"use client";

import { useEffect } from "react";

export default function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 3200);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 border border-black rounded-pill bg-black text-white px-4 py-2.5 text-[12.5px] max-w-[calc(100%-28px)] animate-silo-rise">
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 w-6 h-6 rounded-pill border border-white bg-transparent text-white cursor-pointer flex items-center justify-center text-xs"
      >
        ✕
      </button>
    </div>
  );
}
