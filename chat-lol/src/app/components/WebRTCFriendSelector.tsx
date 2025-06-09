"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authStorage } from "@/lib/auth";
import { peerJSService } from "@/lib/peerjs";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, Wifi, WifiOff, Clock, Zap, CheckCircle2, Loader2, Sparkles, X, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

interface WebRTCFriendSelectorProps {
  sessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onStartChatWithFriend: (
    targetSessionId: string,
    friendUserId: string,
    friendUsername: string,
    isInitiator: boolean,
    connectionId: string
  ) => void;
}

export default function WebRTCFriendSelector({ sessionId, isOpen, onClose, onStartChatWithFriend }: WebRTCFriendSelectorProps) {
  const [auth, setAuth] = useState(authStorage.getAuth());
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [step, setStep] = useState<'friends' | 'sessions' | 'connecting'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [pingingSessionId, setPingingSessionId] = useState<string | null>(null);
  const [activePingId, setActivePingId] = useState<Id<"livePings"> | null>(null);

  useEffect(() => {
    const handleStorageChange = () => {
      setAuth(authStorage.getAuth());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFriendId(null);
      setSelectedSessionId(null);
      setActiveSessions([]);
      setStep('friends');
      setLoading(false);
      setLoadingSessions(false);
      setSearchQuery('');
    }
  }, [isOpen]);

  const friends = useQuery(api.friends.getFriends, auth.token ? { userToken: auth.token } : "skip");
  const getFriendSessionsAction = useAction(api.friends.getFriendActiveSessions);
  const createConnectionOffer = useMutation(api.peerConnections.createConnectionOffer);
  const sendPing = useMutation(api.livePings.send);
  const pingStatus = useQuery(api.livePings.get, activePingId ? { pingId: activePingId } : "skip");

  const selectedFriend = friends?.find(f => f.userId === selectedFriendId);

  // Filter friends based on search query
  const filteredFriends = friends?.filter((friend: any) => 
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  useEffect(() => {
    if (!selectedFriendId || !auth.token) {
      setActiveSessions([]);
      setSelectedSessionId(null);
      setStep('friends');
      return;
    }

    const fetchSessions = async () => {
      try {
        setLoadingSessions(true);
        setStep('sessions');
        const result = await getFriendSessionsAction({
          friendUserId: selectedFriendId as Id<"users">,
          userToken: auth.token!,
        });

        if (result && result.activeSessions) {
          setActiveSessions(result.activeSessions);
          if (result.activeSessions.length > 0) {
            setSelectedSessionId(result.activeSessions[0].sessionId);
          } else {
            toast.info("This user has no active sessions.");
          }
        }
      } catch (error) {
        console.error("Failed to fetch friend sessions:", error);
        toast.error("Failed to fetch friend sessions.");
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchSessions();
  }, [selectedFriendId, auth.token, getFriendSessionsAction]);

  const handlePingSession = async (targetSessionId: string) => {
    if (!sessionId || !auth.token) {
      toast.error("Cannot ping: current session not found.");
      return;
    }
    setPingingSessionId(targetSessionId);
    try {
      const pingId = await sendPing({
        fromSessionId: sessionId,
        toSessionId: targetSessionId,
        userToken: auth.token,
      });
      setActivePingId(pingId);
    } catch (error) {
      console.error("Failed to send ping:", error);
      toast.error("Failed to send ping.");
      setPingingSessionId(null);
    }
  };

  useEffect(() => {
    if (pingStatus?.status === 'responded') {
      toast.success(`${selectedFriend?.username} is online and responsive!`);
      setPingingSessionId(null);
      setActivePingId(null);
    }
  }, [pingStatus, selectedFriend?.username]);

  const handleStartChat = async (targetSessionId: string | null) => {
    if (!auth.token || !selectedFriend || !sessionId || !targetSessionId) {
      toast.error("Missing required information to start chat.");
      return;
    }

    try {
      setLoading(true);
      setStep('connecting');
      const { userId: friendUserId, username: friendUsername } = selectedFriend;

      const connectionResult = await createConnectionOffer({
        sessionId: sessionId,
        targetSessionId: targetSessionId,
        userToken: auth.token,
      });

      if (!connectionResult || !connectionResult.connectionId) {
        toast.error("Failed to create connection offer.");
        setLoading(false);
        return;
      }

      await peerJSService.initializePeer(connectionResult.connectionId, sessionId, auth.username!);

      onStartChatWithFriend(
        targetSessionId,
        friendUserId,
        friendUsername,
        true,
        connectionResult.connectionId
      );
      
      // Close dialog after successful connection
      onClose();
    } catch (error: any) {
      console.error("Failed to start chat:", error);
      toast.error(`Failed to start chat: ${error.message}`);
      setLoading(false);
      setStep('sessions');
    }
  };

  const handleBackToFriends = () => {
    setSelectedFriendId(null);
    setSelectedSessionId(null);
    setActiveSessions([]);
    setStep('friends');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[75vh] p-0">
        <DialogHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {step !== 'friends' && (
                <Button variant="ghost" size="sm" onClick={handleBackToFriends}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-md bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold">Connect with Friends</DialogTitle>
                  <p className="text-xs text-muted-foreground">Choose a friend to start chatting</p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center space-x-3 mt-3">
            <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full transition-all text-xs ${
              step === 'friends' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 
              selectedFriendId ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 
              'bg-muted/50 text-muted-foreground'
            }`}>
              {selectedFriendId ? <CheckCircle2 className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              <span className="font-medium">Choose Friend</span>
            </div>
            
            <div className={`h-px w-6 transition-all ${
              selectedFriendId ? 'bg-blue-500/50' : 'bg-muted-foreground/20'
            }`} />
            
            <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full transition-all text-xs ${
              step === 'sessions' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 
              selectedSessionId ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 
              'bg-muted/50 text-muted-foreground'
            }`}>
              {selectedSessionId ? <CheckCircle2 className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
              <span className="font-medium">Select Session</span>
            </div>
            
            <div className={`h-px w-6 transition-all ${
              selectedSessionId ? 'bg-blue-500/50' : 'bg-muted-foreground/20'
            }`} />
            
            <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full transition-all text-xs ${
              step === 'connecting' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 
              'bg-muted/50 text-muted-foreground'
            }`}>
              <Zap className="h-3 w-3" />
              <span className="font-medium">Connect</span>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-grow p-4">
          <div className="p-1">
            {/* Content */}
            {step === 'friends' && (
              <div className="space-y-3">
                <div className="text-center">
                  <h2 className="text-sm font-medium mb-1">Your Friends</h2>
                  <p className="text-xs text-muted-foreground">Select a friend to see their active sessions</p>
                </div>
                
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search friends..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-8 text-sm"
                  />
                </div>
                
                {!friends ? (
                  <div className="space-y-1">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-2 p-2 rounded-md">
                        <Avatar className="h-6 w-6 rounded-full bg-muted"></Avatar>
                        <div className="flex-grow space-y-1">
                          <div className="h-3 bg-muted rounded w-1/3"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No friends found.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredFriends.map((friend: any) => (
                      <button
                        key={friend.userId}
                        onClick={() => setSelectedFriendId(friend.userId)}
                        className="w-full text-left p-2 rounded-md flex items-center space-x-2 transition-all hover:bg-muted/50"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={friend.imageUrl} alt={friend.username} />
                          <AvatarFallback>{friend.username.substring(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{friend.username}</span>
                        {friend.isActive && (
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 'sessions' && selectedFriend && (
              <div className="space-y-3">
                <div className="text-center">
                  <h2 className="text-sm font-medium mb-1">
                    {selectedFriend.username}'s Active Sessions
                  </h2>
                  <p className="text-xs text-muted-foreground">Choose a session to connect to</p>
                </div>

                {loadingSessions ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-2 p-2 rounded-md">
                        <div className="h-5 w-5 rounded-full bg-muted"></div>
                        <div className="flex-grow space-y-1">
                          <div className="h-3 bg-muted rounded w-2/3"></div>
                          <div className="h-2 bg-muted rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activeSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <WifiOff className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                    <h3 className="text-sm font-medium mb-1">No Active Sessions</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedFriend.username} doesn't have any active sessions right now.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {activeSessions.map((session: any, index: number) => {
                      return (
                        <div
                          key={session.sessionId}
                          className="flex items-center justify-between p-2 rounded-md transition-all hover:bg-muted/50"
                        >
                          <div className="flex-grow text-left flex items-center space-x-2">
                            <Wifi className="h-4 w-4 text-green-500" />
                            <div>
                              <p className="text-sm font-medium">
                                Session {index + 1}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Session ID: {session.sessionId.substring(0, 12)}...
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleStartChat(session.sessionId)}
                            disabled={loading}
                            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                          >
                            {loading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Zap className="mr-2 h-3 w-3" />
                                Connect
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {step === 'connecting' && (
              <div className="text-center py-8">
                <div className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-1">Connecting to {selectedFriend?.username}</h3>
                    <p className="text-xs text-muted-foreground">
                      Setting up your secure connection...
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}