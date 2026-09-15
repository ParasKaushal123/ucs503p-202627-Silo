"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const base =
  "inline-flex items-center justify-center gap-2 font-bold border border-black rounded-pill cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-black text-white hover:bg-neutral-800",
  secondary: "bg-white text-black hover:bg-neutral-100",
  ghost: "bg-transparent text-black border-transparent hover:bg-neutral-100",
  danger: "bg-silo-red text-white hover:opacity-90",
};

const sizes = {
  sm: "text-xs px-3 py-1.5",
  md: "text-[13px] px-4 py-2.5",
  lg: "text-sm px-5 py-3",
};

export default function PillButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
