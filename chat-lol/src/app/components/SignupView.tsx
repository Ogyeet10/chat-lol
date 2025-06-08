"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { User as UserIcon, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from 'sonner';

interface SignupViewProps {
  onSignupSuccess: (token: string, username: string) => void;
}

export default function SignupView({ onSignupSuccess }: SignupViewProps) {
  const [username, setUsername] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  
  const checkUsernameAvailable = useQuery(api.auth.checkUsernameAvailable, 
    username.trim() ? { username: username.trim() } : "skip"
  );
  const signUp = useMutation(api.auth.signUp);

  const handleSignup = async () => {
    if (!username.trim()) {
      toast.error("Please enter a username");
      return;
    }

    if (checkUsernameAvailable === false) {
      toast.error("Username is already taken");
      return;
    }

    setIsSigningUp(true);
    try {
      const result = await signUp({ username: username.trim() });
      toast.success(`Welcome, ${result.username}!`);
      onSignupSuccess(result.token, result.username);
    } catch (error: any) {
      toast.error(error.message || "Failed to sign up");
    } finally {
      setIsSigningUp(false);
    }
  };

  const isUsernameValid = username.trim().length > 0;
  const isUsernameAvailable = checkUsernameAvailable === true;
  const canSignup = isUsernameValid && isUsernameAvailable && !isSigningUp;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Chat (lol)</h1>
        <p className="text-muted-foreground mt-2 text-lg">Join the conversation</p>
      </header>
      
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Create Account</CardTitle>
          <CardDescription className="text-center">
            Choose a username to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 p-6">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="username" 
                placeholder="Enter your username" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                className="pl-10 h-12 text-base"
                disabled={isSigningUp}
                onKeyPress={(e) => e.key === 'Enter' && canSignup && handleSignup()}
              />
            </div>
            {username.trim() && (
              <p className={`text-xs ${
                checkUsernameAvailable === undefined ? 'text-muted-foreground' :
                checkUsernameAvailable ? 'text-green-600' : 'text-red-600'
              }`}>
                {checkUsernameAvailable === undefined ? 'Checking availability...' :
                 checkUsernameAvailable ? 'Username available!' : 'Username taken'}
              </p>
            )}
          </div>
          
          <Button 
            size="lg" 
            className="w-full py-6 text-lg mt-2"
            onClick={handleSignup}
            disabled={!canSignup}
          >
            {isSigningUp ? (
              <>
                <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                Creating Account...
              </>
            ) : (
              <>
                <UserIcon className="mr-3 h-6 w-6" />
                Join Chat (lol)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      
      <footer className="mt-16 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Chat (lol) - Open source.</p>
      </footer>
    </div>
  );
}