"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authStorage } from "@/lib/auth";
import { peerJSService } from "@/lib/peerjs";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WebRTCFriendSelectorProps {
  sessionId: string | null;
  onBack: () => void;
  onStartChatWithFriend: (
    targetSessionId: string,
    friendUserId: string,
    friendUsername: string,
    isInitiator: boolean,
    connectionId: string
  ) => void;
}

export default function WebRTCFriendSelector({ sessionId, onBack, onStartChatWithFriend }: WebRTCFriendSelectorProps) {
  const [auth, setAuth] = useState(authStorage.getAuth());
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    const handleStorageChange = () => {
      setAuth(authStorage.getAuth());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const friends = useQuery(api.friends.getFriends, auth.token ? { userToken: auth.token } : "skip");
  const getFriendSessionsMutation = useMutation(api.friends.getFriendActiveSessions);
  const createConnectionOffer = useMutation(api.peerConnections.createConnectionOffer);

  const selectedFriend = friends?.find(f => f.userId === selectedFriendId);

  useEffect(() => {
    if (!selectedFriendId || !auth.token) {
      setActiveSessions([]);
      setSelectedSessionId(null);
      return;
    }

    const fetchSessions = async () => {
      try {
        setLoadingSessions(true);
        const result = await getFriendSessionsMutation({
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
  }, [selectedFriendId, auth.token, getFriendSessionsMutation]);


  const handleStartChat = async () => {
    if (!auth.token || !selectedFriend || !sessionId || !selectedSessionId) {
      toast.error("Missing required information to start chat.");
      return;
    }

    try {
      setLoading(true);
      const { userId: friendUserId, username: friendUsername } = selectedFriend;

      const connectionResult = await createConnectionOffer({
        sessionId: sessionId,
        targetSessionId: selectedSessionId,
        userToken: auth.token,
      });

      if (!connectionResult || !connectionResult.connectionId) {
        toast.error("Failed to create connection offer.");
        setLoading(false);
        return;
      }

      await peerJSService.initializePeer(connectionResult.connectionId, sessionId, auth.username!);

      onStartChatWithFriend(
        selectedSessionId,
        friendUserId,
        friendUsername,
        true,
        connectionResult.connectionId
      );
    } catch (error: any) {
      console.error("Failed to start chat:", error);
      toast.error(`Failed to start chat: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Connect with a Friend</span>
          <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">1. Select a Friend</label>
          <Select onValueChange={setSelectedFriendId} value={selectedFriendId || ""}>
            <SelectTrigger>
              <SelectValue placeholder="Select a friend..." />
            </SelectTrigger>
            <SelectContent>
              {friends ? friends.map((friend: any) => (
                <SelectItem key={friend.userId} value={friend.userId}>
                  {friend.username} ({friend.sessionCount > 0 ? "Online" : "Offline"})
                </SelectItem>
              )) : <p>Loading friends...</p>}
            </SelectContent>
          </Select>
        </div>

        {selectedFriendId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">2. Select a Session</label>
            <Select onValueChange={setSelectedSessionId} value={selectedSessionId || ""} disabled={loadingSessions}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSessions ? "Loading sessions..." : "Select a session..."} />
              </SelectTrigger>
              <SelectContent>
                {loadingSessions ? (
                  <div className="p-2">Loading...</div>
                ) : activeSessions.length > 0 ? (
                  activeSessions.map((session: any) => (
                    <SelectItem key={session.sessionId} value={session.sessionId}>
                      Session @ {new Date(session.createdAt).toLocaleTimeString()}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2">No active sessions found.</div>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          onClick={handleStartChat}
          disabled={!selectedFriendId || !selectedSessionId || loading || loadingSessions}
          className="w-full mt-4"
        >
          {loading ? "Starting Chat..." : "Start Chat"}
        </Button>
      </CardContent>
    </Card>
  );
}