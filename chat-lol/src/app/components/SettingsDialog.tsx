"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { User, Shield } from 'lucide-react';
import ProfileSettings from './ProfileSettings';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsPage = 'profile' | 'security';

export default function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activePage, setActivePage] = useState<SettingsPage>('profile');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0">
        <div className="flex">
          {/* Sidebar */}
          <div className="w-1/3 max-w-[220px] bg-muted/50 border-r p-4 flex flex-col">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>
            <nav className="flex flex-col space-y-1">
              <Button
                variant={activePage === 'profile' ? 'secondary' : 'ghost'}
                className="justify-start"
                onClick={() => setActivePage('profile')}
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </Button>
              <Button
                variant={activePage === 'security' ? 'secondary' : 'ghost'}
                className="justify-start"
                onClick={() => setActivePage('security')}
                disabled // Will be enabled later
              >
                <Shield className="mr-2 h-4 w-4" />
                Security
              </Button>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activePage === 'profile' && <ProfileSettings />}
            {activePage === 'security' && (
              <div>
                <h3 className="text-xl font-semibold mb-4">Security Settings</h3>
                <p>Coming soon...</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
