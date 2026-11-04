"use client";

import type { Finding } from "@/lib/types";
import PillButton from "@/components/ui/PillButton";
import { SEVERITY_FILL, SEVERITY_LABEL } from "./tones";

interface Props {
  finding: Finding;
  /** Present when the viewer may ask the AI collaborator for a fix. */
  onFix?: () => void;
  fixing?: boolean;
  fixDisabledReason?: string;
}

/** One rule finding: what was matched, where, why it matters and how to fix it. */
export default function FindingCard({ finding, onFix, fixing, fixDisabledReason }: Props) {
  const cweNumber = finding.cwe.replace(/^CWE-/, "");
  return (
    <article className="rounded-[16px] border-[1.5px] border-black bg-neutral-50 p-4">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded-pill px-2.5 py-1 font-mono text-[10px] uppercase font-bold ${SEVERITY_FILL[finding.severity]}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[14px] font-semibold leading-snug">{finding.title}</h4>
          <p className="mt-0.5 font-mono text-[11px] text-neutral-500 break-all">
            {finding.file}:{finding.line} ·{" "}
            {/^\d+$/.test(cweNumber) ? (
              <a
                className="underline hover:text-silo-green"
                href={`https://cwe.mitre.org/data/definitions/${cweNumber}.html`}
                target="_blank"
                rel="noreferrer"
              >
                {finding.cwe}
              </a>
            ) : (
              finding.cwe
            )}{" "}
            · {finding.rule_id} · {finding.engine === "semgrep" ? "Semgrep" : "Silo rule"}
          </p>
        </div>
      </div>
      {finding.snippet && (
        <pre className="mt-3 rounded-[10px] bg-canvas border border-neutral-300 px-3 py-2 font-mono text-[11.5px] overflow-x-auto whitespace-pre-wrap break-words">
          <span className="text-neutral-400 select-none">{finding.line} │ </span>
          {finding.snippet}
        </pre>
      )}
      <p className="mt-3 text-[12.5px] leading-relaxed">{finding.why}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-500">
        <strong className="text-black">Fix:</strong> {finding.fix}
      </p>
      {onFix && (
        <div className="mt-3 flex items-center gap-3">
          <PillButton
            size="sm"
            onClick={onFix}
            disabled={!!fixing || !!fixDisabledReason}
            title={fixDisabledReason || "Ask the AI collaborator for a fix you review in the Workbench"}
            className="!bg-silo-green !text-onaccent !border-silo-green"
          >
            {fixing ? "Asking…" : "✦ Fix with AI"}
          </PillButton>
          {fixDisabledReason && <span className="text-[11px] text-neutral-500">{fixDisabledReason}</span>}
        </div>
      )}
    </article>
  );
}
