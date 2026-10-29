import React from "react";
import { MATTE_SWATCHES } from "../utils/matte";

interface MattePreviewProps {
  imageURL: string;
  alt: string;
  /** a style from MATTE_STYLES; "none" shows the picture on its own */
  matteStyle: string;
  matteColor: string;
  className?: string;
}

// Matte border width per style, as a share of the screen width (CSS padding percentages
// are always of the width, which keeps the border even on all four sides).
const BORDER: Record<string, string> = {
  modernthin: "4%",
  modern: "7%",
  modernwide: "11%",
  flexible: "6%",
  shadowbox: "7%",
  mix: "7%",
};

// The core of a cut mat: a thin light edge between the matte and the picture.
const BEVEL = "0 0 0 1.5px rgb(255 255 255 / 0.55), 0 1px 3px rgb(0 0 0 / 0.35)";

/**
 * The Frame TV, drawn to scale (16:9), showing the picture in the chosen matte. An
 * approximation: Samsung draws the mattes itself and does not publish their exact look.
 */
export default function MattePreview({ imageURL, alt, matteStyle, matteColor, className = "" }: MattePreviewProps) {
  const color = MATTE_SWATCHES[matteColor] ?? MATTE_SWATCHES.neutral;
  const hasMatte = matteStyle && matteStyle !== "none";

  let screen: React.ReactNode;
  if (!hasMatte) {
    screen = <img src={imageURL} alt={alt} className="size-full object-contain" draggable={false} />;
  } else if (matteStyle === "squares" || matteStyle === "panoramic") {
    // A fixed opening the picture is cropped to fill.
    const opening = matteStyle === "squares" ? "h-[80%] aspect-square" : "w-[86%] aspect-[2.6/1]";
    screen = (
      <div className="flex size-full items-center justify-center">
        <img src={imageURL} alt={alt} className={`${opening} object-cover`} style={{ boxShadow: BEVEL }} draggable={false} />
      </div>
    );
  } else if (matteStyle === "triptych") {
    // One picture seen through three side-by-side openings: matte strips laid over it.
    screen = (
      <div className="flex size-full items-center justify-center">
        <div className="relative h-[76%] w-[84%]">
          <img src={imageURL} alt={alt} className="size-full object-cover" draggable={false} />
          {["31.5%", "65%"].map((left) => (
            <span
              key={left}
              className="absolute inset-y-0 w-[3.5%]"
              style={{ left, backgroundColor: color, boxShadow: "inset 1.5px 0 0 rgb(255 255 255 / 0.55), inset -1.5px 0 0 rgb(255 255 255 / 0.55)" }}
            />
          ))}
          <span className="pointer-events-none absolute inset-0" style={{ boxShadow: BEVEL }} />
        </div>
      </div>
    );
  } else {
    // The opening fits itself to the picture; the matte fills what is left.
    screen = (
      <div className="flex size-full items-center justify-center" style={{ padding: BORDER[matteStyle] ?? BORDER.modern }}>
        <img
          src={imageURL}
          alt={alt}
          className="max-h-full max-w-full object-contain"
          style={{ boxShadow: matteStyle === "shadowbox" ? `${BEVEL}, 0 6px 14px rgb(0 0 0 / 0.45)` : BEVEL }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className={`rounded-lg bg-neutral-950 p-[1.2%] shadow-lg ring-1 ring-black/40 ${className}`}>
      <div
        className="relative aspect-video overflow-hidden rounded-[2px] transition-colors duration-300"
        style={{
          backgroundColor: hasMatte ? color : "#000",
          // A faint fall of light across the board, so it reads as a material.
          backgroundImage: hasMatte ? "linear-gradient(135deg, rgb(255 255 255 / 0.07), rgb(0 0 0 / 0.07))" : undefined,
          boxShadow: matteStyle === "shadowbox" ? "inset 0 0 18px rgb(0 0 0 / 0.45)" : undefined,
        }}
      >
        <div className="absolute inset-0">{screen}</div>
      </div>
    </div>
  );
}
