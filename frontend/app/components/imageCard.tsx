
import React, { useState, useEffect, useRef } from "react";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn } from "../utils/tvApi";
import { deleteImage as deleteImageApi, cropImage } from "../utils/galleryApi";
import { ArrowUpTrayIcon, ExclamationCircleIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface TV {
  ip: string;
  name?: string;
  mac?: string;
}

interface ImageCardProps {
  src: string;
  alt: string;
  filename?: string;
  image?: any;
  onClick?: () => void;
  onDelete?: () => void;
  onCrop?: () => void;
  /** if `large` the card uses a bigger image height (useful inside modals) */
  large?: boolean;
  /** when true, TV controls are shown regardless of size (useful for tests) */
  showControls?: boolean;
}

const ImageCard: React.FC<ImageCardProps> = ({
  src,
  alt,
  filename,
  image,
  onClick,
  onDelete,
  onCrop,
  large,
  showControls
}) => {
  const [selectedTvIp, setSelectedTvIp] = useState("");
  const [error, setError] = useState("");
  const [tvs, setTvs] = useState<TV[]>([]);
  const [tvLoading, setTvLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showCropModal, setShowCropModal] = useState(false);
  const [cropperInstance, setCropperInstance] = useState<any>(null);
  const [cropPreset, setCropPreset] = useState('');
  const [cropActionLoading, setCropActionLoading] = useState(false);
  const [cropMessage, setCropMessage] = useState('');
  const [imageURL, setImageURL] = useState(src);
  const cropperRef = useRef<any>(null);

  const cropPresets = [
    { label: '640x480', width: 640, height: 480 },
    { label: '800x600', width: 800, height: 600 },
    { label: '1024x768', width: 1024, height: 768 },
    { label: '1280x960', width: 1280, height: 960 },
    { label: '1920x1080', width: 1920, height: 1080 },
  ];

  // fetch TV list once when mounted
  useEffect(() => {
    getTvs().then(setTvs).catch(() => setTvs([]));
  }, []);

  useEffect(() => {
    setImageURL(src);
  }, [src]);

  const handleSendToTV = async () => {
    if (!selectedTvIp) {
      setError("Select a TV");
      return;
    }
    setTvLoading(true);
    try {
      let payload: any = { ip: selectedTvIp, filename: image?.filename };
      if (image?.type === "provider") {
        payload.provider_id = image.id;
        payload.provider = image.provider;
      }
      await sendToTV({ payload });
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to send to TV");
    } finally {
      setTvLoading(false);
    }
  };

  const handlePlayUploadedImage = async () => {
    if (!selectedTvIp) {
      setError("Select a TV");
      return;
    }
    setTvLoading(true);
    try {
      await playUploadedImage({ ip: selectedTvIp, filename: image?.filename });
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to play uploaded image on TV");
    } finally {
      setTvLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleteLoading(true);
    setError("");
    try {
      await onDelete();
    } catch (e: any) {
      setError(e.message || "Failed to delete image");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCrop = async () => {
    if (!image?.filename || !cropperInstance) return;
    setCropActionLoading(true);
    setCropMessage('');
    try {
      const data = cropperInstance.getData(true);
      const x = Math.max(0, Math.round(data.x));
      const y = Math.max(0, Math.round(data.y));
      const width = Math.max(1, Math.round(data.width));
      const height = Math.max(1, Math.round(data.height));

      const res = await cropImage(image.filename, x, y, width, height);
      if (!res.success) throw new Error((res as any).error || 'Crop failed');

      const cacheBustedUrl = `${src}${src.includes('?') ? '&' : '?'}cb=${Date.now()}`;
      setImageURL(cacheBustedUrl);
      setCropMessage('Crop applied successfully.');
      setShowCropModal(false);
      onCrop?.();
    } catch (e: any) {
      setCropMessage(e.message || 'Failed to crop image');
    } finally {
      setCropActionLoading(false);
    }
  };

  const applyCropPreset = (width: number, height: number) => {
    if (!cropperInstance) return;
    const canvasData = cropperInstance.getCanvasData();
    const left = Math.max(0, (canvasData.naturalWidth - width) / 2);
    const top = Math.max(0, (canvasData.naturalHeight - height) / 2);
    cropperInstance.setCropBoxData({ left, top, width, height });
  };

  const handleTvPowerOn = async () => {
    if (!selectedTvIp) {
      setError("Select a TV");
      return;
    }
    const tv = tvs.find(tv => tv.ip === selectedTvIp);
    setTvLoading(true);
    try {
      await tvPowerOn(tv?.ip || "", tv?.mac);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to power on TV");
    } finally {
      setTvLoading(false);
    }
  };

  return (
    <>
      <div
        className={
          `group relative flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-shadow duration-200 hover:shadow-lg ` +
          (large ? 'col-span-2' : '')
        }
      >
        <div className={`w-full bg-gray-100 flex items-center justify-center overflow-hidden ` + (large ? 'h-72' : 'h-52')} >
          <img
            src={imageURL}
            alt={alt}
            className={`max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105 cursor-pointer`}
            onClick={() => {
            setShowCropModal(true);
            onClick?.();
          }}
          />
        </div>
      {filename && (
        <div className="px-2 py-1 text-xs text-gray-600 truncate" title={filename}>
          {filename}
        </div>
      )}
      {image?.type === 'local' && (
        <button
          className="mt-2 mx-2 mb-1 text-xs text-indigo-700 hover:text-indigo-900"
          onClick={() => { setShowCropModal(true); setCropMessage(''); }}
        >
          Crop Image
        </button>
      )}

      {tvs.length > 0 && (large || showControls) && (
        <div className="w-full bg-gray-50 border-t px-3 py-2 space-y-2">
          <div>
            <select
              className="border px-2 py-1 rounded w-full text-xs"
              value={selectedTvIp}
              onChange={e => setSelectedTvIp(e.target.value)}
              disabled={tvLoading}
            >
              <option value="">-- Select TV --</option>
              {tvs.map(tv => (
                <option key={tv.ip} value={tv.ip}>
                  {tv.name || tv.ip}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
          <button
            className="w-full bg-blue-600 text-white text-xs py-2.5 rounded-4xl disabled:opacity-50 flex items-center justify-center px-4 gap-2 mb-1.5"
            onClick={async e => { e.stopPropagation(); await handleSendToTV(); }}
            disabled={tvLoading || !selectedTvIp}
          >
            {tvLoading ? 'Uploading…' : 'Upload'}
            <ArrowUpTrayIcon className="h-4 w-4" strokeWidth={3} />
          </button>
            <button
              className="flex-1 bg-green-600 text-white text-xs px-2 py-2 rounded-xl disabled:opacity-50"
              onClick={async e => { e.stopPropagation(); await handlePlayUploadedImage(); }}
              disabled={tvLoading || !selectedTvIp}
            >
              Play
            </button>
            <button
              className="flex-1 bg-gray-600 text-white text-xs px-2 py-2 rounded-xl disabled:opacity-50"
              onClick={async e => { e.stopPropagation(); await handleTvPowerOn(); }}
              disabled={tvLoading || !selectedTvIp}
            >
              Power
            </button>
          </div>
          {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
        </div>
      )}

      {onDelete && image?.type === "local" && (
        <button
          className="flex-1 mb-1 mt-2 bg-red-600 text-white text-xs px-2 py-1.5 mx-2 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          onClick={async e => { e.stopPropagation(); await handleDelete(); }}
          disabled={deleteLoading}
        >
          {deleteLoading ? 'Deleting…' : 'Delete'}
          <TrashIcon className="h-4 w-4" />
        </button>
      )}

      {showCropModal && image?.type === 'local' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-lg font-semibold">Crop Image: {filename}</h3>
              <button onClick={() => setShowCropModal(false)} className="text-gray-700 hover:text-black">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
              <div className="rounded overflow-hidden border" style={{ height: 350 }}>
                <Cropper
                  src={imageURL}
                  style={{ height: "100%", width: "100%" }}
                  aspectRatio={16 / 9}
                  guides={true}
                  viewMode={1}
                  background={false}
                  zoomable={true}
                  responsive={true}
                  autoCropArea={0.9}
                  checkOrientation={false}
                  onInitialized={(instance: any) => setCropperInstance(instance)}
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
                    className="flex-1 bg-indigo-600 text-white rounded px-4 py-2 hover:bg-indigo-700"
                    onClick={handleCrop}
                    disabled={cropActionLoading}
                  >
                    {cropActionLoading ? 'Cropping…' : 'Apply Crop'}
                  </button>
                  <button
                    className="flex-1 bg-gray-200 text-gray-800 rounded px-4 py-2 hover:bg-gray-300"
                    onClick={() => {
                      cropperInstance?.reset();
                      setCropMessage('');
                    }}
                  >
                    Reset
                  </button>
                </div>

                {cropMessage && <div className="text-sm text-green-600">{cropMessage}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tvs.length === 0 && (large || showControls) && (
        <div className="w-full bg-gray-50 border-t px-3 py-2 text-xs text-gray-500 flex gap-1">
          <ExclamationCircleIcon className="h-6 w-6 inline-block mr-1" strokeWidth={1.8} />

          No TVs found. Make sure your TV is on and connected to the same network. <br />
          If you have not yet connected any TVs, go to the Settings page to add one.
        </div>
      )}
    </div>
  </>
  );
};

export default ImageCard;
