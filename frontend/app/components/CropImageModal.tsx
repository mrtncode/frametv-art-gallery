import React, { useRef, useState } from "react";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cropImage } from "../utils/galleryApi";

interface CropImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  filename: string;
  onClose: () => void;
  onCropSuccess: (newUrl: string) => void;
}

const CropImageModal: React.FC<CropImageModalProps> = ({
  isOpen,
  imageUrl,
  filename,
  onClose,
  onCropSuccess,
}) => {
  const cropperRef = useRef<any>(null);
  const [cropperReady, setCropperReady] = useState(false);
  const [cropPreset, setCropPreset] = useState('');
  const [cropActionLoading, setCropActionLoading] = useState(false);
  const [cropMessage, setCropMessage] = useState('');

  const cropPresets = [
    { label: '640x480', width: 640, height: 480 },
    { label: '800x600', width: 800, height: 600 },
    { label: '1024x768', width: 1024, height: 768 },
    { label: '1280x960', width: 1280, height: 960 },
    { label: '1920x1080', width: 1920, height: 1080 },
  ];

  const handleCrop = async () => {
    if (!filename || !cropperRef.current?.cropper) {
      setCropMessage('Cropper not initialized. Open crop dialog and wait.');
      return;
    }

    if (!cropperReady) {
      setCropMessage('Cropper is not ready yet. Please wait a moment.');
      return;
    }

    setCropActionLoading(true);
    setCropMessage('');

    try {
      const cropper = cropperRef.current.cropper;
      const imageData = cropper.getImageData();
      const cropBox = cropper.getCropBoxData();

      if (!imageData || !cropBox) {
        setCropMessage('Cannot read crop area. Please try again.');
        return;
      }

      const scaleX = imageData.naturalWidth / imageData.width;
      const scaleY = imageData.naturalHeight / imageData.height;

      const x = Math.max(0, Math.round((cropBox.left - imageData.left) * scaleX));
      const y = Math.max(0, Math.round((cropBox.top - imageData.top) * scaleY));
      const width = Math.max(1, Math.round(cropBox.width * scaleX));
      const height = Math.max(1, Math.round(cropBox.height * scaleY));

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        setCropMessage('Crop coordinates are invalid. Try adjusting the crop area.');
        return;
      }

      console.log('Crop request:', { x, y, width, height });

      const res = await cropImage(filename, x, y, width, height);
      if (!res.success) throw new Error((res as any).error || 'Crop failed');

      const cacheBustedUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}cb=${Date.now()}`;
      setCropMessage('Crop applied successfully.');
      onCropSuccess(cacheBustedUrl);
      onClose();
    } catch (e: any) {
      console.error('Crop error:', e);
      setCropMessage(e.message || 'Failed to crop image');
    } finally {
      setCropActionLoading(false);
    }
  };

  const applyCropPreset = (width: number, height: number) => {
    if (!cropperRef.current?.cropper) return;
    try {
      const cropper = cropperRef.current.cropper;
      const imageData = cropper.getImageData();
      if (!imageData) {
        console.warn('Image data not ready for preset');
        return;
      }
      const left = Math.max(0, (imageData.naturalWidth - width) / 2);
      const top = Math.max(0, (imageData.naturalHeight - height) / 2);
      
      cropper.setData({
        x: left,
        y: top,
        width: width,
        height: height
      });
      console.log('Preset applied:', { width, height, left, top });
    } catch (e: any) {
      console.warn('Failed to apply preset:', e);
    }
  };

  const handleClose = () => {
    setCropperReady(false);
    setCropMessage('');
    setCropPreset('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold">Crop Image: {filename}</h3>
          <button onClick={handleClose} className="text-gray-700 hover:text-black">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
          <div className="rounded overflow-hidden border" style={{ height: 350 }}>
            <Cropper
              src={imageUrl}
              style={{ height: "100%", width: "100%" }}
              aspectRatio={16 / 9}
              guides={true}
              viewMode={1}
              background={false}
              zoomable={true}
              responsive={true}
              autoCropArea={0.9}
              checkOrientation={false}
              ready={() => {
                console.log('Cropper is ready');
                setCropperReady(true);
              }}
              ref={cropperRef}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Presets</label>
              <select
                value={cropPreset}
                onChange={e => {
                  const selected = cropPresets.find(p => p.label === e.target.value);
                  setCropPreset(e.target.value);
                  if (selected) {
                    applyCropPreset(selected.width, selected.height);
                  }
                }}
                className="w-full border rounded px-2 py-1"
              >
                <option value="">Auto</option>
                {cropPresets.map(opt => (
                  <option key={opt.label} value={opt.label}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                className={`flex-1 rounded px-4 py-2 text-white ${
                  cropperReady
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
                onClick={handleCrop}
                disabled={!cropperReady || cropActionLoading}
              >
                {cropActionLoading ? 'Cropping…' : cropperReady ? 'Apply Crop' : 'Loading...'}
              </button>
              <button
                className="flex-1 bg-gray-200 text-gray-800 rounded px-4 py-2 hover:bg-gray-300"
                onClick={() => {
                  if (cropperRef.current?.cropper) {
                    cropperRef.current.cropper.reset();
                    setCropMessage('');
                  }
                }}
                disabled={!cropperReady}
              >
                Reset
              </button>
            </div>

            {cropMessage && (
              <div className={`text-sm ${cropMessage.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
                {cropMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CropImageModal;
