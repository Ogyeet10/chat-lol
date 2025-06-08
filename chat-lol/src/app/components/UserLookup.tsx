"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, User, MessageCircle, Clock, Wifi, WifiOff, Copy } from 'lucide-react';
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import { toast } from 'sonner';

interface UserLookupProps {
  onConnectToSession: (sessionId: string, username: string) => void;
}

export default function UserLookup({ onConnectToSession }: UserLookupProps) {
  const [searchUsername, setSearchUsername] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ username: string; userId: string } | null>(null);

  const auth = authStorage.getAuth();

  // Search for user by username
  const userSessionData = useQuery(
    api.sessions.getOtherUserSessions,
    selectedUser && auth.token ? { 
      username: selectedUser.username,
      requestingUserToken: auth.token 
    } : "skip"
  );

  const handleSearch = () => {
    if (!searchUsername.trim()) {
      toast.error("Please enter a username");
      return;
    }

    setSelectedUser({ username: searchUsername.trim(), userId: "" });
  };

  const handleConnectToSession = (sessionId: string) => {
    onConnectToSession(sessionId, selectedUser?.username || "Unknown");
  };

  const formatTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Session ID copied to clipboard!"))
      .catch(() => toast.error("Failed to copy to clipboard"));
  };

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find User Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter username to search..."
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={!searchUsername.trim()}>
              <Search className="h-4 w-4 mr-1" />
              Search
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Search for any user to see their active session IDs and connect to them
          </p>
        </CardContent>
      </Card>

      {/* Results Section */}
      {selectedUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedUser.username}'s Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!userSessionData ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground animate-pulse" />
                  <p className="text-sm text-muted-foreground">Searching for {selectedUser.username}...</p>
                </div>
              </div>
            ) : userSessionData.sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <WifiOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">User not found or offline</p>
                <p className="text-sm mt-1">
                  {selectedUser.username} doesn't exist or has no active sessions
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {userSessionData.username.substring(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{userSessionData.username}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Wifi className="h-3 w-3 text-green-500" />
                      <span className="text-green-500">Online</span>
                      <span>•</span>
                      <span>{userSessionData.sessions.length} active session{userSessionData.sessions.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {userSessionData.sessions.map((session, index) => (
                  <div
                    key={session.sessionId}
                    className="p-3 rounded-lg border bg-background/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-mono text-sm font-medium">{session.sessionId}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(session.sessionId)}
                            className="h-6 w-6 p-0"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Last active: {formatTimeSince(session.lastPing)}</span>
                          </div>
                          <span>•</span>
                          <span>Created: {formatTimeSince(session.createdAt)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleConnectToSession(session.sessionId)}
                        className="ml-3"
                      >
                        <MessageCircle className="h-3 w-3 mr-1" />
                        Connect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
} 