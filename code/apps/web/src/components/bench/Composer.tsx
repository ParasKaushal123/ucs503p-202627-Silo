"use client";

interface ComposerFile {
  name: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  files: ComposerFile[];
  onRemoveFile: (i: number) => void;
  onScreenshot: () => void;
  onAttach: () => void;
  onMention: () => void;
  sendDisabled: boolean;
  onAskAi: () => void;
  askDisabled: boolean;
  askLabel: string;
  askTitle: string;
  quickActions: { label: string; onPick: () => void }[];
}

export default function Composer({
  value,
  onChange,
  onSend,
  onKeyDown,
  files,
  onRemoveFile,
  onScreenshot,
  onAttach,
  onMention,
  sendDisabled,
  onAskAi,
  askDisabled,
  askLabel,
  askTitle,
  quickActions,
}: Props) {
  const rows = Math.min(6, Math.max(2, value.split("\n").length + 1));

  return (
    <div className="border-t border-black bg-white p-3">
      {/* Quick actions */}
      <div className="flex gap-1.5 flex-wrap mb-2">
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={a.onPick}
            className="rounded-pill border border-black bg-silo-cream px-2.5 py-1 text-[10px] font-bold cursor-pointer hover:bg-silo-yellow transition-colors"
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Attached files */}
      {files.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 border border-black rounded-pill bg-silo-lilac px-2.5 py-1 text-[10px] font-bold"
            >
              {f.name}
              <button
                onClick={() => onRemoveFile(i)}
                className="w-3.5 h-3.5 rounded-full border border-black bg-white text-[8px] cursor-pointer flex items-center justify-center"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea + buttons */}
      <div className="flex gap-2">
        <div className="flex-1 border border-black rounded-[16px] overflow-hidden bg-white">
          <textarea
            aria-label="Change request or team message"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={rows}
            placeholder="Message the team, or describe a change for AI…"
            className="w-full px-3 py-2.5 text-[13px] outline-none resize-none font-body"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <button
              onClick={onScreenshot}
              className="w-7 h-7 rounded-[8px] border border-neutral-200 bg-white text-xs cursor-pointer hover:bg-neutral-50 flex items-center justify-center"
              title="Attach screenshot"
            >
              📸
            </button>
            <button
              onClick={onAttach}
              className="w-7 h-7 rounded-[8px] border border-neutral-200 bg-white text-xs cursor-pointer hover:bg-neutral-50 flex items-center justify-center"
              title="Upload file"
            >
              📎
            </button>
            <button
              onClick={onMention}
              className="w-7 h-7 rounded-[8px] border border-neutral-200 bg-white text-xs cursor-pointer hover:bg-neutral-50 flex items-center justify-center"
              title="Mention someone"
            >
              @
            </button>
          </div>
        </div>
        <div className="self-end shrink-0 flex flex-col gap-1.5">
          <button
            onClick={onAskAi}
            disabled={askDisabled}
            title={askTitle}
            className="rounded-pill border-[1.5px] border-black bg-silo-green px-3 h-9 text-[11px] font-bold cursor-pointer hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✦ {askLabel}
          </button>
          <button
            aria-label="Send message"
            title="Send to the team"
            onClick={onSend}
            disabled={sendDisabled}
            className="rounded-pill border-[1.5px] border-black bg-black text-white px-3 h-9 text-[11px] font-bold cursor-pointer transition-colors hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send ↑
          </button>
        </div>
      </div>
    </div>
  );
}
