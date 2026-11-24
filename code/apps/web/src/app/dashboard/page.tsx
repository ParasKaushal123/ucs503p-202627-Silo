"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { request } from "@/lib/workspace";
import type { App, Version } from "@/lib/types";
import Marquee from "@/components/home/Marquee";
import HeroCard from "@/components/home/HeroCard";
import AppGridCard from "@/components/home/AppGridCard";
import ActivityFeed from "@/components/home/ActivityFeed";
import PillButton from "@/components/ui/PillButton";
import Label from "@/components/ui/Label";
import SiloMark from "@/components/ui/SiloMark";
import Modal from "@/components/ui/Modal";
import Toast from "@/components/ui/Toast";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const router = useRouter();

  const [apps, setApps] = useState<App[]>([]);
  const [versionMap, setVersionMap] = useState<Record<string, Version[]>>({});
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchApps = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const appList = await api.listApps();
      setApps(appList);
      // Fetch versions for each app
      const entries = await Promise.all(
        appList.map(async (a) => {
          try {
            const vs = await api.listVersions(a.id);
            return [a.id, vs] as [string, Version[]];
          } catch {
            return [a.id, []] as [string, Version[]];
          }
        })
      );
      setVersionMap(Object.fromEntries(entries));
      const events = (await Promise.all(appList.map(async a => {
        try { return (await request(`/apps/${a.id}/activity`)).map((e: any) => ({ ...e, appName: a.name })); }
        catch { return []; }
      }))).flat();
      const versions = entries.flatMap(([id, vs]) => vs.map(v => ({ id: v.id, created_at: v.created_at,
        text: `${appList.find(a => a.id === id)?.name} · v${v.version_no} · ${v.status}`, color: "#dceeff", glyph: "↗" })));
      setActivity([...events.map((e: any) => ({ id: e.id, created_at: e.created_at,
        text: `${e.actor.name} · ${e.appName} · ${e.action.replaceAll(".", " ")}`, color: "#e9ccff", glyph: "✦" })), ...versions]
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
        .map(e => ({ ...e, when: new Date(e.created_at.endsWith("Z") || e.created_at.includes("+") ? e.created_at : e.created_at + "Z").toLocaleString() })));

    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) fetchApps();
  }, [isAuthenticated, fetchApps]);

  // Poll for building apps
  useEffect(() => {
    const hasBuilding = Object.values(versionMap).some((vs) =>
      vs.some((v) => v.status === "building" || v.status === "pending")
    );
    if (!hasBuilding) return;
    const interval = setInterval(() => fetchApps(true), 5000);
    return () => clearInterval(interval);
  }, [versionMap, fetchApps]);

  // Collaborators can publish from a shared Workbench; refresh when a live version changes.
  const liveIds = apps.map((a) => `${a.id}:${a.approved_version_id}`).join(",");
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const latest = await api.listApps();
        if (latest.map((a) => `${a.id}:${a.approved_version_id}`).join(",") !== liveIds) {
          await fetchApps(true);
        }
      } catch { /* The next poll retries. */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, liveIds, fetchApps]);

  const latestVersion = (appId: string): Version | undefined => {
    const vs = versionMap[appId] ?? [];
    return vs[0];
  };

  const latestStatus = (appId: string): string => {
    return latestVersion(appId)?.status ?? "draft";
  };

  const filtered = apps.filter((a) => {
    if (query && !a.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "Live") return latestStatus(a.id) === "live";
    if (filter === "Building") return latestStatus(a.id) === "building";
    if (filter === "Failed") return latestStatus(a.id) === "failed";
    return true;
  });

  const featuredApp = apps[0];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await api.createApp({ name: newName.trim() });
      setShowCreate(false);
      setNewName("");
      setHasFile(false);
      setUploadFile(null);
      // If a file was selected, upload it as v1
      if (uploadFile) {
        try {
          await api.uploadVersion(created.id, uploadFile);
          setToast(`Created ${created.name} and started building v1`);
        } catch {
          setToast(`Created ${created.name} — upload failed, try again from the app room`);
        }
      } else {
        setToast(`Created ${created.name}`);
      }
      fetchApps();
    } catch {
      setToast("Failed to create app");
    } finally {
      setCreating(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setHasFile(true);
      setUploadFile(f);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  const email = user?.authenticated ? user.email : "";
  const userId = user?.authenticated ? user.id : "";
  const liveCount = apps.filter((a) => latestStatus(a.id) === "live").length;
  const sharedCount = apps.filter((a) => userId && a.owner_id !== userId).length;
  const initials = email ? email.charAt(0).toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-canvas">
      {/* Marquee */}
      <Marquee />

      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur border-b border-neutral-300">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-5 h-16">
          <SiloMark />
          <div className="flex-1 max-w-sm mx-6">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="w-full border border-black rounded-pill px-4 py-2 text-sm outline-none focus:border-silo-purple"
            />
          </div>
          <div className="flex items-center gap-3">
            <PillButton onClick={() => setShowCreate(true)}>+ New app</PillButton>
            <div
              className="w-9 h-9 rounded-full border border-black bg-silo-yellow flex items-center justify-center font-bold text-sm cursor-pointer"
              title={email}
            >
              {initials}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : apps.length === 0 ? (
          /* Empty state */
          <div className="py-20 text-center">
            <div className="max-w-md mx-auto">
              <div className="font-display text-4xl mb-4">NO APPS YET</div>
              <p className="text-sm text-neutral-500 mb-6">
                Upload a .zip of your project or a single .py file. Silo detects
                the runtime, deps, entry point and port.
              </p>
              <div
                className="border-2 border-dashed border-black rounded-[20px] bg-silo-cream p-8 mb-4 hover:bg-silo-yellow transition-colors cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) { setUploadFile(file); setHasFile(true); setNewName(file.name.replace(/\.(zip|py)$/i, "")); setShowCreate(true); } }}
                onClick={() => setShowCreate(true)}
              >
                <div className="font-display text-2xl mb-2">DROP YOUR CODE</div>
                <p className="text-[13px] text-neutral-500">
                  Drag and drop or click to browse
                </p>
              </div>
              <PillButton onClick={() => setShowCreate(true)} size="lg">
                + New app
              </PillButton>
            </div>
          </div>
        ) : (
          <>
            {/* Greeting and real workspace numbers */}
            <section className="grid gap-6 lg:grid-cols-[1fr_auto] items-end pt-6 pb-8">
              <div>
                <Label>Workspace{email ? ` · ${email}` : ""}</Label>
                <h1 className="font-display font-bold leading-[0.92] mt-4 text-[clamp(38px,5vw,63px)]">
                  Your apps,
                  <br />
                  ready to share.
                </h1>
              </div>
              <div className="grid grid-cols-3 gap-3 min-w-0 lg:w-[460px]">
                {[
                  { label: "Apps", value: apps.length, tone: "bg-silo-green" },
                  { label: "Live now", value: liveCount, tone: "bg-silo-yellow" },
                  { label: "Shared with you", value: sharedCount, tone: "bg-silo-lilac" },
                ].map((stat) => (
                  <div key={stat.label} className={`${stat.tone} text-onaccent rounded-panel border-[1.5px] border-black px-4 py-3.5`}>
                    <div className="font-mono text-[10px] uppercase">{stat.label}</div>
                    <div className="font-display font-bold text-[34px] leading-none mt-2">{stat.value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Hero card for first app */}
            {featuredApp && (
              <div className="mb-8">
                <Label className="mb-3">Continue working</Label>
                <HeroCard
                  app={featuredApp}
                  versions={versionMap[featuredApp.id] ?? []}
                  onOpen={() => router.push(`/apps/${featuredApp.id}`)}
                  onVersionClick={() => router.push(`/apps/${featuredApp.id}`)}
                />
              </div>
            )}

            {/* Filter bar */}
            <div className="flex items-center gap-2 mb-4">
              {["All", "Live", "Building", "Failed"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-pill border border-black px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                    filter === f
                      ? "bg-black text-white"
                      : "bg-white text-black hover:bg-neutral-100"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* App grid */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-sm text-neutral-400">
                No apps match your filter.
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 mb-8">
                {filtered.map((a) => (
                  <AppGridCard
                    key={a.id}
                    app={a}
                    latestVersion={latestVersion(a.id)}
                    onClick={() => router.push(`/apps/${a.id}`)}
                  />
                ))}
              </div>
            )}

            {/* Activity feed */}
            <div className="max-w-md">
              <ActivityFeed items={activity} />
            </div>
          </>
        )}
      </main>

      {/* New App Sheet/Modal */}
      <Modal
        open={showCreate}
        title="NEW APP"
        headBg="#dceeff"
        onClose={() => {
          setShowCreate(false);
          setNewName("");
          setHasFile(false);
          setUploadFile(null);
        }}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide mb-1.5">
              App name
            </span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Invoice Generator"
              className="w-full border border-black rounded-pill px-4 py-2.5 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </label>

          <div
            className="border-2 border-dashed border-black rounded-[20px] bg-silo-cream p-6 text-center hover:bg-silo-yellow transition-colors cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) { setUploadFile(file); setHasFile(true); if (!newName.trim()) setNewName(file.name.replace(/\.(zip|py)$/i, "")); } }}
            onClick={() => document.getElementById("file-input-create")?.click()}
          >
            <div className="font-display text-xl mb-2">DROP YOUR CODE</div>
            <p className="text-[13px] text-neutral-500 mb-3">
              A .zip of your project, or a single .py file.
            </p>
            <PillButton variant="secondary" size="sm" type="button">
              Browse files
            </PillButton>
            <input
              id="file-input-create"
              type="file"
              accept=".zip,.py"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {hasFile && uploadFile && (
            <div className="border border-black rounded-[16px] px-3.5 py-3 flex items-center gap-3 bg-white">
              <span className="shrink-0 w-8 h-8 border border-black rounded-[9px] bg-silo-lilac flex items-center justify-center text-[11px] font-bold">
                {uploadFile.name.split(".").pop()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate">
                  {uploadFile.name}
                </span>
                <span className="block text-xs text-neutral-500">
                  {(uploadFile.size / 1024).toFixed(0)} KB
                </span>
              </span>
              <button
                onClick={() => {
                  setHasFile(false);
                  setUploadFile(null);
                }}
                className="shrink-0 w-7 h-7 rounded-pill border border-black bg-white cursor-pointer flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <PillButton
              variant="secondary"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setHasFile(false);
                setUploadFile(null);
              }}
            >
              Cancel
            </PillButton>
            <PillButton
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating
                ? "Creating…"
                : hasFile
                ? "Create and build"
                : "Create app"}
            </PillButton>
          </div>
        </div>
      </Modal>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
