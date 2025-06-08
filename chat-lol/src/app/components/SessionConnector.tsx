"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Send, AlertCircle } from 'lucide-react';
import { authStorage } from "@/lib/auth";
import { toast } from 'sonner';
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSession } from "@/hooks/useSession";

interface SessionConnectorProps {
  onBack: () => void;
  onConnectionEstablished: (sessionId: string, username: string) => void;
}

export default function SessionConnector({ onBack, onConnectionEstablished }: SessionConnectorProps) {
  const [targetSessionId, setTargetSessionId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const auth = authStorage.getAuth();
  const { sessionId } = useSession();
  
  const createConnectionOffer = useMutation(api.peerConnections.createConnectionOffer);
  const getOtherUserSessions = useQuery(api.sessions.getOtherUserSessions, "skip");

  const handleConnect = async () => {
    if (!targetSessionId.trim() || !sessionId || !auth.token || !auth.username) {
      toast.error("Missing connection information");
      return;
    }

    setIsConnecting(true);

    try {
      // First, validate that the target session exists and get user info
      const targetSessionQuery = await fetch(`/api/sessions/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          targetSessionId: targetSessionId.trim(),
          userToken: auth.token 
        })
      });

      if (!targetSessionQuery.ok) {
        // Let's try a different approach - check if we can create the connection offer directly
        console.log("Direct session validation failed, trying connection creation...");
      }

      // Create connection offer through Convex
      const connectionResult = await createConnectionOffer({
        sessionId: sessionId,
        targetSessionId: targetSessionId.trim(),
        userToken: auth.token,
        connectionData: {
          initiatedAt: Date.now(),
          initiatorUsername: auth.username
        }
      });

      console.log("✅ Connection offer created:", connectionResult);

      // Find target user info from the result
      const targetUserId = connectionResult.targetSession?.userId;
      let targetUsername = "Unknown User";

      if (targetUserId) {
        // We could query for the username, but for now let's proceed without it
        // The receiving end will provide their username during the handshake
      }

      toast.success("Connection request sent!");
      
      // Trigger the connection flow
      onConnectionEstablished(targetSessionId.trim(), targetUsername);

    } catch (error: any) {
      console.error("❌ Connection failed:", error);
      
      if (error.message?.includes("not found")) {
        toast.error("Session not found", {
          description: "The session ID you entered doesn't exist or is inactive"
        });
      } else if (error.message?.includes("already exists")) {
        toast.error("Connection already exists", {
          description: "You already have an active connection to this session"
        });
      } else {
        toast.error("Connection failed", {
          description: error.message || "Unable to establish connection"
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnecting && targetSessionId.trim()) {
      handleConnect();
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Connect to Session
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="sessionId" className="text-sm font-medium">
            Target Session ID
          </label>
          <Input
            id="sessionId"
            placeholder="Enter session ID..."
            value={targetSessionId}
            onChange={(e) => setTargetSessionId(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isConnecting}
            className="font-mono"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Enter the session ID of the person you want to connect to
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="font-medium text-muted-foreground">How it works:</p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                <li>• You send a connection request to their session</li>
                <li>• They will automatically accept if you're friends</li>
                <li>• A direct peer-to-peer connection is established</li>
                <li>• Start chatting securely without servers!</li>
              </ul>
            </div>
          </div>
        </div>

        {sessionId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-900">Your Session ID:</p>
            <code className="text-xs font-mono text-blue-700 break-all">{sessionId}</code>
            <p className="text-xs text-blue-600 mt-1">Share this with others so they can connect to you</p>
          </div>
        )}

        <Button 
          onClick={handleConnect}
          disabled={isConnecting || !targetSessionId.trim()}
          className="w-full"
          size="lg"
        >
          {isConnecting ? (
            <>
              <Send className="mr-2 h-4 w-4 animate-pulse" />
              Sending Request...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send Connection Request
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
} 