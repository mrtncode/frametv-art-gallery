import { useEffect } from "react";

// Shorter absences cannot have outlived the login session, so skip the check.
const MIN_HIDDEN_MS = 60_000;

/**
 * In production the app sits behind a login proxy. If its session expires while a tab is
 * idle, every request is redirected to the login page, so the loaded page looks empty until
 * a refresh signs in again. When the tab comes back, check that the API still answers with
 * JSON and reload (which re-authenticates and refetches) if it does not.
 */
export default function SessionGuard() {
  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? Date.now() : null;
    let checking = false;

    async function sessionLost() {
      try {
        const res = await fetch("/api/tvs", { cache: "no-store", redirect: "manual" });
        if (res.type === "opaqueredirect" || !res.ok) return true;
        return !(res.headers.get("content-type") || "").includes("json");
      } catch {
        // A blocked cross-origin redirect to the login page lands here; being offline does not.
        return navigator.onLine;
      }
    }

    async function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away < MIN_HIDDEN_MS || checking) return;
      checking = true;
      try {
        if (await sessionLost()) window.location.reload();
      } finally {
        checking = false;
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
