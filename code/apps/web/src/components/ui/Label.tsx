"use client";

import type { ReactNode } from "react";

type Tone = "plain" | "mint" | "peach" | "danger" | "forest";

const tones: Record<Tone, string> = {
  plain: "border-neutral-300 text-neutral-500",
  mint: "border-silo-green/60 text-silo-green",
  peach: "border-silo-yellow/60 text-silo-yellow",
  danger: "border-silo-red/60 text-silo-red",
  forest: "border-silo-forest/40 text-silo-forest",
};

/** The mockups' mono uppercase pill, used for eyebrows, section titles and status. */
export default function Label({
  children,
  tone = "plain",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border-[1.5px] px-3 py-1 font-mono text-[11px] uppercase leading-none whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
