"use client";

import type { App, Version } from "@/lib/types";
import StatusDot from "@/components/ui/StatusDot";
import { appColor } from "@/lib/mockData";

interface Props {
  app: App;
  latestVersion?: Version;
  onClick: () => void;
}

export default function AppGridCard({ app, latestVersion, onClick }: Props) {
  const status = latestVersion?.status ?? "draft";
  const vLabel = latestVersion ? `v${latestVersion.version_no}` : "—";
  const isBuilding = status === "building";

  return (
    <button
      onClick={onClick}
      className="w-full text-left border-[1.5px] border-black rounded-panel overflow-hidden bg-white hover:-translate-y-0.5 hover:shadow-[0_6px_0_rgb(var(--ink))] transition-transform cursor-pointer group"
    >
      {/* Thumbnail area */}
      <div
        className="h-[120px] flex items-center justify-center relative"
        style={{ background: appColor(app.name) + "22" }}
      >
        <div
          className="w-12 h-12 rounded-[12px] border border-black flex items-center justify-center font-display text-xl"
          style={{ background: appColor(app.name) }}
        >
          {app.name.charAt(0)}
        </div>
        {isBuilding && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-200">
            <div className="h-full bg-silo-yellow animate-silo-pulse w-[60%]" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 py-3 border-t border-black">
        <div className="flex items-center gap-2">
          <StatusDot status={status} size={7} />
          <span className="text-sm font-semibold truncate">{app.name}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-neutral-500 capitalize">{status}</span>
          <span className="text-xs font-mono text-neutral-400">{vLabel}</span>
        </div>
      </div>
    </button>
  );
}
