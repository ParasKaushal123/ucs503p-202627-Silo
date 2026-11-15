"use client";

import { Boxes } from "lucide-react";

/** Silo's mark: a mint rounded square, optionally with the wordmark. */
export default function SiloMark({ wordmark = true, size = 28 }: { wordmark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl font-bold leading-none">
      <span
        className="rounded-[9px] border-[1.5px] border-black bg-silo-green text-onaccent flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <Boxes size={Math.round(size * 0.54)} aria-hidden />
      </span>
      {wordmark && "Silo"}
    </span>
  );
}
