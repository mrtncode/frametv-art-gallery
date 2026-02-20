
export function meta({}: Route.MetaArgs) {
  return [
    { title: "FrameTV Art Gallery" },
    { name: "description", content: "Start dashboard for FrameTV Art Gallery" },
  ];
}

import React, { useEffect, useState } from "react";

export default function Home() {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/images")
      .then((res) => res.json())
      .then((data) => {
        setImages(data.images || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-lg">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900">FrameTV Art Gallery</h1>
        <p className="text-lg text-gray-500 mt-2">Upload, and enjoy beautiful images on your Frame TV.</p>
      </header>
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">General Information</h2>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li>Upload your own images to share</li>
          <li>Connect your Frame TV for seamless display</li>
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Featured Artworks</h2>
        {loading ? (
          <div className="text-center text-gray-400">Loading images...</div>
        ) : images.length === 0 ? (
          <div className="text-center text-gray-400">No images found. Upload some art!</div>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <img
                key={idx}
                src={`/uploads/${img}`}
                alt={`Artwork ${idx + 1}`}
                className="w-48 h-32 object-cover rounded-xl shadow-md border border-gray-200"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
