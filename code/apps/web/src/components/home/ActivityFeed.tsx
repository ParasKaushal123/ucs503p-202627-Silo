"use client";

import Label from "@/components/ui/Label";

interface Activity { id: string; text: string; when: string; color: string; glyph: string; }

export default function ActivityFeed({ items = [] }: { items?: Activity[] }) {
  return (
    <div>
      <h3 className="mb-3"><Label>Recent activity</Label></h3>
      <div className="space-y-0">
        {!items.length && <p className="text-xs text-neutral-400">Your app activity will appear here.</p>}
        {items.map((a, i) => (
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
