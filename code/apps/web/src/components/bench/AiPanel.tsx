"use client";

import type { BenchMessage } from "@/lib/types";
import ProposalCard from "./ProposalCard";
import Composer from "./Composer";

interface Action {
  label: string;
  bg: string;
  fg: string;
  disabled?: boolean;
  onPick: () => void;
}

interface Props {
  visible: boolean;
  width: string;
  messages: BenchMessage[];
  applying: boolean;
  applyStep: number;
  applyEvent: string;
  getActions: (msg: BenchMessage) => Action[];
  composer: string;
  onComposerChange: (v: string) => void;
  onSend: () => void;
  onComposerKey: (e: React.KeyboardEvent) => void;
  composerFiles: { name: string }[];
  onRemoveFile: (i: number) => void;
  onScreenshot: () => void;
  onAttach: () => void;
  onMention: () => void;
  sendDisabled: boolean;
  quickActions: { label: string; onPick: () => void }[];
  onClose: () => void;
}

export default function AiPanel({
  visible,
  width,
  messages,
  applying,
  applyStep,
  applyEvent,
  getActions,
  composer,
  onComposerChange,
  onSend,
  onComposerKey,
  composerFiles,
  onRemoveFile,
  onScreenshot,
  onAttach,
  onMention,
  sendDisabled,
  quickActions,
  onClose,
}: Props) {
  if (!visible) return null;

  return (
    <div
      className="shrink-0 border-l border-black bg-white flex flex-col h-full"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-silo-blue border border-black flex items-center justify-center text-[10px] font-bold text-white">
            AI
          </span>
          <span className="text-xs font-bold uppercase tracking-wide">
            Silo Collaborator
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-pill border border-black bg-white cursor-pointer flex items-center justify-center text-xs"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto silo-scroll p-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.kind === "human" ? (
              /* Human message */
              <div className="bg-silo-cream rounded-[16px] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-6 h-6 rounded-full border border-black flex items-center justify-center text-[9px] font-bold"
                    style={{ background: msg.color }}
                  >
                    {msg.initials}
                  </span>
                  <span className="text-[12px] font-semibold">
                    {msg.author} · {msg.role}
                  </span>
                  <span className="text-[10px] text-neutral-400 ml-auto">
                    {msg.when}
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed">{msg.content}</p>
                {msg.attachment && (
                  <div className="mt-2 text-[11px] text-silo-blue font-mono">
                    📎 {msg.attachment}
                  </div>
                )}
              </div>
            ) : (
              /* Proposal */
              <ProposalCard
                msg={msg}
                applying={applying && msg.status === "applying"}
                applyStep={applyStep}
                applyEvent={applyEvent}
                actions={getActions(msg)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Composer */}
      <Composer
        value={composer}
        onChange={onComposerChange}
        onSend={onSend}
        onKeyDown={onComposerKey}
        files={composerFiles}
        onRemoveFile={onRemoveFile}
        onScreenshot={onScreenshot}
        onAttach={onAttach}
        onMention={onMention}
        sendDisabled={sendDisabled}
        quickActions={quickActions}
      />
    </div>
  );
}
