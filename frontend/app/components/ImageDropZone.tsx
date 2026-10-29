import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import React, { useState } from "react";

type ImageDropZoneProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onFilesDropped: (files: File[]) => Promise<void>;
};

export default function ImageDropZone({
  children,
  className,
  disabled = false,
  onFilesDropped,
}: ImageDropZoneProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [hasImageFiles, setHasImageFiles] = useState(false);

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    setDragCounter((prev) => prev + 1);
    setIsDraggingOver(true);

    const items = e.dataTransfer.items;
    const types = Array.from(e.dataTransfer.types || []);
    let hasImages = false;

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          hasImages = true;
          break;
        }
      }
    }

    if (!hasImages && types.includes("Files")) {
      hasImages = true;
    }

    setHasImageFiles(hasImages);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    setDragCounter((prev) => {
      const next = Math.max(prev - 1, 0);
      if (next === 0) {
        setIsDraggingOver(false);
        setHasImageFiles(false);
      }
      return next;
    });
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();

    setIsDraggingOver(false);
    setDragCounter(0);
    setHasImageFiles(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length === 0) return;
    await onFilesDropped(files);
  }

  return (
    <div
      className={className}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div
          className={`fixed inset-0 z-40 flex items-center justify-center pointer-events-none ${
            hasImageFiles
              ? "bg-green-200 opacity-80"
              : "bg-red-500 bg-opacity-20"
          }`}
        >
          <div className="text-center">
            <ArrowUpTrayIcon scale={20} />
            <p
              className={`text-2xl font-bold ${
                hasImageFiles ? "text-green-900" : "text-red-600"
              }`}
            >
              {hasImageFiles ? "Upload Image" : "No Images Detected"}
            </p>
            <p
              className={`text-sm mt-2 ${
                hasImageFiles ? "text-green-900" : "text-red-600"
              }`}
            >
              {hasImageFiles ? "Drop to upload" : "Please drag image files"}
            </p>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
