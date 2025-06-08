import Peer, { DataConnection } from 'peerjs';

export interface PeerMessage {
  type: 'USERNAME_ANNOUNCE' | 'CHAT_MESSAGE' | 'USER_DISCONNECT' | 'CONNECTION_REQUEST';
  payload: any;
  timestamp: number;
  from: string;
}

export interface PeerConnectionInfo {
  connectionId: string;
  peerId: string;
  sessionId: string;
  targetSessionId: string;
  username: string;
}

export class PeerJSService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private connectionInfo: PeerConnectionInfo | null = null;
  private messageHandler?: (message: PeerMessage) => void;
  private connectionStateHandler?: (peerId: string, isConnected: boolean) => void;
  private errorHandler?: (error: Error) => void;

  constructor() {
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.cleanup();
      });
    }
  }

  async initializePeer(
    connectionId: string, 
    sessionId: string, 
    username: string,
    targetSessionId?: string
  ): Promise<void> {
    if (this.peer && this.peer.id === connectionId && !this.peer.destroyed) {
      console.log('ℹ️ PeerJS already initialized for this ID, skipping recreation:', connectionId);
      return;
    }

    if (this.peer) {
      console.log('🧹 Cleaning up old PeerJS instance before creating a new one.');
      this.cleanup();
    }

    this.connectionInfo = {
      connectionId,
      peerId: connectionId, // Using connectionId as peerId for simplicity
      sessionId,
      targetSessionId: targetSessionId || '',
      username
    };

    return new Promise((resolve, reject) => {
      this.peer = new Peer(connectionId, {
        debug: 2, // Enable debugging in development
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('🔗 PeerJS initialized with ID:', id);
        this.setupPeerEventHandlers();
        resolve();
      });

      this.peer.on('error', (error) => {
        console.error('❌ PeerJS initialization error:', error);
        this.handleError(error);
        reject(error);
      });
    });
  }

  private setupPeerEventHandlers() {
    if (!this.peer) return;

    this.peer.on('connection', (conn) => {
      console.log('📞 Incoming connection from:', conn.peer);
      this.handleIncomingConnection(conn);
    });

    this.peer.on('disconnected', () => {
      console.log('🔌 Peer disconnected from signaling server');
      // Attempt to reconnect
      setTimeout(() => {
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      }, 1000);
    });

    this.peer.on('close', () => {
      console.log('🔒 Peer connection closed');
    });

    this.peer.on('error', (error) => {
      console.error('❌ Peer error:', error);
      this.handleError(error);
    });
  }

  async connectToPeer(peerId: string, targetSessionId: string, targetUsername: string): Promise<void> {
    if (!this.peer || !this.connectionInfo) {
      throw new Error('Peer not initialized');
    }

    console.log('🔗 Connecting to peer:', peerId);

    return new Promise((resolve, reject) => {
      const conn = this.peer!.connect(peerId, {
        label: 'chat',
        metadata: {
          sessionId: this.connectionInfo!.sessionId,
          username: this.connectionInfo!.username,
          targetSessionId
        }
      });

      conn.on('open', () => {
        console.log('✅ Connected to peer:', peerId);
        this.connections.set(peerId, conn);
        this.setupConnectionHandlers(conn, targetUsername);
        
        // Send username announcement
        this.sendMessage(peerId, {
          type: 'USERNAME_ANNOUNCE',
          payload: this.connectionInfo!.username,
          timestamp: Date.now(),
          from: this.connectionInfo!.sessionId
        });

        this.notifyConnectionState(peerId, true);
        resolve();
      });

      conn.on('error', (error) => {
        console.error('❌ Connection error:', error);
        this.handleError(error);
        reject(error);
      });
    });
  }

  private handleIncomingConnection(conn: DataConnection) {
    const metadata = conn.metadata;
    const targetUsername = metadata?.username || 'Unknown';

    conn.on('open', () => {
      console.log('✅ Incoming connection established from:', conn.peer);
      this.connections.set(conn.peer, conn);
      this.setupConnectionHandlers(conn, targetUsername);
      this.notifyConnectionState(conn.peer, true);
    });

    conn.on('error', (error) => {
      console.error('❌ Incoming connection error:', error);
      this.handleError(error);
    });
  }

  private setupConnectionHandlers(conn: DataConnection, peerUsername: string) {
    conn.on('data', (data) => {
      try {
        const message = data as PeerMessage;
        console.log('📨 Received message:', message);
        
        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        console.error('❌ Error processing message:', error);
      }
    });

    conn.on('close', () => {
      console.log('🔌 Connection closed with:', conn.peer);
      this.connections.delete(conn.peer);
      this.notifyConnectionState(conn.peer, false);
      
      // Send disconnect message if we still have other connections
      if (this.connections.size > 0) {
        this.broadcastDisconnect();
      }
    });

    conn.on('error', (error) => {
      console.error('❌ Connection error with', conn.peer, ':', error);
      this.connections.delete(conn.peer);
      this.notifyConnectionState(conn.peer, false);
      this.handleError(error);
    });
  }

  sendMessage(peerId: string, message: PeerMessage): boolean {
    const conn = this.connections.get(peerId);
    if (!conn || conn.open !== true) {
      console.warn('⚠️ Connection not available for peer:', peerId);
      return false;
    }

    try {
      conn.send(message);
      console.log('📤 Message sent to', peerId, ':', message);
      return true;
    } catch (error) {
      console.error('❌ Error sending message to', peerId, ':', error);
      this.handleError(error as Error);
      return false;
    }
  }

  sendChatMessage(peerId: string, messageText: string): boolean {
    if (!this.connectionInfo) {
      console.warn('⚠️ No connection info available');
      return false;
    }

    return this.sendMessage(peerId, {
      type: 'CHAT_MESSAGE',
      payload: messageText,
      timestamp: Date.now(),
      from: this.connectionInfo.sessionId
    });
  }

  private broadcastDisconnect() {
    if (!this.connectionInfo) return;

    const disconnectMessage: PeerMessage = {
      type: 'USER_DISCONNECT',
      payload: this.connectionInfo.username,
      timestamp: Date.now(),
      from: this.connectionInfo.sessionId
    };

    this.connections.forEach((conn, peerId) => {
      this.sendMessage(peerId, disconnectMessage);
    });
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connections.keys()).filter(peerId => {
      const conn = this.connections.get(peerId);
      return conn && conn.open;
    });
  }

  isConnectedToPeer(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return conn ? conn.open : false;
  }

  getPeerInfo(): PeerConnectionInfo | null {
    return this.connectionInfo;
  }

  onMessage(handler: (message: PeerMessage) => void) {
    this.messageHandler = handler;
  }

  onConnectionStateChange(handler: (peerId: string, isConnected: boolean) => void) {
    this.connectionStateHandler = handler;
  }

  onError(handler: (error: Error) => void) {
    this.errorHandler = handler;
  }

  private notifyConnectionState(peerId: string, isConnected: boolean) {
    if (this.connectionStateHandler) {
      this.connectionStateHandler(peerId, isConnected);
    }
  }

  private handleError(error: Error) {
    console.error('🚨 PeerJS Service Error:', error);
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  cleanup() {
    console.log('🧹 Cleaning up PeerJS service...');
    
    // Send disconnect messages before cleanup
    this.broadcastDisconnect();

    // Close all connections
    this.connections.forEach((conn) => {
      if (conn && conn.open) {
        conn.close();
      }
    });
    this.connections.clear();

    // Destroy peer
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }

    this.peer = null;
    this.connectionInfo = null;
    this.messageHandler = undefined;
    this.connectionStateHandler = undefined;
    this.errorHandler = undefined;
  }
}

// Singleton instance for app-wide use (client-side only)
let _peerJSService: PeerJSService | null = null;

export const peerJSService = (() => {
  if (typeof window === 'undefined') {
    // Return a mock object for SSR
    return {
      initializePeer: async () => Promise.resolve(),
      connectToPeer: async () => Promise.resolve(),
      sendMessage: () => false,
      sendChatMessage: () => false,
      getConnectedPeers: () => [],
      onMessage: () => {},
      onConnectionStateChange: () => {},
      onError: () => {},
      cleanup: () => {},
    } as any;
  }
  
  if (!_peerJSService) {
    _peerJSService = new PeerJSService();
  }
  
  return _peerJSService;
})();