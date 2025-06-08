"use client";

import React, { useState, useEffect } from "react";
import { Toaster, toast } from 'sonner';
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authStorage } from "@/lib/auth";
import { useSession } from "@/hooks/useSession";

import SignupView from "./components/SignupView";
import MainChatInterface from "./components/MainChatInterface";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ token: string; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { sessionId, isSessionActive, initializeSession, cleanupSession } = useSession();

  // Validate stored token with Convex
  const storedAuth = authStorage.getAuth();
  const tokenToValidate = storedAuth.isAuthenticated ? storedAuth.token : null;
  const validateToken = useQuery(
    api.auth.validateToken, 
    tokenToValidate ? { token: tokenToValidate } : "skip"
  );

  // Check for stored authentication on mount
  useEffect(() => {
    if (validateToken !== undefined) {
      if (validateToken && storedAuth.username && tokenToValidate) {
        // Token is valid, set user and authenticated state
        setCurrentUser({ token: tokenToValidate, username: validateToken.username });
        setIsAuthenticated(true);
      } else {
        // No token or invalid token, clear auth
        authStorage.clearAuth();
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
      setIsLoading(false);
    }
  }, [validateToken]);

  // Handle session initialization and cleanup
  useEffect(() => {
    console.log('🎯 page.tsx useEffect triggered - isAuthenticated:', isAuthenticated);
    if (isAuthenticated) {
      console.log('🚀 page.tsx calling initializeSession');
      initializeSession();
    } else {
      console.log('🧹 page.tsx calling cleanupSession');
      cleanupSession();
    }
  }, [isAuthenticated]); // Remove function dependencies to prevent re-initialization cycles

  const handleSignupSuccess = (token: string, username: string) => {
    authStorage.saveAuth(token, username);
    setCurrentUser({ token, username });
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    authStorage.clearAuth();
    setCurrentUser(null);
    setIsAuthenticated(false);
    toast.info("Logged out successfully");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Chat (lol)</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors closeButton position="top-right" />
      
      {!isAuthenticated ? (
        <SignupView onSignupSuccess={handleSignupSuccess} />
      ) : (
        currentUser && (
          <MainChatInterface 
            currentUsername={currentUser.username}
            sessionId={sessionId}
            isSessionActive={isSessionActive}
            onLogout={handleLogout}
          />
        )
      )}
    </div>
  );
}