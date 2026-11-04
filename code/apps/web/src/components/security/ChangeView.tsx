"use client";

import { useState } from "react";
import type { SecurityDiff } from "@/lib/types";
import Label from "@/components/ui/Label";
import { CLASSIFICATION } from "./tones";

const STATUS = { added: "A", removed: "D", modified: "M" } as const;

function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="mt-2 rounded-[10px] border border-neutral-300 bg-canvas overflow-x-auto font-mono text-[11.5px] leading-[1.6] py-2">
      {diff.split("\n").map((line, i) => {
        const tone = line.startsWith("+++") || line.startsWith("---")
          ? "text-neutral-500"
          : line.startsWith("+")
            ? "bg-silo-green/15 text-silo-green"
            : line.startsWith("-")
              ? "bg-silo-red/15 text-silo-red"
              : line.startsWith("@@")
                ? "text-silo-sky"
                : "text-neutral-700";
        return (
          <div key={i} className={`px-3 whitespace-pre ${tone}`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

/** What changed between two builds, and what that does to what the app can reach. */
export default function ChangeView({ diff, version }: { diff: SecurityDiff; version: number }) {
  const [open, setOpen] = useState<string | null>(diff.files[0]?.path ?? null);
  const tone = CLASSIFICATION[diff.classification];
  const delta = diff.risk_after - diff.risk_before;
  const depChanges =
    diff.dependencies_added.length + diff.dependencies_removed.length + diff.dependencies_changed.length;

  return (
    <div className="space-y-5">
      <div className={`rounded-panel border-[1.5px] border-black p-5 ${tone.fill}`}>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase">
          <span className="rounded-pill bg-black text-white px-2.5 py-1">{tone.word}</span>
          <span>
            v{diff.base.version_no} → v{version} · risk {diff.risk_before} → {diff.risk_after}
            {delta !== 0 && <strong> ({delta > 0 ? "+" : ""}{delta})</strong>}
          </span>
        </div>
        <p className="mt-3 text-[16px] font-semibold leading-snug">{diff.verdict}</p>
        {(diff.capabilities_added.length > 0 || diff.capabilities_removed.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {diff.capabilities_added.map((c) => (
              <span key={c.key} id={`item-${c.key}`} className="rounded-pill border-[1.5px] border-onaccent/70 bg-onaccent/10 text-onaccent px-2.5 py-1 text-[11.5px] font-semibold">
                + {c.label}{c.detail && ` · ${c.detail}`}
              </span>
            ))}
            {diff.capabilities_removed.map((c) => (
              <span key={c.key} className="rounded-pill border-[1.5px] border-onaccent/40 text-onaccent px-2.5 py-1 text-[11.5px] line-through opacity-70">
                {c.label}{c.detail && ` · ${c.detail}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {depChanges > 0 && (
        <section>
          <Label>Dependencies · {depChanges} changed</Label>
          <ul className="mt-2 rounded-[14px] border-[1.5px] border-black divide-y divide-neutral-200 overflow-hidden">
            {diff.dependencies_added.map((d) => (
              <li key={"a" + d.name + d.version} id={`item-dep:${d.name}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span><span className="font-mono text-silo-green mr-2">+</span>{d.name}</span>
                <span className="font-mono text-[11px] text-neutral-500">{d.version} · {d.ecosystem} · {d.source}</span>
              </li>
            ))}
            {diff.dependencies_changed.map((d) => (
              <li key={"c" + d.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span><span className="font-mono text-silo-yellow mr-2">~</span>{d.name}</span>
                <span className="font-mono text-[11px] text-neutral-500">{d.from} → {d.to}</span>
              </li>
            ))}
            {diff.dependencies_removed.map((d) => (
              <li key={"r" + d.name + d.version} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-neutral-500">
                <span><span className="font-mono text-silo-red mr-2">−</span><span className="line-through">{d.name}</span></span>
                <span className="font-mono text-[11px]">{d.ecosystem}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <Label>Files · {diff.files.length} changed</Label>
        {diff.files.length === 0 ? (
          <p className="mt-2 text-[13px] text-neutral-500">The source is identical to v{diff.base.version_no}.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {diff.files.map((f) => {
              const total = Math.max(1, f.added + f.removed);
              return (
                <li key={f.path} className="rounded-[14px] border-[1.5px] border-black bg-neutral-50 px-4 py-2.5">
                  <button
                    onClick={() => setOpen(open === f.path ? null : f.path)}
                    aria-expanded={open === f.path}
                    className="w-full flex items-center gap-3 text-left cursor-pointer"
                  >
                    <span className={`w-6 h-6 shrink-0 rounded-[7px] font-mono text-[11px] font-bold flex items-center justify-center ${
                      f.status === "added" ? "bg-silo-green" : f.status === "removed" ? "bg-silo-red" : "bg-silo-lilac"
                    }`}>
                      {STATUS[f.status]}
                    </span>
                    <span className="flex-1 min-w-0 font-mono text-[12.5px] truncate">{f.path}</span>
                    <span className="font-mono text-[11px] text-silo-green">+{f.added}</span>
                    <span className="font-mono text-[11px] text-silo-red">−{f.removed}</span>
                    <span className="hidden sm:flex w-16 h-1.5 rounded-pill overflow-hidden bg-neutral-200" aria-hidden>
                      <span className="bg-silo-green" style={{ width: `${(f.added / total) * 100}%` }} />
                      <span className="bg-silo-red" style={{ width: `${(f.removed / total) * 100}%` }} />
                    </span>
                    <span className="text-neutral-500 text-xs" aria-hidden>{open === f.path ? "▾" : "▸"}</span>
                  </button>
                  {open === f.path && <DiffBlock diff={f.diff} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
