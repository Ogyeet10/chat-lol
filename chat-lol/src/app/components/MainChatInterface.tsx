"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, UserPlus, LogOut, Users } from 'lucide-react';
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import SimpleWebRTCChat from './SimpleWebRTCChat';
import FriendsPanel from './FriendsPanel';
import FriendNotificationBadge from './FriendNotificationBadge';
import WebRTCFriendSelector from './WebRTCFriendSelector';
import { toast } from 'sonner';

interface MainChatInterfaceProps {
  currentUsername: string;
  sessionId: string | null;
  isSessionActive: boolean;
  onLogout: () => void;
}

interface ConnectionRequest {
  _id: string;
  fromSessionId: string;
  fromUsername: string;
  requestData?: any;
  createdAt: number;
}

export default function MainChatInterface({ currentUsername, sessionId, isSessionActive, onLogout }: MainChatInterfaceProps) {
  const [activeView, setActiveView] = useState<'main' | 'friends' | 'connect'>('main');
  const [activeConnection, setActiveConnection] = useState<{
    sessionId: string;
    username: string;
    requestId?: string;
    isInitiator: boolean;
    offerData?: any; // For receivers
  } | null>(null);
  
  const [pendingConnection, setPendingConnection] = useState<{
    sessionId: string;
    username: string;
    requestId?: string;
    isInitiator: boolean;
    offerData?: any; // For receivers
  } | null>(null);
  
  // Track processed requests to prevent re-processing
  const processedRequestsRef = useRef<Set<string>>(new Set());

  const auth = authStorage.getAuth();

  // Debug auth token and session
  console.log('🔌 DEBUG: Auth and session state for incoming requests query:', {
    hasToken: !!auth.token,
    username: auth.username,
    tokenLength: auth.token?.length,
    sessionId: sessionId,
    hasSession: !!sessionId
  });

  console.log('🔌 DEBUG: Setting up useQuery with args:', auth.token && sessionId ? { userToken: auth.token, sessionId: sessionId } : "skip");

  // Get incoming connection requests - now reactive to session changes
  const incomingRequests = useQuery(
    api.webrtc_signaling.getSentConnectionRequests,
    auth.token && sessionId ? { userToken: auth.token, sessionId: sessionId } : "skip"
  );

  console.log('🔌 DEBUG: useQuery returned - value:', incomingRequests);
  console.log('🔌 DEBUG: useQuery returned - type:', typeof incomingRequests);
  console.log('🔌 DEBUG: useQuery returned - is array?', Array.isArray(incomingRequests));
  console.log('🔌 DEBUG: Query skipped?', !auth.token);

  // Effect to handle auto-connecting to incoming requests
  useEffect(() => {
    console.log('🔌 DEBUG: useEffect triggered - incomingRequests value:', incomingRequests);
    console.log('🔌 DEBUG: useEffect triggered - activeConnection:', activeConnection?.username || 'none');
    
    // Log all incoming request snapshots
    if (incomingRequests) {
      console.log('🔌 DEBUG: Received connection request snapshot:', JSON.stringify(incomingRequests, null, 2));
      if (incomingRequests.length > 0) {
        console.log(`🔌 DEBUG: Found ${incomingRequests.length} pending connection request(s)`);
        incomingRequests.forEach((req, index) => {
          console.log(`🔌 DEBUG: Request ${index + 1}: from ${req.fromUsername} (session: ${req.fromSessionId})`);
        });
      } else {
        console.log('🔌 DEBUG: No pending connection requests found');
      }
    }

    // Only process if we don't already have an active or pending connection
    if (!activeConnection && !pendingConnection && incomingRequests && incomingRequests.length > 0) {
      const requestToProcess = incomingRequests[0]; // Process the most recent one
      
      // Check if we've already processed this request
      if (processedRequestsRef.current.has(requestToProcess._id)) {
        console.log('🔌 DEBUG: Request already processed, skipping:', requestToProcess._id);
        return;
      }
      
      console.log("🔌 DEBUG: Auto-accepting incoming request from:", requestToProcess.fromUsername);
      console.log("🔌 DEBUG: Request details:", JSON.stringify(requestToProcess, null, 2));
      
      // Mark this request as processed
      processedRequestsRef.current.add(requestToProcess._id);
      
      toast.info(`Incoming connection from ${requestToProcess.fromUsername}`);
      
      setPendingConnection({
        sessionId: requestToProcess.fromSessionId,
        username: requestToProcess.fromUsername,
        requestId: requestToProcess._id,
        isInitiator: false,
        offerData: requestToProcess.requestData,
      });
      // Switch to main chat view on auto-accept
      setActiveView('main');
    } else if (!activeConnection && !pendingConnection && incomingRequests && incomingRequests.length === 0) {
      console.log('🔌 DEBUG: No action taken - no pending requests to process');
    } else if (activeConnection) {
      console.log('🔌 DEBUG: No action taken - already have active connection with:', activeConnection.username);
    } else if (pendingConnection) {
      console.log('🔌 DEBUG: No action taken - already have pending connection with:', pendingConnection.username);
    }
  }, [incomingRequests, activeConnection, pendingConnection]);


  const handleConnectionEstablished = (targetSessionId: string, username: string, requestId?: string, isInitiator: boolean = true) => {
    setPendingConnection({
      sessionId: targetSessionId,
      username,
      requestId,
      isInitiator
    });
    setActiveView('main');
  };

  const handleWebRTCConnectionReady = () => {
    if (pendingConnection) {
      console.log('🔌 DEBUG: WebRTC connection established, promoting pending to active:', pendingConnection.username);
      setActiveConnection(pendingConnection);
      setPendingConnection(null);
    }
  };

  const handleLeaveConnection = () => {
    setActiveConnection(null);
    setPendingConnection(null);
    // Clear processed requests so user can reconnect
    processedRequestsRef.current.clear();
    console.log('🔌 DEBUG: Connection ended, cleared processed requests');
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-muted/40 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1">
              <Button
                variant={activeView === 'main' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('main')}
                className="relative"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Chat
                {incomingRequests && incomingRequests.length > 0 && !activeConnection && !pendingConnection && (
                  <span className="ml-1 bg-destructive text-destructive-foreground rounded-full text-xs px-1.5 py-0.5 animate-pulse">
                    {incomingRequests.length}
                  </span>
                )}
              </Button>
              <Button
                variant={activeView === 'friends' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('friends')}
                className="relative"
              >
                <Users className="h-4 w-4 mr-1" />
                Friends
                <FriendNotificationBadge />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-grow">
          {activeView === 'main' ? (
            <div className="p-4 space-y-4">
              {/* Connect to Session Button */}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setActiveView('connect')}
                disabled={!!activeConnection || !!pendingConnection}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Connect to Session
              </Button>

              {/* Current Session Info */}
              {sessionId && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <h3 className="text-sm font-medium mb-2">Your Session</h3>
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-muted-foreground break-all">
                      {sessionId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Share this ID for others to connect to you
                    </p>
                  </div>
                </div>
              )}

              {/* Pending Connection */}
              {pendingConnection && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <h3 className="text-sm font-medium mb-2">Connecting...</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {pendingConnection.username.substring(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{pendingConnection.username}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {pendingConnection.isInitiator ? 'Initiated' : 'Received'}
                    </span>
                  </div>
                </div>
              )}

              {/* Active Connection */}
              {activeConnection && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <h3 className="text-sm font-medium mb-2">Active Connection</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {activeConnection.username.substring(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{activeConnection.username}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {activeConnection.isInitiator ? 'Initiated' : 'Received'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : activeView === 'friends' ? (
            <div className="p-4">
              <FriendsPanel currentUsername={currentUsername} />
            </div>
          ) : null}
        </ScrollArea>

        {/* User Profile at Bottom */}
        <div className="p-4 border-t">
          <div className="flex items-center space-x-2 p-2 rounded-lg bg-background/50">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{currentUsername.substring(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-grow">
              <p className="text-sm font-medium">{currentUsername}</p>
              <p className="text-xs text-muted-foreground">
                {isSessionActive ? 'Online' : 'Connecting...'}
              </p>
              {sessionId && (
                <p className="text-xs text-muted-foreground/60 font-mono">
                  {sessionId.substring(0, 8)}...
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-grow flex flex-col">
        {activeView === 'connect' ? (
          <div className="flex-grow flex items-center justify-center p-4">
            <WebRTCFriendSelector 
              onBack={() => setActiveView('main')}
              onStartChatWithFriend={(sessionId, friendUserId, friendUsername, isInitiator) => {
                // sessionId is the target session ID we're connecting to
                handleConnectionEstablished(sessionId, friendUsername, undefined, isInitiator);
              }}
            />
          </div>
        ) : activeConnection ? (
          <SimpleWebRTCChat
            targetSessionId={activeConnection.sessionId}
            otherUsername={activeConnection.username}
            requestId={activeConnection.requestId}
            isInitiator={activeConnection.isInitiator}
            offerData={activeConnection.offerData}
            onLeaveChat={handleLeaveConnection}
            onConnectionReady={handleWebRTCConnectionReady}
          />
        ) : pendingConnection ? (
          <SimpleWebRTCChat
            targetSessionId={pendingConnection.sessionId}
            otherUsername={pendingConnection.username}
            requestId={pendingConnection.requestId}
            isInitiator={pendingConnection.isInitiator}
            offerData={pendingConnection.offerData}
            onLeaveChat={handleLeaveConnection}
            onConnectionReady={handleWebRTCConnectionReady}
          />
        ) : (
          <div className="flex-grow flex items-center justify-center bg-muted/20">
            <div className="text-center space-y-3">
              <Users className="h-16 w-16 mx-auto text-muted-foreground/50" />
              <div>
                <h3 className="text-xl font-medium text-muted-foreground">No active connection</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect to a session or wait for incoming connections
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => setActiveView('connect')}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Connect to Session
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}