"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { sessionStorage } from '@/lib/session';
import { authStorage } from '@/lib/auth';

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const createSession = useMutation(api.sessions.createSession);
  const updateSessionPing = useMutation(api.sessions.updateSessionPing);
  const deactivateSession = useMutation(api.sessions.deactivateSession);

  const cleanupSession = useCallback(async () => {
    console.log('🧹 Cleaning up session...');
    const currentSessionId = sessionStorage.getCurrentSessionId();

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (currentSessionId) {
        const auth = authStorage.getAuth();
        if (auth.token) {
            try {
              await deactivateSession({ 
                sessionId: currentSessionId, 
                userToken: auth.token 
              });
              console.log('✅ Session deactivated');
            } catch (error) {
              console.error('❌ Failed to deactivate session:', error);
            }
        }
    }

    setSessionId(null);
    setIsSessionActive(false);
    sessionStorage.clearSessionId();
    console.log('✅ Session cleanup complete');
  }, [deactivateSession]);

  const initializeSession = useCallback(async () => {
    console.log('🚀 initializeSession called');
    await cleanupSession(); // Start fresh

    const auth = authStorage.getAuth();
    console.log('📋 Auth state:', { isAuth: auth.isAuthenticated, hasToken: !!auth.token });
    
    if (!auth.isAuthenticated || !auth.token) {
      console.log('❌ No auth token, skipping session init');
      return;
    }
    
    try {
      console.log('🔄 Creating new session...');
      const result = await createSession({ userToken: auth.token });
      console.log('✅ New session created:', result.sessionId);
      
      setSessionId(result.sessionId);
      setIsSessionActive(true);
      
      sessionStorage.saveSessionId(result.sessionId);

      // Start ping interval (every 30 seconds)
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      
      pingIntervalRef.current = setInterval(async () => {
        try {
          const currentAuth = authStorage.getAuth();
          if (!currentAuth.token) throw new Error("No token for ping");
          await updateSessionPing({ 
            sessionId: result.sessionId, 
            userToken: currentAuth.token
          });
        } catch (error) {
          console.error('Failed to ping session:', error);
          setIsSessionActive(false);
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        }
      }, 30000); // 30 seconds

    } catch (error) {
      console.error('❌ Failed to initialize session:', error);
    }
  }, [createSession, updateSessionPing, cleanupSession]);

  useEffect(() => {
    const handleBeforeUnload = () => {
        const currentSessionId = sessionStorage.getCurrentSessionId();
        if (currentSessionId) {
            const auth = authStorage.getAuth();
            if (auth.token) {
                const data = JSON.stringify({ sessionId: currentSessionId, userToken: auth.token });
                navigator.sendBeacon('/api/cleanup-session', data);
            }
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupSession();
    };
  }, [cleanupSession]);

  return {
    sessionId,
    isSessionActive,
    initializeSession,
    cleanupSession
  };
}