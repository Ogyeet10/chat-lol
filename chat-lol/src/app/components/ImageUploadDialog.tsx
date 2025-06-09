"use client";

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { authStorage } from '@/lib/auth';
import { toast } from 'sonner';

interface ImageUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: (newImageUrl: string) => void;
}

export default function ImageUploadDialog({ isOpen, onClose, onUploadComplete }: ImageUploadDialogProps) {
  const [auth] = useState(authStorage.getAuth());
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const updateProfileImage = useMutation(api.users.updateProfileImage);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined); // Makes crop preview update between selections
      const reader = new FileReader();
      reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!completedCrop || !imgRef.current) {
      toast.error("Please select and crop an image first.");
      return;
    }

    setIsUploading(true);
    const croppedImageBlob = await getCroppedImg(imgRef.current, completedCrop);

    try {
      // 1. Get a short-lived upload URL
      const postUrl = await generateUploadUrl();
      
      // 2. POST the file to the URL
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "image/png" }, // We'll compress to PNG
        body: croppedImageBlob,
      });

      const { storageId } = await result.json();

      // 3. Update the user's profile with the new storage ID
      const newImageUrl = await updateProfileImage({ token: auth.token!, storageId });

      toast.success("Profile picture updated!");
      if (onUploadComplete) {
        onUploadComplete(newImageUrl);
      }
      onClose();
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload image. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Helper function to get the cropped image as a blob
  function getCroppedImg(image: HTMLImageElement, crop: Crop): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return Promise.reject(new Error("Canvas context not available"));
    }

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width,
      crop.height
    );
    
    // For GIFs, we can't really crop frames, so we'll just return the original blob if it's a GIF
    // A more advanced implementation would require a GIF parsing library.
    // For now, we compress everything to PNG for consistency.

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas is empty'));
            return;
          }
          resolve(blob);
        },
        'image/png',
        0.8 // Compress to 80% quality
      );
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Profile Picture</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4">
          <Input type="file" accept="image/*,image/gif" onChange={onSelectFile} />
          {imgSrc && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
            >
              <img ref={imgRef} src={imgSrc} style={{ maxHeight: '50vh' }}/>
            </ReactCrop>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!completedCrop || isUploading}>
            {isUploading ? "Uploading..." : "Upload & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 