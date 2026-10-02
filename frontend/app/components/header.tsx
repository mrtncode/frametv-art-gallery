import React, { useEffect, useState } from 'react'

import { useLocation } from "react-router";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

import lockupForLight from "~/assets/brand/frame-gallery-logo-wordmark-for-light.svg";
import lockupForDark from "~/assets/brand/frame-gallery-logo-wordmark-for-dark.svg";
import symbolForLight from "~/assets/brand/frame-gallery-logo-for-light.svg";
import symbolForDark from "~/assets/brand/frame-gallery-logo-for-dark.svg";

const VERSION = import.meta.env.VITE_APP_VERSION || "dev";

const pageNames: { [key: string]: string } = {
  "/": "Home",
  "/gallery": "Gallery",
  "/discover": "Discover",
  "/tv-gallery": "TV Settings",
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
      className="rounded-full p-2 text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
    <header className="sticky top-0 z-40 w-[95%] self-center rounded-4xl mt-2 bg-card/95 text-foreground border border-border shadow-[var(--shadow-card)] backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="m-0 flex items-center">
            {/* for-light art has a dark frame/text, for-dark has ivory; swap on the theme class. */}
            <img src={lockupForLight} alt="Frame Gallery" width={240} height={48}
              className="hidden h-auto w-[240px] sm:block dark:sm:hidden" />
            <img src={lockupForDark} alt="Frame Gallery" width={240} height={48}
              className="hidden h-auto w-[240px] dark:sm:block" />
            <img src={symbolForLight} alt="Frame Gallery" width={42} height={33}
              className="block h-auto w-[42px] sm:hidden dark:hidden" />
            <img src={symbolForDark} alt="Frame Gallery" width={42} height={33}
              className="hidden h-auto w-[42px] dark:block dark:sm:hidden" />
          </h1>
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{VERSION}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-muted-foreground">{pageName}</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
