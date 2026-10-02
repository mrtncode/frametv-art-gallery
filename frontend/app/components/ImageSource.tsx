import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { ImageProvenance } from "~/utils/galleryApi";

/**
 * Where an image came from: a manual upload, or the source it was added from, with a link
 * back to the original page.
 */
export default function ImageSource({ provenance, className = "" }: { provenance: ImageProvenance; className?: string }) {
  const fromSource = Boolean(provenance.source && provenance.source !== "upload");

  if (!fromSource) {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        {provenance.source === "upload" ? "Uploaded manually" : "Uploaded"}
      </p>
    );
  }

  const byline = [provenance.title, provenance.artist].filter(Boolean).join(" · ");
  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      {byline && <p className="truncate text-foreground" title={byline}>{byline}</p>}
      <p>
        From {provenance.source_label}
        {provenance.license ? ` · ${provenance.license}` : ""}
      </p>
      {provenance.source_url && (
        <a
          href={provenance.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex items-center gap-1 text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          View the original
          <ArrowTopRightOnSquareIcon className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
