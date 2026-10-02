import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "~/lib/utils"

/** A short label that appears on hover and keyboard focus (unlike `title`, which touch and keyboard users never see). */
function Tooltip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-50 max-w-64 rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md dark:bg-neutral-100 dark:text-neutral-900"
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-neutral-900 dark:fill-neutral-100" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

export { Tooltip }
