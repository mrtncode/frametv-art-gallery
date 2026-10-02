import React from 'react'

// The Frame Gallery mark, assembled piece by piece: the frame draws itself,
// the clay arch rises inside it, then the ochre disc pops in. Colours match
// the brand SVGs; the frame uses currentColor so it follows light/dark theme.
const css = `
.fg-load-frame { stroke-dasharray: 1; stroke-dashoffset: 1; animation: fg-frame 3s ease-in-out infinite; }
.fg-load-arch { transform-box: fill-box; transform-origin: 50% 100%; animation: fg-arch 3s ease-in-out infinite; }
.fg-load-disc { transform-box: fill-box; transform-origin: 50% 50%; animation: fg-disc 3s ease-in-out infinite; }
@keyframes fg-frame {
  0% { stroke-dashoffset: 1; opacity: 1; }
  40%, 85% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes fg-arch {
  0%, 25% { transform: scaleY(0); opacity: 0; }
  55%, 85% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(1); opacity: 0; }
}
@keyframes fg-disc {
  0%, 50% { transform: scale(0); opacity: 0; }
  68% { transform: scale(1.15); opacity: 1; }
  76%, 85% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .fg-load-frame, .fg-load-arch, .fg-load-disc { animation: none; stroke-dashoffset: 0; transform: none; opacity: 1; }
}
`

export default function LoadingScreen() {
  return (
    <div
      className='flex flex-col h-screen justify-center items-center gap-4'
      role="status"
      aria-live="polite"
      aria-label="Loading content, please wait."
    >
      <style>{css}</style>
      <svg
        viewBox="0 0 90 70"
        className="w-48 md:w-64 h-auto text-foreground"
        aria-hidden="true"
      >
        <path
          className="fg-load-frame"
          pathLength={1}
          d="M7.825 16 Q7.825 8.825 15 8.825 H82.175 V56.5 Q82.175 61.175 77.5 61.175 H7.825 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinejoin="miter"
        />
        <path
          className="fg-load-arch"
          d="M17 54 C17 32.95 30.9 16 48 16 V54 Z"
          fill="#C9725D"
        />
        <circle className="fg-load-disc" cx="63.5" cy="25" r="8.75" fill="#D69D41" />
      </svg>
      <span className="sr-only">Loading content, please wait.</span>
      <p className="text-center text-2xl md:text-4xl text-muted-foreground">Loading...</p>
    </div>
  )
}
