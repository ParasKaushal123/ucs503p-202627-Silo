"use client";

import type { SecurityTrack } from "@/lib/types";

const TONE_FILL = { low: "bg-silo-live", medium: "bg-silo-yellow", high: "bg-silo-red" } as const;

/** Which build could reach what: one row per capability, one column per build. */
export default function CapabilityMatrix({
  track,
  selectedId,
  onSelect,
}: {
  track: SecurityTrack;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!track.capabilities.length) {
    return <p className="text-[13px] text-neutral-500 py-6 text-center">No build reaches the network, files, processes or browser storage.</p>;
  }
  return (
    <div className="overflow-x-auto silo-scroll">
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th className="text-left font-mono text-[10px] uppercase text-neutral-500 font-normal pb-2 pr-3 sticky left-0 bg-white">Capability</th>
            {track.nodes.map((n) => (
              <th key={n.version_id} className="pb-2 px-1">
                <button
                  onClick={() => onSelect(n.version_id)}
                  className={`font-mono text-[11px] rounded-pill px-2 py-0.5 cursor-pointer ${
                    n.version_id === selectedId ? "bg-black text-white" : "text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  v{n.version_no}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {track.capabilities.map((cap) => {
            const first = track.nodes.findIndex((n) => n.capability_keys.includes(cap.key));
            return (
              <tr key={cap.key} className="group">
                <td className="py-1.5 pr-3 border-t border-neutral-200 sticky left-0 bg-white">
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_FILL[cap.tone]}`} aria-hidden />
                    <span className="truncate">{cap.label}</span>
                    {cap.detail && <span className="font-mono text-[10.5px] text-neutral-500 truncate">{cap.detail}</span>}
                  </div>
                </td>
                {track.nodes.map((n, index) => {
                  const has = n.capability_keys.includes(cap.key);
                  const isNew = has && index === first && index > 0;
                  return (
                    <td key={n.version_id} className={`border-t border-neutral-200 text-center ${n.version_id === selectedId ? "bg-neutral-100" : ""}`}>
                      <button
                        onClick={() => onSelect(n.version_id)}
                        title={`${cap.label}${cap.detail ? ` (${cap.detail})` : ""}: ${has ? "yes" : "no"} in v${n.version_no}${isNew ? ", first appears here" : ""}`}
                        className="w-full h-8 flex items-center justify-center cursor-pointer"
                      >
                        {has ? (
                          <span className={`w-4 h-4 rounded-[5px] ${TONE_FILL[cap.tone]} ${isNew ? "ring-2 ring-offset-2 ring-offset-white ring-silo-yellow" : ""}`} />
                        ) : (
                          <span className="w-4 h-4 rounded-[5px] border border-neutral-300" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 font-mono text-[10px] uppercase text-neutral-500">
        Ringed square: access first granted in that build
      </p>
    </div>
  );
}
