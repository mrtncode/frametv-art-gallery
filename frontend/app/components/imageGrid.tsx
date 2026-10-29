import React from 'react'
import ImageCard from './imageCard'
import { getUploadUrl } from '~/utils/galleryApi';

interface ImageGridProps {
  images: any[];
  albums?: { id: string; name: string; images: string[] }[];
  onImageClick?: (img: any) => void;
  onDeleteImage?: (img: any) => void;
  onAssignSuccess?: () => void;
  /** Pass the list when the page already has it; left out, the tiles share one fetch */
  tvs?: any[];
  /** filenames currently selected; passing this turns the checkboxes on */
  selectedFilenames?: string[];
  onToggleSelect?: (filename: string, index: number, shiftKey: boolean) => void;
}

export default function ImageGrid({
  images,
  albums = [],
  onImageClick,
  onDeleteImage,
  onAssignSuccess,
  tvs,
  selectedFilenames,
  onToggleSelect,
}: ImageGridProps) {
  const selected = new Set(selectedFilenames || []);
  return (
    <div className="w-full py-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {images.map((img: any, index: number) => (
          <ImageCard
            key={img.id}
            src={getUploadUrl(img.filename, 400)}
            fullSrc={getUploadUrl(img.filename)}
            alt={img.filename}
            filename={img.filename}
            image={img}
            albums={albums}
            tvs={tvs}
            onAssignSuccess={onAssignSuccess}
            onClick={() => onImageClick?.(img)}
            onDelete={onDeleteImage ? () => onDeleteImage(img) : undefined}
            selected={selected.has(img.filename)}
            selecting={selected.size > 0}
            onToggleSelect={
              onToggleSelect ? (shiftKey) => onToggleSelect(img.filename, index, shiftKey) : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}
