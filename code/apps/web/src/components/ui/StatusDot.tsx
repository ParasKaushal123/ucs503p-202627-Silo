"use client";

const colorMap: Record<string, string> = {
  live: "bg-silo-live",
  building: "bg-silo-yellow animate-silo-pulse",
  failed: "bg-silo-red",
  pending: "bg-silo-blue animate-silo-pulse",
  draft: "bg-silo-blue",
  superseded: "bg-neutral-400",
};

export default function StatusDot({
  status,
  size = 8,
}: {
  status: string;
  size?: number;
}) {
  const cls = colorMap[status] ?? "bg-neutral-400";
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${cls}`}
      style={{ width: size, height: size }}
    />
  );
}
