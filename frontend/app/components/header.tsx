import React, { useEffect, useState } from 'react'

import { useLocation } from "react-router";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

const VERSION = import.meta.env.VITE_APP_VERSION || "dev";

const pageNames: { [key: string]: string } = {
  "/": "Home",
  "/gallery": "Gallery",
  "/settings": "Settings"
};

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known once mounted; render a placeholder until then so the
  // button does not flash the wrong icon.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-full p-2 text-gray-200 hover:bg-gray-700 hover:text-white transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Switch between light and dark mode"
    >
      {mounted
        ? (isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />)
        : <span className="block h-5 w-5" />}
    </button>
  );
}

export default function Header() {
  const location = useLocation();
  const pageName = pageNames[location.pathname] || "Page";
  return (
    <header className="sticky top-0 z-40 w-full bg-gray-800 text-white border-b border-gray-700">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold">FrameTV Art Gallery</h1>
          {/* The bar stays dark in both themes, so its text keeps fixed colours. */}
          <span className="text-xs text-gray-400 font-medium">{VERSION}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-gray-200">{pageName}</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
