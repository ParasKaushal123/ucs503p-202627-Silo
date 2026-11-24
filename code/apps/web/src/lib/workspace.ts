export const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, {
    credentials: "include", ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Server unavailable" }));
    throw new Error(typeof error.detail === "string" ? error.detail : `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const post = <T = any>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
export type SourceFile = { path: string; content: string };
export type SourceFiles = Record<string, SourceFile>;
export type Draft = { id: string; app_id: string; role: string; generation: number; revision: number; files: SourceFiles; source_hash: string; updated_at: string; title?: string; base_files?: SourceFiles; base_version_no?: number };
export type Person = { id: string; name: string; email: string; role: string; connection?: string };
export type Release = { id: string; label: string; source_hash: string; status: string; created_at: string; capabilities: { category: string; label: string; file: string; line: number }[]; kind: string; version_id: string | null; version_no?: number };
