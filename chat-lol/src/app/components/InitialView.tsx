"use client";

import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Rocket, UserPlus, User as UserIcon, UploadCloud, Image as ImageIcon } from "lucide-react";

interface InitialViewProps {
  onInitiate: (username: string, pfpDataUrl: string | null) => void;
  onJoin: (username: string, pfpDataUrl: string | null) => void;
}

const MAX_PFP_SIZE = 512;

export default function InitialView({ onInitiate, onJoin }: InitialViewProps) {
  const [username, setUsername] = useState("");
  const [selectedPfpFile, setSelectedPfpFile] = useState<File | null>(null);
  const [pfpPreviewUrl, setPfpPreviewUrl] = useState<string | null>(null);
  const [pfpDataUrlForUpload, setPfpDataUrlForUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePfpFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedPfpFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPfpPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);

      try {
        const image = document.createElement('img');
        image.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = image;

          if (width > height) {
            if (width > MAX_PFP_SIZE) {
              height = Math.round((height * MAX_PFP_SIZE) / width);
              width = MAX_PFP_SIZE;
            }
          } else {
            if (height > MAX_PFP_SIZE) {
              width = Math.round((width * MAX_PFP_SIZE) / height);
              height = MAX_PFP_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(image, 0, 0, width, height);
            const scaledDataUrl = canvas.toDataURL('image/jpeg', 0.85); 
            setPfpDataUrlForUpload(scaledDataUrl);
            console.log("Scaled PFP Data URL length:", scaledDataUrl.length); 
          } else {
            console.error("Could not get canvas context");
            setPfpDataUrlForUpload(null);
          }
          URL.revokeObjectURL(image.src);
        };
        image.onerror = () => {
          console.error("Error loading image for scaling.");
          setPfpDataUrlForUpload(null);
          URL.revokeObjectURL(image.src);
        };
        image.src = URL.createObjectURL(file);
      } catch (error) {
        console.error("Error processing PFP:", error);
        setPfpDataUrlForUpload(null);
      }
    } else {
      setSelectedPfpFile(null);
      setPfpPreviewUrl(null);
      setPfpDataUrlForUpload(null);
    }
  };

  const handleInitiate = () => {
    if (!username.trim()) {
      alert("Please enter a username.");
      return;
    }
    onInitiate(username.trim(), pfpDataUrlForUpload);
  };

  const handleJoin = () => {
    if (!username.trim()) {
      alert("Please enter a username.");
      return;
    }
    onJoin(username.trim(), pfpDataUrlForUpload);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Chat (lol)</h1>
        <p className="text-muted-foreground mt-2 text-lg">Peer-to-Peer Local Network Chat</p>
      </header>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Set Up Your Profile</CardTitle>
          <CardDescription className="text-center">
            Enter a username and optionally upload a profile picture.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 p-6">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                    id="username" 
                    placeholder="E.g., ChattyCathy" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    className="pl-10 h-12 text-base"
                />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Profile Picture (Optional)</label>
            <div className="flex items-center space-x-4">
              <div 
                className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-dashed cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {pfpPreviewUrl ? (
                  <img src={pfpPreviewUrl} alt="PFP Preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0"
              >
                <UploadCloud className="mr-2 h-4 w-4" /> 
                {selectedPfpFile ? "Change Picture" : "Upload Picture"}
              </Button>
              <Input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={handlePfpFileChange} 
                className="hidden" 
              />
            </div>
            {selectedPfpFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedPfpFile.name} ({(selectedPfpFile.size / 1024).toFixed(1)} KB)
                {pfpDataUrlForUpload ? " Scaled & ready." : " Processing..."}
              </p>
            )}
          </div>
          <Button 
            size="lg" 
            className="w-full py-6 text-lg mt-2"
            onClick={handleInitiate}
            disabled={!username.trim()}
          >
            <Rocket className="mr-3 h-6 w-6" />
            Initiate New Chat
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full py-6 text-lg"
            onClick={handleJoin}
            disabled={!username.trim()}
          >
            <UserPlus className="mr-3 h-6 w-6" />
            Join Existing Chat
          </Button>
        </CardContent>
      </Card>
      <footer className="mt-16 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Chat (lol) - Open source.</p>
      </footer>
    </div>
  );
} 