"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal
} from "@/components/ui/dropdown-menu";
import { MessageCircle, UserPlus, LogOut, Users, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import SimpleWebRTCChat from './SimpleWebRTCChat';
import FriendsPanel from './FriendsPanel';
import FriendNotificationBadge from './FriendNotificationBadge';
import WebRTCFriendSelector from './WebRTCFriendSelector';
import { toast } from 'sonner';
import { useTheme } from "@/lib/theme";
import SettingsDialog from './SettingsDialog';

interface MainChatInterfaceProps {
  currentUsername: string;
  sessionId: string | null;
  isSessionActive: boolean;
  onLogout: () => void;
}

export default function MainChatInterface({ currentUsername, sessionId, isSessionActive, onLogout }: MainChatInterfaceProps) {
  const [activeView, setActiveView] = useState<'main' | 'friends' | 'connect'>('main');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFriendSelectorOpen, setIsFriendSelectorOpen] = useState(false);
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

  const user = useQuery(api.users.getViewer, auth.token ? { token: auth.token } : "skip");
  const cleanupStaleSessions = useMutation(api.sessions.cleanupOldSessions);
  const incomingPings = useQuery(api.livePings.getIncoming, sessionId && auth.token ? { targetSessionId: sessionId, userToken: auth.token } : "skip");
  const respondToPing = useMutation(api.livePings.respond);
  const { setTheme } = useTheme();

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

  useEffect(() => {
    cleanupStaleSessions();
  }, [cleanupStaleSessions]);

  useEffect(() => {
    if (incomingPings && incomingPings.length > 0) {
      for (const ping of incomingPings) {
        if (auth.token) {
          respondToPing({ pingId: ping._id, userToken: auth.token });
        }
      }
    }
  }, [incomingPings, respondToPing, auth.token]);

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

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
  };

  return (
    <>
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-muted/40 border-r flex flex-col justify-between">
          <div className="flex flex-col flex-grow">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex space-x-1">
                  <Button
                    variant={activeView === 'main' || activeView === 'connect' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveView('main')}
                    className="relative"
                  >
                    <MessageCircle className="h-4 w-4 mr-1"/>
                    Chat
                  </Button>
                  <Button
                    variant={activeView === 'friends' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveView('friends')}
                    className="relative"
                  >
                    <Users className="h-4 w-4 mr-1"/>
                    Friends
                    <FriendNotificationBadge/>
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground hover:text-destructive">
                  <LogOut className="h-4 w-4"/>
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-grow">
              <div className="grid overflow-hidden">
                {/* Main View */}
                <div
                  style={{gridArea: '1 / 1 / 2 / 2'}}
                  className={`transition-transform duration-300 ease-in-out ${
                    activeView === 'main' || activeView === 'connect'
                      ? 'translate-x-0'
                      : '-translate-x-full'
                  }`}
                >
                  <div className="p-4 space-y-4">
                    {/* Connect to Session Button */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsFriendSelectorOpen(true)}
                      disabled={!!activeConnection || !!pendingConnection}
                    >
                      <UserPlus className="mr-2 h-4 w-4"/>
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
                </div>

                {/* Friends View */}
                <div
                  style={{gridArea: '1 / 1 / 2 / 2'}}
                  className={`transition-transform duration-300 ease-in-out ${
                    activeView === 'friends'
                      ? 'translate-x-0'
                      : 'translate-x-full'
                  }`}
                >
                  <FriendsPanel currentUsername={currentUsername}/>
                </div>
              </div>
            </ScrollArea>
          </div>

          <div className="p-4 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start items-center space-x-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.imageUrl} alt={user?.username}/>
                    <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">{user?.username}</span>
                    <span className="text-xs text-muted-foreground">Online</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.username}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator/>
                <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="mr-2 h-4 w-4"/>
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"/>
                    <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"/>
                    <span>Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => handleThemeChange('light')}>
                        <Sun className="mr-2 h-4 w-4"/>
                        <span>Light</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
                        <Moon className="mr-2 h-4 w-4"/>
                        <span>Dark</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleThemeChange('system')}>
                        <Monitor className="mr-2 h-4 w-4"/>
                        <span>System</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuSeparator/>
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="mr-2 h-4 w-4"/>
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {activeConnection || pendingConnection ? (
            <SimpleWebRTCChat
              key={activeConnection?.sessionId || pendingConnection?.sessionId}
              userSessionId={sessionId!}
              targetSessionId={activeConnection?.sessionId || pendingConnection?.sessionId || ''}
              otherUsername={activeConnection?.username || pendingConnection?.username || 'Peer'}
              isInitiator={activeConnection?.isInitiator ?? pendingConnection?.isInitiator ?? false}
              onConnectionReady={handleWebRTCConnectionReady}
              onLeaveChat={handleLeaveConnection}
              offerData={activeConnection?.offerData || pendingConnection?.offerData}
              requestId={activeConnection?.requestId || pendingConnection?.requestId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/20">
              <div className="text-center">
                <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">Welcome to the Chat</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a friend to start a conversation or connect via session ID.
                </p>
              </div>
            </div>
          )}
        </main>

        {isFriendSelectorOpen && (
          <WebRTCFriendSelector
            sessionId={sessionId}
            isOpen={isFriendSelectorOpen}
            onClose={() => setIsFriendSelectorOpen(false)}
            onStartChatWithFriend={(targetSessionId, friendUserId, friendUsername, isInitiator, connectionId) => {
              handleConnectionEstablished(targetSessionId, friendUsername, connectionId, isInitiator);
            }}
          />
        )}
      </div>
    </>
  );
}