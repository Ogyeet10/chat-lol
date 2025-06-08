"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Users, 
  Wifi, 
  WifiOff, 
  Clock, 
  ArrowLeft,
  RefreshCw,
  MessageCircle,
  Signal
} from 'lucide-react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import { toast } from 'sonner';
interface WebRTCFriendSelectorProps {
  sessionId: string | null;
  onBack: () => void;
  onStartChatWithFriend: (chatId: string, friendUserId: string, friendUsername: string, isInitiator: boolean) => void;
}

export default function WebRTCFriendSelector({ sessionId, onBack, onStartChatWithFriend }: WebRTCFriendSelectorProps) {
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedFriendUsername, setSelectedFriendUsername] = useState<string | null>(null);
  const [friendSessions, setFriendSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const auth = authStorage.getAuth();
  
  // Get friends with session counts
  const friends = useQuery(
    api.friends.getFriendsWithSessionCounts,
    auth.token ? { userToken: auth.token } : "skip"
  );

  // Get friend's active sessions
  const getFriendSessions = useMutation(api.friends.getFriendActiveSessions);
  
  // Create connection offer
  const createConnectionOffer = useMutation(api.peerConnections.createConnectionOffer);
  
  // WebRTC removed - no connection requests

  const handleSelectFriend = async (friendUserId: string, friendUsername: string, useActivePing: boolean = false) => {
    if (!auth.token) {
      toast.error("Authentication required");
      return;
    }

    setSelectedFriendId(friendUserId);
    setSelectedFriendUsername(friendUsername);
    setIsLoadingSessions(true);
    setFriendSessions([]);

    try {
      const result = await getFriendSessions({
        friendUserId: friendUserId as any,
        userToken: auth.token,
        performActivePing: useActivePing
      });

      setFriendSessions(result.activeSessions);
      
      const pingMethodText = result.pingMethod === "active_ping" ? "active ping" : "quick check";
      
      if (result.activeSessionsCount === 0) {
        toast.info(`${friendUsername} has no active sessions`, {
          description: `Verified with ${pingMethodText} - they may not be online right now`
        });
      } else {
        toast.success(`Found ${result.activeSessionsCount} active session${result.activeSessionsCount > 1 ? 's' : ''} for ${friendUsername}`, {
          description: `Verified with ${pingMethodText}`
        });
      }
    } catch (error: any) {
      toast.error("Failed to get friend's sessions", {
        description: error.message || "Please try again"
      });
      setSelectedFriendId(null);
      setSelectedFriendUsername(null);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleRefreshSessions = () => {
    if (selectedFriendId && selectedFriendUsername) {
      // Use active pinging when refreshing to send ping requests to sessions
      toast.info("Sending ping requests to sessions...", {
        description: "Sessions will be checked for recent activity and pinged to verify responsiveness"
      });
      handleSelectFriend(selectedFriendId, selectedFriendUsername, true);
    }
  };

  const handleConnectToSession = async (targetSessionId: string) => {
    console.log('🔍 Debug connection info:', {
      'auth.token': !!auth.token,
      'selectedFriendUsername': selectedFriendUsername,
      'sessionId': sessionId,
      'targetSessionId': targetSessionId
    });

    if (!auth.token) {
      toast.error("Missing authentication token");
      return;
    }
    
    if (!selectedFriendUsername) {
      toast.error("No friend selected");
      return;
    }
    
    if (!sessionId) {
      toast.error("No session ID available");
      return;
    }

    try {
      // First, create connection offer in database
      const connectionResult = await createConnectionOffer({
        sessionId: sessionId,
        targetSessionId: targetSessionId,
        userToken: auth.token,
        connectionData: {
          initiatedAt: Date.now(),
          initiatorUsername: auth.username
        }
      });

      console.log("✅ Connection offer created:", connectionResult);

      // Then start the chat with the selected friend's session
      onStartChatWithFriend(
        `chat_${targetSessionId}`, // chatId
        selectedFriendId!, // friendUserId  
        selectedFriendUsername, // friendUsername
        true // isInitiator (we're initiating the connection)
      );
      
      toast.success(`Connection offer sent to ${selectedFriendUsername}!`);
    } catch (error: any) {
      console.error("❌ Failed to start chat:", error);
      toast.error("Failed to start chat", {
        description: error.message || "Please try again"
      });
    }
  };

  const formatTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (!friends) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Loading Friends...
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {selectedFriendId ? `${selectedFriendUsername}'s Sessions` : 'Select Friend for PeerJS Chat'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!sessionId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-yellow-900">Session Initializing...</p>
            <p className="text-yellow-700 text-xs mt-1">Please wait while your session is being set up.</p>
          </div>
        )}
        
        {!selectedFriendId ? (
          // Friend selection view
          <div>
            {friends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No friends yet</p>
                <p className="text-sm mt-1">Add some friends to start PeerJS chats!</p>
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.userId}
                      className="p-3 rounded-lg border bg-background/50 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleSelectFriend(friend.userId, friend.username)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {friend.username.substring(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{friend.username}</p>
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                              {friend.isOnline ? (
                                <>
                                  <Wifi className="h-3 w-3 text-green-500" />
                                  <span className="text-green-500">Online</span>
                                  <span>•</span>
                                  <span>{friend.activeSessionCount} session{friend.activeSessionCount !== 1 ? 's' : ''}</span>
                                </>
                              ) : (
                                <>
                                  <WifiOff className="h-3 w-3 text-gray-400" />
                                  <span>Offline</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <MessageCircle className="h-3 w-3 mr-1" />
                          Select
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        ) : (
          // Friend sessions view
          <div>
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSelectedFriendId(null);
                  setSelectedFriendUsername(null);
                  setFriendSessions([]);
                }}
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                Back to Friends
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshSessions}
                disabled={isLoadingSessions}
              >
                {isLoadingSessions ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>

            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Checking sessions...</span>
              </div>
            ) : friendSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <WifiOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{selectedFriendUsername} has no active sessions</p>
                <p className="text-sm mt-1">They may not be online right now</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Active sessions for <strong>{selectedFriendUsername}</strong>:
                </p>
                {friendSessions.map((session, index) => (
                  <div
                    key={session.sessionId}
                    className="p-3 rounded-lg border bg-background/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Signal className={`h-4 w-4 ${
                          session.pingStatus === "recently_active" ? "text-green-500" :
                          session.pingStatus === "recent_activity" ? "text-blue-500" :
                          "text-gray-400"
                        }`} />
                        <div>
                          <p className="font-mono text-sm">{session.sessionId}</p>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Last ping: {formatTimeSince(session.lastPing)}</span>
                            <span>•</span>
                            <span>Created: {formatTimeSince(session.createdAt)}</span>
                            {session.pingStatus && (
                              <>
                                <span>•</span>
                                <span className={
                                  session.pingStatus === "recently_active" ? "text-green-600" :
                                  session.pingStatus === "recent_activity" ? "text-blue-600" :
                                  "text-gray-600"
                                }>
                                  {session.pingStatus === "recently_active" ? "✓ Recently Active" :
                                   session.pingStatus === "recent_activity" ? "Recent activity" :
                                   "Unknown status"}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleConnectToSession(session.sessionId)}
                        disabled={!sessionId}
                        className="bg-primary hover:bg-primary/90 disabled:opacity-50"
                        title={!sessionId ? "Waiting for session to be ready..." : "Connect to this session"}
                      >
                        <MessageCircle className="h-3 w-3 mr-1" />
                        {!sessionId ? "Loading..." : "Connect"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 