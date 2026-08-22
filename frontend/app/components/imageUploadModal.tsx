import React, { useState, useRef, useEffect } from "react";
import { XMarkIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { uploadImage, createAlbum } from "../utils/galleryApi";
import { toast } from "sonner";

const NEW_ALBUM = "__new__";

export type AlbumOption = {
  id: string;
  name: string;
};

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  albums: AlbumOption[];
  onUploadSuccess: () => Promise<void> | void;
}

export default function ImageUploadModal({
  isOpen,
  onClose,
  albums,
  onUploadSuccess,
}: ImageUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadAlbumId, setUploadAlbumId] = useState("");
  const [uploadNewAlbumName, setUploadNewAlbumName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setUploadAlbumId("");
      setUploadNewAlbumName("");
      setError("");
      setUploading(false);
      setIsDragOver(false);
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
    if (files.length === 0) return;

    setUploading(true);
    setError("");

    try {
      const albumId = await resolveAlbumId(uploadAlbumId, uploadNewAlbumName);
      let uploaded = 0;
      let failed = 0;
      const duplicates: string[] = [];

      for (const file of files) {
        try {
          const result = await uploadImage(file, albumId);
          uploaded++;
          if (result?.duplicate_of) {
            duplicates.push(`${result.filename} (same as ${result.duplicate_of})`);
          }
        } catch (err) {
          failed++;
          console.error(`Failed to upload ${file.name}:`, err);
        }
      }

      if (duplicates.length > 0) {
        toast.warning(`Already in gallery: ${duplicates.join(", ")}`, {
          position: "top-center",
          duration: 8000,
        });
      }

      if (uploaded > 0) {
        toast.success(
          `Uploaded ${uploaded} image${uploaded === 1 ? "" : "s"} successfully`,
          { position: "top-center" }
        );
        await onUploadSuccess();
        onClose();
      } else if (failed > 0) {
        setError(`Failed to upload ${failed} file${failed === 1 ? "" : "s"}`);
      } else {
        setError("No valid image files were uploaded");
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload image(s)");
    } finally {
      setUploading(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter((file) =>
        file.type.startsWith("image/")
      );
      setFiles(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (uploading) return;
    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      if (droppedFiles.length > 0) {
        setFiles(droppedFiles);
      }
    }
  };

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
            <ArrowUpTrayIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold">Upload Images</h3>
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
          {/* File Dropzone / Select */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragOver
                ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
                : "border-border hover:border-blue-400 bg-muted/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              multiple
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />

            <ArrowUpTrayIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {files.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-foreground">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs mx-auto">
                  {files.map((f) => f.name).join(", ")}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Click or drag to change selection
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-foreground">
                  Click to select or drag & drop images
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, WEBP or GIF
                </p>
              </div>
            )}
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
              disabled={uploading || files.length === 0}
              className="text-sm"
            >
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
