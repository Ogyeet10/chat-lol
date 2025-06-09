"use client";

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { authStorage } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ImageUploadDialog from './ImageUploadDialog';

export default function ProfileSettings() {
  const [auth] = useState(authStorage.getAuth());
  const user = useQuery(api.users.getViewer, auth.token ? { token: auth.token } : "skip");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  if (!user) {
    return (
      <div>
        <h3 className="text-xl font-semibold mb-4">Profile</h3>
        <div className="space-y-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <h3 className="text-xl font-semibold mb-4">Profile</h3>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.imageUrl || undefined} />
              <AvatarFallback className="text-4xl">
                {user.username.substring(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold">{user.username}</p>
            <p className="text-muted-foreground">This is your public display name.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setIsUploadDialogOpen(true)}
            >
              Change Picture
            </Button>
          </div>
        </div>
      </div>

      <ImageUploadDialog
        isOpen={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
      />
    </>
  );
} 