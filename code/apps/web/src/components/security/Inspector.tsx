"use client";

import { useEffect } from "react";
import type { Finding, SecurityNodeDetail } from "@/lib/types";
import Label from "@/components/ui/Label";
import NutritionLabel from "./NutritionLabel";
import ChangeView from "./ChangeView";
import FindingCard from "./FindingCard";

export type InspectorTab = "label" | "dependencies" | "changes" | "findings";

interface Props {
  detail: SecurityNodeDetail;
  engine: string;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  focusId: string | null;
  loading: boolean;
  onClose: () => void;
  onFix: (finding: Finding) => void;
  fixing: string | null;
  fixReason?: string;
}

/** The selected build: its capability label, dependencies, changes and findings. */
export default function Inspector({
  detail, engine, tab, onTab, focusId, loading, onClose, onFix, fixing, fixReason,
}: Props) {
  const { node, diff, findings, label } = detail;
  // The origin leads with its label; a comparison started from it still gets a Changes tab.
  const tabs: { key: InspectorTab; text: string }[] = node.origin
    ? [
        ...(diff ? [{ key: "changes" as const, text: `Changes vs v${diff.base.version_no}` }] : []),
        { key: "label", text: "Nutrition label" },
        { key: "dependencies", text: `Dependencies (${label.dependencies.length})` },
        { key: "findings", text: `Findings (${findings.length})` },
      ]
    : [
        { key: "changes", text: diff ? `Changes vs v${diff.base.version_no}` : "Changes" },
        { key: "findings", text: `Findings (${findings.length})` },
        { key: "label", text: "Label" },
        { key: "dependencies", text: `Deps (${label.dependencies.length})` },
      ];

  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`item-${focusId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-silo-green");
      setTimeout(() => el?.classList.remove("ring-2", "ring-silo-green"), 1600);
    }, 120);
    return () => clearTimeout(t);
  }, [focusId, tab, detail]);

  const newIds = new Set(diff?.findings_new.map((f) => f.fingerprint));
  return (
    <aside
      aria-label={`Build v${node.version_no}`}
      className="w-[min(520px,100%)] shrink-0 border-l-[1.5px] border-black bg-white flex flex-col min-h-0 animate-silo-rise"
    >
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-black">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase text-neutral-500">v{node.version_no} · {node.origin ? "origin" : node.kind}</span>
              {node.published && <Label dot tone="mint">Live</Label>}
              {loading && <span className="font-mono text-[10px] uppercase text-neutral-400">updating…</span>}
            </div>
            <h2 className="font-display font-bold text-[24px] leading-tight truncate" title={node.label}>{node.label}</h2>
            <p className="text-[12px] text-neutral-500">{node.actor.name} · {label.files} files · {label.dependencies.length} dependencies · {detail.engines.join(" + ")}</p>
          </div>
          <button onClick={onClose} aria-label="Close build details" className="w-8 h-8 rounded-pill border border-black flex items-center justify-center cursor-pointer hover:bg-neutral-100">✕</button>
        </div>
        <div role="tablist" className="mt-3 flex gap-1 overflow-x-auto silo-scroll">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => onTab(t.key)}
              className={`shrink-0 rounded-pill px-3 py-1.5 text-[12px] font-bold cursor-pointer ${
                tab === t.key ? "bg-black text-white" : "hover:bg-neutral-100"
              }`}
            >
              {t.text}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto silo-scroll p-5 space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {tab === "label" && <NutritionLabel detail={detail} engine={engine} />}

        {tab === "dependencies" && (label.dependencies.length ? (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase text-neutral-500 text-left">
                <th className="font-normal pb-2">Package</th>
                <th className="font-normal pb-2">Version</th>
                <th className="font-normal pb-2">Declared in</th>
              </tr>
            </thead>
            <tbody>
              {label.dependencies.map((d) => {
                const added = diff?.dependencies_added.some((a) => a.name === d.name && a.ecosystem === d.ecosystem);
                const changed = diff?.dependencies_changed.find((c) => c.name === d.name && c.ecosystem === d.ecosystem);
                return (
                  <tr key={`${d.ecosystem}:${d.name}:${d.version}`} id={`item-dep:${d.name}`} className="border-t border-neutral-200 rounded">
                    <td className="py-2 pr-2">
                      <span className="font-semibold">{d.name}</span>
                      <span className="ml-1.5 font-mono text-[10px] uppercase text-neutral-500">{d.ecosystem}</span>
                      {added && <span className="ml-1.5 rounded-pill bg-silo-yellow text-onaccent px-1.5 font-mono text-[9px] uppercase">new</span>}
                    </td>
                    <td className="py-2 pr-2 font-mono text-[11px]">{changed ? <>{changed.from} → <strong>{changed.to}</strong></> : d.version}</td>
                    <td className="py-2 font-mono text-[11px] text-neutral-500">{d.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-[13px] text-neutral-500">No dependencies declared or imported.</p>
        ))}

        {tab === "changes" && (diff ? (
          <>
            <ChangeView diff={diff} version={node.version_no} />
            {diff.findings_fixed.length > 0 && (
              <section>
                <Label tone="mint">Fixed in this build · {diff.findings_fixed.length}</Label>
                <ul className="mt-2 space-y-1.5">
                  {diff.findings_fixed.map((f) => (
                    <li key={f.fingerprint} id={`item-${f.fingerprint}`} className="flex items-center gap-2 text-[13px] rounded-[8px]">
                      <span className="text-silo-green">✓</span>
                      <span className="line-through text-neutral-500">{f.title}</span>
                      <span className="font-mono text-[11px] text-neutral-500">{f.file}:{f.line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="text-[13px] text-neutral-500">This is the first build; there is nothing before it to compare.</p>
        ))}

        {tab === "findings" && (findings.length ? (
          [...findings]
            .sort((a, b) => Number(newIds.has(b.fingerprint)) - Number(newIds.has(a.fingerprint)))
            .map((f) => (
              <div key={f.fingerprint} id={`item-${f.fingerprint}`} className="rounded-[16px] transition-shadow">
                {newIds.has(f.fingerprint) && <div className="mb-1 font-mono text-[10px] uppercase text-silo-red">New in this build</div>}
                <FindingCard finding={f} onFix={() => onFix(f)} fixing={fixing === f.fingerprint} fixDisabledReason={fixReason} />
              </div>
            ))
        ) : (
          <div className="rounded-[16px] border-[1.5px] border-silo-green p-5 text-center">
            <div className="font-display font-bold text-xl">No findings</div>
            <p className="text-[12.5px] text-neutral-500 mt-1">None of the {engine} matched this build.</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
