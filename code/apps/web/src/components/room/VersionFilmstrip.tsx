"use client";

import type { Version } from "@/lib/types";
import StatusDot from "@/components/ui/StatusDot";
import { appColor } from "@/lib/mockData";

interface Props {
  versions: Version[];
  viewingId: string | null;
  appName: string;
  onView: (v: Version) => void;
}

export default function VersionFilmstrip({ versions, viewingId, appName, onView }: Props) {
  if (versions.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-neutral-400">
        No versions yet — upload code to create v1.
      </div>
    );
  }

  const color = appColor(appName);

  return (
    <div className="flex gap-3 overflow-x-auto p-4 silo-scroll">
      {versions.map((v) => {
        const isViewing = viewingId === v.id || (!viewingId && v.status === "live");
        return (
          <button
            key={v.id}
            onClick={() => onView(v)}
            className={`shrink-0 w-[120px] rounded-[16px] border-2 p-3 text-left cursor-pointer transition-all ${
              isViewing
                ? "border-silo-purple bg-silo-lilac -translate-y-1"
                : "border-black bg-white hover:bg-neutral-50"
            }`}
          >
            <div
              className="w-full h-12 rounded-[10px] border border-black mb-2 flex items-center justify-center text-xs font-bold"
              style={{
                background:
                  v.status === "failed"
                    ? "#f3dcd6"
                    : v.status === "building"
                    ? "#ffe9a8"
                    : color,
              }}
            >
              v{v.version_no}
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot status={v.status} size={6} />
              <span className="text-[11px] font-semibold capitalize truncate">
                {v.status}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
