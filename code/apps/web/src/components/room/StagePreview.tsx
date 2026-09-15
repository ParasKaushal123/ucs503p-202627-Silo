"use client";

import { useState, useRef } from "react";
import StatusDot from "@/components/ui/StatusDot";

interface Props {
  appId: string;
  appName: string;
  appColor: string;
  status: string;
  envChip: string;
  building: boolean;
  failed: boolean;
  buildProgress: string;
  proxyUrl: string;
  onReload: () => void;
  onCopyUrl: () => void;
}

export default function StagePreview({
  appId,
  appName,
  appColor,
  status,
  envChip,
  building,
  failed,
  buildProgress,
  proxyUrl,
  onReload,
  onCopyUrl,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const handleReload = () => {
    setIframeKey((k) => k + 1);
    onReload();
  };

  const handleOpenTab = () => {
    if (proxyUrl) window.open(proxyUrl, "_blank");
  };

  return (
    <div className="flex-1 relative flex flex-col items-center justify-center bg-silo-cream overflow-hidden">
      {/* Environment chip */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 border border-black rounded-pill bg-white px-3 py-1.5 text-[11px] font-bold tracking-wide">
          <StatusDot status={building ? "building" : failed ? "failed" : status} size={7} />
          {envChip}
        </div>
      </div>

      {building ? (
        /* Building state */
        <div className="text-center p-8">
          <div className="w-20 h-20 rounded-[20px] border border-black bg-silo-yellow flex items-center justify-center font-display text-4xl mx-auto mb-6 animate-silo-pulse">
            {appName.charAt(0)}
          </div>
          <div className="font-display text-xl mb-3">BUILDING</div>
          <div className="w-64 mx-auto">
            <div className="h-2 border border-black rounded-pill overflow-hidden bg-neutral-200">
              <div
                className="h-full bg-silo-yellow transition-all duration-500"
                style={{ width: buildProgress }}
              />
            </div>
            <div className="text-xs text-neutral-500 mt-2">{buildProgress}</div>
          </div>
        </div>
      ) : failed ? (
        /* Failed state */
        <div className="text-center p-8">
          <div className="w-20 h-20 rounded-[20px] border border-black bg-red-100 flex items-center justify-center font-display text-4xl mx-auto mb-6">
            {appName.charAt(0)}
          </div>
          <div className="font-display text-xl text-silo-red mb-2">BUILD FAILED</div>
          <p className="text-sm text-neutral-500">Check the build logs for details.</p>
        </div>
      ) : status === "live" && proxyUrl ? (
        /* Live app iframe */
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={proxyUrl}
          className="absolute inset-0 w-full h-full border-0"
          title={`${appName} preview`}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      ) : (
        /* No live version */
        <div className="text-center p-8">
          <div
            className="w-20 h-20 rounded-[20px] border border-black flex items-center justify-center font-display text-4xl mx-auto mb-6"
            style={{ background: appColor }}
          >
            {appName.charAt(0)}
          </div>
          <div className="text-sm text-neutral-500">
            Upload a version to see your app here
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        <button
          onClick={handleReload}
          className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
          title="Reload"
        >
          ↻
        </button>
        <button
          onClick={handleOpenTab}
          className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
          title="Open in new tab"
        >
          ↗
        </button>
        <button
          onClick={onCopyUrl}
          className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
          title="Copy URL"
        >
          📋
        </button>
      </div>
    </div>
  );
}
