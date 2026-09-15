"use client";

import type { App, Version } from "@/lib/types";
import StatusDot from "@/components/ui/StatusDot";
import { appColor } from "@/lib/mockData";
import { proxyUrl } from "@/lib/api";

interface Props {
  app: App;
  versions: Version[];
  onOpen: () => void;
  onVersionClick: (v: Version) => void;
}

export default function HeroCard({ app, versions, onOpen, onVersionClick }: Props) {
  const latestVersion = versions[0];
  const liveVersion = versions.find((v) => v.status === "live");
  const isLive = !!liveVersion;

  const statusLabel = latestVersion
    ? latestVersion.status === "live"
      ? `Live v${latestVersion.version_no} · Deployed recently`
      : latestVersion.status === "building"
      ? "Build in progress"
      : latestVersion.status === "failed"
      ? "Last build failed"
      : `v${latestVersion.version_no}`
    : "No versions yet";

  const actionLabel = latestVersion?.status === "failed"
    ? "Retry build"
    : latestVersion?.status === "building"
    ? "Review latest build"
    : "Continue working";

  return (
    <div className="border border-black rounded-[24px] overflow-hidden bg-white">
      <div className="flex flex-col lg:flex-row">
        {/* Preview area */}
        <div
          className="flex-1 min-h-[240px] relative cursor-pointer overflow-hidden"
          style={{ background: appColor(app.name) + "22" }}
          onClick={onOpen}
        >
          {isLive ? (
            /* Live app preview iframe */
            <div className="absolute inset-0">
              <iframe
                src={proxyUrl(app.id)}
                className="w-full h-full border-0 pointer-events-none"
                title={`${app.name} preview`}
                sandbox="allow-scripts allow-same-origin"
                tabIndex={-1}
              />
              {/* Overlay to make the whole card clickable */}
              <div className="absolute inset-0" />
              {/* Status badge at top */}
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-black rounded-pill px-3 py-1.5 text-[11px] font-bold">
                <StatusDot status="live" size={7} />
                {statusLabel}
              </div>
            </div>
          ) : (
            /* Placeholder when not live */
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-[16px] border border-black flex items-center justify-center font-display text-3xl mx-auto mb-4"
                  style={{ background: appColor(app.name) }}
                >
                  {app.name.charAt(0)}
                </div>
                <div className="font-display text-xl">{app.name}</div>
                <div className="flex items-center justify-center gap-2 mt-2 text-xs text-neutral-500">
                  <StatusDot status={latestVersion?.status ?? "draft"} />
                  <span>{statusLabel}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Version sidebar */}
        <div className="w-full lg:w-[260px] border-t lg:border-t-0 lg:border-l border-black bg-silo-cream p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-3">
            Version history
          </div>
          <div className="space-y-2">
            {versions.slice(0, 4).map((v) => {
              const vIsLive = v.status === "live";
              return (
                <button
                  key={v.id}
                  onClick={() => onVersionClick(v)}
                  className={`w-full flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left cursor-pointer transition-colors ${
                    vIsLive
                      ? "border-silo-purple border-2 bg-silo-lilac"
                      : "border-black bg-white hover:bg-neutral-50"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-[10px] border border-black flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background:
                        v.status === "failed"
                          ? "#f3dcd6"
                          : v.status === "building"
                          ? "#ffe9a8"
                          : appColor(app.name),
                    }}
                  >
                    v{v.version_no}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <StatusDot status={v.status} size={6} />
                      <span className="capitalize">{v.status}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={onOpen}
            className="mt-3 w-full rounded-pill border border-black bg-black text-white text-[13px] font-bold py-2.5 cursor-pointer hover:bg-neutral-800 transition-colors"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
