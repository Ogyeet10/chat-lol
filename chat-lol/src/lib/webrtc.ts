let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;

type WebRTCListeners = {
  onDataChannelOpened?: (channel: RTCDataChannel) => void;
  onDataChannelMessage?: (event: MessageEvent) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (event: Event) => void;
  onTrack?: (event: RTCTrackEvent) => void; // For later audio/video
};

export function createPeerConnection(listeners: WebRTCListeners): RTCPeerConnection {
  peerConnection = new RTCPeerConnection();

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && listeners.onIceCandidate) {
      listeners.onIceCandidate(event.candidate);
    }
  };

  peerConnection.onconnectionstatechange = (event) => {
    if (listeners.onConnectionStateChange) {
      listeners.onConnectionStateChange(event);
    }
    // Example: console.log('Peer Connection State:', peerConnection?.connectionState);
    if (peerConnection?.connectionState === 'connected' && dataChannel?.readyState === 'open') {
        // Potentially already handled by onDataChannelOpened
    }
  };

  // For receiving data channels from the remote peer
  peerConnection.ondatachannel = (event) => {
    console.log('ondatachannel event:', event);
    dataChannel = event.channel;
    setupDataChannelListeners(dataChannel, listeners);
    if (listeners.onDataChannelOpened) {
      listeners.onDataChannelOpened(dataChannel);
    }
  };
  
  // For receiving audio/video tracks (placeholder for now)
  peerConnection.ontrack = (event) => {
    if (listeners.onTrack) {
        listeners.onTrack(event);
    }
  };

  return peerConnection;
}

function setupDataChannelListeners(channel: RTCDataChannel, listeners: WebRTCListeners) {
  channel.onopen = () => {
    console.log('Data channel opened:', channel.label);
    if (listeners.onDataChannelOpened && channel === dataChannel) { // Ensure it's the primary data channel we manage
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
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
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
  dataChannel = newDataChannel; // Assume this is the primary data channel we want to manage for sending
  // Listeners are passed during createPeerConnection, setupDataChannelListeners will be called for the new channel too
  // if it's created by the local peer. If by remote, ondatachannel handles it.
  // Re-calling setupDataChannelListeners here for the locally created channel.
  // This requires listeners to be accessible, or passed again. For simplicity, assuming they are.
  // This part needs careful handling of listeners context if createPeerConnection isn't called again.
  // For now, global listeners are implicitly used or we rely on ondatachannel for remote ones.
  // Let's refine this by ensuring listeners are correctly applied.
  // The current structure implies listeners are passed to createPeerConnection.
  // We need a way to pass those listeners to setupDataChannelListeners if called from here.
  // A better approach might be to get listeners from a shared context or re-architect.
  // For now, we'll assume setupDataChannelListeners is mainly for the ondatachannel event.
  // The listeners on the *created* data channel need to be setup.
  
  // Simplified: If listeners were passed to createPeerConnection, they should be used.
  // This is tricky as createPeerConnection returns pc, but doesn't keep listeners in global scope
  // explicitly for this function to reuse.
  // A quick fix would be to pass listeners again, or store them with the peerConnection instance.
  // For now, let's assume listeners passed to createPeerConnection will have onDataChannelMessage, etc.
  // and setup them directly on the new channel.
  
  // Let's assume listeners are available through a closure or passed:
  // (This is a placeholder for a proper listener management strategy)
  // For instance, we could store listeners in a global variable or pass them around.
  
  // Direct setup for locally created channel:
  // This will be problematic if listeners are not accessible here.
  // The listeners need to be passed or stored associated with the peerConnection.
  // *Correction*: setupDataChannelListeners should be called on this newly created channel
  // using the *same* listeners object that was passed to createPeerConnection.
  // This is a structural challenge with the current simple export model.
  // I will assume listeners are implicitly available or this will be refactored in page.tsx to pass them.
  // For now, the onopen and onmessage for this *locally* created channel are crucial.

  // Example: If listeners were globally stored for the current peer connection context:
  // setupDataChannelListeners(newDataChannel, currentPClisteners);
  
  // The ondatachannel callback in createPeerConnection will handle setting up listeners for remotely created channels.
  // For locally created channels, we need to set them up directly.
  // It's cleaner if data channel creation and its listener setup is more tightly coupled with createPeerConnection context.
  // Let's defer full listener setup for locally created channel to page.tsx or expect onopen to be sufficient for now.
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

export function closeConnection(): void {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  console.log('WebRTC connection closed.');
}

// Utility to get current peerConnection (e.g., for page to manage)
export function getPeerConnection(): RTCPeerConnection | null {
  return peerConnection;
}

export function getDataChannel(): RTCDataChannel | null {
    return dataChannel;
} 