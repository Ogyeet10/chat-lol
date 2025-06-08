"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  createPeerConnection,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  createDataChannel as createWebRTCDataChannel,
  sendData as sendWebRTCData,
  closeConnection as closeWebRTCConnection,
} from "../../lib/webrtc";

import { toast } from 'sonner';
import InitiatorFlowDialog from "./InitiatorFlowDialog";
import ReceiverFlowDialog from "./ReceiverFlowDialog";
import ChatRoom from "./ChatRoom";

// Define PTP Message Structure
interface PtpMessage {
  type: 'USERNAME_ANNOUNCE' | 'CHAT_MESSAGE' | 'USER_DISCONNECT' | 'PFP_ANNOUNCE' | string;
  payload: any;
}

interface BundledSignal {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
}

type WebRTCView = 'setup' | 'initiatorDialog' | 'receiverDialog' | 'chatRoom';

interface WebRTCChatRoomProps {
  currentUsername: string;
  onLeaveWebRTC: () => void;
}

export default function WebRTCChatRoom({ currentUsername, onLeaveWebRTC }: WebRTCChatRoomProps) {
  const [view, setView] = useState<WebRTCView>('setup');
  
  // WebRTC Core States
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  
  // States for UI and Signaling Data
  const [connectionStatus, setConnectionStatus] = useState("Idle");
  const [messages, setMessages] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [generatedStringForPeer, setGeneratedStringForPeer] = useState("");
  const [isProcessingSignal, setIsProcessingSignal] = useState(false);
  const [isInitiationAttempted, setIsInitiationAttempted] = useState(false);

  // Usernames
  const [localUsername] = useState(currentUsername);
  const [localUserPFP] = useState<string | null>(null);
  const [peerUsername, setPeerUsername] = useState("Peer");
  const [peerUserPFP, setPeerUserPFP] = useState<string | null>(null);

  // Refs for ICE gathering
  const collectedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceGatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Full reset: Clears everything and returns to setup view
  const resetStateAndGoToSetupView = useCallback((
    toastMessage?: string, 
    toastDetails?: { description?: string, type?: 'info' | 'error' | 'success' | 'warning' }
  ) => {
    if (peerConnectionRef.current) {
        closeWebRTCConnection(); 
        peerConnectionRef.current = null; 
    }
    dataChannelRef.current = null;
    setGeneratedStringForPeer("");
    collectedIceCandidatesRef.current = [];
    if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
    
    if (toastMessage && typeof toastMessage === 'string') { 
        const type = toastDetails?.type || 'info';
        const description = toastDetails?.description;
        switch (type) {
            case 'error': toast.error(toastMessage, { description }); break;
            case 'success': toast.success(toastMessage, { description }); break;
            case 'warning': toast.warning(toastMessage, { description }); break;
            default: toast.info(toastMessage, { description }); break;
        }
    }
    
    setConnectionStatus("Idle");
    setIsProcessingSignal(false);
    setPeerUsername("Peer"); 
    setPeerUserPFP(null);
    setMessages([]); 
    setView('setup');
    setIsInitiationAttempted(false);
  }, []);

  // Lightweight reset for new attempt
  const resetWebRTCInternals = useCallback(() => {
    if (peerConnectionRef.current) {
        closeWebRTCConnection(); 
        peerConnectionRef.current = null; 
    }
    dataChannelRef.current = null;
    setGeneratedStringForPeer("");
    collectedIceCandidatesRef.current = [];
    if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
    setIsProcessingSignal(false);
  }, []);

  // Send structured PTP messages
  const sendPtpMessage = useCallback((type: PtpMessage['type'], payload: any) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const message: PtpMessage = { type, payload };
      try {
        sendWebRTCData(dataChannelRef.current, JSON.stringify(message));
      } catch (error) {
        console.error("Error sending PTP message:", error);
        toast.error("Failed to send message", { description: `Type: ${type}` });
      }
    }
  }, []);

  // WebRTC Event Handlers
  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const ptpMsg: PtpMessage = JSON.parse(event.data);
      switch (ptpMsg.type) {
        case 'USERNAME_ANNOUNCE':
          if (typeof ptpMsg.payload === 'string') {
            setPeerUsername(ptpMsg.payload);
            setMessages((prevMessages) => [...prevMessages, `System: ${ptpMsg.payload} has joined the chat.`]);
            toast.success(`${ptpMsg.payload} has connected!`, { description: "Chat is now active."} );
          }
          break;
        case 'CHAT_MESSAGE':
          if (typeof ptpMsg.payload === 'string') {
            setMessages((prevMessages) => [...prevMessages, `${peerUsername || 'Peer'}: ${ptpMsg.payload}`]);
          }
          break;
        case 'USER_DISCONNECT':
          resetStateAndGoToSetupView(`${peerUsername || 'Peer'} has disconnected.`, { type: 'info' });
          break;
        case 'PFP_ANNOUNCE':
          if (typeof ptpMsg.payload === 'string') {
            setPeerUserPFP(ptpMsg.payload);
            toast.info(`${peerUsername || 'Peer'} updated their profile picture.`);
          }
          break;
        default:
          setMessages((prevMessages) => [...prevMessages, `Peer (raw): ${event.data}`]);
      }
    } catch (error) {
      setMessages((prevMessages) => [...prevMessages, `Peer (unstructured): ${event.data}`]);
      toast.error("Received an unreadable message from peer.");
    }
  }, [peerUsername, resetStateAndGoToSetupView]);

  const handleDataChannelOpened = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    setConnectionStatus("Connected! Chat is active.");
    setMessages((prevMessages) => [...prevMessages, "System: Data channel opened successfully."]);
    
    if (localUsername) {
      sendPtpMessage('USERNAME_ANNOUNCE', localUsername);
    }

    setView('chatRoom');
    setIsProcessingSignal(false);
  }, [localUsername, sendPtpMessage]);

  // Initialize peer connection
  const initializeNewPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) resetStateAndGoToSetupView();
    
    collectedIceCandidatesRef.current = [];
    if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
    
    const pcListeners = {
      onDataChannelOpened: handleDataChannelOpened,
      onDataChannelMessage: handleDataChannelMessage,
      onIceCandidate: (candidate: RTCIceCandidate) => {
        if (candidate) {
            collectedIceCandidatesRef.current.push(candidate.toJSON());
        }
      },
      onConnectionStateChange: () => {
        const pc = peerConnectionRef.current;
        if (pc) {
          let statusMsg = `Peer Connection: ${pc.connectionState}`;
          if (pc.connectionState === 'connected' && dataChannelRef.current?.readyState === 'open') {
            statusMsg = "Connected! Chat is active.";
          } else if (pc.connectionState === 'failed') {
            statusMsg = "Connection failed. Please reset and try again.";
            if (view === 'chatRoom') {
              resetStateAndGoToSetupView("Connection failed abruptly.", { type: 'error' });
            } else {
              resetStateAndGoToSetupView("Connection attempt failed.", { description: "Please check details and try again.", type: 'error'});
            }
          } else if (['disconnected', 'closed'].includes(pc.connectionState)) {
            if (view === 'chatRoom') {
                 if (dataChannelRef.current) {
                    resetStateAndGoToSetupView(`${peerUsername || 'Peer'} connection lost.`, { type: 'warning' });
                 }
            } else {
                resetStateAndGoToSetupView(); 
            }
            if(pc.connectionState !== 'closed' && peerConnectionRef.current) closeWebRTCConnection();
            peerConnectionRef.current = null;
            dataChannelRef.current = null;
          }
          setConnectionStatus(statusMsg);
        }
      },
    };
    const newPc = createPeerConnection(pcListeners);
    peerConnectionRef.current = newPc;
    return newPc;
  }, [handleDataChannelOpened, handleDataChannelMessage, resetStateAndGoToSetupView, view, peerUsername]);

  // Signaling string bundling
  const finalizeAndBundleSignal = (sdp: RTCSessionDescriptionInit): string => {
    const bundle: BundledSignal = { sdp: sdp, candidates: [...collectedIceCandidatesRef.current] };
    return JSON.stringify(bundle, null, 2);
  };

  const startIceGatheringAndFinalize = (pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit, type: 'offer' | 'answer') => {
    collectedIceCandidatesRef.current = []; 
    if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
    setIsProcessingSignal(true);

    const finalize = () => {
        const bundledString = finalizeAndBundleSignal(sdp);
        setGeneratedStringForPeer(bundledString);
        toast.success(`Signal string for ${type} created.`, { description: "Please share it with your peer." });
        setIsProcessingSignal(false);
    };

    if (pc.iceGatheringState === 'complete') {
        finalize();
    } else {
        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
                finalize();
                if(pc) pc.onicegatheringstatechange = null;
            }
        };
        iceGatheringTimeoutRef.current = setTimeout(() => {
            finalize();
            if(pc) pc.onicegatheringstatechange = null;
        }, 3000);
    }
  };

  // Initiator logic
  const handleInitiatorGenerateString = useCallback(async () => {
    resetWebRTCInternals();
    setConnectionStatus("Initializing new connection attempt..."); 
    setIsProcessingSignal(true);

    const pc = initializeNewPeerConnection();
    if (!pc) {
        toast.error("Failed to initialize connection internally.");
        resetStateAndGoToSetupView("Initialization failed.", { type: 'error'});
        return;
    }
    
    const dc = createWebRTCDataChannel(pc, "chatChannel");
    dc.onmessage = handleDataChannelMessage;
    dc.onopen = () => handleDataChannelOpened(dc);
    dataChannelRef.current = dc; 
    
    try {
      setConnectionStatus("Creating offer...");
      const offer = await createOffer(pc);
      startIceGatheringAndFinalize(pc, offer, 'offer');
    } catch (error) {
      resetStateAndGoToSetupView("Failed to create offer.", { description: "Please check console and try again.", type: 'error' });
    }
  }, [resetWebRTCInternals, initializeNewPeerConnection, handleDataChannelMessage, handleDataChannelOpened, resetStateAndGoToSetupView]);

  // Auto-initiation effect
  useEffect(() => {
    if (view === 'initiatorDialog' && localUsername && !generatedStringForPeer && !isProcessingSignal && !isInitiationAttempted) {
      setIsInitiationAttempted(true);
      handleInitiatorGenerateString();
    }
    if (view !== 'initiatorDialog') {
      setIsInitiationAttempted(false);
    }
  }, [view, localUsername, generatedStringForPeer, isProcessingSignal, handleInitiatorGenerateString, isInitiationAttempted]);

  const handleInitiatorProcessResponse = async (responseString: string) => {
    const pc = peerConnectionRef.current;
    if (!pc) {
      resetStateAndGoToSetupView("Connection error.", { description: "Please reset and try again.", type: 'error' });
      return;
    }
    if (!responseString) {
      toast.warning("Empty response from peer.");
      setIsProcessingSignal(false); return;
    }
    setIsProcessingSignal(true);
    let receivedBundle: BundledSignal;
    try {
      receivedBundle = JSON.parse(responseString);
      if (!receivedBundle.sdp || !receivedBundle.candidates) throw new Error("Invalid response format");
    } catch (error) {
      resetStateAndGoToSetupView("Invalid response from peer.", { description: "The data format is not recognized.", type: 'error' });
      return;
    }

    try {
      setConnectionStatus("Processing answer from peer...");
      await setRemoteDescription(pc, receivedBundle.sdp);
      for (const candidate of receivedBundle.candidates) {
         if (candidate?.candidate) await addIceCandidate(pc, candidate);
      }
      setConnectionStatus("Response processed. Attempting to connect...");
    } catch (error) {
      resetStateAndGoToSetupView("Failed to process peer's answer.", { description: "Please check console and try again.", type: 'error' });
    }
  };

  // Receiver logic
  const handleReceiverProcessOfferAndCreateAnswer = async (offerString: string) => {
    if (!offerString) {
      toast.warning("Empty offer string from initiator.");
      setIsProcessingSignal(false); return;
    }
    resetWebRTCInternals();
    setConnectionStatus("Initializing for answer...");
    const pc = initializeNewPeerConnection();
    if (!pc) { 
        toast.error("Failed to initialize connection internally for receiver.");
        resetStateAndGoToSetupView("Initialization failed for receiver.", { type: 'error'});
        return; 
    }
    let receivedBundle: BundledSignal;
    try {
      receivedBundle = JSON.parse(offerString);
      if (!receivedBundle.sdp || !receivedBundle.candidates) throw new Error("Invalid offer format");
    } catch (error) {
      resetStateAndGoToSetupView("Invalid offer from initiator.", { description: "The data format is not recognized.", type: 'error' });
      return;
    }
    
    try {
      setConnectionStatus("Processing offer, creating answer & gathering ICE...");
      await setRemoteDescription(pc, receivedBundle.sdp);
      for (const candidate of receivedBundle.candidates) {
        if (candidate?.candidate) await addIceCandidate(pc, candidate);
      }
      const answer = await createAnswer(pc, receivedBundle.sdp);
      startIceGatheringAndFinalize(pc, answer, 'answer');
    } catch (error) {
      resetStateAndGoToSetupView("Failed to process offer.", { description: "Please check console and try again.", type: 'error' });
    }
  };

  // Chat message logic
  const handleSendMessage = () => {
    if (messageInput.trim()) {
      sendPtpMessage('CHAT_MESSAGE', messageInput.trim());
      setMessages((prevMessages) => [...prevMessages, `${localUsername || 'You'}: ${messageInput.trim()}`]);
      setMessageInput("");
    } else if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      toast.warning("Cannot send message.", { description: "Data channel is not open."} );
    } 
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Copied to clipboard!"))
      .catch(err => toast.error("Failed to copy to clipboard."));
  };

  const handleLeaveChat = () => {
    toast.info("You are disconnecting from the chat...");
    sendPtpMessage('USER_DISCONNECT', { username: localUsername });
    setTimeout(() => {
        onLeaveWebRTC();
    }, 200);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetStateAndGoToSetupView();
    };
  }, [resetStateAndGoToSetupView]);

  // Render based on view
  switch (view) {
    case 'initiatorDialog':
      return <InitiatorFlowDialog 
                isOpen={true} 
                onClose={() => setView('setup')}
                generatedString={generatedStringForPeer}
                onGenerateString={handleInitiatorGenerateString}
                onProcessResponse={handleInitiatorProcessResponse}
                isProcessing={isProcessingSignal}
                copyToClipboard={copyToClipboard}
                connectionStatus={connectionStatus}
              />;
    case 'receiverDialog':
      return <ReceiverFlowDialog 
                isOpen={true} 
                onClose={() => setView('setup')}
                generatedResponseString={generatedStringForPeer}
                onProcessOfferAndCreateAnswer={handleReceiverProcessOfferAndCreateAnswer}
                isProcessing={isProcessingSignal}
                copyToClipboard={copyToClipboard}
                connectionStatus={connectionStatus}
              />;
    case 'chatRoom':
      return <ChatRoom 
                messages={messages} 
                messageInput={messageInput} 
                onMessageInputChange={setMessageInput}
                onSendMessage={handleSendMessage}
                onLeaveChat={handleLeaveChat}
                connectionStatus={connectionStatus}
                dataChannelReadyState={dataChannelRef.current?.readyState || null}
                currentUsername={localUsername}
                currentUserPFP={localUserPFP}
                peerUsername={peerUsername}
                peerUserPFP={peerUserPFP}
              />;
    case 'setup':
    default:
      return (
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center space-y-4">
            <h3 className="text-xl font-medium">Start WebRTC Chat</h3>
            <p className="text-muted-foreground">Choose how to connect with your peer</p>
            <div className="space-x-4">
              <button 
                onClick={() => setView('initiatorDialog')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Initiate Chat
              </button>
              <button 
                onClick={() => setView('receiverDialog')}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90"
              >
                Join Chat
              </button>
            </div>
          </div>
        </div>
      );
  }
}