import React from "react";
import { ArrowUpTrayIcon, ExclamationCircleIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";

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

interface ImageModalProps {
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
  assignMessage
}) => {
  const [showAlbumAssign, setShowAlbumAssign] = React.useState(false);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-lg sm:rounded-lg w-full sm:w-96 max-h-[90vh] overflow-y-auto p-4 space-y-4">
        {/* Close Button */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-semibold">Image Controls</h2>
          <button
            onClick={onClose}
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

        {/* Crop Button & Assign Album */}
        {isLocalImage && (
          <div className={`flex gap-2 ${availableAlbums.length > 0 ? '' : 'flex-col'}`}>
            <button
              className={`${availableAlbums.length > 0 ? 'flex-1' : 'w-full'} bg-indigo-600 text-white text-sm py-2 rounded-lg hover:bg-indigo-700`}
              onClick={() => {
                setShowCropModal(true);
                onClose();
              }}
            >
              Crop Image
            </button>

            {availableAlbums.length > 0 && (
              <button
                className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-lg hover:bg-indigo-700"
                onClick={() => setShowAlbumAssign(!showAlbumAssign)}
              >
                Assign to Album
              </button>
            )}
          </div>
        )}

        {isLocalImage && availableAlbums.length > 0 && showAlbumAssign && (
          <div className="space-y-2 pt-2 border-t">
            <select
              className="w-full border border-gray-300 px-2 py-2 rounded text-sm"
              value={selectedAlbum}
              onChange={e => setSelectedAlbum(e.target.value)}
            >
              <option value="">Choose album</option>
              {availableAlbums.map(album => (
                <option key={album.id} value={album.name}>{album.name}</option>
              ))}
            </select>
            <Button
              className="w-full text-sm py-2 disabled:opacity-50"
              onClick={handleAssignToAlbum}
              disabled={assigning || !selectedAlbum}
            >
              {assigning ? 'Assigning…' : 'Assign'}
            </Button>
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

            <div className="flex gap-2">
              <button
                className="flex-1 bg-green-600 text-white text-sm py-2 rounded-lg disabled:opacity-50 hover:bg-green-700"
                onClick={handlePlayUploadedImage}
                disabled={tvLoading || !selectedTvIp}
              >
                Play
              </button>

              <button
                className="flex-1 bg-gray-600 text-white text-sm py-2 rounded-lg disabled:opacity-50 hover:bg-gray-700"
                onClick={handleTvPowerOn}
                disabled={tvLoading || !selectedTvIp}
              >
                Power On
              </button>
            </div>
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
            onClick={onDelete}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting…' : 'Delete Image'}
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ImageModal;
