"use client";

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { authStorage } from '@/lib/auth';
import { useCallback } from 'react';

export function useFriends() {
  const auth = authStorage.getAuth();

  // Real-time queries
  const friends = useQuery(
    api.friends.getFriends,
    auth.token ? { userToken: auth.token } : "skip"
  );

  const pendingRequests = useQuery(
    api.friends.getPendingFriendRequests,
    auth.token ? { userToken: auth.token } : "skip"
  );

  const sentRequests = useQuery(
    api.friends.getSentFriendRequests,
    auth.token ? { userToken: auth.token } : "skip"
  );

  const friendRequestCount = useQuery(
    api.friends.getFriendRequestCount,
    auth.token ? { userToken: auth.token } : "skip"
  );

  // Mutations
  const sendFriendRequestMutation = useMutation(api.friends.sendFriendRequest);
  const respondToFriendRequestMutation = useMutation(api.friends.respondToFriendRequest);
  const removeFriendMutation = useMutation(api.friends.removeFriend);

  const sendFriendRequest = useCallback(async (toUsername: string) => {
    if (!auth.token) {
      throw new Error('No auth token');
    }

    const result = await sendFriendRequestMutation({
      toUsername,
      userToken: auth.token
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result;
  }, [auth.token, sendFriendRequestMutation]);

  const acceptFriendRequest = useCallback(async (requestId: string) => {
    if (!auth.token) {
      throw new Error('No auth token');
    }

    return await respondToFriendRequestMutation({
      requestId: requestId as any, // Type assertion for Convex ID
      response: 'accepted',
      userToken: auth.token
    });
  }, [auth.token, respondToFriendRequestMutation]);

  const rejectFriendRequest = useCallback(async (requestId: string) => {
    if (!auth.token) {
      throw new Error('No auth token');
    }

    return await respondToFriendRequestMutation({
      requestId: requestId as any, // Type assertion for Convex ID
      response: 'rejected',
      userToken: auth.token
    });
  }, [auth.token, respondToFriendRequestMutation]);

  const removeFriend = useCallback(async (friendUserId: string) => {
    if (!auth.token) {
      throw new Error('No auth token');
    }

    return await removeFriendMutation({
      friendUserId: friendUserId as any, // Type assertion for Convex ID
      userToken: auth.token
    });
  }, [auth.token, removeFriendMutation]);

  return {
    friends: friends || [],
    pendingRequests: pendingRequests || [],
    sentRequests: sentRequests || [],
    friendRequestCount: friendRequestCount || 0,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    isLoading: friends === undefined || pendingRequests === undefined || sentRequests === undefined
  };
}