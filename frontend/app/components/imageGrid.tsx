import React from 'react'
import ImageCard from './imageCard'
import { getUploadUrl } from '~/utils/galleryApi';

interface ImageGridProps {
  images: any[];
  albums?: { id: string; name: string; images: string[] }[];
  onImageClick?: (img: any) => void;
  onDeleteImage?: (img: any) => void;
  onAssignSuccess?: () => void;
}

export default function ImageGrid({ images, albums = [], onImageClick, onDeleteImage, onAssignSuccess }: ImageGridProps) {
  return (
    <div className="w-full p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((img: any) => (
          <ImageCard
            key={img.id}
            src={getUploadUrl(img.filename)}
            alt={img.filename}
            filename={img.filename}
            image={img}
            albums={albums}
            onAssignSuccess={onAssignSuccess}
            onClick={() => onImageClick?.(img)}
            onDelete={onDeleteImage ? () => onDeleteImage(img) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
