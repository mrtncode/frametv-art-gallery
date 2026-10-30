import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { ThemeProvider } from "next-themes";
import { IconContext } from "@phosphor-icons/react";

import type { Route } from "./+types/root";
// Inter is bundled with the app rather than fetched from Google Fonts: that stylesheet
// blocked the first paint on a round trip to another site. Font files load only when used.
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/inter/opsz-italic.css";
import "./app.css";
import LoadingScreen from "./components/loading-screen";
import SessionGuard from "./components/SessionGuard";
import { Toaster } from "./components/ui/sonner";
import { UIThemeProvider } from "./context/ThemeContext";
import { THEME_STORAGE_KEY, DEFAULT_THEME_ID } from "./lib/theme";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.png", type: "image/png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the class on <html> before React runs.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0A0A0A" media="(prefers-color-scheme: dark)" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME_ID}';document.documentElement.setAttribute('data-ui-theme',t);}catch(e){}})();`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <UIThemeProvider>
            {/* One icon set across the app, in duotone: a line plus a soft fill of the same colour. */}
            <IconContext.Provider value={{ weight: "duotone" }}>
              {children}
              <ScrollRestoration />
              <Scripts />
              <Toaster />
              <SessionGuard />
            </IconContext.Provider>
          </UIThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <LoadingScreen />;
}


export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
