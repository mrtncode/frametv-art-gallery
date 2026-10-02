import React, { useState, useEffect, useRef } from "react";
import { getTvs, sendToTV, playUploadedImage, tvPowerOn, type TVInfo } from "../utils/tvApi";
import { addImageToAlbum } from "../utils/galleryApi";
import CropImageModal from "./CropImageModal";
import ImageModal, { type TV, type AlbumOption } from "./imageModal";
import { MATTE_COLORS, splitMatte, combineMatte } from "../utils/matte";
import { CheckIcon } from "@heroicons/react/24/outline";

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
  /** Something in the grid is selected: checkboxes stay visible and a click selects */
  selecting?: boolean;
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
  selecting,
}) => {
  const [selectedTvIp, setSelectedTvIp] = useState("");
  const [error, setError] = useState("");
  const [tvs, setTvs] = useState<TV[]>(tvsProp || []);
  const [tvLoading, setTvLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [tileURL, setTileURL] = useState(src);
  // The tile pulses as a skeleton until its picture has arrived (or failed to).
  const [tileLoaded, setTileLoaded] = useState(false);
  const tileRef = useRef<HTMLImageElement>(null);
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
  // A picture added from a museum has a real title; an upload falls back to its file name.
  const provenance = image?.provenance;
  const title = provenance?.title || (filename || alt).replace(/\.[^.]+$/, "");
  const albumName = filename ? albums?.find((album) => album.images.includes(filename))?.name : undefined;
  const subtitle = provenance?.title
    ? [provenance.artist, provenance.source_label].filter(Boolean).join(" · ")
    : albumName;
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

  // Default to the first TV, so sending an image is one click away.
  useEffect(() => {
    if (tvs.length > 0 && !tvs.some((tv) => tv.ip === selectedTvIp)) {
      setSelectedTvIp(tvs[0].ip);
    }
  }, [tvs, selectedTvIp]);

  useEffect(() => {
    setTileURL(src);
    setImageURL(fullSrc ?? src);
  }, [src, fullSrc]);

  // A cached picture can finish before React attaches onLoad, so check once it is in place.
  useEffect(() => {
    setTileLoaded(!!tileRef.current?.complete && tileRef.current.naturalWidth > 0);
  }, [tileURL]);

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
      {/* The tile is the shape of the TV. The whole picture sits over a blurred fill of itself,
          so portraits and squares are shown complete without plain bars beside them. */}
      <div
        className={
          `group relative aspect-video overflow-hidden rounded-xl bg-neutral-900 shadow-xs transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:shadow-lg ` +
          (large ? "col-span-2 " : "") +
          (selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "")
        }
      >
        {!tileLoaded && <span className="absolute inset-0 animate-pulse bg-accent" aria-hidden="true" />}
        <img
          src={tileURL}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={
            "absolute inset-0 size-full scale-110 object-cover blur-xl brightness-75 transition-opacity duration-300 " +
            (tileLoaded ? "opacity-100" : "opacity-0")
          }
        />
        <button
          type="button"
          className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70"
          aria-label={`Open ${title}`}
          onClick={(event) => {
            // While selecting, a click (or shift/ctrl-click) picks the image instead of opening it.
            if (onToggleSelect && (selecting || event.shiftKey || event.ctrlKey || event.metaKey)) {
              onToggleSelect(event.shiftKey);
              return;
            }
            setShowControlsModal(true);
            onClick?.();
          }}
        >
          <img
            ref={tileRef}
            src={tileURL}
            alt={alt}
            loading="lazy"
            onLoad={() => setTileLoaded(true)}
            onError={() => setTileLoaded(true)}
            className={
              "relative size-full object-contain drop-shadow-lg transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.03] " +
              (tileLoaded ? "opacity-100" : "opacity-0")
            }
          />
        </button>

        {/* Name on a soft gradient, as on the home hero */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-6 text-white sm:px-3 sm:pb-2.5 sm:pt-8">
          <p className="truncate text-xs font-semibold sm:text-sm leading-tight drop-shadow-sm" title={title}>{title}</p>
          {subtitle && <p className="hidden truncate text-xs text-white/75 sm:block">{subtitle}</p>}
        </div>

        {onToggleSelect && (
          <label
            className={
              "absolute left-2 top-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-opacity has-[:focus-visible]:opacity-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/60 " +
              (selected
                ? "border-primary bg-primary text-primary-foreground opacity-100"
                : "border-white/70 bg-black/30 text-transparent hover:bg-black/45 " +
                  (selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"))
            }
            title="Select image"
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={!!selected}
              aria-label={`Select ${title}`}
              onChange={(event) => onToggleSelect((event.nativeEvent as MouseEvent).shiftKey)}
            />
            <CheckIcon className="size-4" strokeWidth={3} aria-hidden="true" />
          </label>
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
