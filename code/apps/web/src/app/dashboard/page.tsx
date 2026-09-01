"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { App } from "@/lib/types";
import Navbar from "@/components/Navbar";
import AppCard from "@/components/AppCard";
import CreateAppDialog from "@/components/CreateAppDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<App | null>(null);

  const fetchApps = useCallback(() => {
    setLoading(true);
    api
      .listApps()
      .then(setApps)
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) fetchApps();
  }, [isAuthenticated, fetchApps]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteApp(deleteTarget.id);
      setApps((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    } catch {
      // Could show a toast here
    }
    setDeleteTarget(null);
  };

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

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Your Apps</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
          >
            + New App
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-neutral-200 py-20 text-center">
            <div className="space-y-3">
              <div className="text-4xl">📦</div>
              <h3 className="text-lg font-medium text-neutral-700">No apps yet</h3>
              <p className="text-sm text-neutral-500">
                Create your first app to get started.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                + New App
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} onDelete={() => setDeleteTarget(app)} />
            ))}
          </div>
        )}
      </main>

      <CreateAppDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchApps}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete app"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
