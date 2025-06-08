"use client";

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { authStorage } from '@/lib/auth';
import { useCallback } from 'react';

export function usePingRequests(sessionId: string | null) {
  const auth = authStorage.getAuth();
  
  // Query for pending ping requests (real-time subscription)
  const pendingRequests = useQuery(
    api.pings.getPendingPingRequests,
    sessionId && auth.token ? { sessionId, userToken: auth.token } : "skip"
  );

  // Query for sent ping requests
  const sentRequests = useQuery(
    api.pings.getSentPingRequests,
    sessionId && auth.token ? { sessionId, userToken: auth.token } : "skip"
  );

  // Mutations
  const sendPingRequest = useMutation(api.pings.sendPingRequest);
  const respondToPingRequest = useMutation(api.pings.respondToPingRequest);

  const sendPing = useCallback(async (toSessionId: string, requestData?: any) => {
    if (!sessionId || !auth.token) {
      throw new Error('No active session or auth token');
    }

    return await sendPingRequest({
      toSessionId,
      fromSessionId: sessionId,
      userToken: auth.token,
      requestData
    });
  }, [sessionId, auth.token, sendPingRequest]);

  const respondToPing = useCallback(async (
    pingRequestId: string, 
    response: 'accepted' | 'rejected'
  ) => {
    if (!sessionId || !auth.token) {
      throw new Error('No active session or auth token');
    }

    return await respondToPingRequest({
      pingRequestId: pingRequestId as any, // Type assertion for Convex ID
      sessionId,
      userToken: auth.token,
      response
    });
  }, [sessionId, auth.token, respondToPingRequest]);

  return {
    pendingRequests: pendingRequests || [],
    sentRequests: sentRequests || [],
    sendPing,
    respondToPing,
    isLoading: pendingRequests === undefined || sentRequests === undefined
  };
}