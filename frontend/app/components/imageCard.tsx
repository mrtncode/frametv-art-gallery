
import React, { useState, useEffect } from "react";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn } from "../utils/tvApi";
import { addImageToAlbum } from "../utils/galleryApi";
import { ArrowUpTrayIcon, ExclamationCircleIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import CropImageModal from "./CropImageModal";

interface TV {
  ip: string;
  name?: string;
  mac?: string;
}

interface AlbumOption {
  id: string;
  name: string;
  images: string[];
}

interface ImageCardProps {
  src: string;
  alt: string;
  filename?: string;
  image?: any;
  albums?: AlbumOption[];
  onClick?: () => void;
  onDelete?: () => void;
  onCrop?: () => void;
  onAssignSuccess?: () => void;
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
  albums,
  onClick,
  onDelete,
  onCrop,
  onAssignSuccess,
  large,
  showControls
}) => {
  const [selectedTvIp, setSelectedTvIp] = useState("");
  const [error, setError] = useState("");
  const [tvs, setTvs] = useState<TV[]>([]);
  const [tvLoading, setTvLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [imageURL, setImageURL] = useState(src);
  const [selectedAlbum, setSelectedAlbum] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState('');

  const isLocalImage = image?.type === 'local' || !image?.type;
  const availableAlbums = (albums || []).filter(album => filename && !album.images.includes(filename));

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

  const handleAssignToAlbum = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!selectedAlbum || !filename) {
      setError("Select an album first.");
      return;
    }
    setAssigning(true);
    setError("");
    setAssignMessage("");
    try {
      await addImageToAlbum(selectedAlbum, filename);
      setAssignMessage("Assigned to album.");
      setSelectedAlbum('');
      onAssignSuccess?.();
    } catch (e: any) {
      setError(e.message || "Failed to assign image to album");
    } finally {
      setAssigning(false);
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
              setShowControlsModal(true);
              onClick?.();
            }}
          />
        </div>
      {filename && (
        <div className="px-2 py-1 text-xs text-gray-600 truncate" title={filename}>
          {filename}
        </div>
      )}
    </div>


      {showCropModal && isLocalImage && (
        <CropImageModal
          isOpen={showCropModal}
          imageUrl={imageURL}
          filename={filename || "image"}
          onClose={() => setShowCropModal(false)}
          onCropSuccess={(newUrl) => {
            setImageURL(newUrl);
            setShowCropModal(false);
            onCrop?.();
          }}
        />
      )}

      {/* Controls Modal - opens on image click */}
      {showControlsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-lg sm:rounded-lg w-full sm:w-96 max-h-[90vh] overflow-y-auto p-4 space-y-4">
            {/* Close Button */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold">Image Controls</h2>
              <button
                onClick={() => setShowControlsModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="w-full bg-gray-100 rounded-lg flex items-center justify-center h-48 overflow-hidden">
              <img
                src={imageURL}
                alt={alt}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Crop Button */}
            {isLocalImage && (
              <button
                className="w-full bg-indigo-600 text-white text-sm py-2 rounded-lg hover:bg-indigo-700"
                onClick={() => {
                  setShowCropModal(true);
                  setShowControlsModal(false);
                }}
              >
                Crop Image
              </button>
            )}

            {isLocalImage && availableAlbums.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Assign to album</div>
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 border border-gray-300 px-2 py-2 rounded text-sm"
                    value={selectedAlbum}
                    onChange={e => setSelectedAlbum(e.target.value)}
                  >
                    <option value="">Choose album</option>
                    {availableAlbums.map(album => (
                      <option key={album.id} value={album.name}>{album.name}</option>
                    ))}
                  </select>
                  <button
                    className="bg-blue-600 text-white text-sm px-3 py-2 rounded disabled:opacity-50"
                    onClick={handleAssignToAlbum}
                    disabled={assigning || !selectedAlbum}
                  >
                    {assigning ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
                {assignMessage && <div className="text-xs text-green-600">{assignMessage}</div>}
              </div>
            )}

            {/* TV Controls */}
            {tvs.length > 0 && (
              <div className="space-y-3">
                <select
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm"
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

                <button
                  className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2"
                  onClick={handleSendToTV}
                  disabled={tvLoading || !selectedTvIp}
                >
                  {tvLoading ? 'Uploading…' : 'Upload to TV'}
                  <ArrowUpTrayIcon className="h-4 w-4" strokeWidth={3} />
                </button>

                <button
                  className="w-full bg-green-600 text-white text-sm py-2 rounded-lg disabled:opacity-50 hover:bg-green-700"
                  onClick={handlePlayUploadedImage}
                  disabled={tvLoading || !selectedTvIp}
                >
                  Play
                </button>

                <button
                  className="w-full bg-gray-600 text-white text-sm py-2 rounded-lg disabled:opacity-50 hover:bg-gray-700"
                  onClick={handleTvPowerOn}
                  disabled={tvLoading || !selectedTvIp}
                >
                  Power On
                </button>
              </div>
            )}

            {tvs.length === 0 && (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg flex gap-2">
                <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0" strokeWidth={1.8} />
                <span>No TVs configured. Go to Settings to add one.</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Delete Button */}
            {onDelete && isLocalImage && (
              <button
                className="w-full bg-red-600 text-white text-sm py-2 rounded-lg disabled:opacity-50 hover:bg-red-700 flex items-center justify-center gap-2"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting…' : 'Delete Image'}
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
  </>
  );
};

export default ImageCard;
