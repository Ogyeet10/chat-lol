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

  // Monitor for incoming connection offers
  const incomingOffers = useQuery(api.peerConnections.getConnectionOffers, 
    sessionId && auth.token ? { sessionId, userToken: auth.token } : "skip"
  );

  // Auto-handle incoming connection offers (for receivers)
  useEffect(() => {
    if (!incomingOffers || incomingOffers.length === 0 || activeConnection || pendingConnection) return;

    // Find unprocessed offers
    const newOffer = incomingOffers.find(offer => 
      offer.status === "offered" && !processedRequestsRef.current.has(offer.connectionId)
    );

    if (newOffer) {
      console.log('📥 Incoming connection offer detected:', newOffer);
      
      // Mark as processed
      processedRequestsRef.current.add(newOffer.connectionId);
      
      // Extract source user info
      const sourceUsername = newOffer.sourceUser?.username || 'Unknown User';
      
      // Show notification
      toast.info(`Incoming connection from ${sourceUsername}`, {
        description: "Setting up connection automatically..."
      });
      
      // Auto-connect to the offer (Client 2 becomes receiver)
      handleConnectionEstablished(
        newOffer.sessionId, // Source session that initiated
        sourceUsername,
        newOffer.connectionId,
        false, // isInitiator = false (we're receiving)
        newOffer.connectionData // Pass the offer data from the incoming connection
      );
    }
  }, [incomingOffers, activeConnection, pendingConnection]);


  const handleConnectionEstablished = (
    targetSessionId: string, 
    username: string, 
    requestId?: string, 
    isInitiator: boolean = true,
    offerSignalData?: any // Added to accept offer data for receivers
  ) => {
    setPendingConnection({
      sessionId: targetSessionId,
      username,
      requestId,
      isInitiator,
      offerData: offerSignalData // Store the offer data
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
              sessionId={sessionId}
              onBack={() => setActiveView('main')}
              onStartChatWithFriend={(targetSessionId, friendUserId, friendUsername, isInitiator, connectionId) => {
                // The connectionId from the selector is passed as requestId
                handleConnectionEstablished(targetSessionId, friendUsername, connectionId, isInitiator);
              }}
            />
          </div>
        ) : activeConnection ? (
          <SimpleWebRTCChat
            userSessionId={sessionId!}
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
            userSessionId={sessionId!}
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