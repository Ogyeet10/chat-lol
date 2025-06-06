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
import { Loader2, ArrowRight, Copy, Send } from 'lucide-react';

interface InitiatorFlowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  generatedString: string;
  onGenerateString: () => Promise<void>;
  onProcessResponse: (response: string) => Promise<void>;
  isProcessing: boolean; // To show loading state
  copyToClipboard: (text: string) => void;
  connectionStatus: string; // To display current status/errors
}

export default function InitiatorFlowDialog(
  { 
    isOpen, 
    onClose, 
    generatedString, 
    onGenerateString, 
    onProcessResponse, 
    isProcessing,
    copyToClipboard,
    connectionStatus
  }: InitiatorFlowDialogProps
) {
  const [step, setStep] = useState(1);
  const [responseString, setResponseString] = useState("");

  const handleGenerate = async () => {
    await onGenerateString();
    // No need to setStep(2) here, generatedString existing will show the string
    // User manually clicks next when ready
  };

  const handleNextStep = () => {
    if (generatedString) {
      setStep(2);
    } else {
      // Optionally, prompt to generate string first or handle error
      alert("Please generate the connection string first.");
    }
  };

  const handleConnect = async () => {
    if (responseString) {
      await onProcessResponse(responseString);
      // onClose(); // Keep open to show status, parent will close on success
    } else {
      alert("Please paste the response string from your peer.");
    }
  };
  
  // Reset step when dialog is closed or generatedString changes (e.g. reset)
  React.useEffect(() => {
    if (!isOpen || (step === 2 && !generatedString)) {
      setStep(1);
      setResponseString("");
    }
  }, [isOpen, generatedString, step]);

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Step 1: Create Connection String" : "Step 2: Get Peer's Response"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Generate a connection string and send it to your peer. Then click 'Next' to enter their response."
              : "Paste the response string you received from your peer below and click 'Connect'."}
          </DialogDescription>
        </DialogHeader>
        
        {step === 1 && (
          <div className="space-y-4 py-4">
            <Button onClick={handleGenerate} disabled={isProcessing || !!generatedString} className="w-full">
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {generatedString ? "String Generated (Regenerate?)" : "Generate Connection String"}
            </Button>
            {generatedString && (
              <div className="space-y-2">
                <label htmlFor="initiatorGeneratedString" className="text-sm font-medium">
                  Copy and send this string to your peer:
                </label>
                <div className="flex space-x-2">
                  <Textarea id="initiatorGeneratedString" value={generatedString} readOnly rows={5} className="flex-grow"/>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(generatedString)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="peerResponseString" className="text-sm font-medium">
                Paste peer's response string here:
              </label>
              <Textarea 
                id="peerResponseString" 
                value={responseString} 
                onChange={(e) => setResponseString(e.target.value)} 
                rows={5} 
                placeholder="Paste response string from peer..."
              />
            </div>
          </div>
        )}
        
        <DialogFooter className="sm:justify-between gap-2 flex-col sm:flex-row">
          <div className="text-xs text-muted-foreground truncate w-full sm:w-auto text-center sm:text-left" title={connectionStatus}>
             Status: {connectionStatus.length > 50 ? connectionStatus.substring(0, 50) + '...' : connectionStatus}
          </div>
          <div className="flex gap-2">
            {step === 1 && (
              <Button onClick={handleNextStep} disabled={!generatedString || isProcessing} className="w-full sm:w-auto">
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleConnect} disabled={isProcessing || !responseString} className="w-full sm:w-auto">
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect <Send className="ml-2 h-4 w-4"/>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 