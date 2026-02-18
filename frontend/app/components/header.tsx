import React from 'react'

import { useLocation } from "react-router";

const VERSION = "v1.0.0";

const pageNames: { [key: string]: string } = {
  "/": "Home",
  "/wallet": "Wallet",
  "/new": "New Artwork",
  "/settings": "Settings",
  "/profile": "Profile",
};

export default function Header() {
  const location = useLocation();
  const pageName = pageNames[location.pathname] || "Page";
  return (
    <header className="sticky top-0 z-40 w-full bg-gray-800 text-white border-b border-gray-700">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold">FrameTV Art Gallery</h1>
          <span className="text-xs text-gray-400 font-medium">{VERSION}</span>
        </div>
        <span className="text-base font-semibold text-gray-200">{pageName}</span>
      </div>
    </header>
  );
}
