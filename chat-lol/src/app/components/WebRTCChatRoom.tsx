"use client";

import React from "react";
import { toast } from 'sonner';

interface WebRTCChatRoomProps {
  currentUsername: string;
  onLeaveWebRTC: () => void;
}

export default function WebRTCChatRoom({ }: WebRTCChatRoomProps) {

  // WebRTC removed - simplified component

  // Render simplified setup view
  return (
    <div className="flex-grow flex items-center justify-center">
      <div className="text-center space-y-4">
        <h3 className="text-xl font-medium">WebRTC Chat (Disabled)</h3>
        <p className="text-muted-foreground">WebRTC functionality has been removed</p>
        <div className="space-x-4">
          <button 
            onClick={() => toast.info("WebRTC functionality has been removed")}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg opacity-50 cursor-not-allowed"
            disabled
          >
            Initiate Chat (Disabled)
          </button>
          <button 
            onClick={() => toast.info("WebRTC functionality has been removed")}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg opacity-50 cursor-not-allowed"
            disabled
          >
            Join Chat (Disabled)
          </button>
        </div>
      </div>
    </div>
  );
}