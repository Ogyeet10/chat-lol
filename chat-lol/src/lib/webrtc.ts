// Removed global state - each component manages its own connections

type WebRTCListeners = {
  onDataChannelOpened?: (channel: RTCDataChannel) => void;
  onDataChannelMessage?: (event: MessageEvent) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (event: Event) => void;
  onTrack?: (event: RTCTrackEvent) => void; // For later audio/video
};

export function createPeerConnection(listeners: WebRTCListeners): RTCPeerConnection {
  // Use STUN server for NAT traversal
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && listeners.onIceCandidate) {
      listeners.onIceCandidate(event.candidate);
    }
  };

  pc.onconnectionstatechange = (event) => {
    if (listeners.onConnectionStateChange) {
      listeners.onConnectionStateChange(event);
    }
  };

  // For receiving data channels from the remote peer
  pc.ondatachannel = (event) => {
    console.log('ondatachannel event:', event);
    const channel = event.channel;
    setupDataChannelListeners(channel, listeners);
    if (listeners.onDataChannelOpened) {
      listeners.onDataChannelOpened(channel);
    }
  };
  
  // For receiving audio/video tracks (placeholder for now)
  pc.ontrack = (event) => {
    if (listeners.onTrack) {
        listeners.onTrack(event);
    }
  };

  return pc;
}

function setupDataChannelListeners(channel: RTCDataChannel, listeners: WebRTCListeners) {
  channel.onopen = () => {
    console.log('Data channel opened:', channel.label);
    if (listeners.onDataChannelOpened) {
      listeners.onDataChannelOpened(channel);
    }
  };
  channel.onmessage = (event) => {
    if (listeners.onDataChannelMessage) {
      listeners.onDataChannelMessage(event);
    }
  };
  channel.onclose = () => {
    console.log('Data channel closed:', channel.label);
  };
  channel.onerror = (error) => {
    console.error('Data channel error:', error);
  };
}

export async function createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  if (!pc) throw new Error('PeerConnection not initialized');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(pc: RTCPeerConnection, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
  if (!pc) throw new Error('PeerConnection not initialized');
  console.log('🔌 DEBUG: webrtc.createAnswer - Setting remote description...');
  console.log('🔌 DEBUG: PC state before setRemoteDescription:', {
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    signalingState: pc.signalingState,
    localDescription: pc.localDescription,
    remoteDescription: pc.remoteDescription
  });
  
  try {
    await Promise.race([
      pc.setRemoteDescription(new RTCSessionDescription(offer)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('setRemoteDescription timeout')), 10000))
    ]);
  } catch (error) {
    console.error('🔌 DEBUG: setRemoteDescription failed:', error);
    throw error;
  }
  console.log('🔌 DEBUG: webrtc.createAnswer - Creating answer...');
  const answer = await pc.createAnswer();
  console.log('🔌 DEBUG: webrtc.createAnswer - Setting local description...');
  await pc.setLocalDescription(answer);
  console.log('🔌 DEBUG: webrtc.createAnswer - Answer created successfully');
  return answer;
}

export async function setRemoteDescription(pc: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void> {
  if (!pc) throw new Error('PeerConnection not initialized');
  await pc.setRemoteDescription(new RTCSessionDescription(description));
}

export async function addIceCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit | RTCIceCandidate): Promise<void> {
  if (!pc) throw new Error('PeerConnection not initialized');
  await pc.addIceCandidate(candidate);
}

export function createDataChannel(pc: RTCPeerConnection, label: string = 'chat'): RTCDataChannel {
  if (!pc) throw new Error('PeerConnection not initialized');
  const newDataChannel = pc.createDataChannel(label);
  console.log('Data channel created by local peer:', label);
  return newDataChannel;
}


export function sendData(dc: RTCDataChannel, message: string): void {
  if (dc && dc.readyState === 'open') {
    dc.send(message);
  } else {
    console.error('Data channel is not open or not initialized. State:', dc?.readyState);
  }
}

export function closeConnection(pc: RTCPeerConnection | null, dc: RTCDataChannel | null): void {
  if (dc) {
    dc.close();
  }
  if (pc) {
    pc.close();
  }
  console.log('WebRTC connection closed.');
} 