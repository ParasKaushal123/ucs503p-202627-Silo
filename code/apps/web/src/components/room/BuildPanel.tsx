"use client";

interface Fact {
  label: string;
  value: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  statusLine: string;
  progress: string;
  progressColor: string;
  facts: Fact[];
}

export default function BuildPanel({
  open,
  onClose,
  statusLine,
  progress,
  progressColor,
  facts,
}: Props) {
  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[320px] max-w-full border-l border-black bg-white z-20 flex flex-col animate-silo-rise">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black">
        <h4 className="text-xs font-bold uppercase tracking-wide">Build details</h4>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-pill border border-black bg-white cursor-pointer flex items-center justify-center text-xs"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 silo-scroll">
        {/* Status line */}
        <div className="text-sm font-semibold">{statusLine}</div>

        {/* Progress bar */}
        <div>
          <div className="h-2 border border-black rounded-pill overflow-hidden bg-neutral-100">
            <div
              className="h-full transition-all duration-700"
              style={{ width: progress.endsWith("%") ? progress : "45%", background: progressColor }}
            />
          </div>
        </div>

        {/* Facts */}
        <div className="border border-black rounded-[16px] overflow-hidden">
          {facts.map((f, i) => (
            <div
              key={i}
              className="flex justify-between gap-3 px-3.5 py-2.5 border-b border-neutral-200 last:border-0 text-[12.5px]"
            >
              <span className="text-neutral-500">{f.label}</span>
              <span className="font-semibold text-right">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
