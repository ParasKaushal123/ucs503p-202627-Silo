"use client";

import type { BenchMessage } from "@/lib/types";
import PillButton from "@/components/ui/PillButton";

interface Action {
  label: string;
  bg: string;
  fg: string;
  disabled?: boolean;
  onPick: () => void;
}

interface Props {
  msg: BenchMessage;
  applying: boolean;
  applyStep: number;
  applyEvent: string;
  actions: Action[];
}

const PROGRESS_LABELS = ["Planning", "Editing", "Building", "Testing"];

export default function ProposalCard({
  msg,
  applying,
  applyStep,
  applyEvent,
  actions,
}: Props) {
  const st = msg.status ?? "proposed";
  const headBg =
    st === "failed"
      ? "#f3dcd6"
      : st === "applied"
      ? "#e9ccff"
      : "#dceeff";

  const kicker =
    {
      proposed: "Change proposal",
      queued: "Queued proposal",
      applying: "Applying change",
      applied: "Change applied",
      failed: "Change needs attention",
      cancelled: "Proposal cancelled",
    }[st] || "Change proposal";

  return (
    <div className="border border-black rounded-[18px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3" style={{ background: headBg }}>
        <div className="text-[10px] font-bold uppercase tracking-wide mb-1 text-neutral-600">
          {kicker}
        </div>
        <div className="text-[14px] font-semibold">{msg.title}</div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-[12.5px] leading-relaxed mb-3">{msg.content}</p>

        {/* Planned steps */}
        {msg.planned && msg.planned.length > 0 && st !== "applied" && st !== "failed" && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-1">
              Planned
            </div>
            {msg.planned.map((p, i) => (
              <div key={i} className="text-[12px] py-0.5 text-neutral-700">
                · {p}
              </div>
            ))}
          </div>
        )}

        {/* Files */}
        {msg.files && msg.files.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-1">
              Files
            </div>
            {msg.files.map((f, i) => (
              <div key={i} className="text-[11px] font-mono text-silo-purple py-0.5">
                {f}
              </div>
            ))}
          </div>
        )}

        {/* Capability notice */}
        {msg.cap && (
          <div
            className="flex items-center gap-2 rounded-pill border border-black px-3 py-2 text-[11px] mb-3"
            style={{
              background:
                msg.cap === "expanding" ? "#ffd731" : "#f7f7f5",
            }}
          >
            <span>{msg.cap === "expanding" ? "!" : "✓"}</span>
            <span>
              {msg.cap === "expanding"
                ? "New access requested: External network"
                : "No new server capabilities"}
            </span>
          </div>
        )}

        {/* Apply progress (shown when applying) */}
        {st === "applying" && (
          <div className="mb-3">
            <div className="flex gap-1.5 mb-2">
              {PROGRESS_LABELS.map((label, i) => (
                <div key={label} className="flex-1 text-center">
                  <div
                    className="w-full h-1.5 rounded-pill mb-1 transition-colors"
                    style={{
                      background:
                        i < applyStep
                          ? "#55db9c"
                          : i === applyStep
                          ? "#ffd731"
                          : "#e5e7eb",
                    }}
                  />
                  <div
                    className="text-[9px] font-bold"
                    style={{ opacity: i <= applyStep ? 1 : 0.45 }}
                  >
                    {i < applyStep ? "✓" : i === applyStep ? "◌" : ""} {label}
                  </div>
                </div>
              ))}
            </div>
            {applyEvent && (
              <div className="text-[11px] text-neutral-500 text-center">
                {applyEvent}
              </div>
            )}
          </div>
        )}

        {/* Result (applied / failed) */}
        {(st === "applied" || st === "failed") && (
          <div
            className="rounded-[12px] p-3 mb-3 text-[12px]"
            style={{
              background: st === "failed" ? "#f3dcd6" : "#f7f7f5",
            }}
          >
            <div className="font-bold text-[10px] uppercase tracking-wide mb-1">
              {st === "applied" ? "Change applied" : "Change needs attention"}
            </div>
            {st === "applied" && (
              <>
                <div>· {msg.files?.length ?? 0} files changed</div>
                <div>· Build passed · preview ready</div>
              </>
            )}
            {st === "failed" && (
              <>
                <div>· Build failed</div>
                <div>· Live version is unaffected and still serving</div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={a.onPick}
                disabled={a.disabled}
                className="rounded-pill border border-black px-3 py-1.5 text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: a.bg, color: a.fg }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
