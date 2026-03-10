import React from 'react'
import ImageCard from './imageCard'

interface ImageGridProps {
  images: any[];
  onImageClick?: (img: any) => void;
}

export default function ImageGrid({ images, onImageClick }: ImageGridProps) {
  return (
    <div className='flex flex-wrap gap-4 bg-red-100 w-full p-4 rounded'>
      {images.map((img: any) => (
        <ImageCard
          key={img.id}
          src={`/uploads/${img.filename}`}
          alt={img.filename}
          filename={img.filename}
          image={img}
          onClick={() => onImageClick?.(img)}
        />
      ))}
    </div>
  )
}
