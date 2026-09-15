"use client";

import type { BenchThread } from "@/lib/types";

interface Props {
  threads: BenchThread[];
  onToggleResolve: (id: string) => void;
  onToast: (msg: string) => void;
}

export default function CommentsPanel({ threads, onToggleResolve, onToast }: Props) {
  const unresolved = threads.filter((t) => !t.resolved).length;

  return (
    <div className="p-3 space-y-3">
      <div className="text-[11px] text-neutral-500">
        {unresolved} unresolved comment{unresolved !== 1 ? "s" : ""}
      </div>
      {threads.map((t) => (
        <div key={t.id} className="border border-black rounded-[14px] p-3">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-6 h-6 rounded-full border border-black flex items-center justify-center text-[9px] font-bold"
              style={{ background: t.color }}
            >
              {t.initials}
            </span>
            <span className="text-[12px] font-semibold">{t.author}</span>
            <span className="text-[10px] text-neutral-400">{t.when}</span>
            <span
              className="ml-auto text-[10px] font-bold rounded-pill px-2 py-0.5"
              style={{
                background: t.resolved ? "#e9e9e9" : "#ffd731",
              }}
            >
              {t.resolved ? "Resolved" : "Open"}
            </span>
          </div>
          <p className="text-[12.5px] leading-relaxed mb-2">{t.body}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onToast(`Reply drafted in the ${t.author} thread.`)}
              className="rounded-pill border border-black bg-white px-3 py-1 text-[11px] font-bold cursor-pointer hover:bg-neutral-100"
            >
              Reply
            </button>
            <button
              onClick={() => onToggleResolve(t.id)}
              className="rounded-pill border border-black px-3 py-1 text-[11px] font-bold cursor-pointer"
              style={{
                background: t.resolved ? "#fff" : "#55db9c",
              }}
            >
              {t.resolved ? "Reopen" : "Resolve"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
