
import React, { useState, useEffect } from "react";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn } from "../utils/tvApi";
import { addImageToAlbum } from "../utils/galleryApi";
import { ArrowUpTrayIcon, ExclamationCircleIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import CropImageModal from "./CropImageModal";
import ImageModal from "./imageModal";

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

      {/* Controls Modal - now in ImageModal component */}
      <ImageModal
        isOpen={showControlsModal}
        onClose={() => setShowControlsModal(false)}
        imageURL={imageURL}
        alt={alt}
        filename={filename}
        image={image}
        albums={albums}
        tvs={tvs}
        selectedTvIp={selectedTvIp}
        setSelectedTvIp={setSelectedTvIp}
        tvLoading={tvLoading}
        handleSendToTV={handleSendToTV}
        handlePlayUploadedImage={handlePlayUploadedImage}
        handleTvPowerOn={handleTvPowerOn}
        error={error}
        isLocalImage={isLocalImage}
        onDelete={onDelete ? handleDelete : undefined}
        deleteLoading={deleteLoading}
        showCropModal={showCropModal}
        setShowCropModal={setShowCropModal}
        onCrop={onCrop}
        availableAlbums={availableAlbums}
        selectedAlbum={selectedAlbum}
        setSelectedAlbum={setSelectedAlbum}
        handleAssignToAlbum={handleAssignToAlbum}
        assigning={assigning}
        assignMessage={assignMessage}
      />
  </>
  );
};

export default ImageCard;
