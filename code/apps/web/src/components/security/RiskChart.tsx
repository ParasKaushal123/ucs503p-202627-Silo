"use client";

import type { SecurityNode } from "@/lib/types";

const HEIGHT = 180;
const SEVERITIES = [
  { key: "high", fill: "fill-silo-red" },
  { key: "medium", fill: "fill-silo-yellow" },
  { key: "low", fill: "fill-silo-sky" },
] as const;

/** Findings per build as stacked bars, with the risk score as a line. Click a bar to open it. */
export default function RiskChart({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: SecurityNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const step = 64;
  const width = Math.max(320, nodes.length * step + 40);
  const maxFindings = Math.max(4, ...nodes.map((n) => n.counts.high + n.counts.medium + n.counts.low));
  const y = (risk: number) => 16 + (1 - risk / 100) * (HEIGHT - 40);
  const line = nodes.map((n, i) => `${28 + i * step + 18},${y(n.risk)}`).join(" ");
  return (
    <div className="overflow-x-auto silo-scroll">
      <svg width={width} height={HEIGHT + 24} role="img" aria-label="Findings and risk by build">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1="24" x2={width} y1={y(v)} y2={y(v)} className="stroke-neutral-200" strokeDasharray="3 5" />
            <text x="0" y={y(v) + 4} className="fill-neutral-400 font-mono" fontSize="10">{v}</text>
          </g>
        ))}
        {nodes.map((n, i) => {
          let top = HEIGHT - 24;
          const x = 28 + i * step;
          return (
            <g key={n.version_id} onClick={() => onSelect(n.version_id)} className="cursor-pointer" role="button" aria-label={`Open v${n.version_no}`}>
              <rect x={x - 6} y="8" width="48" height={HEIGHT - 8} rx="10"
                className={n.version_id === selectedId ? "fill-neutral-100" : "fill-transparent hover:fill-neutral-50"} />
              {SEVERITIES.map(({ key, fill }) => {
                const count = n.counts[key];
                if (!count) return null;
                const h = (count / maxFindings) * (HEIGHT - 60);
                top -= h;
                return <rect key={key} x={x} y={top} width="36" height={h} rx="4" className={fill} />;
              })}
              {!(n.counts.high + n.counts.medium + n.counts.low) && (
                <rect x={x} y={HEIGHT - 27} width="36" height="3" rx="1.5" className="fill-silo-live" />
              )}
              <text x={x + 18} y={HEIGHT - 6} textAnchor="middle" className="fill-neutral-500 font-mono" fontSize="11">v{n.version_no}</text>
            </g>
          );
        })}
        {nodes.length > 1 && <polyline points={line} fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-black" />}
        {nodes.map((n, i) => (
          <g key={n.version_id + "r"} pointerEvents="none">
            <circle cx={28 + i * step + 18} cy={y(n.risk)} r="5" className="fill-black" />
            <text x={28 + i * step + 18} y={y(n.risk) - 10} textAnchor="middle" className="fill-black font-mono" fontSize="11" fontWeight="700">{n.risk}</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 font-mono text-[10px] uppercase text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-silo-red" />High</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-silo-yellow" />Medium</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-silo-sky" />Low</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-black" />Risk score</span>
      </div>
    </div>
  );
}
