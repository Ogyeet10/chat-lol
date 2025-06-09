"use client";

import React, { useEffect, useState } from 'react';
import { Badge } from 'lucide-react';
import { useFriends } from '@/hooks/useFriends';
import { toast } from 'sonner';

interface FriendNotificationBadgeProps {
  className?: string;
}

export default function FriendNotificationBadge({ className }: FriendNotificationBadgeProps) {
  const { friendRequestCount } = useFriends();
  const [previousCount, setPreviousCount] = useState(0);
  const [hasShownNotification, setHasShownNotification] = useState(false);

  useEffect(() => {
    // Show notification when friend request count increases
    if (friendRequestCount > previousCount && previousCount > 0 && !hasShownNotification) {
      const newRequestsCount = friendRequestCount - previousCount;
      toast.info(
        `You have ${newRequestsCount} new friend request${newRequestsCount > 1 ? 's' : ''}!`,
        {
          duration: 4000,
          action: {
            label: 'View',
            onClick: () => {
              // You can add navigation logic here if needed
              console.log('Navigate to friends panel');
            },
          },
        }
      );
      setHasShownNotification(true);
    }
    
    // Reset notification flag when count decreases (requests handled)
    if (friendRequestCount < previousCount) {
      setHasShownNotification(false);
    }

    setPreviousCount(friendRequestCount);
  }, [friendRequestCount, previousCount, hasShownNotification]);

  if (friendRequestCount === 0) {
    return null;
  }

  return (
    <div className={`absolute -top-1 -right-2 ${className}`}>
      <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold ring-2 ring-background">
        {friendRequestCount > 9 ? '9+' : friendRequestCount}
      </div>
    </div>
  );
}