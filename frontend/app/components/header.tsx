import React, { useEffect, useState } from 'react'

import { useLocation, useNavigation } from "react-router";
import { useTheme } from "next-themes";
import { Moon as MoonIcon, Sun as SunIcon } from "@phosphor-icons/react";

import UpdateStatus from "~/components/update-status";
import lockupForLight from "~/assets/brand/frame-gallery-logo-wordmark-for-light.svg";
import lockupForDark from "~/assets/brand/frame-gallery-logo-wordmark-for-dark.svg";

const VERSION = import.meta.env.VITE_APP_VERSION || "dev";

const pageNames: { [key: string]: string } = {
  "/": "Home",
  "/gallery": "Gallery",
  "/albums": "Albums",
  "/discover": "Discover",
  "/tv-gallery": "TV Gallery",
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
  const navigation = useNavigation();
  // While a page is loading, name the one being opened rather than the one being left.
  const pageName = pageNames[(navigation.location ?? location).pathname] || "Page";
  return (
    <header className="w-[95%] self-center rounded-4xl mt-2 bg-card/95 text-foreground border border-border shadow-[var(--shadow-card)] backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-start gap-4">
          <h1 className="m-0 flex items-center">
            {/* for-light art has a dark frame/text, for-dark has ivory; swap on the theme class. */}
            <img src={lockupForLight} alt="Frame Gallery" width={240} height={48}
              className="block h-auto w-[180px] sm:w-[240px] dark:hidden" />
            <img src={lockupForDark} alt="Frame Gallery" width={240} height={48}
              className="hidden h-auto w-[180px] sm:w-[240px] dark:block" />
          </h1>
          {/* Where you are, set like the wordmark (light, widely spaced) and divided from it by a hairline.
              The wordmark's baseline sits 31.3px down the 240px-wide lockup, and this text (18px, line-height 1)
              puts its own baseline 15.6px down its box, so about 16px of margin lines the two up (measured in the browser: 16.3px). */}
          <span aria-hidden="true" className="hidden h-6 w-px self-center bg-border sm:block" />
          <span className="hidden text-[18px] font-light leading-none tracking-[0.14em] text-foreground/80 antialiased sm:mt-[16.3px] sm:inline">
            {pageName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{VERSION}</span>
          {/* Appears only when a newer version exists */}
          <UpdateStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
