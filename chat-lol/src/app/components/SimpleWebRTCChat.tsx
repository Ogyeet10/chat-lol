"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import { toast } from 'sonner';
import ChatRoom from "./ChatRoom";
import {
  createPeerConnection,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  createDataChannel,
} from "../../lib/webrtc";

interface SimpleWebRTCChatProps {
  targetSessionId: string;
  otherUsername: string;
  requestId?: string; // If this was initiated by us
  onLeaveChat: () => void;
  isInitiator: boolean; // Clear role definition
  offerData?: any; // For receivers to process incoming offer
  onConnectionReady?: () => void; // Called when WebRTC connection is truly established
}

interface PtpMessage {
  type: 'USERNAME_ANNOUNCE' | 'CHAT_MESSAGE' | 'USER_DISCONNECT';
  payload: any;
}

export default function SimpleWebRTCChat({ 
  targetSessionId, 
  otherUsername, 
  requestId, 
  onLeaveChat,
  isInitiator,
  offerData,
  onConnectionReady
}: SimpleWebRTCChatProps) {
  const [connectionStatus, setConnectionStatus] = useState("Initializing...");
  const [messages, setMessages] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [dataChannelState, setDataChannelState] = useState<string | null>(null);
  const [actualRequestId, setActualRequestId] = useState<string | null>(requestId || null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const hasProcessedOfferRef = useRef(false);

  const auth = authStorage.getAuth();

  // Update actualRequestId when requestId prop changes
  useEffect(() => {
    if (requestId && requestId !== actualRequestId) {
      console.log('🔌 DEBUG: Updating actualRequestId from', actualRequestId, 'to', requestId);
      setActualRequestId(requestId);
    }
  }, [requestId, actualRequestId]);

  // Convex mutations and queries
  const replyToRequest = useMutation(api.webrtc_signaling.replyToConnectionRequest);
  const markCompleted = useMutation(api.webrtc_signaling.markConnectionCompleted);
  const sendConnectionRequest = useMutation(api.webrtc_signaling.sendConnectionRequest);
  
  // Only check request status if we're the initiator and have a requestId
  const checkRequestStatus = useQuery(
    api.webrtc_signaling.checkConnectionRequestStatus,
    auth.token && isInitiator && actualRequestId ? { 
      requestId: actualRequestId as any,
      userToken: auth.token 
    } : "skip"
  );

  // Monitor request status for initiators
  useEffect(() => {
    if (isInitiator && checkRequestStatus && actualRequestId) {
      console.log('🔌 DEBUG: Received connection request snapshot:', JSON.stringify(checkRequestStatus, null, 2));
      console.log(`🔌 DEBUG: Processing request status: ${checkRequestStatus.status} for request ID: ${actualRequestId}`);
      
      if (checkRequestStatus.status === "replied" && checkRequestStatus.responseData) {
        console.log('🔌 DEBUG: Found reply in snapshot, processing answer from:', otherUsername);
        handleReceivedAnswer(checkRequestStatus.responseData);
      } else {
        console.log(`🔌 DEBUG: No action taken - status is "${checkRequestStatus.status}" or no response data available`);
      }
    }
  }, [checkRequestStatus, isInitiator, actualRequestId]);

  // Initialize WebRTC connection
  useEffect(() => {
    initializeWebRTC();
    
    return () => {
      cleanup();
    };
  }, []);

  // Process offer for receivers
  useEffect(() => {
    console.log('🔌 DEBUG: Process offer effect triggered:', {
      isInitiator,
      hasOfferData: !!offerData,
      hasPeerConnection: !!peerConnectionRef.current,
      hasProcessed: hasProcessedOfferRef.current,
      actualRequestId,
      requestId
    });
    
    if (!isInitiator && offerData && peerConnectionRef.current && !hasProcessedOfferRef.current && actualRequestId) {
      console.log("Processing incoming offer for receiver");
      processIncomingOffer(offerData);
    }
  }, [isInitiator, offerData, actualRequestId]);

  const initializeWebRTC = useCallback(() => {
    setConnectionStatus("Setting up connection...");
    
    const listeners = {
      onDataChannelOpened: (channel: RTCDataChannel) => {
        console.log("Data channel opened");
        dataChannelRef.current = channel;
        setDataChannelState(channel.readyState);
        setConnectionStatus("Connected! Chat is active.");
        setMessages(prev => [...prev, "System: Connection established successfully."]);
        
        // Announce username
        sendPtpMessage('USERNAME_ANNOUNCE', auth.username || "Unknown");
        
        // Notify parent that WebRTC connection is truly established
        onConnectionReady?.();
        
        // Mark as completed if we have a requestId
        if (auth.token && actualRequestId) {
          markCompleted({ 
            requestId: actualRequestId as any, 
            userToken: auth.token 
          }).catch(err => console.error("Failed to mark completed:", err));
        }
      },
      onDataChannelMessage: (event: MessageEvent) => {
        handleDataChannelMessage(event);
      },
      onIceCandidate: (candidate: RTCIceCandidate) => {
        // ICE candidates are handled in the offer/answer exchange
        console.log("ICE candidate generated:", candidate);
      },
      onConnectionStateChange: () => {
        const pc = peerConnectionRef.current;
        if (pc) {
          console.log("Connection state changed:", pc.connectionState);
          setConnectionStatus(`Connection: ${pc.connectionState}`);
          
          if (pc.connectionState === 'failed') {
            toast.error("Connection failed");
            setConnectionStatus("Connection failed");
          } else if (pc.connectionState === 'disconnected') {
            toast.warning("Connection lost");
            setConnectionStatus("Disconnected");
          }
        }
      }
    };

    const pc = createPeerConnection(listeners);
    peerConnectionRef.current = pc;

    if (isInitiator) {
      // We initiated this connection, create data channel and create/send offer
      const dc = createDataChannel(pc, "chatChannel");
      dc.onopen = () => listeners.onDataChannelOpened(dc);
      dc.onmessage = listeners.onDataChannelMessage;
      
      // Create and send offer if we have auth but no requestId (first time)
      if (auth.token && !actualRequestId) {
        createAndSendOfferForInitiator(pc).then(newRequestId => {
          if (newRequestId) {
            setActualRequestId(newRequestId);
          }
        });
      } else {
        setConnectionStatus("Waiting for response...");
      }
    } else {
      // We're receiving a connection, wait for offer to be processed
      setConnectionStatus("Ready to accept connection...");
    }
  }, [isInitiator, auth.token, auth.username, actualRequestId]);

  const createAndSendOfferForInitiator = async (pc: RTCPeerConnection) => {
    if (!auth.token) return;
    
    try {
      setConnectionStatus("Creating and sending offer...");
      const offer = await createOffer(pc);
      
      console.log(`🔌 DEBUG: Generating connection request to user: ${otherUsername} (session: ${targetSessionId})`);
      console.log('🔌 DEBUG: Offer content:', JSON.stringify(offer, null, 2));
      console.log('🔌 DEBUG: Connecting from user:', auth.username);
      
      const result = await sendConnectionRequest({
        toSessionId: targetSessionId,
        userToken: auth.token,
        offerData: offer
      });
      
      console.log('🔌 DEBUG: Connection request sent successfully, request ID:', result.requestId);
      
      setConnectionStatus("Offer sent, waiting for answer...");
      // Return the new request ID so parent can update
      return result.requestId;
    } catch (error) {
      console.error("Failed to create and send offer:", error);
      toast.error("Failed to send offer");
      setConnectionStatus("Failed to send offer");
      return null;
    }
  };

  const handleReceivedAnswer = async (answerData: RTCSessionDescriptionInit) => {
    if (!isInitiator || !peerConnectionRef.current) {
      console.error("Received answer but not initiator or no peer connection");
      return;
    }
    
    setConnectionStatus("Received answer, finalizing connection...");
    
    try {
      await setRemoteDescription(peerConnectionRef.current, answerData);
      setConnectionStatus("Answer processed, connecting...");
    } catch (error) {
      console.error("Failed to handle answer:", error);
      toast.error("Failed to process answer");
      setConnectionStatus("Failed to process answer");
    }
  };

  const processIncomingOffer = async (offerData: RTCSessionDescriptionInit) => {
    if (isInitiator || !peerConnectionRef.current || hasProcessedOfferRef.current) {
      console.log("🔌 DEBUG: Skipping offer processing:", { isInitiator, hasPc: !!peerConnectionRef.current, hasProcessed: hasProcessedOfferRef.current });
      return;
    }
    
    console.log(`🔌 DEBUG: Processing incoming connection request from: ${otherUsername}`);
    console.log('🔌 DEBUG: Received offer data:', JSON.stringify(offerData, null, 2));
    console.log('🔌 DEBUG: Receiving user:', auth.username);
    console.log('🔌 DEBUG: Current actualRequestId:', actualRequestId);
    console.log('🔌 DEBUG: Props requestId:', requestId);
    
    hasProcessedOfferRef.current = true;
    setConnectionStatus("Processing incoming offer...");
    
    try {
      // Set up data channel listener for incoming connection
      peerConnectionRef.current.ondatachannel = (event) => {
        const channel = event.channel;
        channel.onopen = () => {
          console.log("🔌 DEBUG: Received data channel opened");
          dataChannelRef.current = channel;
          setDataChannelState(channel.readyState);
          setConnectionStatus("Connected! Chat is active.");
          setMessages(prev => [...prev, "System: Connection established successfully."]);
          
          // Announce username
          sendPtpMessage('USERNAME_ANNOUNCE', auth.username || "Unknown");
          
          // Notify parent that WebRTC connection is truly established
          onConnectionReady?.();
        };
        channel.onmessage = handleDataChannelMessage;
      };

      console.log('🔌 DEBUG: About to call createAnswer...');
      let answer;
      try {
        answer = await createAnswer(peerConnectionRef.current, offerData);
        console.log('🔌 DEBUG: Created answer for request:', JSON.stringify(answer, null, 2));
      } catch (createAnswerError) {
        console.error('🔌 DEBUG: createAnswer failed:', createAnswerError);
        throw createAnswerError;
      }
      
      // Accept the request with our answer
      console.log('🔌 DEBUG: Ready to send answer - auth.token:', !!auth.token, 'actualRequestId:', actualRequestId);
      if (auth.token && actualRequestId) {
        console.log('🔌 DEBUG: Sending answer to database...');
        await replyToRequest({
          requestId: actualRequestId as any,
          userToken: auth.token,
          answerData: answer
        });
        console.log('🔌 DEBUG: Answer sent successfully for request ID:', actualRequestId);
        setConnectionStatus("Answer sent, connecting...");
      } else {
        console.log('🔌 DEBUG: Cannot send answer - missing auth token or request ID');
        setConnectionStatus("Failed to send answer - missing credentials");
      }
    } catch (error) {
      console.error("🔌 DEBUG: Failed to process offer:", error);
      toast.error("Failed to process offer");
      setConnectionStatus("Failed to process offer");
    }
  };

  const sendPtpMessage = useCallback((type: PtpMessage['type'], payload: any) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const message: PtpMessage = { type, payload };
      try {
        dataChannelRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending PTP message:", error);
        toast.error("Failed to send message");
      }
    }
  }, []);

  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const ptpMsg: PtpMessage = JSON.parse(event.data);
      switch (ptpMsg.type) {
        case 'USERNAME_ANNOUNCE':
          if (typeof ptpMsg.payload === 'string') {
            setMessages(prev => [...prev, `System: ${ptpMsg.payload} has joined the chat.`]);
            toast.success(`${ptpMsg.payload} has connected!`);
          }
          break;
        case 'CHAT_MESSAGE':
          if (typeof ptpMsg.payload === 'string') {
            setMessages(prev => [...prev, `${otherUsername}: ${ptpMsg.payload}`]);
          }
          break;
        case 'USER_DISCONNECT':
          setMessages(prev => [...prev, `System: ${otherUsername} has disconnected.`]);
          toast.info(`${otherUsername} has left the chat`);
          onLeaveChat();
          break;
        default:
          setMessages(prev => [...prev, `${otherUsername}: ${event.data}`]);
      }
    } catch (error) {
      setMessages(prev => [...prev, `${otherUsername}: ${event.data}`]);
    }
  }, [otherUsername, onLeaveChat]);

  const handleSendMessage = () => {
    if (messageInput.trim() && dataChannelRef.current?.readyState === 'open') {
      sendPtpMessage('CHAT_MESSAGE', messageInput.trim());
      setMessages(prev => [...prev, `${auth.username || 'You'}: ${messageInput.trim()}`]);
      setMessageInput("");
    }
  };

  const cleanup = () => {
    // Send disconnect message
    if (dataChannelRef.current?.readyState === 'open') {
      sendPtpMessage('USER_DISCONNECT', { username: auth.username });
    }
    
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

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