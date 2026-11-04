import type { App, AuthUser, Version } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function json(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** URL to load a running app in an iframe */
export function proxyUrl(appId: string): string {
  return `${BASE}/proxy/${appId}`;
}

export const api = {
  getMe: () => request<AuthUser>("/auth/me"),

  listApps: () => request<App[]>("/apps"),

  getApp: (id: string) => request<App>(`/apps/${id}`),

  createApp: (body: { name: string; description?: string }) =>
    request<App>("/apps", { method: "POST", ...json(body) }),

  deleteApp: (id: string) =>
    request<void>(`/apps/${id}`, { method: "DELETE" }),

  deleteAllApps: () =>
    request<void>("/apps", { method: "DELETE" }),

  listVersions: (appId: string) =>
    request<Version[]>(`/apps/${appId}/versions`),

  getVersion: (id: string) => request<Version>(`/versions/${id}`),

  uploadVersion: async (appId: string, file: File): Promise<Version> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/apps/${appId}/versions`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
};
