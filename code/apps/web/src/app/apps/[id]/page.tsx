"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api, proxyUrl } from "@/lib/api";
import type { App, Version } from "@/lib/types";
import { appColor, SCRIPT_OK, SCRIPT_FAIL } from "@/lib/mockData";
import RoomHeader from "@/components/room/RoomHeader";
import StagePreview from "@/components/room/StagePreview";
import BuildDrawer from "@/components/room/BuildDrawer";
import BuildPanel from "@/components/room/BuildPanel";
import Modal from "@/components/ui/Modal";
import PillButton from "@/components/ui/PillButton";
import Toast from "@/components/ui/Toast";

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

function clock(i: number): string {
  const base = 14 * 3600 + 22 * 60 + 5 + i * 7;
  const h = String(Math.floor(base / 3600)).padStart(2, "0");
  const m = String(Math.floor(base / 60) % 60).padStart(2, "0");
  const s = String(base % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function AppRoom() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [app, setApp] = useState<App | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Room UI state
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"versions" | "logs">("versions");
  const [panelOpen, setPanelOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Deploy simulation state
  const [deployState, setDeployState] = useState<"idle" | "deploying" | "deployed" | "failed">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logTimer = useRef<ReturnType<typeof setInterval>>();
  const doneTimer = useRef<ReturnType<typeof setTimeout>>();

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated, fetchData]);

  // Poll for building
  useEffect(() => {
    const hasBuilding = versions.some(
      (v) => v.status === "building" || v.status === "pending"
    );
    if (!hasBuilding) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [versions, fetchData]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      clearInterval(logTimer.current);
      clearTimeout(doneTimer.current);
    };
  }, []);

  const latestVersion = versions[0];
  const currentStatus = latestVersion?.status ?? "draft";
  const liveVersion = versions.find((v) => v.status === "live");

  // Deploy simulation
  const deploy = async () => {
    if (!app || !uploadFile) return;
    setUploading(true);
    try {
      await api.uploadVersion(app.id, uploadFile);
      setShowUpload(false);
      setUploadFile(null);
      setUploading(false);

      // Start simulated log output
      setDeployState("deploying");
      setLogs([]);
      setDrawerTab("logs");
      setDrawerOpen(true);

      const script = SCRIPT_OK; // Real status comes from polling
      let i = 0;
      clearInterval(logTimer.current);
      logTimer.current = setInterval(() => {
        if (i >= script.length) {
          clearInterval(logTimer.current);
          return;
        }
        const [level, message] = script[i];
        setLogs((prev) => [
          ...prev,
          { id: `l${prev.length}`, timestamp: clock(prev.length), level, message },
        ]);
        i++;
      }, 620);

      // Actual status will be updated by polling
      // After a delay, also refresh data
      doneTimer.current = setTimeout(() => {
        fetchData();
        setDeployState("idle");
      }, 8000);
    } catch {
      setUploading(false);
      setToast("Upload failed — try again");
    }
  };

  // Quick deploy (no file — just re-trigger simulated logs)
  const quickDeploy = () => {
    if (deployState === "deploying") return;
    setShowUpload(true);
  };

  const saveName = () => {
    setEditing(false);
    // No PATCH endpoint — just local rename display
    if (app && nameDraft.trim()) {
      setApp({ ...app, name: nameDraft.trim() });
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-4">{error || "App not found"}</p>
          <PillButton onClick={() => router.push("/dashboard")}>Back to Home</PillButton>
        </div>
      </div>
    );
  }

  const isBuilding = deployState === "deploying" || currentStatus === "building";
  const isFailed = deployState === "failed" || (!isBuilding && currentStatus === "failed");
  const buildingVersion = (latestVersion?.version_no ?? 0) + (deployState === "deploying" ? 1 : 0);

  const envChip = isBuilding
    ? `BUILDING · v${buildingVersion}`
    : isFailed
    ? `FAILED · v${latestVersion?.version_no ?? "?"}`
    : currentStatus === "live"
    ? `LIVE · v${liveVersion?.version_no ?? latestVersion?.version_no}`
    : `PREVIEW · v${latestVersion?.version_no ?? 1}`;

  const deployLabel = { idle: "Deploy", deploying: "Deploying…", deployed: "Deployed", failed: "Retry deploy" }[deployState];
  const deployBg = { idle: "#000", deploying: "#ffd731", deployed: "#55db9c", failed: "#fb4903" }[deployState];
  const deployFg = deployState === "deploying" || deployState === "deployed" ? "#000" : "#fff";

  const buildProgress = isBuilding
    ? `${Math.round((logs.length / 9) * 100)}%`
    : currentStatus === "live"
    ? "100%"
    : currentStatus === "failed"
    ? "70%"
    : "0%";

  const progressColor = isBuilding ? "#D97706" : isFailed ? "#DC2626" : "#16A34A";

  const facts = [
    { label: "Detected runtime", value: "Python 3.11" },
    { label: "Entry point", value: "app.py" },
    { label: "Detected port", value: latestVersion?.internal_port ? String(latestVersion.internal_port) : "—" },
    { label: "Dependencies", value: "auto-detected" },
    { label: "Resource limits", value: "256 MB · 0.5 CPU" },
    { label: "Viewing", value: viewingId ? `Selected version` : currentStatus === "live" ? `v${liveVersion?.version_no} · Live` : "—" },
  ];

  return (
    <div className="h-screen flex flex-col relative overflow-hidden">
      <RoomHeader
        appName={app.name}
        status={isBuilding ? "building" : currentStatus}
        onBack={() => router.push("/dashboard")}
        onWorkbench={() => router.push(`/apps/${id}/workbench`)}
        onTogglePanel={() => setPanelOpen(!panelOpen)}
        panelOpen={panelOpen}
        deployLabel={deployLabel}
        deployBg={deployBg}
        deployFg={deployFg}
        deploying={deployState === "deploying"}
        onDeploy={quickDeploy}
        editing={editing}
        nameDraft={nameDraft}
        onStartEdit={() => {
          setEditing(true);
          setNameDraft(app.name);
        }}
        onNameInput={setNameDraft}
        onSaveName={saveName}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <StagePreview
          appId={app.id}
          appName={app.name}
          appColor={appColor(app.name)}
          status={currentStatus}
          envChip={envChip}
          building={isBuilding}
          failed={isFailed}
          buildProgress={buildProgress}
          proxyUrl={proxyUrl(app.id)}
          onReload={() => setToast("Reloaded the sandbox.")}
          onCopyUrl={() => {
            navigator.clipboard.writeText(proxyUrl(app.id));
            setToast(`Copied URL for ${app.name}`);
          }}
        />

        <BuildDrawer
          open={drawerOpen}
          onToggle={() => setDrawerOpen(!drawerOpen)}
          tab={drawerTab}
          onTabChange={(t) => {
            setDrawerTab(t);
            setDrawerOpen(true);
          }}
          versions={versions}
          viewingId={viewingId}
          appName={app.name}
          onViewVersion={(v) => setViewingId(v.id)}
          logs={logs}
          onCopyLogs={() => setToast("Build logs copied to clipboard.")}
          onClearLogs={() => {
            setLogs([]);
            setToast("Cleared view — server logs are kept.");
          }}
        />

        <BuildPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          statusLine={isBuilding ? `Building v${buildingVersion}` : currentStatus === "live" ? "Application is live" : currentStatus === "failed" ? "Last build failed" : "No build yet"}
          progress={buildProgress}
          progressColor={progressColor}
          facts={facts}
        />
      </div>

      {/* Upload Modal */}
      <Modal
        open={showUpload}
        title="UPLOAD VERSION"
        headBg="#dceeff"
        onClose={() => {
          setShowUpload(false);
          setUploadFile(null);
        }}
      >
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-black rounded-[20px] bg-silo-cream p-6 text-center hover:bg-silo-yellow transition-colors cursor-pointer"
            onClick={() => document.getElementById("file-input-upload")?.click()}
          >
            <div className="font-display text-xl mb-2">DROP YOUR CODE</div>
            <p className="text-[13px] text-neutral-500 mb-3">
              A .zip of your project, or a single .py file. Silo detects the
              runtime, deps, entry point and port.
            </p>
            <PillButton variant="secondary" size="sm" type="button">
              Browse files
            </PillButton>
            <input
              id="file-input-upload"
              type="file"
              accept=".zip,.py"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setUploadFile(f);
              }}
            />
          </div>

          {uploadFile && (
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
                onClick={() => setUploadFile(null)}
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
                setShowUpload(false);
                setUploadFile(null);
              }}
            >
              Cancel
            </PillButton>
            <PillButton
              onClick={deploy}
              disabled={!uploadFile || uploading}
            >
              {uploading ? "Uploading…" : "Upload and build"}
            </PillButton>
          </div>
        </div>
      </Modal>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
