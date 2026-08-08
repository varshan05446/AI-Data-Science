"use client";

import * as React from "react";

/**
 * Minimal `asChild` implementation (Radix Slot-compatible surface) so we can
 * render Buttons as links without pulling in @radix-ui. Merges className and
 * forwards props/ref to the single child element.
 */
export const Slot = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }
>(({ children, ...props }, ref) => {
  if (!React.isValidElement(children)) return null;
  const child = children as React.ReactElement<Record<string, unknown>>;
  return React.cloneElement(child, {
    ...props,
    ...child.props,
    className: [props.className, child.props.className]
      .filter(Boolean)
      .join(" "),
    ref,
  });
});
Slot.displayName = "Slot";
