"use client";

const colorMap: Record<string, string> = {
  live: "bg-green-500",
  building: "bg-amber-500 animate-silo-pulse",
  failed: "bg-red-600",
  pending: "bg-silo-blue animate-silo-pulse",
  draft: "bg-silo-blue",
  superseded: "bg-slate-400",
};

export default function StatusDot({
  status,
  size = 8,
}: {
  status: string;
  size?: number;
}) {
  const cls = colorMap[status] ?? "bg-slate-400";
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${cls}`}
      style={{ width: size, height: size }}
    />
  );
}
