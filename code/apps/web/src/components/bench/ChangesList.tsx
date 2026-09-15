"use client";

import type { BenchChange } from "@/lib/types";

interface Props {
  changes: BenchChange[];
  summary: string;
}

export default function ChangesList({ changes, summary }: Props) {
  return (
    <div className="p-3 space-y-3">
      <div className="text-[11px] text-neutral-500">{summary}</div>
      {changes.map((c, i) => (
        <div key={c.id} className="border border-black rounded-[14px] p-3">
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-6 h-6 rounded-full bg-silo-cream border border-black flex items-center justify-center text-[10px] font-bold">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{c.title}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{c.meta}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: c.dot }}
                />
                <span className="text-[11px]">{c.build}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
