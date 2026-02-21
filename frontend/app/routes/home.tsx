import type { Route } from "./+types/settings";
import { TvIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardDescription, CardTitle, CardAction, CardFooter } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

// Reusable CardInfo component
function CardInfo({ description, title, badgeText, badgeIcon, footerMain, footerSub }) {
  return (
    <Card className="@container/card flex-1">
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {title}
        </CardTitle>
        <CardAction>
          <Badge variant="outline">
            {badgeIcon}
            {badgeText}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {footerMain}
        </div>
        <div className="text-muted-foreground">
          {footerSub}
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

  // Array to control cards
  const cards = [
    {
      description: "Total images",
      title: images.length.toString(),
      badgeText: "+12.5%",
      badgeIcon: <TvIcon />,
      footerMain: <><span>Trending up this month</span> <TvIcon className="size-4" /></>,
      footerSub: "Visitors for the last 6 months",
    },
    {
      description: "Total albums",
      title: "12",
      badgeText: "+12.5%",
      badgeIcon: <TvIcon />,
      footerMain: <><span>Trending up this month</span> <TvIcon className="size-4" /></>,
      footerSub: "Visitors for the last 6 months",
    },
    {
      description: "Images added this month",
      title: "42",
      badgeText: "+12.5%",
      badgeIcon: <TvIcon />,
      footerMain: <><span>Trending up this month</span> <TvIcon className="size-4" /></>,
      footerSub: "Visitors for the last 6 months",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-lg">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900">FrameTV Art Gallery</h1>
        <p className="text-lg text-gray-500 mt-2">Upload, and enjoy beautiful images on your Frame TV.</p>
      </header>

      <div className="flex flex-row gap-4">
        {cards.map((card, idx) => (
          <CardInfo key={idx} {...card} />
        ))}
      </div>

      <section className="mb-8 mt-10">
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
