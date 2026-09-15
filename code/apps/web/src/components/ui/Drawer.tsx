"use client";

import { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
  width?: string;
  offsetLeft?: string;
}

export default function Drawer({
  open,
  title,
  onClose,
  children,
  side = "left",
  width = "300px",
  offsetLeft = "56px",
}: Props) {
  if (!open) return null;

  const posStyle =
    side === "left"
      ? { left: offsetLeft, width: `min(${width}, 80%)` }
      : { right: 0, width: `min(${width}, 80%)` };

  return (
    <div
      className="absolute top-0 bottom-0 z-30 border-r border-black bg-white flex flex-col animate-silo-rise"
      style={posStyle}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-black shrink-0">
        <h4 className="m-0 text-xs font-bold uppercase tracking-wide">
          {title}
        </h4>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-pill border border-black bg-white cursor-pointer flex items-center justify-center text-xs"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto silo-scroll">{children}</div>
    </div>
  );
}
