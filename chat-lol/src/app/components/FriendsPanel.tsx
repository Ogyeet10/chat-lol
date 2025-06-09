"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  UserPlus, 
  Users, 
  Check, 
  X, 
  Send, 
  Clock,
  UserMinus,
  Badge
} from 'lucide-react';
import { useFriends } from '@/hooks/useFriends';
import { toast } from 'sonner';
import FriendNotificationBadge from './FriendNotificationBadge';

interface FriendsPanelProps {
  currentUsername: string;
}

export default function FriendsPanel({ currentUsername }: FriendsPanelProps) {
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'pending' | 'sent'>('friends');
  const [isAddingFriend, setIsAddingFriend] = useState(false);

  const {
    friends,
    pendingRequests,
    sentRequests,
    friendRequestCount,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    isLoading
  } = useFriends();

  const handleSendFriendRequest = async () => {
    if (!newFriendUsername.trim()) {
      toast.error('Please enter a username');
      return;
    }

    if (newFriendUsername.toLowerCase() === currentUsername.toLowerCase()) {
      toast.error('You cannot add yourself as a friend');
      return;
    }

    setIsAddingFriend(true);
    try {
      await sendFriendRequest(newFriendUsername.trim());
      toast.success(`Friend request sent to ${newFriendUsername}`);
      setNewFriendUsername('');
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to send friend request';
      
      if (errorMessage.includes('User not found')) {
        toast.error(`User "${newFriendUsername}" not found`);
      } else if (errorMessage.includes('Already friends')) {
        toast.error(`You're already friends with ${newFriendUsername}`);
      } else if (errorMessage.includes('Friend request already exists')) {
        toast.error(`Friend request to ${newFriendUsername} already sent`);
      } else if (errorMessage.includes('Cannot send friend request to yourself')) {
        toast.error('You cannot add yourself as a friend');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleAcceptRequest = async (requestId: string, fromUsername: string) => {
    try {
      await acceptFriendRequest(requestId);
      toast.success(`You are now friends with ${fromUsername}!`);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to accept friend request';
      
      if (errorMessage.includes('Friend request not found')) {
        toast.error('This friend request no longer exists');
      } else if (errorMessage.includes('already responded to')) {
        toast.error('This friend request has already been responded to');
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handleRejectRequest = async (requestId: string, fromUsername: string) => {
    try {
      await rejectFriendRequest(requestId);
      toast.info(`Friend request from ${fromUsername} rejected`);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to reject friend request';
      
      if (errorMessage.includes('Friend request not found')) {
        toast.error('This friend request no longer exists');
      } else if (errorMessage.includes('already responded to')) {
        toast.error('This friend request has already been responded to');
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handleRemoveFriend = async (friendUserId: string, username: string) => {
    if (!confirm(`Are you sure you want to remove ${username} from your friends?`)) {
      return;
    }

    try {
      await removeFriend(friendUserId);
      toast.info(`${username} removed from friends`);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to remove friend';
      
      if (errorMessage.includes('Friendship not found')) {
        toast.error(`You are not friends with ${username}`);
      } else {
        toast.error(errorMessage);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading friends...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Add Friend Section */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserPlus className="h-4 w-4" />
          Add Friend
        </div>
        <div className="flex gap-1">
          <Input
            placeholder="Username..."
            value={newFriendUsername}
            onChange={(e) => setNewFriendUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendFriendRequest()}
            disabled={isAddingFriend}
            className="text-sm h-8"
          />
          <Button 
            onClick={handleSendFriendRequest}
            disabled={isAddingFriend || !newFriendUsername.trim()}
            size="sm"
            className="h-8 w-8 p-0"
          >
            {isAddingFriend ? (
              <Clock className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        <Button
          variant={activeTab === 'friends' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('friends')}
          className="flex-1 h-7 text-xs px-1"
        >
          <Users className="h-3 w-3" />
          <span className="ml-1">{friends.length}</span>
        </Button>
        <Button
          variant={activeTab === 'pending' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('pending')}
          className="flex-1 h-7 text-xs px-1 relative"
        >
          <Clock className="h-3 w-3" />
          <span className="ml-1">{pendingRequests.length}</span>
          <FriendNotificationBadge />
        </Button>
        <Button
          variant={activeTab === 'sent' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('sent')}
          className="flex-1 h-7 text-xs px-1"
        >
          <Send className="h-3 w-3" />
          <span className="ml-1">{sentRequests.length}</span>
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="h-64">
        {activeTab === 'friends' && (
          <div className="space-y-2">
            {friends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No friends yet</p>
                <p className="text-xs mt-1">Add some friends to get started!</p>
              </div>
            ) : (
              friends.map((friend) => (
                <div key={friend.userId} className="p-2 rounded-lg bg-background/50 border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {friend.username.substring(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-medium">{friend.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {friend.isActive ? (
                            <span className="text-green-500">● Online</span>
                          ) : (
                            'Offline'
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFriend(friend.userId, friend.username)}
                      className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                    >
                      <UserMinus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="space-y-2">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No pending requests</p>
              </div>
            ) : (
              pendingRequests.map((request) => (
                <div key={request.requestId} className="p-2 rounded-lg bg-background/50 border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {request.fromUsername.substring(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-medium">{request.fromUsername}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptRequest(request.requestId, request.fromUsername)}
                        className="bg-green-600 hover:bg-green-700 h-6 w-6 p-0"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectRequest(request.requestId, request.fromUsername)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'sent' && (
          <div className="space-y-2">
            {sentRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Send className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No sent requests</p>
              </div>
            ) : (
              sentRequests.map((request) => (
                <div key={request.requestId} className="p-2 rounded-lg bg-background/50 border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {request.toUsername.substring(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-medium">{request.toUsername}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}