"use client";

import { ReactNode, useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  headBg?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({
  open,
  title,
  headBg = "#dceeff",
  onClose,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-5">
      <div className="w-full max-w-[520px] max-h-full overflow-auto border border-black rounded-[30px] bg-white animate-silo-rise">
        <div
          className="flex items-center justify-between gap-3 px-5 py-[17px] border-b border-black"
          style={{ background: headBg }}
        >
          <h3 className="m-0 font-display text-2xl leading-none">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 border border-black rounded-pill bg-white cursor-pointer flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
