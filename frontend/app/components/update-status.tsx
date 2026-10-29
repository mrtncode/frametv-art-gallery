import { BellAlertIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { fetchAppStatus, type AppStatusResponse } from "~/utils/appApi";

const DISMISSED_UPDATE_VERSION_KEY = "frametv-dismissed-update-version";

function readDismissedUpdateVersion(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeDismissedUpdateVersion(version: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, version);
  } catch {
    // Ignore cache write failures.
  }
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < text.length) {
    const rest = text.slice(index);

    if (rest.startsWith("**")) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        nodes.push(
          <strong key={key++}>
            {renderInlineMarkdown(text.slice(index + 2, end))}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }

    if (rest.startsWith("`")) {
      const end = text.indexOf("`", index + 1);
      if (end !== -1) {
        nodes.push(
          <code
            key={key++}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.95em]"
          >
            {text.slice(index + 1, end)}
          </code>,
        );
        index = end + 1;
        continue;
      }
    }

    if (rest.startsWith("[")) {
      const closeBracket = text.indexOf("]", index + 1);
      const openParen = closeBracket !== -1 ? text.indexOf("(", closeBracket + 1) : -1;
      const closeParen = openParen !== -1 ? text.indexOf(")", openParen + 1) : -1;
      if (closeBracket !== -1 && openParen === closeBracket + 1 && closeParen !== -1) {
        const label = text.slice(index + 1, closeBracket);
        const href = text.slice(openParen + 1, closeParen);
        const isSafeLink = /^https?:\/\//i.test(href) || href.startsWith("/");

        nodes.push(
          isSafeLink ? (
            <a
              key={key++}
              href={href}
              target={href.startsWith("/") ? undefined : "_blank"}
              rel={href.startsWith("/") ? undefined : "noreferrer"}
              className="text-primary underline underline-offset-4"
            >
              {label}
            </a>
          ) : (
            <span key={key++}>{label}</span>
          ),
        );
        index = closeParen + 1;
        continue;
      }
    }

    if (rest.startsWith("*") && !rest.startsWith("**")) {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        nodes.push(<em key={key++}>{renderInlineMarkdown(text.slice(index + 1, end))}</em>);
        index = end + 1;
        continue;
      }
    }

    const nextSpecials = ["**", "`", "[", "*"]
      .map((token) => text.indexOf(token, index + 1))
      .filter((pos) => pos !== -1);
    const nextIndex = nextSpecials.length ? Math.min(...nextSpecials) : text.length;
    nodes.push(text.slice(index, nextIndex));
    index = nextIndex;
  }

  return nodes;
}

function MarkdownView({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  let key = 0;

  const pushParagraph = (paragraphLines: string[]) => {
    const text = paragraphLines.join(" ").trim();
    if (!text) return;
    blocks.push(
      <p key={key++} className="leading-7 text-foreground/90">
        {renderInlineMarkdown(text)}
      </p>,
    );
  };

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-2xl border bg-muted/70 p-4 text-sm leading-6 text-foreground"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#{1,3}/)?.[0].length ?? 1;
      const headingText = line.replace(/^#{1,3}\s+/, "");
      const headingClassName =
        level === 1
          ? "text-2xl font-semibold tracking-tight"
          : level === 2
            ? "text-xl font-semibold tracking-tight"
            : "text-lg font-semibold tracking-tight";

      if (level === 1) {
        blocks.push(
          <h2 key={key++} className={headingClassName}>
            {renderInlineMarkdown(headingText)}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h3 key={key++} className={headingClassName}>
            {renderInlineMarkdown(headingText)}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={key++} className={headingClassName}>
            {renderInlineMarkdown(headingText)}
          </h4>,
        );
      }
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-4 border-primary/40 pl-4 text-sm italic text-muted-foreground"
        >
          {renderInlineMarkdown(quoteLines.join(" ").trim())}
        </blockquote>,
      );
      continue;
    }

    if (/^(- |\* |\d+\.\s+)/.test(line)) {
      const listItems: string[] = [];
      const isOrdered = /^\d+\.\s+/.test(line);
      while (
        index < lines.length &&
        (isOrdered ? /^\d+\.\s+/.test(lines[index]) : /^(- |\* )/.test(lines[index]))
      ) {
        listItems.push(lines[index].replace(/^(?:- |\* |\d+\.\s+)/, ""));
        index += 1;
      }

      const ListTag = isOrdered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={key++}
          className={`ml-5 space-y-2 text-foreground/90 ${isOrdered ? "list-decimal" : "list-disc"}`}
        >
          {listItems.map((item, itemIndex) => (
            <li key={itemIndex} className="leading-7">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !/^#{1,3}\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^(- |\* |\d+\.\s+)/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    pushParagraph(paragraphLines);
  }

  if (!blocks.length) {
    return <p className="text-sm text-muted-foreground">No changelog was provided.</p>;
  }

  return <div className="space-y-4">{blocks}</div>;
}

export default function UpdateStatus() {
  const [appStatus, setAppStatus] = useState<AppStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const dismissedVersion = readDismissedUpdateVersion();

    setDismissedUpdateVersion(dismissedVersion);

    setLoading(true);
    fetchAppStatus()
      .then((status) => {
        if (!active) return;
        setAppStatus(status);
        const latestVersion = status.latest_version ?? null;
        const isDismissedForLatestVersion = Boolean(
          latestVersion && dismissedVersion === latestVersion,
        );

        setShowPopup(Boolean(status.update_available) && !isDismissedForLatestVersion);
      })
      .catch(() => {
        if (!active) return;
        setAppStatus(null);
        setShowPopup(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const latestVersion = appStatus?.latest_version ?? null;
  const isDismissedForLatestVersion = Boolean(
    latestVersion && dismissedUpdateVersion === latestVersion,
  );
  const hasUpdate = Boolean(appStatus?.update_available) && !isDismissedForLatestVersion;

  const dismissUpdateNotice = () => {
    const version = appStatus?.latest_version;

    setShowModal(false);
    setShowPopup(false);

    if (!version) return;

    setDismissedUpdateVersion(version);
    writeDismissedUpdateVersion(version);
  };

  const openModal = () => {
    if (!hasUpdate) return;
    setShowModal(true);
    setShowPopup(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={openModal}
        aria-label={`Update available${appStatus?.latest_version ? `: ${appStatus.latest_version}` : ""}`}
        title={hasUpdate ? "Update available" : loading ? "Checking for updates..." : "No update available"}
        disabled={!hasUpdate}
        className="relative border-blue-500/40 text-blue-700 hover:bg-blue-500/10 hover:text-blue-800 disabled:opacity-100 dark:text-blue-300 dark:hover:text-blue-200"
      >
        <BellAlertIcon className="h-4 w-4" />
        {hasUpdate && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" />}
      </Button>

      {hasUpdate && showPopup && (
        <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))]">
          <div
            role="button"
            tabIndex={0}
            onClick={openModal}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openModal();
              }
            }}
            className="relative cursor-pointer rounded-2xl border border-blue-500/30 bg-background/95 p-4 pr-11 shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-3xl"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                dismissUpdateNotice();
              }}
              aria-label="Dismiss update popup"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-500/15 p-2 text-blue-700 dark:text-blue-300">
                <SparklesIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Update available</p>
                <p className="text-sm text-muted-foreground">
                  {appStatus?.latest_version
                    ? `Version ${appStatus.latest_version} is available. Click to review the changelog.`
                    : "A new version is available. Click to review the changelog."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasUpdate && showModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-modal-title"
            className="w-full max-w-3xl overflow-hidden rounded-3xl border bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 id="update-modal-title" className="text-xl font-semibold">
                    Update available
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {appStatus?.latest_version
                    ? `Latest version: ${appStatus.latest_version}`
                    : "A newer version is available."}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissUpdateNotice}
                aria-label="Close update modal"
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <MarkdownView content={appStatus?.changelog?.trim() || "No changelog was provided."} />
              </div>

              <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-foreground">
                <p className="font-semibold">Update your installation</p>
                <p className="mt-1 text-muted-foreground">
                  Update by your installation way, for example by updating the version in your Docker Compose
                  file and restarting the app.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
