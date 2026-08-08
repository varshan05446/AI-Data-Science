"use client";

import * as React from "react";

import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  const showImage = src && !errored;
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 select-none items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        initials(name || "U")
      )}
    </span>
  );
}
