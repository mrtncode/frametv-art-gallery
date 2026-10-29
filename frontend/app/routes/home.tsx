import type { Route } from "./+types/home";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardDescription, CardTitle, CardFooter } from "~/components/ui/card";
import { fetchImages, fetchAlbums, fetchImagesAddedThisMonth, getUploadUrl } from "~/utils/galleryApi";
import { Badge } from "~/components/ui/badge";
import UpdateStatus from "~/components/update-status";

function CardInfo({
  description,
  title,
  badgeText,
  badgeIcon,
  footerMain,
  footerSub,
}: {
  description: string;
  title: string;
  badgeText: string;
  badgeIcon: React.ReactNode;
  footerMain: React.ReactNode;
  footerSub: React.ReactNode;
}) {
  return (
    <Card className="@container/card flex-1 bg-gray-100/40 dark:bg-gray-800/20">
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">{footerMain}</div>
        <div className="text-muted-foreground">{footerSub}</div>
        <div className="mt-2 flex w-full justify-start">
          <Badge
            variant="outline"
            className="flex items-center gap-1 whitespace-nowrap px-2 py-1 text-xs md:px-3 md:py-1.5 md:text-sm sm:text-xs"
            style={{ minWidth: 0, maxWidth: "100%" }}
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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchImages(), fetchAlbums(), fetchImagesAddedThisMonth()])
      .then(([imgs, albms, count]) => {
        setImages(imgs || []);
        setAlbums(albms || []);
        setImagesThisMonth(typeof count === "number" ? count : 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
    <div className="relative mx-auto w-full p-12">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-foreground">FrameTV Art Gallery</h1>
            <UpdateStatus />
          </div>
        </div>
        <h2 className="text-4xl font-medium text-foreground">{greeting()}</h2>
      </header>

      <div className="flex flex-row gap-4 md:flex-row md:gap-4 sm:w-full sm:flex-col sm:items-stretch sm:gap-4">
        {cards.map((card, idx) => (
          <CardInfo key={idx} {...card} />
        ))}
      </div>

      <section className="mt-8 rounded-2xl bg-gray-100/40 p-2 py-4 dark:bg-gray-800/20">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Featured Artworks</h2>
        {loading ? (
          <div className="text-center text-muted-foreground">Loading images...</div>
        ) : images.length === 0 ? (
          <div className="text-center text-muted-foreground">No images found. Upload some art!</div>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <img
                key={idx}
                src={getUploadUrl(img, 400)}
                alt={`Artwork ${idx + 1}`}
                className="h-32 w-48 rounded-xl border border-border object-cover shadow-md"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
