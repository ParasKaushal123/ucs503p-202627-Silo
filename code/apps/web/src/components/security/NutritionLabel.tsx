"use client";

import type { SecurityNodeDetail } from "@/lib/types";
import { SEVERITY_FILL, SEVERITY_LABEL } from "./tones";

const TONE_DOT = { low: "bg-silo-live", medium: "bg-silo-yellow", high: "bg-silo-red" } as const;

/**
 * What a build can do, on one card, in the style of a food label: the
 * "ingredients" are its dependencies and the "facts" its capabilities.
 */
export default function NutritionLabel({
  detail,
  engine,
}: {
  detail: SecurityNodeDetail;
  engine: string;
}) {
  const { label, node } = detail;
  const total = label.counts.high + label.counts.medium + label.counts.low;
  return (
    <section
      data-theme="light"
      aria-label={`Capability label for v${node.version_no}`}
      className="bg-white text-black border-[3px] border-black rounded-[14px] p-5 font-body"
    >
      <h2 className="font-display font-bold text-[34px] leading-none">Capability Facts</h2>
      <p className="font-mono text-[11px] uppercase text-neutral-500 mt-1.5">
        Build v{node.version_no} · digest {label.manifest_digest}
      </p>
      <div className="mt-2 text-[13px] border-b-[10px] border-black pb-2">
        Serving size{" "}
        <strong>
          {label.files} file{label.files === 1 ? "" : "s"} · {label.lines.toLocaleString()} line
          {label.lines === 1 ? "" : "s"}
        </strong>
        {label.languages.length > 0 && <> · {label.languages.filter((l) => l !== "other").join(", ")}</>}
      </div>

      <div className="flex items-end justify-between border-b-[5px] border-black py-2">
        <div>
          <div className="text-[13px] font-bold">Risk score</div>
          <div className="text-[11px] text-neutral-500">0 to 100 · lower is better</div>
        </div>
        <div className="font-display font-bold text-[44px] leading-none">{label.risk}</div>
      </div>
      <div className="h-2 rounded-pill bg-neutral-100 mt-2 overflow-hidden" aria-hidden>
        <div className="h-full bg-black" style={{ width: `${Math.max(2, label.risk)}%` }} />
      </div>

      <h3 className="mt-4 text-[13px] font-bold border-b border-black pb-1">What it can do</h3>
      {label.capabilities.length ? (
        <ul>
          {label.capabilities.map((c) => (
            <li
              key={c.key}
              id={`item-${c.key}`}
              className="flex items-start justify-between gap-3 py-1.5 border-b border-neutral-300 text-[13px]"
              title={c.evidence.map((e) => `${e.file}:${e.line}`).join("\n")}
            >
              <span className="flex items-start gap-2 min-w-0">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE_DOT[c.tone]}`} aria-hidden />
                <span>
                  {c.label}
                  {c.uncertain && <span className="text-neutral-500"> (destination not fixed in code)</span>}
                </span>
              </span>
              {c.detail && <strong className="font-mono text-[11px] text-right break-all">{c.detail}</strong>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[13px] text-neutral-500 border-b border-neutral-300">
          No network, file, process or browser access detected.
        </p>
      )}

      <h3 className="mt-4 text-[13px] font-bold border-b-[5px] border-black pb-1 flex justify-between">
        <span>Findings</span>
        <span>{total}</span>
      </h3>
      {(["high", "medium", "low"] as const).map((s) => (
        <div key={s} className="flex items-center justify-between py-1 border-b border-neutral-300 text-[13px]">
          <span className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_FILL[s]}`} aria-hidden />
            {SEVERITY_LABEL[s]}
          </span>
          <strong>{label.counts[s]}</strong>
        </div>
      ))}

      <p className="mt-4 text-[12px] leading-relaxed">
        <strong>Ingredients ({label.dependencies.length}):</strong>{" "}
        {label.dependencies.length
          ? label.dependencies.map((d, i) => (
              <span key={`${d.ecosystem}:${d.name}:${d.version}`}>
                {i > 0 && ", "}
                {d.name}
                {d.version !== "any" && <span className="text-neutral-500"> {d.version}</span>}
              </span>
            ))
          : "none declared or imported."}
      </p>
      <p className="mt-3 pt-2 border-t-[5px] border-black text-[10.5px] leading-snug text-neutral-500">
        Rule-based static analysis by {engine}. It describes what the code can do; it does not
        prove the app is safe.
      </p>
    </section>
  );
}
