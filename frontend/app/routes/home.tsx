import type { Route } from "./+types/settings";
import { ChartBarIcon, TvIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { fetchImages, fetchAlbums, fetchImagesAddedThisMonth, getUploadUrl } from "~/utils/galleryApi";
import { Card, CardHeader, CardDescription, CardTitle, CardAction, CardFooter } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

// Reusable CardInfo component
function CardInfo({ description, title, badgeText, badgeIcon, footerMain, footerSub }: {
  description: string;
  title: string;
  badgeText: string;
  badgeIcon: React.ReactNode;
  footerMain: React.ReactNode;
  footerSub: React.ReactNode;
}) {
  return (
    <Card className="@container/card flex-1">
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {footerMain}
        </div>
        <div className="text-muted-foreground">
          {footerSub}
        </div>
        <div className="mt-2 w-full flex justify-start">
          <Badge
            variant="outline"
            className="flex items-center gap-1 px-2 py-1 text-xs md:text-sm sm:text-xs md:px-3 md:py-1.5 whitespace-nowrap"
            style={{ minWidth: 0, maxWidth: '100%' }}
          >
            {badgeIcon}
            {badgeText}
          </Badge>
        </div>
      </CardFooter>
    </Card>
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FrameTV Art Gallery" },
    { name: "description", content: "Start dashboard for FrameTV Art Gallery" },
  ];
}


export default function Home() {
  const [images, setImages] = useState<string[]>([]);
  const [albums, setAlbums] = useState<{ name: string; images: string[] }[]>([]);
  const [imagesThisMonth, setImagesThisMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchImages(),
      fetchAlbums(),
      fetchImagesAddedThisMonth(),
    ])
      .then(([imgs, albms, count]) => {
        setImages(imgs || []);
        setAlbums(albms || []);
        setImagesThisMonth(typeof count === "number" ? count : 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Array to control cards
  const cards = [
    {
      description: "Total images",
      title: loading ? "-" : images.length.toString(),
      badgeText: images.length > 0 ? `+${images.length}` : "0",
      badgeIcon: <ChartBarIcon />, 
      footerMain: null,
      footerSub: loading ? "Loading..." : "",
    },
    {
      description: "Total albums",
      title: loading ? "-" : albums.length.toString(),
      badgeText: albums.length > 0 ? `+${albums.length}` : "0",
      badgeIcon: <ChartBarIcon />, 
      footerMain: null,
      footerSub: loading ? "Loading..." : "",
    },
    {
      description: "Images added this month",
      title: loading || imagesThisMonth === null ? "-" : imagesThisMonth.toString(),
      badgeText: imagesThisMonth !== null ? `+${imagesThisMonth}` : "0",
      badgeIcon: <ChartBarIcon />, 
      footerMain: null,
      footerSub: loading ? "Loading..." : "",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-lg">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900">FrameTV Art Gallery</h1>
        <p className="text-lg text-gray-500 mt-2">Upload, and enjoy beautiful images on your Frame TV.</p>
      </header>

      {/* Responsive cards container */}
      <div
        className="flex flex-row gap-4 md:flex-row md:gap-4 sm:flex-col sm:gap-4 sm:w-full sm:items-stretch"
      >
        {cards.map((card, idx) => (
          <CardInfo key={idx} {...card} />
        ))}
      </div>

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
                src={getUploadUrl(img)}
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
