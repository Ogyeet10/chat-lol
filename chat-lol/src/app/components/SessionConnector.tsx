"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Send, AlertCircle } from 'lucide-react';
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import { toast } from 'sonner';
import { createPeerConnection, createOffer } from "../../lib/webrtc";

interface SessionConnectorProps {
  onBack: () => void;
  onConnectionEstablished: (sessionId: string, username: string) => void;
}

export default function SessionConnector({ onBack, onConnectionEstablished }: SessionConnectorProps) {
  const [targetSessionId, setTargetSessionId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const auth = authStorage.getAuth();
  const sendConnectionRequest = useMutation(api.webrtc_signaling.sendConnectionRequest);

  const handleConnect = async () => {
    if (!targetSessionId.trim()) {
      toast.error("Please enter a session ID");
      return;
    }

    if (!auth.token) {
      toast.error("Authentication required");
      return;
    }

    setIsConnecting(true);

    try {
      // Create WebRTC offer
      const pc = createPeerConnection({});
      const offer = await createOffer(pc);
      
      // Send connection request with offer
      const result = await sendConnectionRequest({
        toSessionId: targetSessionId.trim(),
        userToken: auth.token,
        offerData: offer
      });

      toast.success("Connection request sent!", {
        description: "Waiting for the other session to accept..."
      });

      // Start the connection process
      onConnectionEstablished(targetSessionId.trim(), "Unknown");
      
    } catch (error: any) {
      toast.error("Failed to send connection request", {
        description: error.message || "Please try again"
      });
    } finally {
      setIsConnecting(false);
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
            disabled={isConnecting}
            className="font-mono"
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
                <li>• They will see your request and can accept/reject it</li>
                <li>• If accepted, a direct WebRTC connection is established</li>
              </ul>
            </div>
          </div>
        </div>

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