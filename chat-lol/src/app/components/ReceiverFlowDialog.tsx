"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Send } from 'lucide-react'; // Changed SendPlane to Send

interface ReceiverFlowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  generatedResponseString: string; // The string this dialog generates
  onProcessOfferAndCreateAnswer: (offerString: string) => Promise<void>;
  isProcessing: boolean;
  copyToClipboard: (text: string) => void;
  connectionStatus: string;
}

export default function ReceiverFlowDialog(
  { 
    isOpen, 
    onClose, 
    generatedResponseString, 
    onProcessOfferAndCreateAnswer, 
    isProcessing, 
    copyToClipboard,
    connectionStatus
  }: ReceiverFlowDialogProps
) {
  const [offerString, setOfferString] = useState("");

  const handleGenerateResponse = async () => {
    if (offerString) {
      await onProcessOfferAndCreateAnswer(offerString);
      // Parent will handle closing the dialog upon successful connection or if user cancels
    } else {
      alert("Please paste the connection string from the initiator first.");
    }
  };

  // Reset state when dialog is closed
  React.useEffect(() => {
    if (!isOpen) {
      setOfferString("");
      // generatedResponseString is a prop, so it's controlled by parent
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Join Chat: Respond to Initiator</DialogTitle>
          <DialogDescription>
            Paste the connection string from the initiator, then generate your response string to send back.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="initiatorOfferString" className="text-sm font-medium">
              Paste initiator's connection string here:
            </label>
            <Textarea 
              id="initiatorOfferString" 
              value={offerString} 
              onChange={(e) => setOfferString(e.target.value)} 
              rows={5} 
              placeholder="Paste string from initiator..."
              disabled={isProcessing || !!generatedResponseString}
            />
          </div>

          <Button onClick={handleGenerateResponse} disabled={isProcessing || !offerString || !!generatedResponseString} className="w-full">
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {generatedResponseString ? "Response Generated Below" : "Generate Response String"}
             {!generatedResponseString && <Send className="ml-2 h-4 w-4"/>}
          </Button>

          {generatedResponseString && (
            <div className="space-y-2 mt-4">
              <label htmlFor="receiverGeneratedString" className="text-sm font-medium">
                Copy and send this response string back to the initiator:
              </label>
              <div className="flex space-x-2">
                <Textarea id="receiverGeneratedString" value={generatedResponseString} readOnly rows={5} className="flex-grow"/>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(generatedResponseString)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground pt-2">
                After sending, the initiator will complete the connection. This dialog will close automatically if successful, or you can close it.
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter className="sm:justify-between flex-col sm:flex-row">
           <div className="text-xs text-muted-foreground truncate w-full sm:w-auto text-center sm:text-left" title={connectionStatus}>
             Status: {connectionStatus.length > 50 ? connectionStatus.substring(0, 50) + '...' : connectionStatus}
          </div>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 