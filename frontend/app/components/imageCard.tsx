import React, { useState, useEffect } from "react";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn, type TVInfo } from "../utils/tvApi";
import { addImageToAlbum } from "../utils/galleryApi";
import CropImageModal from "./CropImageModal";
import ImageModal, { type TV, type AlbumOption } from "./imageModal";
import { MATTE_COLORS, splitMatte, combineMatte } from "../utils/matte";

export interface ImageCardProps {
  /** what the grid tile shows — may be a downscaled copy */
  src: string;
  /**
   * Full-resolution URL for the modal and the cropper. The cropper scales its
   * coordinates by naturalWidth, so handing it a thumbnail would crop the wrong
   * region of the original. Defaults to `src`.
   */
  fullSrc?: string;
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
  tvs?: TV[];
  selected?: boolean;
  /** passing this shows the selection checkbox */
  onToggleSelect?: (shiftKey: boolean) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({
  src,
  fullSrc,
  alt,
  filename,
  image,
  albums,
  onClick,
  onDelete,
  onCrop,
  onAssignSuccess,
  large,
  showControls,
  tvs: tvsProp,
  selected,
  onToggleSelect,
}) => {
  const [selectedTvIp, setSelectedTvIp] = useState("");
  const [error, setError] = useState("");
  const [tvs, setTvs] = useState<TV[]>(tvsProp || []);
  const [tvLoading, setTvLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [tileURL, setTileURL] = useState(src);
  const [imageURL, setImageURL] = useState(fullSrc ?? src);
  const [selectedAlbum, setSelectedAlbum] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState("");
  const [matteStyle, setMatteStyle] = useState("none");
  const [matteColor, setMatteColor] = useState<string>(MATTE_COLORS[0]);
  // Whether this send should carry a matte of its own. Left false, the request omits
  // it and the TV's configured default applies server-side.
  const [matteTouched, setMatteTouched] = useState(false);

  const isLocalImage = image?.type === "local" || !image?.type;
  const availableAlbums = (albums || []).filter(
    (album) => filename && !album.images.includes(filename)
  );

  // Sync or fetch TV list
  useEffect(() => {
    if (tvsProp && tvsProp.length > 0) {
      setTvs(tvsProp);
      return;
    }
    if (tvs.length === 0) {
      getTvs()
        .then((fetchedTvs) => setTvs(fetchedTvs || []))
        .catch(() => setTvs([]));
    }
  }, [tvsProp]);

  useEffect(() => {
    setTileURL(src);
    setImageURL(fullSrc ?? src);
  }, [src, fullSrc]);

  // Sync default matte for selected TV
  const selectedTvDefaultMatte = tvs.find((t) => t.ip === selectedTvIp)?.default_matte ?? null;
  useEffect(() => {
    const { style, color } = splitMatte(selectedTvDefaultMatte);
    setMatteStyle(style);
    setMatteColor(color);
    setMatteTouched(false);
  }, [selectedTvIp, selectedTvDefaultMatte]);

  /**
   * Send artwork to TV.
   * If ignoreOneSlot is true, passes ignore_one_slot: true in payload so backend bypasses 1-slot pruning.
   */
  const handleSendToTV = async () => {
    if (!selectedTvIp) {
      setError("Select a TV");
      return;
    }
    setTvLoading(true);
    try {
      let payload: any = { ip: selectedTvIp, filename: image?.filename };
      if (matteTouched) payload.matte = combineMatte(matteStyle, matteColor);
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
    const tv = tvs.find((t) => t.ip === selectedTvIp);
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
      setSelectedAlbum("");
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
          `group relative flex flex-col overflow-hidden rounded-xl bg-card border border-border/80 shadow-xs transition-all duration-200 hover:shadow-lg hover:border-border ` +
          (large ? "col-span-2 " : "") +
          (selected ? "ring-2 ring-blue-500 border-blue-500" : "")
        }
      >
        {onToggleSelect && (
          <label
            className="absolute top-2 left-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-card/90 backdrop-blur-xs border border-border shadow-xs hover:bg-card transition-colors"
            title="Select image"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
              checked={!!selected}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onToggleSelect((event.nativeEvent as MouseEvent).shiftKey)}
            />
          </label>
        )}

        <div
          className={
            `w-full bg-muted/60 flex items-center justify-center overflow-hidden ` +
            (large ? "h-72" : "h-52")
          }
        >
          <img
            src={tileURL}
            alt={alt}
            loading="lazy"
            className="max-h-full max-w-full object-contain transition-transform duration-300 ease-out group-hover:scale-105 cursor-pointer"
            onClick={(event) => {
              // While selecting, clicking the image extends selection instead of opening modal
              if (onToggleSelect && (event.shiftKey || event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                onToggleSelect(event.shiftKey);
                return;
              }
              setShowControlsModal(true);
              onClick?.();
            }}
          />
        </div>

        {filename && (
          <div
            className="px-3 py-2 text-xs font-medium text-muted-foreground truncate border-t border-border/40 bg-card"
            title={filename}
          >
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
            setTileURL(`${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`);
            setShowCropModal(false);
            onCrop?.();
          }}
        />
      )}

      {/* Refactored Controls Modal */}
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
        matteStyle={matteStyle}
        setMatteStyle={(style: string) => {
          setMatteStyle(style);
          setMatteTouched(true);
        }}
        matteColor={matteColor}
        setMatteColor={(color: string) => {
          setMatteColor(color);
          setMatteTouched(true);
        }}
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
