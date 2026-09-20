"use client";

import StatusDot from "@/components/ui/StatusDot";
import PillButton from "@/components/ui/PillButton";

interface Props {
  appName: string;
  status: string;
  onBack: () => void;
  onWorkbench: () => void;
  onSecurity: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  deployLabel: string;
  deployBg: string;
  deployFg: string;
  deploying: boolean;
  onDeploy: () => void;
  editing: boolean;
  nameDraft: string;
  onStartEdit: () => void;
  onNameInput: (v: string) => void;
  onSaveName: () => void;
}

export default function RoomHeader({
  appName,
  status,
  onBack,
  onWorkbench,
  onSecurity,
  onTogglePanel,
  panelOpen,
  deployLabel,
  deployBg,
  deployFg,
  deploying,
  onDeploy,
  editing,
  nameDraft,
  onStartEdit,
  onNameInput,
  onSaveName,
}: Props) {
  return (
    <header className="shrink-0 h-14 border-b border-black bg-white flex items-center px-4 gap-3 z-20">
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
      >
        ←
      </button>

      {editing ? (
        <input
          value={nameDraft}
          onChange={(e) => onNameInput(e.target.value)}
          onBlur={onSaveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") onSaveName();
          }}
          autoFocus
          className="text-lg font-semibold border-b-2 border-silo-purple outline-none bg-transparent px-1"
        />
      ) : (
        <button
          onClick={onStartEdit}
          className="text-lg font-semibold hover:text-silo-purple transition-colors cursor-pointer bg-transparent border-0 p-0"
        >
          {appName}
        </button>
      )}

      <div className="flex items-center gap-1.5 ml-1">
        <StatusDot status={status} />
        <span className="text-xs capitalize text-neutral-500">{status}</span>
      </div>

      <div className="flex-1" />

      <PillButton variant="secondary" size="sm" onClick={onSecurity}>
        Security track
      </PillButton>

      <PillButton variant="secondary" size="sm" onClick={onWorkbench}>
        Workbench
      </PillButton>

      <button
        onClick={onTogglePanel}
        className={`rounded-pill border border-black px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
          panelOpen ? "bg-silo-lilac" : "bg-white hover:bg-neutral-100"
        }`}
      >
        Build details
      </button>

      <button
        onClick={onDeploy}
        disabled={deploying}
        className="rounded-pill border border-black px-4 py-2 text-[13px] font-bold cursor-pointer transition-colors disabled:opacity-50"
        style={{ background: deployBg, color: deployFg }}
      >
        {deployLabel}
      </button>
    </header>
  );
}
