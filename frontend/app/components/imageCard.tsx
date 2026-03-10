
import React, { useState, useEffect } from "react";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn } from "../utils/tvApi";

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
  /** if `large` the card uses a bigger image height (useful inside modals) */
  large?: boolean;
}

const ImageCard: React.FC<ImageCardProps> = ({
  src,
  alt,
  filename,
  image,
  onClick,
  large,
}) => {
  const [selectedTvIp, setSelectedTvIp] = useState("");
  const [error, setError] = useState("");
  const [tvs, setTvs] = useState<TV[]>([]);
  const [tvLoading, setTvLoading] = useState(false);

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
    <div className="border rounded p-2 flex flex-col items-center">
      <img
        src={src}
        alt={alt}
        className={`w-full ${large ? 'h-auto max-h-96' : 'h-32'} object-contain mb-2 bg-gray-100`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : undefined }}
      />
      {filename && <div className="mb-2 text-xs text-gray-500">{filename}</div>}
      {/* TV controls (always shown when TVs are available) */}
      {tvs.length > 0 && (
        <>
          <div className="mb-2 w-full">
            <label className="block text-xs mb-1">Select TV:</label>
            <select
              className="border px-2 py-1 rounded w-full"
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
          <div className="flex gap-2 mb-2">
            <button
              className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
              onClick={handleSendToTV}
              disabled={tvLoading || !selectedTvIp}
            >
              {tvLoading ? 'Uploading…' : 'Upload to TV'}
            </button>
            <button
              className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
              onClick={handlePlayUploadedImage}
              disabled={tvLoading || !selectedTvIp}
            >
              Play on TV
            </button>
            <button
              className="bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-50"
              onClick={handleTvPowerOn}
              disabled={tvLoading || !selectedTvIp}
            >
              Turn On TV
            </button>
          </div>
          {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
        </>
      )}
    </div>
  );
};

export default ImageCard;
