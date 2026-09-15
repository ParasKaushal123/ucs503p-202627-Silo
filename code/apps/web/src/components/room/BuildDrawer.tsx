"use client";

import type { Version } from "@/lib/types";
import VersionFilmstrip from "./VersionFilmstrip";

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  tab: "versions" | "logs";
  onTabChange: (t: "versions" | "logs") => void;
  versions: Version[];
  viewingId: string | null;
  appName: string;
  onViewVersion: (v: Version) => void;
  logs: LogEntry[];
  onCopyLogs: () => void;
  onClearLogs: () => void;
}

function logColor(level: string): string {
  if (level === "error") return "#ff8a65";
  if (level === "warning") return "#ffd731";
  if (level === "success") return "#55db9c";
  return "#e9e9e9";
}

export default function BuildDrawer({
  open,
  onToggle,
  tab,
  onTabChange,
  versions,
  viewingId,
  appName,
  onViewVersion,
  logs,
  onCopyLogs,
  onClearLogs,
}: Props) {
  return (
    <div
      className="shrink-0 border-t border-black bg-white transition-all duration-300 overflow-hidden"
      style={{ height: open ? "min(330px, 62%)" : "46px" }}
    >
      {/* Tab header */}
      <div className="flex items-center h-[46px] px-4 border-b border-black">
        <button onClick={onToggle} className="mr-3 cursor-pointer text-sm bg-transparent border-0 p-0">
          {open ? "⌄" : "⌃"}
        </button>
        <button
          onClick={() => onTabChange("versions")}
          className={`px-3 py-1 rounded-pill border border-black text-xs font-bold cursor-pointer mr-2 ${
            tab === "versions" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Versions
        </button>
        <button
          onClick={() => onTabChange("logs")}
          className={`px-3 py-1 rounded-pill border border-black text-xs font-bold cursor-pointer ${
            tab === "logs" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Build logs
          {logs.length > 0 && (
            <span className="ml-1.5 text-[10px]">({logs.length})</span>
          )}
        </button>
        <div className="flex-1" />
        {tab === "logs" && logs.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={onCopyLogs}
              className="rounded-pill border border-black bg-white px-2.5 py-1 text-[10px] font-bold cursor-pointer hover:bg-neutral-100"
            >
              Copy
            </button>
            <button
              onClick={onClearLogs}
              className="rounded-pill border border-black bg-white px-2.5 py-1 text-[10px] font-bold cursor-pointer hover:bg-neutral-100"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {open && (
        <div className="h-[calc(100%-46px)] overflow-y-auto silo-scroll">
          {tab === "versions" ? (
            <VersionFilmstrip
              versions={versions}
              viewingId={viewingId}
              appName={appName}
              onView={onViewVersion}
            />
          ) : (
            <div className="bg-neutral-900 text-neutral-100 p-4 min-h-full font-mono text-xs leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-neutral-500 text-center py-8">
                  No build logs yet. Deploy a version to see logs.
                </div>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="flex gap-3 py-0.5">
                    <span className="text-neutral-500 shrink-0">{l.timestamp}</span>
                    <span style={{ color: logColor(l.level) }}>{l.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
