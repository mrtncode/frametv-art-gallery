import React from "react";
import { ArrowUpTrayIcon, ExclamationCircleIcon, TrashIcon, XMarkIcon, SparklesIcon, TvIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { MATTE_STYLES, MATTE_COLORS } from "../utils/matte";

export interface TV {
  ip: string;
  name?: string;
  mac?: string;
  default_matte?: string | null;
  one_slot_mode?: boolean;
}

export interface AlbumOption {
  id: string;
  name: string;
  images: string[];
}

export interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageURL: string;
  alt: string;
  filename?: string;
  image?: any;
  albums?: AlbumOption[];
  tvs: TV[];
  selectedTvIp: string;
  setSelectedTvIp: (ip: string) => void;
  matteStyle: string;
  setMatteStyle: (style: string) => void;
  matteColor: string;
  setMatteColor: (color: string) => void;
  tvLoading: boolean;
  handleSendToTV: () => void;
  handlePlayUploadedImage: () => void;
  handleTvPowerOn: () => void;
  error: string;
  isLocalImage: boolean;
  onDelete?: () => Promise<void>;
  deleteLoading: boolean;
  showCropModal: boolean;
  setShowCropModal: (open: boolean) => void;
  onCrop?: () => void;
  availableAlbums: AlbumOption[];
  selectedAlbum: string;
  setSelectedAlbum: (id: string) => void;
  handleAssignToAlbum: (event: React.MouseEvent<HTMLButtonElement>) => void;
  assigning: boolean;
  assignMessage: string;
}

const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  imageURL,
  alt,
  filename,
  image,
  albums,
  tvs,
  selectedTvIp,
  setSelectedTvIp,
  matteStyle,
  setMatteStyle,
  matteColor,
  setMatteColor,
  tvLoading,
  handleSendToTV,
  handlePlayUploadedImage,
  handleTvPowerOn,
  error,
  isLocalImage,
  onDelete,
  deleteLoading,
  showCropModal,
  setShowCropModal,
  onCrop,
  availableAlbums,
  selectedAlbum,
  setSelectedAlbum,
  handleAssignToAlbum,
  assigning,
  assignMessage,
}) => {
  const [showAlbumAssign, setShowAlbumAssign] = React.useState(false);

  if (!isOpen) return null;

  const selectedTv = tvs.find((t) => t.ip === selectedTvIp);
  const isOneSlotMode = !!selectedTv?.one_slot_mode;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-opacity duration-200">
      <div className="bg-card text-card-foreground border border-border rounded-t-xl sm:rounded-xl w-full sm:w-[420px] max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <TvIcon className="h-5 w-5 text-blue-500" />
            <h2 className="text-base font-semibold truncate max-w-[260px]" title={filename || alt}>
              {filename || "Image Actions"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1 transition-colors hover:bg-muted"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Image Preview */}
        <div className="w-full bg-muted/60 rounded-lg flex items-center justify-center h-48 overflow-hidden border border-border/50">
          <img
            src={imageURL}
            alt={alt}
            className="max-h-full max-w-full object-contain transition-transform duration-200"
          />
        </div>

        {/* Crop & Assign Album Buttons */}
        {isLocalImage && (
          <div className={`flex gap-2 ${availableAlbums.length > 0 ? '' : 'flex-col'}`}>
            <button
              className={`${availableAlbums.length > 0 ? 'flex-1' : 'w-full'} bg-indigo-600 text-white text-xs font-medium py-2 px-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs`}
              onClick={() => {
                setShowCropModal(true);
                onClose();
              }}
            >
              Crop Image
            </button>

            {availableAlbums.length > 0 && (
              <button
                className="flex-1 bg-indigo-600 text-white text-xs font-medium py-2 px-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                onClick={() => setShowAlbumAssign(!showAlbumAssign)}
              >
                {showAlbumAssign ? "Hide Albums" : "Assign to Album"}
              </button>
            )}
          </div>
        )}

        {/* Album Assign Dropdown */}
        {isLocalImage && availableAlbums.length > 0 && showAlbumAssign && (
          <div className="space-y-2 pt-2 border-t border-border/60 bg-muted/30 p-3 rounded-lg">
            <label className="text-xs font-medium text-muted-foreground">Select Destination Album</label>
            <select
              className="w-full border border-border bg-background px-3 py-2 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={selectedAlbum}
              onChange={(e) => setSelectedAlbum(e.target.value)}
            >
              <option value="">Choose album...</option>
              {availableAlbums.map((album) => (
                <option key={album.id} value={album.name}>
                  {album.name}
                </option>
              ))}
            </select>
            <Button
              className="w-full text-xs py-2 disabled:opacity-50 font-medium"
              onClick={handleAssignToAlbum}
              disabled={assigning || !selectedAlbum}
            >
              {assigning ? 'Assigning…' : 'Assign to Album'}
            </Button>
            {assignMessage && <div className="text-xs text-green-600 dark:text-green-400 font-medium text-center">{assignMessage}</div>}
          </div>
        )}

        {/* TV Controls */}
        {tvs.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-border/60">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Target Frame TV</label>
              <select
                className="w-full border border-border bg-background px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={selectedTvIp}
                onChange={(e) => setSelectedTvIp(e.target.value)}
                disabled={tvLoading}
              >
                <option value="">-- Select TV --</option>
                {tvs.map((tv) => (
                  <option key={tv.ip} value={tv.ip}>
                    {tv.name || tv.ip} {tv.one_slot_mode ? "(1-Slot Mode)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* 1-Slot Mode status badge */}
            {selectedTvIp && isOneSlotMode && (
              <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50 flex items-start gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mt-1 flex-shrink-0 animate-pulse" />
                <span>
                  <strong>1-Slot Mode active:</strong> Uploading will display the image and auto-replace existing artwork on TV.
                </span>
              </div>
            )}

            {/* Matte settings */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Matte / Frame Options</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="border border-border bg-background px-2.5 py-2 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={matteStyle}
                  onChange={(e) => setMatteStyle(e.target.value)}
                  aria-label="Matte style"
                >
                  {MATTE_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style === 'none' ? 'No matte' : style}
                    </option>
                  ))}
                </select>
                <select
                  className="border border-border bg-background px-2.5 py-2 rounded-lg text-xs disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={matteColor}
                  onChange={(e) => setMatteColor(e.target.value)}
                  disabled={matteStyle === 'none'}
                  aria-label="Matte color"
                >
                  {MATTE_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Buttons depending on 1-Slot Mode */}
            {isOneSlotMode ? (
              <div className="space-y-2 pt-1">
                <button
                  className="w-full bg-blue-600 text-white text-xs font-semibold py-2.5 px-3 rounded-lg disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
                  onClick={() => handleSendToTV()}
                  disabled={tvLoading || !selectedTvIp}
                >
                  <ArrowUpTrayIcon className="h-4 w-4" strokeWidth={2.5} />
                  {tvLoading ? 'Processing…' : 'Upload and Play on TV'}
                </button>

                <button
                  className="w-full bg-gray-600 text-white text-xs font-medium py-2 px-3 rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors"
                  onClick={handleTvPowerOn}
                  disabled={tvLoading || !selectedTvIp}
                >
                  Power On TV
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <button
                  className="w-full bg-blue-600 text-white text-xs font-semibold py-2.5 px-3 rounded-lg disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
                  onClick={() => handleSendToTV()}
                  disabled={tvLoading || !selectedTvIp}
                >
                  <ArrowUpTrayIcon className="h-4 w-4" strokeWidth={2.5} />
                  {tvLoading ? 'Uploading…' : 'Upload to TV'}
                </button>

                <div className="flex gap-2">
                  <button
                    className="flex-1 bg-emerald-600 text-white text-xs font-medium py-2 px-3 rounded-lg disabled:opacity-50 hover:bg-emerald-700 transition-colors shadow-xs"
                    onClick={handlePlayUploadedImage}
                    disabled={tvLoading || !selectedTvIp}
                  >
                    Play
                  </button>

                  <button
                    className="flex-1 bg-gray-600 text-white text-xs font-medium py-2 px-3 rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors shadow-xs"
                    onClick={handleTvPowerOn}
                    disabled={tvLoading || !selectedTvIp}
                  >
                    Power On
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No TVs Warning */}
        {tvs.length === 0 && (
          <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg flex items-center gap-2 border border-border">
            <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 text-amber-500" strokeWidth={1.8} />
            <span>No TVs configured. Go to Settings to add one.</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded-lg border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* Delete Button */}
        {onDelete && isLocalImage && (
          <div className="pt-2 border-t border-border/60">
            <button
              className="w-full bg-red-600 text-white text-xs font-medium py-2.5 px-3 rounded-lg disabled:opacity-50 hover:bg-red-700 flex items-center justify-center gap-2 transition-colors shadow-xs"
              onClick={onDelete}
              disabled={deleteLoading}
            >
              <TrashIcon className="h-4 w-4" />
              {deleteLoading ? 'Deleting…' : 'Delete Image'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageModal;
