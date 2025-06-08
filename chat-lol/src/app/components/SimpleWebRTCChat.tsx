"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { authStorage } from "@/lib/auth";
import { toast } from 'sonner';
import ChatRoom from "./ChatRoom";
import { peerJSService, PeerMessage } from "@/lib/peerjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface SimpleWebRTCChatProps {
  /** The local user's session ID, passed from the root component */
  userSessionId: string;
  /** The target peer's session ID */
  targetSessionId: string;
  otherUsername: string;
  requestId?: string;
  isInitiator: boolean;
  offerData?: any;
  onLeaveChat: () => void;
  onConnectionReady?: () => void;
}

export default function SimpleWebRTCChat({ 
  userSessionId,
  targetSessionId, 
  otherUsername, 
  requestId, 
  isInitiator,
  offerData,
  onLeaveChat,
  onConnectionReady
}: SimpleWebRTCChatProps) {
  const [connectionStatus, setConnectionStatus] = useState("Initializing...");
  const [messages, setMessages] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [dataChannelState, setDataChannelState] = useState<string | null>("connecting");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const hasInitialized = useRef(false);
  const cleanupDone = useRef(false);

  const auth = authStorage.getAuth();
  // Use the passed-in root session ID
  const sessionId = userSessionId;

  const createConnectionOffer = useMutation(api.peerConnections.createConnectionOffer);
  const updateConnectionStatus = useMutation(api.peerConnections.updateConnectionStatus);
  const disconnectConnection = useMutation(api.peerConnections.disconnectConnection);
  
  // Incoming connection offers against the local session
  const connectionOffers = useQuery(api.peerConnections.getConnectionOffers, 
    sessionId && auth.token ? { sessionId, userToken: auth.token } : "skip"
  );

  // Initialize PeerJS connection
  useEffect(() => {
    if (!sessionId || !auth.token || !auth.username || hasInitialized.current) return;

    const initializeConnection = async () => {
      try {
        setConnectionStatus("Setting up connection...");
        
        if (isInitiator) {
          // The offer is created by the parent, and connectionId is passed as 'requestId'
          if (!connectionId) {
            toast.error("Initialization Error: Connection ID is missing.");
            setConnectionStatus("Error: No Connection ID");
            return;
          }

          // Initialize peer with the existing connection ID
          await peerJSService.initializePeer(connectionId, sessionId, auth.username!, targetSessionId);
          setConnectionStatus(`Waiting for ${otherUsername} to connect...`);
          
        } else {
          // Receiver logic: wait for an incoming offer from the query.
          setConnectionStatus("Looking for connection offer...");
        }

        hasInitialized.current = true;
      } catch (error) {
        console.error("❌ Failed to initialize connection:", error);
        setConnectionStatus("Failed to initialize connection");
        toast.error("Failed to initialize connection");
      }
    };

    initializeConnection();
  }, [sessionId, auth.token, auth.username, isInitiator, targetSessionId, otherUsername, connectionId]);

  // Handle incoming connection offers (for receivers)
  useEffect(() => {
    if (isInitiator || !connectionOffers || !sessionId || !auth.token || !auth.username) return;

    console.log('🔍 SimpleWebRTCChat receiver - checking offers:', {
      isInitiator,
      targetSessionId,
      sessionId,
      connectionOffersCount: connectionOffers.length,
      connectionOffers
    });

    // Find offers from the target session we're expecting to connect to
    const relevantOffer = connectionOffers.find(offer => 
      offer.sessionId === targetSessionId && offer.status === "offered"
    );

    console.log('🎯 Relevant offer found:', relevantOffer);

    if (relevantOffer && !connectionId) {
      const connectToPeer = async () => {
        try {
          setConnectionStatus(`Connecting to ${otherUsername}...`);
          setConnectionId(relevantOffer.connectionId);

          // Initialize our own peer first
          const ourConnectionId = `resp_${relevantOffer.connectionId}`;
          await peerJSService.initializePeer(ourConnectionId, sessionId, auth.username!, targetSessionId);

          // Connect to the initiator's peer
          await peerJSService.connectToPeer(relevantOffer.peerId, targetSessionId, otherUsername);

          // Update connection status in DB
          await updateConnectionStatus({
            connectionId: relevantOffer.connectionId,
            status: "connected",
            userToken: auth.token!,
            connectionData: { connectedAt: Date.now() }
          });

          setConnectionStatus("Connected!");
          setDataChannelState("open");
          setIsConnected(true);
          onConnectionReady?.();
          toast.success(`Connected to ${otherUsername}!`);

        } catch (error) {
          console.error("❌ Failed to connect to peer:", error);
          setConnectionStatus("Connection failed");
          toast.error("Failed to connect");
        }
      };

      connectToPeer();
    }
  }, [connectionOffers, isInitiator, connectionId, sessionId, auth.token, auth.username, targetSessionId, otherUsername, updateConnectionStatus, onConnectionReady]);

  // Setup PeerJS event handlers
  useEffect(() => {
    const handleMessage = (message: PeerMessage) => {
      switch (message.type) {
        case 'USERNAME_ANNOUNCE':
          if (typeof message.payload === 'string') {
            setMessages(prev => [...prev, `System: ${message.payload} has joined the chat.`]);
            toast.success(`${message.payload} has connected!`);
          }
          break;
        case 'CHAT_MESSAGE':
          if (typeof message.payload === 'string') {
            setMessages(prev => [...prev, `${otherUsername}: ${message.payload}`]);
          }
          break;
        case 'USER_DISCONNECT':
          setMessages(prev => [...prev, `System: ${otherUsername} has disconnected.`]);
          toast.info(`${otherUsername} has left the chat`);
          setIsConnected(false);
          setDataChannelState("closed");
          onLeaveChat();
          break;
        default:
          console.warn("Unknown message type:", message.type);
      }
    };

    const handleConnectionStateChange = (peerId: string, isConnected: boolean) => {
      if (isConnected) {
        setConnectionStatus("Connected!");
        setDataChannelState("open");
        setIsConnected(true);
        onConnectionReady?.();
      } else {
        setConnectionStatus("Disconnected");
        setDataChannelState("closed");
        setIsConnected(false);
      }
    };

    const handleError = (error: Error) => {
      console.error("❌ PeerJS Error:", error);
      setConnectionStatus("Connection error");
      toast.error("Connection error occurred");
    };

    peerJSService.onMessage(handleMessage);
    peerJSService.onConnectionStateChange(handleConnectionStateChange);
    peerJSService.onError(handleError);

    return () => {
      // Event handlers are cleaned up by the service itself
    };
  }, [otherUsername, onConnectionReady, onLeaveChat]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !isConnected) return;

    const connectedPeers = peerJSService.getConnectedPeers();
    if (connectedPeers.length === 0) {
      toast.error("No active connection");
      return;
    }

    // Send to first connected peer (1-on-1 chat)
    const success = peerJSService.sendChatMessage(connectedPeers[0], messageInput.trim());
    
    if (success) {
      setMessages(prev => [...prev, `You: ${messageInput.trim()}`]);
      setMessageInput("");
    } else {
      toast.error("Failed to send message");
    }
  };

  const cleanup = useCallback(async () => {
    if (cleanupDone.current) return;
    cleanupDone.current = true;

    console.log('🧹 Cleaning up SimpleWebRTCChat...');

    try {
      // Update connection status in DB
      if (connectionId && auth.token) {
        await disconnectConnection({
          connectionId,
          userToken: auth.token
        });
      }
    } catch (error) {
      console.error("❌ Error updating connection status:", error);
    }

    // Cleanup PeerJS service
    peerJSService.cleanup();
  }, [connectionId, auth.token, disconnectConnection]);

  const handleLeaveChat = () => {
    cleanup();
    onLeaveChat();
  };

  return (
    <ChatRoom
      messages={messages}
      messageInput={messageInput}
      onMessageInputChange={setMessageInput}
      onSendMessage={handleSendMessage}
      onLeaveChat={handleLeaveChat}
      connectionStatus={connectionStatus}
      dataChannelReadyState={dataChannelState}
      currentUsername={auth.username || "You"}
      peerUsername={otherUsername}
    />
  );
} 