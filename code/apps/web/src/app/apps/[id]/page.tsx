"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { App, Version } from "@/lib/types";
import Navbar from "@/components/Navbar";
import BuildStatusBadge from "@/components/BuildStatusBadge";
import UploadVersionDialog from "@/components/UploadVersionDialog";

export default function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [app, setApp] = useState<App | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [appData, versionData] = await Promise.all([
        api.getApp(id),
        api.listVersions(id),
      ]);
      setApp(appData);
      setVersions(versionData);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        setError("App not found");
      } else {
        setError("Failed to load app");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  // Initial fetch
  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated, fetchData]);

  // Poll for building versions every 3s
  useEffect(() => {
    const hasBuilding = versions.some((v) => v.status === "building" || v.status === "pending");
    if (!hasBuilding) return;

    const interval = setInterval(async () => {
      if (!id) return;
      try {
        const updated = await api.listVersions(id);
        setVersions(updated);
      } catch {
        // Silently ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [versions, id]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Back link */}
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-6 flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to apps
        </button>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        ) : app ? (
          <>
            {/* App header */}
            <div className="flex items-start justify-between mb-8">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold">{app.name}</h1>
                <span className="inline-block rounded bg-neutral-100 px-2 py-0.5 text-xs font-mono text-neutral-500">
                  {app.slug}
                </span>
                {app.description && (
                  <p className="text-sm text-neutral-500 mt-2">{app.description}</p>
                )}
              </div>
              <button
                onClick={() => setShowUpload(true)}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors shrink-0"
              >
                Upload Version
              </button>
            </div>

            {/* Versions list */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Versions</h2>
              {versions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-neutral-200 py-12 text-center">
                  <div className="space-y-3">
                    <div className="text-3xl">🚀</div>
                    <h3 className="text-base font-medium text-neutral-700">No versions yet</h3>
                    <p className="text-sm text-neutral-500">
                      Upload a <strong>.zip</strong> or <strong>.py</strong> file to deploy your first version.
                    </p>
                    <button
                      onClick={() => setShowUpload(true)}
                      className="mt-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
                    >
                      Upload Version
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-300 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-mono font-medium text-neutral-700">
                          v{v.version_no}
                        </span>
                        <BuildStatusBadge status={v.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-400">
                        {v.status === "live" && v.internal_port && (
                          <span>port {v.internal_port}</span>
                        )}
                        {app.approved_version_id === v.id && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>

      <UploadVersionDialog
        open={showUpload}
        appId={id}
        onClose={() => setShowUpload(false)}
        onUploaded={fetchData}
      />
    </div>
  );
}
