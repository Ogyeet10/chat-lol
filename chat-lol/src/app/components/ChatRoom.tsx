"use client";

import React, { useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Send, LogOut, UserCircle, Users, PanelLeft } from 'lucide-react';

interface ChatRoomProps {
  messages: string[];
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
  onLeaveChat: () => void;
  connectionStatus: string;
  dataChannelReadyState: string | null;
  currentUsername?: string;
  currentUserPFP?: string | null;
  peerUsername?: string;
  peerUserPFP?: string | null;
}

export default function ChatRoom(
  { 
    messages, 
    messageInput, 
    onMessageInputChange, 
    onSendMessage, 
    onLeaveChat,
    connectionStatus,
    dataChannelReadyState,
    currentUsername: currentUsernameFromProps = "You",
    currentUserPFP = null,
    peerUsername: peerUsernameFromProps = "Peer",
    peerUserPFP = null
  }: ChatRoomProps
) {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const currentUsername = currentUsernameFromProps || "You";
  const peerUsername = peerUsernameFromProps || "Peer";

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const isChatActive = dataChannelReadyState === 'open';

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="w-64 bg-muted/40 p-4 border-r flex flex-col space-y-4">
        <div className="flex items-center space-x-2 p-2">
          <UserCircle className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">My Profile</h2> 
        </div>
        <div className="flex-grow p-2 rounded-md border border-dashed border-muted-foreground/30 flex flex-col items-center justify-center space-y-2">
            <Avatar className="h-16 w-16 border-2 border-primary/50">
              <AvatarImage src={currentUserPFP || undefined} alt={currentUsername} />
              <AvatarFallback>{currentUsername.substring(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <p className="text-lg font-medium text-center">{currentUsername}</p>
            <p className="text-xs text-muted-foreground text-center">Local User</p>
        </div>
         <p className="text-xs text-muted-foreground text-center">Connection: {connectionStatus}</p>
         <p className="text-xs text-muted-foreground text-center">Channel: {dataChannelReadyState || 'N/A'}</p>
      </aside>

      <main className="flex-grow flex flex-col h-screen">
        <header className="p-4 border-b flex justify-between items-center bg-muted/20">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10 border-2 border-accent-foreground/30">
              <AvatarImage src={peerUserPFP || undefined} alt={peerUsername} />
              <AvatarFallback>{peerUsername.substring(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
                <h3 className="font-semibold text-lg">{peerUsername}</h3>
                <p className={`text-xs ${isChatActive ? 'text-green-500' : 'text-orange-500'}`}>
                  {isChatActive ? "Online & Connected" : (dataChannelReadyState ? `Channel: ${dataChannelReadyState}`: "Offline")}
                </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLeaveChat} className="text-muted-foreground hover:text-destructive">
            <LogOut className="mr-2 h-4 w-4" /> Leave Chat
          </Button>
        </header>

        <ScrollArea className="flex-grow p-4 sm:p-6" ref={chatContainerRef}>
          {messages.length === 0 && 
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Users className="h-20 w-20 mb-6 text-primary/40" />
              <p className="text-xl font-medium">Chat Room is Empty</p>
              <p className="mt-1">
                {peerUsername === 'Peer' ? 'Waiting for a peer to connect.' : `Say hello to ${peerUsername}!`}
              </p>
            </div>
          }
          {messages.map((msg, index) => {
            const systemMsgPrefix = "System: ";
            const currentUserMsgPrefix = `${currentUsername}: `;

            const isSystemMessage = msg.startsWith(systemMsgPrefix);
            const isCurrentUserMessage = msg.startsWith(currentUserMsgPrefix);
            const isPeerMessage = !isSystemMessage && !isCurrentUserMessage;
            
            let messageContent = msg;

            if (isCurrentUserMessage) {
              messageContent = msg.substring(currentUserMsgPrefix.length);
            } else if (isPeerMessage) {
              const colonIndex = msg.indexOf(': ');
              if (colonIndex !== -1) {
                messageContent = msg.substring(colonIndex + 2);
              } else {
                // Fallback if a peer message isn't formatted with ": " - display raw
                messageContent = msg; 
              }
            }
            // For system messages, messageContent remains the original msg.
            
            if (isSystemMessage) {
              return (
                <div key={index} className="text-center my-3">
                  <span className="text-xs text-muted-foreground bg-accent px-3 py-1 rounded-full shadow-sm">
                    {messageContent} {/* System messages displayed as is (already includes "System:" if needed) */}
                  </span>
                </div>
              );
            }

            // For Current User or Peer messages
            return (
              <div 
                key={index} 
                className={`mb-4 flex items-end gap-2 ${
                  isCurrentUserMessage ? 'justify-end' : 'justify-start'
                }`}
              >
                {isPeerMessage && ( // Peer's avatar
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={peerUserPFP || undefined} alt={peerUsername} />
                    <AvatarFallback>{peerUsername.substring(0,1).toUpperCase()}</AvatarFallback> 
                  </Avatar>
                )}
                <div className={`p-3 rounded-xl max-w-[70%] shadow-md text-sm break-words ${
                  isCurrentUserMessage 
                    ? 'bg-primary text-primary-foreground rounded-br-none' 
                    : 'bg-muted text-foreground rounded-bl-none' 
                }`}>
                  {messageContent} {/* Display the processed message text (without prefix) */}
                </div>
                {isCurrentUserMessage && ( // Current user's avatar
                     <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={currentUserPFP || undefined} alt={currentUsername} />
                        <AvatarFallback>{currentUsername.substring(0,1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                )}
              </div>
            );
          })}
        </ScrollArea>

        <footer className="p-4 border-t bg-muted/20">
          <div className="flex w-full space-x-3 items-center">
            <Input
              type="text"
              value={messageInput}
              onChange={(e) => onMessageInputChange(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
              placeholder={isChatActive ? `Message ${peerUsername === 'Peer' ? 'your peer' : peerUsername}...` : "Waiting for connection..."}
              className="flex-grow h-10 text-base focus-visible:ring-primary/60"
              disabled={!isChatActive}
              aria-label="Chat message input"
            />
            <Button onClick={onSendMessage} disabled={!isChatActive || !messageInput.trim()} size="lg" aria-label="Send message">
              <Send className="h-5 w-5"/>
            </Button>
          </div>
        </footer>
      </main>
    </div>
  );
} 