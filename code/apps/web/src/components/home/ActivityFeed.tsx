"use client";

import { ACTIVITY } from "@/lib/mockData";

export default function ActivityFeed() {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-3">
        Recent activity
      </h3>
      <div className="space-y-0">
        {ACTIVITY.map((a, i) => (
          <div
            key={i}
            className="flex items-start gap-3 py-2.5 border-b border-neutral-100 last:border-0"
          >
            <span
              className="shrink-0 w-6 h-6 rounded-full border border-black flex items-center justify-center text-[10px]"
              style={{ background: a.color }}
            >
              {a.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px]">{a.text}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">{a.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
