import React from "react";

interface ImageCardProps {
  src: string;
  alt: string;
  filename?: string;
  onClick?: () => void;
  onSendToTV?: () => void;
  tvLoading?: boolean;
}

const ImageCard: React.FC<ImageCardProps> = ({
  src,
  alt,
  filename,
  onClick,
  onSendToTV,
  tvLoading,
}) => (
  <div className="border rounded p-2 flex flex-col items-center">
    <img
      src={src}
      alt={alt}
      className="w-full h-32 object-contain mb-2 bg-gray-100"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    />
    {filename && <div className="mb-2 text-xs text-gray-500">{filename}</div>}
    {onSendToTV && (
      <button
        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
        onClick={onSendToTV}
        disabled={tvLoading}
      >Send to TV</button>
    )}
  </div>
);

export default ImageCard;
