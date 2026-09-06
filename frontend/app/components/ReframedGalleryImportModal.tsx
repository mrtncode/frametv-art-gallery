import React, { useState, useEffect } from "react";
import { XMarkIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { importReframedGallery, createAlbum } from "../utils/galleryApi";
import { toast } from "sonner";

const NEW_ALBUM = "__new__";

export type AlbumOption = {
  id: string;
  name: string;
};

interface ReframedGalleryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  albums: AlbumOption[];
  onUploadSuccess: () => Promise<void> | void;
}

export default function ReframedGalleryImportModal({
  isOpen,
  onClose,
  albums,
  onUploadSuccess,
}: ReframedGalleryImportModalProps) {
  const [url, setUrl] = useState("");
  const [uploadAlbumId, setUploadAlbumId] = useState("");
  const [uploadNewAlbumName, setUploadNewAlbumName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setUrl("");
      setUploadAlbumId("");
      setUploadNewAlbumName("");
      setError("");
      setUploading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function resolveAlbumId(
    targetAlbumId: string,
    newAlbumName: string
  ): Promise<string | undefined> {
    if (targetAlbumId !== NEW_ALBUM) return targetAlbumId || undefined;

    const name = newAlbumName.trim();
    if (!name) throw new Error("Enter a name for the new album");

    const existing = albums.find((album) => album.name === name);
    let targetId = existing?.id;

    if (!targetId) {
      const updatedAlbums = await createAlbum(name);
      const target = updatedAlbums.find((a: any) => a.name === name);
      if (!target) throw new Error("Failed to create album");
      targetId = String(target.id);
    }
    return targetId;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setUploading(true);
    setError("");

    try {
      const albumId = await resolveAlbumId(uploadAlbumId, uploadNewAlbumName);
      const duplicates: string[] = [];
      const result = await importReframedGallery(url.trim(), albumId);
      if (result?.duplicate_of) duplicates.push(`${result.filename} (same as ${result.duplicate_of})`);

      if (duplicates.length > 0) {
        toast.warning(`Already in gallery: ${duplicates.join(", ")}`, {
          position: "top-center",
          duration: 8000,
        });
      }

      toast.success("Artwork imported successfully", { position: "top-center" });
      await onUploadSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to import artwork");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div className="bg-card text-foreground rounded-lg shadow-xl w-full max-w-md p-6 relative border border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ArrowTopRightOnSquareIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold">Import from Reframed Gallery</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Button type="button" variant="outline" onClick={() => window.open("https://reframed.gallery", "_blank", "noopener,noreferrer")}>
            Browse gallery
          </Button>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reframed-url" className="text-sm font-medium text-muted-foreground">Paste art link</label>
            <input id="reframed-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://reframed.gallery/..." className="border border-border bg-background px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={uploading} autoFocus />
          </div>

          {/* Album Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Add to album (optional)
            </label>
            <select
              value={uploadAlbumId}
              onChange={(e) => setUploadAlbumId(e.target.value)}
              className="border border-border bg-background px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            >
              <option value="">No album</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
              <option value={NEW_ALBUM}>+ New album…</option>
            </select>
          </div>

          {/* New Album Name Input */}
          {uploadAlbumId === NEW_ALBUM && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                New album name
              </label>
              <input
                type="text"
                value={uploadNewAlbumName}
                onChange={(e) => setUploadNewAlbumName(e.target.value)}
                placeholder="Enter new album name"
                className="border border-border bg-background px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={uploading}
                autoFocus
              />
            </div>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={uploading}
              className="text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={uploading || !url.trim()}
              className="text-sm"
            >
              {uploading ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
