import type { Classification, Severity } from "@/lib/types";

/** Theme classes for severities and build classifications on the Security track. */
export const SEVERITY_FILL: Record<Severity, string> = {
  high: "bg-silo-red",
  medium: "bg-silo-yellow",
  low: "bg-silo-sky",
  info: "bg-neutral-300",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const CLASSIFICATION: Record<Classification, { fill: string; line: string; word: string }> = {
  origin: { fill: "bg-silo-green", line: "bg-silo-green", word: "Origin" },
  expanding: { fill: "bg-silo-yellow", line: "bg-silo-yellow", word: "Expanding" },
  reducing: { fill: "bg-silo-green", line: "bg-silo-green", word: "Reducing" },
  neutral: { fill: "bg-silo-lilac", line: "bg-neutral-300", word: "No change" },
};

/** Risk is 0–100, lower is better. */
export function riskFill(risk: number): string {
  if (risk >= 40) return "bg-silo-red";
  if (risk >= 15) return "bg-silo-yellow";
  return "bg-silo-green";
}

/** The same bands as riskFill, for SVG strokes. */
export function riskStroke(risk: number): string {
  if (risk >= 40) return "stroke-silo-red";
  if (risk >= 15) return "stroke-silo-yellow";
  return "stroke-silo-live";
}
