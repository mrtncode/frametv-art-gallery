
import React, { useState, useEffect } from "react";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn } from "../utils/tvApi";
import { ArrowUpTrayIcon, ExclamationCircleIcon, TrashIcon } from "@heroicons/react/24/outline";

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
  large,
  showControls,
  onDelete
}) => {
  const [selectedTvIp, setSelectedTvIp] = useState("");
  const [error, setError] = useState("");
  const [tvs, setTvs] = useState<TV[]>([]);
  const [tvLoading, setTvLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // fetch TV list once when mounted
  useEffect(() => {
    getTvs().then(setTvs).catch(() => setTvs([]));
  }, []);

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
    <div
      className={
        `group relative flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-shadow duration-200 hover:shadow-lg ` +
        (large ? 'col-span-2' : '')
      }
    >
      <div className={`w-full bg-gray-100 flex items-center justify-center overflow-hidden ` + (large ? 'h-72' : 'h-48')} >
        <img
          src={src}
          alt={alt}
          className={`max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105`
            + (onClick ? ' cursor-pointer' : '')}
          onClick={onClick}
        />
      </div>
      {filename && (
        <div className="px-2 py-1 text-xs text-gray-600 truncate" title={filename}>
          {filename}
        </div>
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

      {tvs.length === 0 && (large || showControls) && (
        <div className="w-full bg-gray-50 border-t px-3 py-2 text-xs text-gray-500 flex gap-1">
          <ExclamationCircleIcon className="h-6 w-6 inline-block mr-1" strokeWidth={1.8} />

          No TVs found. Make sure your TV is on and connected to the same network. <br />
          If you have not yet connected any TVs, go to the Settings page to add one.
        </div>
      )}
    </div>
  );
};

export default ImageCard;
