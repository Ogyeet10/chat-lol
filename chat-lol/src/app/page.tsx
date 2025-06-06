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
  getPeerConnection,
  getDataChannel,
} from "../lib/webrtc";

// Assuming shadcn/ui components are in these paths
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area"; // For chat messages
import { Info, MessageSquare, Settings, AlertTriangle, Copy, Send, RotateCcw } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import InitialView from "./components/InitialView";
import InitiatorFlowDialog from "./components/InitiatorFlowDialog";
import ReceiverFlowDialog from "./components/ReceiverFlowDialog";
import ChatRoom from "./components/ChatRoom";

// Define PTP Message Structure
interface PtpMessage {
  type: 'USERNAME_ANNOUNCE' | 'CHAT_MESSAGE' | 'USER_DISCONNECT' | 'PFP_ANNOUNCE' | string;
  payload: any;
}

interface BundledSignal {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
}

type AppView = 'initial' | 'initiatorDialog' | 'receiverDialog' | 'chatRoom';

export default function Home() {
  const [view, setView] = useState<AppView>('initial');
  
  // WebRTC Core States (managed by page.tsx, accessed via refs in some callbacks)
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
  const [localUsername, setLocalUsername] = useState("");
  const [localUserPFP, setLocalUserPFP] = useState<string | null>(null);
  const [peerUsername, setPeerUsername] = useState("Peer");
  const [peerUserPFP, setPeerUserPFP] = useState<string | null>(null);

  // Refs for ICE gathering
  const collectedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceGatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Full reset: Clears everything and returns to initial view, with optional toast.
  const resetStateAndGoToInitialView = useCallback((
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
    setLocalUsername("");
    setLocalUserPFP(null);
    setPeerUsername("Peer"); 
    setPeerUserPFP(null);
    setMessages([]); 
    setView('initial');
    setIsInitiationAttempted(false);
  }, []);

  // Lightweight reset: Clears only WebRTC connection-specific state for a new attempt.
  const resetWebRTCInternals = useCallback(() => {
    if (peerConnectionRef.current) {
        closeWebRTCConnection(); 
        peerConnectionRef.current = null; 
    }
    dataChannelRef.current = null;
    setGeneratedStringForPeer(""); // Clear any old offer/answer string
    collectedIceCandidatesRef.current = [];
    if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
    // setConnectionStatus("Ready for new WebRTC operation..."); // Or keep it neutral
    setIsProcessingSignal(false); // Ensure processing is reset
  }, []);

  // --- Send structured PTP messages ---
  const sendPtpMessage = useCallback((type: PtpMessage['type'], payload: any) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const message: PtpMessage = { type, payload };
      try {
        sendWebRTCData(dataChannelRef.current, JSON.stringify(message));
        if (type === 'PFP_ANNOUNCE') console.log("Sent PFP_ANNOUNCE");
      } catch (error) {
        console.error("Error sending PTP message:", error);
        toast.error("Failed to send message", { description: `Type: ${type}` });
      }
    } else {
      console.warn(`Cannot send PTP message type ${type}, data channel not open.`);
      if (type === 'PFP_ANNOUNCE') {
        toast.warning("Could not send PFP.", { description: "Connection might not be fully open."} );
      }
    }
  }, []);

  // --- WebRTC Event Handlers ---
  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const ptpMsg: PtpMessage = JSON.parse(event.data);
      switch (ptpMsg.type) {
        case 'USERNAME_ANNOUNCE':
          if (typeof ptpMsg.payload === 'string') {
            setPeerUsername(ptpMsg.payload);
            setMessages((prevMessages) => [...prevMessages, `System: ${ptpMsg.payload} has joined the chat.`]);
            toast.success(`${ptpMsg.payload} has connected!`, { description: "Chat is now active."} );
          } else {
            console.warn("Received USERNAME_ANNOUNCE with invalid payload:", ptpMsg.payload);
          }
          break;
        case 'CHAT_MESSAGE':
          if (typeof ptpMsg.payload === 'string') {
            setMessages((prevMessages) => [...prevMessages, `${peerUsername || 'Peer'}: ${ptpMsg.payload}`]);
          } else {
            console.warn("Received CHAT_MESSAGE with invalid payload:", ptpMsg.payload);
          }
          break;
        case 'USER_DISCONNECT':
          console.log("Received USER_DISCONNECT from peer.");
          resetStateAndGoToInitialView(`${peerUsername || 'Peer'} has disconnected.`, { type: 'info' });
          break;
        case 'PFP_ANNOUNCE':
          if (typeof ptpMsg.payload === 'string') {
            setPeerUserPFP(ptpMsg.payload);
            toast.info(`${peerUsername || 'Peer'} updated their profile picture.`);
            console.log("Received and set PFP for peer. Length:", ptpMsg.payload.length);
          } else {
            console.warn("Received PFP_ANNOUNCE with invalid payload:", ptpMsg.payload);
          }
          break;
        default:
          console.warn("Received unknown PTP message type:", ptpMsg.type);
          setMessages((prevMessages) => [...prevMessages, `Peer (raw): ${event.data}`]); // Show raw for unknown
      }
    } catch (error) {
      console.error("Error parsing PTP message or non-JSON message received:", error);
      // Fallback for non-JSON messages (though we aim for all JSON now)
      setMessages((prevMessages) => [...prevMessages, `Peer (unstructured): ${event.data}`]);
      toast.error("Received an unreadable message from peer.");
    }
  }, [peerUsername, resetStateAndGoToInitialView]);

  const handleDataChannelOpened = useCallback((channel: RTCDataChannel) => {
    console.log("Data channel opened! Label:", channel.label);
    dataChannelRef.current = channel; // Update ref
    setConnectionStatus("Connected! Chat is active.");
    setMessages((prevMessages) => [...prevMessages, "System: Data channel opened successfully."]);
    
    // Announce username
    if (localUsername) {
      sendPtpMessage('USERNAME_ANNOUNCE', localUsername);
    }
    if (localUserPFP) {
      sendPtpMessage('PFP_ANNOUNCE', localUserPFP);
    }

    setView('chatRoom'); // Transition to chat room view
    setIsProcessingSignal(false);
  }, [localUsername, localUserPFP, sendPtpMessage]); // Added localUsername and sendPtpMessage
  
  useEffect(() => {
    // Cleanup on unmount
    return () => {
      resetStateAndGoToInitialView(); // Silently reset on unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeNewPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) resetStateAndGoToInitialView(); // Ensure clean slate if called mid-process
    
    collectedIceCandidatesRef.current = [];
    if(iceGatheringTimeoutRef.current) clearTimeout(iceGatheringTimeoutRef.current);
    
    const pcListeners = {
      onDataChannelOpened: handleDataChannelOpened,
      onDataChannelMessage: handleDataChannelMessage,
      onIceCandidate: (candidate: RTCIceCandidate) => {
        if (candidate) {
            console.log("Generated ICE Candidate:", JSON.stringify(candidate.toJSON(), null, 2));
            collectedIceCandidatesRef.current.push(candidate.toJSON());
        }
      },
      onConnectionStateChange: () => {
        const pc = peerConnectionRef.current;
        if (pc) {
          let statusMsg = `Peer Connection: ${pc.connectionState}`;
          if (pc.connectionState === 'connected' && dataChannelRef.current?.readyState === 'open') {
            // Handled by onDataChannelOpened for view transition
            statusMsg = "Connected! Chat is active.";
          } else if (pc.connectionState === 'failed') {
            statusMsg = "Connection failed. Please reset and try again.";
            if (view === 'chatRoom') {
              resetStateAndGoToInitialView("Connection failed abruptly.", { type: 'error' });
            } else {
              resetStateAndGoToInitialView("Connection attempt failed.", { description: "Please check details and try again.", type: 'error'});
              setView('initial'); 
            }
          } else if (['disconnected', 'closed'].includes(pc.connectionState)) {
            statusMsg = `Connection ${pc.connectionState}.`;
            if (view === 'chatRoom') {
                 // If already disconnected by USER_DISCONNECT, this might be redundant but safe
                 if (dataChannelRef.current) { // Check if it wasn't already cleared by USER_DISCONNECT
                    resetStateAndGoToInitialView(`${peerUsername || 'Peer'} connection lost.`, { type: 'warning' });
                 }
            } else {
                // For non-chat views, just reset state, maybe a silent log
                resetStateAndGoToInitialView(); 
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
  }, [handleDataChannelOpened, handleDataChannelMessage, resetStateAndGoToInitialView, view, peerUsername]);

  // --- Signaling String Bundling ---
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
            console.warn("ICE gathering timed out, using collected candidates.");
            finalize();
            if(pc) pc.onicegatheringstatechange = null;
        }, 3000);
    }
  };

  // --- Initiator Logic ---
  const handleInitiatorGenerateString = useCallback(async () => {
    resetWebRTCInternals();
    setConnectionStatus("Initializing new connection attempt..."); 
    setIsProcessingSignal(true);

    const pc = initializeNewPeerConnection();
    if (!pc) {
        toast.error("Failed to initialize connection internally.");
        resetStateAndGoToInitialView("Initialization failed.", { type: 'error'});
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
      console.error("Error creating offer:", error);
      resetStateAndGoToInitialView("Failed to create offer.", { description: "Please check console and try again.", type: 'error' });
    }
  }, [resetWebRTCInternals, initializeNewPeerConnection, handleDataChannelMessage, handleDataChannelOpened, startIceGatheringAndFinalize, resetStateAndGoToInitialView]);

  // useEffect to handle auto-initiation when view changes to initiatorDialog
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
      resetStateAndGoToInitialView("Connection error.", { description: "Please reset and try again.", type: 'error' });
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
      console.error("Parsing peer response error:", error);
      resetStateAndGoToInitialView("Invalid response from peer.", { description: "The data format is not recognized.", type: 'error' });
      return;
    }

    try {
      setConnectionStatus("Processing answer from peer...");
      await setRemoteDescription(pc, receivedBundle.sdp);
      for (const candidate of receivedBundle.candidates) {
         if (candidate?.candidate) await addIceCandidate(pc, candidate);
      }
      setConnectionStatus("Response processed. Attempting to connect...");
      // Connection will proceed via onConnectionStateChange and onDataChannelOpened
    } catch (error) {
      console.error("Error processing answer string:", error);
      resetStateAndGoToInitialView("Failed to process peer's answer.", { description: "Please check console and try again.", type: 'error' });
    }
  };

  // --- Receiver Logic ---
  const handleReceiverProcessOfferAndCreateAnswer = async (offerString: string) => {
    if (!localUsername) { toast.error("Please enter a username first!"); return; }
    if (!offerString) {
      toast.warning("Empty offer string from initiator.");
      setIsProcessingSignal(false); return;
    }
    resetWebRTCInternals(); // Lightweight reset for a new attempt
    setConnectionStatus("Initializing for answer...");
    // setIsProcessingSignal(true); // This is set by startIceGatheringAndFinalize
    const pc = initializeNewPeerConnection();
    if (!pc) { 
        toast.error("Failed to initialize connection internally for receiver.");
        resetStateAndGoToInitialView("Initialization failed for receiver.", { type: 'error'});
        return; 
    }
    let receivedBundle: BundledSignal;
    try {
      receivedBundle = JSON.parse(offerString);
      if (!receivedBundle.sdp || !receivedBundle.candidates) throw new Error("Invalid offer format");
    } catch (error) {
      console.error("Parsing offer string error:", error);
      resetStateAndGoToInitialView("Invalid offer from initiator.", { description: "The data format is not recognized.", type: 'error' });
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
      console.error("Error processing offer or creating answer:", error);
      resetStateAndGoToInitialView("Failed to process offer.", { description: "Please check console and try again.", type: 'error' });
    }
  };

  // --- Chat Message Logic ---
  const handleSendMessage = () => {
    if (messageInput.trim()) {
      sendPtpMessage('CHAT_MESSAGE', messageInput.trim());
      setMessages((prevMessages) => [...prevMessages, `${localUsername || 'You'}: ${messageInput.trim()}`]);
      setMessageInput("");
    } else if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      toast.warning("Cannot send message.", { description: "Data channel is not open."} );
    } 
  };

  // --- UI Navigation and Helpers ---
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Copied to clipboard!"))
      .catch(err => {
        console.error('Failed to copy: ', err);
        toast.error("Failed to copy to clipboard.");
      });
  };

  const handleLeaveChat = () => {
    toast.info("You are disconnecting from the chat...");
    sendPtpMessage('USER_DISCONNECT', { username: localUsername }); // Send disconnect message
    // A small delay to allow the message to be sent before tearing down the connection
    setTimeout(() => {
        resetStateAndGoToInitialView("You have left the chat.", { type: 'info'});
    }, 200); // 200ms delay, adjust if needed
  };

  const handleUserDetailsSet = (username: string, pfpDataUrl: string | null) => {
    if (!username.trim()) {
        toast.error("Username cannot be empty.");
        return false;
    }
    setLocalUsername(username);
    setLocalUserPFP(pfpDataUrl);
    setGeneratedStringForPeer("");
    setIsInitiationAttempted(false);
    return true;
  };

  // --- Render Logic ---
  const renderView = () => {
    switch (view) {
      case 'initiatorDialog':
        return <InitiatorFlowDialog 
                  isOpen={true} 
                  onClose={() => resetStateAndGoToInitialView()} // Full reset if dialog is closed by user
                  generatedString={generatedStringForPeer}
                  onGenerateString={handleInitiatorGenerateString} // Dialog can still re-trigger generation
                  onProcessResponse={handleInitiatorProcessResponse}
                  isProcessing={isProcessingSignal}
                  copyToClipboard={copyToClipboard}
                  connectionStatus={connectionStatus}
                />;
      case 'receiverDialog':
        return <ReceiverFlowDialog 
                  isOpen={true} 
                  onClose={() => resetStateAndGoToInitialView()} // Full reset
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
      case 'initial':
      default:
        return <InitialView 
                  onInitiate={(uname, pfp) => {
                    if (handleUserDetailsSet(uname, pfp)) {
                      setIsInitiationAttempted(false);
                      setGeneratedStringForPeer("");
                      setView('initiatorDialog'); 
                    }
                  }}
                  onJoin={(uname, pfp) => {
                    if (handleUserDetailsSet(uname, pfp)) {
                      setView('receiverDialog'); 
                    }
                  }}
                />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors closeButton position="top-right" />
      {/* Render dialogs on top of InitialView if not in chatRoom, or ChatRoom itself */} 
      {view === 'initial' && renderView()} 
      {view === 'initiatorDialog' && renderView()} 
      {view === 'receiverDialog' && renderView()} 
      {view === 'chatRoom' && renderView()} 
      {/* A more direct way for dialogs: 
          Only InitialView or ChatRoom are full page. 
          Dialogs are rendered conditionally on top of InitialView, 
          or page.tsx manages which of the 3 "full pages" to show. 
          The current renderView switch handles this okay.
      */}
    </div>
  );
}
