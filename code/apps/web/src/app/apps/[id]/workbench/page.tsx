"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { BenchMessage, BenchThread, BenchChange, FileNode } from "@/lib/types";
import {
  INITIAL_MESSAGES,
  INITIAL_THREADS,
  INITIAL_CHANGES,
  FILE_TREE,
  CODE_PREVIEWS,
  PEOPLE,
  QUICK_ACTIONS,
} from "@/lib/mockData";
import ToolRail, { TOOLS } from "@/components/bench/ToolRail";
import FileTree from "@/components/bench/FileTree";
import ChangesList from "@/components/bench/ChangesList";
import Timeline from "@/components/bench/Timeline";
import CommentsPanel from "@/components/bench/CommentsPanel";
import AiPanel from "@/components/bench/AiPanel";
import PresencePopover from "@/components/bench/PresencePopover";
import Drawer from "@/components/ui/Drawer";
import Modal from "@/components/ui/Modal";
import PillButton from "@/components/ui/PillButton";
import StatusDot from "@/components/ui/StatusDot";
import Toast from "@/components/ui/Toast";

type DrawerKey = "files" | "changes" | "versions" | "comments" | "build" | null;

export default function Workbench() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Core bench state
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [viewport, setViewport] = useState("desktop");

  // Draft state
  const [title, setTitle] = useState("Add category filters");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveState, setSaveState] = useState("Saved");
  const [checkpoints, setCheckpoints] = useState(3);
  const [baseVersion] = useState(5);
  const [draftVersion] = useState(6);

  // Messages and changes
  const [messages, setMessages] = useState<BenchMessage[]>(INITIAL_MESSAGES);
  const [threads, setThreads] = useState<BenchThread[]>(INITIAL_THREADS);
  const [changes, setChanges] = useState<BenchChange[]>(INITIAL_CHANGES);
  const [changesBadge, setChangesBadge] = useState(2);
  const [modified, setModified] = useState(["ExpenseTable.tsx", "CategoryFilter.tsx"]);

  // Apply state
  const [applying, setApplying] = useState(false);
  const [applyStep, setApplyStep] = useState(0);
  const [applyEvent, setApplyEvent] = useState("");
  const [errorBanner, setErrorBanner] = useState(false);
  const [readyChip, setReadyChip] = useState<string | null>(null);

  // Composer
  const [composer, setComposer] = useState("");
  const [composerFiles, setComposerFiles] = useState<{ name: string }[]>([]);

  // Files
  const [openFileId, setOpenFileId] = useState("expense-table");
  const [fileQuery, setFileQuery] = useState("");

  // UI
  const [toast, setToast] = useState<string | null>(null);
  const [presence, setPresence] = useState<(typeof PEOPLE)[0] | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [stage, setStage] = useState<"preparing" | "preview">("preparing");

  const applyTimer = useRef<ReturnType<typeof setInterval>>();
  const aiTimer = useRef<ReturnType<typeof setTimeout>>();

  // Stage prepare animation
  useEffect(() => {
    const t = setTimeout(() => setStage("preview"), 950);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/");
  }, [authLoading, isAuthenticated, router]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(applyTimer.current);
      clearTimeout(aiTimer.current);
    };
  }, []);

  const benchToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  // Tool rail click
  const handleToolPick = (key: string) => {
    if (key === "preview") {
      setDrawer(null);
    } else {
      setDrawer(drawer === key ? null : (key as DrawerKey));
    }
  };

  // File tree helpers
  const files: (FileNode & { modified?: boolean })[] = FILE_TREE.map((f) => ({
    ...f,
    modified: modified.some((m) => f.name.endsWith(m)),
  }));

  const openFileRow = FILE_TREE.find((f) => f.id === openFileId && !f.folder);
  const openFile = openFileRow
    ? {
        name: openFileRow.name,
        meta: modified.some((m) => openFileRow.name.endsWith(m))
          ? "Modified in this draft · read-only"
          : "Unchanged · read-only",
        code:
          CODE_PREVIEWS[openFileRow.id] ||
          "// Read-only preview\n// Silo shows the draft copy of this file.",
      }
    : null;

  // Timeline
  const timeline = [
    { id: "live", title: `Live v${baseVersion}`, meta: "Published Tuesday · serving the stable URL", swatch: "#55db9c", action: "Preview" },
    { id: "draft", title: `Shared Draft v${draftVersion}`, meta: `${title} · ${checkpoints} checkpoints`, swatch: "#ffd731", action: "Viewing" },
    ...Array.from({ length: checkpoints }).map((_, i) => ({
      id: `cp${checkpoints - i}`,
      title: `Checkpoint ${checkpoints - i}`,
      meta: `${checkpoints - i === checkpoints ? "Latest · " : ""}Applied by Silo · build passed`,
      swatch: "#e9ccff",
      action: "Restore",
    })),
  ];

  // Apply proposal
  const applyProposal = (msgId: string) => {
    if (applying) return;
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, status: "applying" } : m))
    );
    setApplying(true);
    setApplyStep(0);
    setApplyEvent("Analysed current application");
    setSaveState("Build pending");
    setErrorBanner(false);
    setReadyChip(null);

    const events = [
      "Analysed current application",
      "Updated three files",
      "Resolving dependencies",
      "Building preview",
      "Running health check",
      "Preview ready",
    ];
    let i = 0;
    clearInterval(applyTimer.current);
    applyTimer.current = setInterval(() => {
      i++;
      if (i >= events.length) {
        clearInterval(applyTimer.current);
        // Success
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: "applied" } : m))
        );
        setApplying(false);
        setSaveState("Saved");
        setApplyEvent("");
        setCheckpoints((c) => c + 1);
        setChangesBadge((b) => b + 1);
        setReadyChip("Draft preview updated.");
        setModified((prev) => [
          ...new Set([...prev, ...(msg.files?.map((f) => f.split("/").pop()!) ?? [])]),
        ]);
        setChanges((prev) => [
          ...prev,
          {
            id: `c${prev.length + 1}`,
            title: msg.title ?? "Change",
            meta: `Proposed by Paras · Applied by Silo · ${msg.files?.length ?? 0} files changed`,
            build: "Build passed",
            dot: "#16A34A",
          },
        ]);
        benchToast("Draft updated.");
        setTimeout(() => setReadyChip(null), 2600);
        return;
      }
      setApplyStep(Math.min(3, Math.floor(i * 0.7)));
      setApplyEvent(events[i]);
    }, 780);
  };

  // AI response simulation
  const pushPrompt = (text: string) => {
    const t = (text || "").trim();
    if (!t) return;
    const now = new Date();
    const when = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    setMessages((prev) => [
      ...prev,
      {
        id: `h${Date.now()}`,
        kind: "human",
        author: "You",
        role: "Editor",
        initials: "PK",
        color: "#5c4ade",
        when,
        content: t,
        attachment: composerFiles.length ? composerFiles.map((f) => f.name).join(", ") : null,
      },
    ]);
    setComposer("");
    setComposerFiles([]);
    setSaveState("Saving…");
    setTimeout(() => setSaveState("Saved"), 600);

    clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(() => {
      const low = t.toLowerCase();
      let p: Partial<BenchMessage>;
      if (/fix|fail|error|broken/.test(low)) {
        p = {
          title: "Fix the failing CategoryFilter build",
          cap: "none",
          content: "I found the cause: CategoryFilter imports a helper that no longer exists.",
          planned: ["Restore the missing helper in lib/preferences.ts", "Guard against an empty category list", "Rebuild the draft preview"],
          files: ["components/CategoryFilter.tsx", "lib/preferences.ts"],
        };
      } else {
        p = {
          title: t.length > 44 ? t.slice(0, 44) + "…" : t,
          cap: "none",
          content: "Here is how I would implement that on the shared draft.",
          planned: ["Adjust the affected screen to match the request", "Keep existing data and routes unchanged", "Rebuild the draft preview"],
          files: ["components/ExpenseTable.tsx", "app.tsx"],
        };
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `p${Date.now()}`,
          kind: "proposal",
          author: "Silo",
          initials: "AI",
          color: "#4da2ff",
          when,
          status: "proposed",
          content: p.content!,
          title: p.title,
          cap: p.cap as BenchMessage["cap"],
          planned: p.planned,
          files: p.files,
        },
      ]);
    }, 850);
  };

  // Actions for each proposal
  const getActions = (msg: BenchMessage) => {
    const st = msg.status;
    const acts: { label: string; bg: string; fg: string; disabled?: boolean; onPick: () => void }[] = [];
    if (st === "proposed" || st === "queued") {
      acts.push({
        label: applying ? "Apply blocked" : "Apply to draft",
        bg: applying ? "#9ca3af" : "#000",
        fg: "#fff",
        disabled: applying,
        onPick: () => applyProposal(msg.id),
      });
      acts.push({ label: "Edit", bg: "#fff", fg: "#000", onPick: () => setComposer(`Revise: ${msg.title}`) });
      acts.push({
        label: "Cancel",
        bg: "#fff",
        fg: "#000",
        onPick: () => setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: "cancelled" } : m))),
      });
    } else if (st === "applied") {
      acts.push({ label: "View changes", bg: "#000", fg: "#fff", onPick: () => setDrawer("changes") });
      acts.push({ label: "Test preview", bg: "#fff", fg: "#000", onPick: () => benchToast("Draft preview focused.") });
    } else if (st === "failed") {
      acts.push({ label: "Ask AI to fix", bg: "#000", fg: "#fff", onPick: () => pushPrompt("Fix the failing build") });
      acts.push({ label: "View logs", bg: "#fff", fg: "#000", onPick: () => setDrawer("build") });
    } else if (st === "cancelled") {
      acts.push({
        label: "Re-propose",
        bg: "#fff",
        fg: "#000",
        onPick: () => setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: "proposed" } : m))),
      });
    }
    return acts;
  };

  const vpWidths: Record<string, string> = {
    desktop: "100%",
    tablet: "834px",
    mobile: "390px",
    fit: "100%",
  };

  const unresolved = threads.filter((t) => !t.resolved).length;

  // Drawer content
  const drawerTitle: Record<string, string> = {
    files: "Files",
    changes: `Draft v${draftVersion} changes`,
    versions: "Versions & checkpoints",
    comments: "Comments",
    build: "Build details",
  };

  const changeSummary = `${modified.length} files modified · Build passed · No new server access`;

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="shrink-0 h-14 border-b border-black bg-white flex items-center px-4 gap-3 z-40">
        <button
          onClick={() => router.push(`/apps/${id}`)}
          className="w-8 h-8 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
        >
          ←
        </button>

        <div className="w-8 h-8 rounded-[10px] border border-black bg-silo-yellow flex items-center justify-center font-display text-sm">
          E
        </div>

        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditingTitle(false);
              if (titleDraft.trim()) setTitle(titleDraft.trim());
              setSaveState("Saving…");
              setTimeout(() => setSaveState("Saved"), 700);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            autoFocus
            className="text-sm font-semibold border-b-2 border-silo-purple outline-none bg-transparent px-1"
          />
        ) : (
          <button
            onClick={() => {
              setEditingTitle(true);
              setTitleDraft(title);
            }}
            className="text-sm font-semibold hover:text-silo-purple transition-colors cursor-pointer bg-transparent border-0 p-0"
          >
            {title}
          </button>
        )}

        <div className="flex items-center gap-1.5">
          <StatusDot status={saveState === "Saved" ? "live" : "building"} size={6} />
          <span className="text-[11px] text-neutral-500">{saveState}</span>
        </div>

        <span className="text-[11px] font-mono text-neutral-400">
          Live v{baseVersion} → Draft v{draftVersion}
        </span>

        <div className="flex-1" />

        {/* Presence avatars */}
        <div className="flex -space-x-1.5 mr-2">
          {PEOPLE.map((p) => (
            <button
              key={p.id}
              onClick={() => setPresence(presence?.id === p.id ? null : p)}
              className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold cursor-pointer"
              style={{ background: p.color }}
              title={p.name}
            >
              {p.initials}
            </button>
          ))}
        </div>

        {unresolved > 0 && (
          <button
            onClick={() => setDrawer("comments")}
            className="rounded-pill border border-black bg-silo-yellow px-2.5 py-1 text-[11px] font-bold cursor-pointer"
          >
            💬 {unresolved}
          </button>
        )}

        <button
          onClick={() => benchToast("Share link copied — Editors can join this Workbench.")}
          className="rounded-pill border border-black bg-white px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-neutral-100"
        >
          Share
        </button>

        <PillButton size="sm" onClick={() => setModal("push")}>
          Push update
        </PillButton>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Tool rail (desktop) */}
        <div className="hidden md:flex">
          <ToolRail
            tools={TOOLS.map((t) => ({
              ...t,
              badge: t.key === "changes" ? changesBadge : undefined,
            }))}
            activeKey={drawer}
            onPick={handleToolPick}
          />
        </div>

        {/* Left drawer */}
        <Drawer
          open={!!drawer && drawer !== "preview"}
          title={drawer ? drawerTitle[drawer] || "" : ""}
          onClose={() => setDrawer(null)}
          side="left"
          width="300px"
          offsetLeft="56px"
        >
          {drawer === "files" && (
            <FileTree
              files={files}
              openFileId={openFileId}
              fileQuery={fileQuery}
              onQueryChange={setFileQuery}
              onPick={setOpenFileId}
              openFile={openFile}
            />
          )}
          {drawer === "changes" && (
            <ChangesList changes={changes} summary={changeSummary} />
          )}
          {drawer === "versions" && (
            <Timeline
              items={timeline}
              onAction={(item) => {
                if (item.action === "Viewing") benchToast("You are already viewing the shared draft.");
                else if (item.action === "Restore") setModal("restore");
                else benchToast(`Opening ${item.title} in a read-only preview.`);
              }}
            />
          )}
          {drawer === "comments" && (
            <CommentsPanel
              threads={threads}
              onToggleResolve={(tid) =>
                setThreads((prev) =>
                  prev.map((t) =>
                    t.id === tid ? { ...t, resolved: !t.resolved } : t
                  )
                )
              }
              onToast={benchToast}
            />
          )}
          {drawer === "build" && (
            <div className="p-3 space-y-3">
              <div className="border border-black rounded-[14px] overflow-hidden">
                {[
                  { label: "Draft build", value: applying ? "Building…" : errorBanner ? "Failed" : "Passed" },
                  { label: "Runtime", value: "Python 3.11" },
                  { label: "Entry point", value: "app.py" },
                  { label: "Port", value: "8000" },
                  { label: "Dependencies", value: "flask, requests, pandas" },
                  { label: "Preview URL", value: `draft-v${draftVersion}.silo.app` },
                ].map((f, i) => (
                  <div key={i} className="flex justify-between gap-3 px-3.5 py-2.5 border-b border-neutral-200 last:border-0 text-[12px]">
                    <span className="text-neutral-500">{f.label}</span>
                    <span className="font-semibold text-right">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Drawer>

        {/* Center preview */}
        <div
          className="flex-1 flex flex-col relative bg-silo-cream overflow-hidden transition-all"
          style={{
            paddingLeft: drawer && drawer !== "preview" ? "300px" : "0px",
            paddingRight: aiOpen ? "0px" : "0px",
          }}
        >
          {/* Viewport switcher */}
          <div className="shrink-0 flex items-center justify-center gap-1 py-2 bg-white border-b border-black">
            {["Desktop", "Tablet", "Mobile", "Fit"].map((label) => {
              const k = label.toLowerCase();
              return (
                <button
                  key={k}
                  onClick={() => setViewport(k)}
                  className={`rounded-pill px-3 py-1 text-[11px] font-bold cursor-pointer border transition-colors ${
                    viewport === k
                      ? "bg-black text-white border-black"
                      : "bg-transparent text-black border-transparent hover:bg-neutral-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Preview area */}
          <div className="flex-1 flex items-center justify-center p-6 relative">
            {/* Environment chip */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <div className="flex items-center gap-2 border border-black rounded-pill bg-white px-3 py-1.5 text-[11px] font-bold tracking-wide">
                <StatusDot
                  status={applying ? "building" : errorBanner ? "failed" : "draft"}
                  size={7}
                />
                {applying
                  ? "BUILDING"
                  : errorBanner
                  ? "PREVIEW FAILED"
                  : `SHARED DRAFT · v${draftVersion}`}
              </div>
            </div>

            {readyChip && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 animate-silo-rise">
                <div className="rounded-pill bg-silo-green px-3 py-1 text-[11px] font-bold border border-black">
                  {readyChip}
                </div>
              </div>
            )}

            {errorBanner && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10">
                <div className="rounded-pill bg-red-100 border border-silo-red px-3 py-1 text-[11px] font-bold text-silo-red">
                  Preview failed — live app is unaffected
                </div>
              </div>
            )}

            {stage === "preparing" ? (
              <div className="text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 mx-auto mb-3" />
                <div className="text-xs text-neutral-500">Preparing workbench…</div>
              </div>
            ) : (
              <div
                className="border border-black rounded-[12px] bg-white shadow-sm overflow-hidden transition-all"
                style={{
                  width: vpWidths[viewport],
                  maxWidth: "100%",
                  height: "100%",
                }}
              >
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                  App preview area
                  <br />
                  <span className="text-[11px]">(iframe will render the running app)</span>
                </div>
              </div>
            )}

            {/* Bottom controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <button
                onClick={() => benchToast("Draft preview reloaded.")}
                className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
              >
                ↻
              </button>
              <button className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm">
                ↗
              </button>
              <button
                onClick={() => benchToast(`Copied draft preview URL`)}
                className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
              >
                📋
              </button>
            </div>
          </div>

          {/* Status strip */}
          <div className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-neutral-900 text-neutral-400 text-[10px] font-mono border-t border-black">
            <span>{saveState === "Saved" ? "Draft saved" : saveState} · {applying ? "Building" : errorBanner ? "Build failed" : "Build passed"}</span>
            <span>{viewport.charAt(0).toUpperCase() + viewport.slice(1)} · Preview {errorBanner ? "degraded" : "online"}</span>
            <span>No new access · Owner</span>
          </div>
        </div>

        {/* AI Panel */}
        <AiPanel
          visible={aiOpen}
          width="min(400px, 46%)"
          messages={messages}
          applying={applying}
          applyStep={applyStep}
          applyEvent={applyEvent}
          getActions={getActions}
          composer={composer}
          onComposerChange={setComposer}
          onSend={() => pushPrompt(composer)}
          onComposerKey={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              pushPrompt(composer);
            }
          }}
          composerFiles={composerFiles}
          onRemoveFile={(i) =>
            setComposerFiles((prev) => prev.filter((_, j) => j !== i))
          }
          onScreenshot={() => {
            setComposerFiles((prev) => [...prev, { name: "preview-shot.png" }]);
            benchToast("Screenshot of the draft preview attached.");
          }}
          onAttach={() => benchToast("File picker would open here.")}
          onMention={() => setComposer((prev) => (prev ? prev + " " : "") + "@Aditi ")}
          sendDisabled={!composer.trim()}
          quickActions={QUICK_ACTIONS.map((label) => ({
            label,
            onPick: () => pushPrompt(label),
          }))}
          onClose={() => setAiOpen(false)}
        />

        {/* AI toggle button (when closed) */}
        {!aiOpen && (
          <button
            onClick={() => setAiOpen(true)}
            className="absolute top-4 right-4 z-30 rounded-pill border border-black bg-silo-lilac px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-silo-purple hover:text-white transition-colors"
          >
            AI Collaborator
          </button>
        )}
      </div>

      {/* Mobile bottom tabs */}
      <div className="md:hidden shrink-0 flex border-t border-black bg-white">
        {["Preview", "AI", "Changes"].map((label) => {
          const k = label.toLowerCase();
          const active =
            k === "preview"
              ? !drawer && !aiOpen
              : k === "ai"
              ? aiOpen
              : drawer === "changes";
          return (
            <button
              key={k}
              onClick={() => {
                if (k === "preview") {
                  setDrawer(null);
                  setAiOpen(false);
                } else if (k === "ai") {
                  setAiOpen(true);
                  setDrawer(null);
                } else {
                  setDrawer("changes");
                  setAiOpen(false);
                }
              }}
              className={`flex-1 py-3 text-xs font-bold cursor-pointer border-0 ${
                active ? "bg-black text-white" : "bg-white text-black"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Presence popover */}
      <PresencePopover
        person={presence}
        onClose={() => setPresence(null)}
      />

      {/* Push Modal */}
      <Modal
        open={modal === "push"}
        title={`PUSH DRAFT AS VERSION ${draftVersion}`}
        headBg="#ffd731"
        onClose={() => setModal(null)}
      >
        <p className="text-[13px] leading-relaxed mb-4">
          Creates version {draftVersion} from the shared draft. The live app keeps
          serving v{baseVersion} until you publish.
        </p>
        <div className="border border-black rounded-[16px] overflow-hidden mb-4">
          {[
            { label: "Build", value: "Passed" },
            { label: "Preview", value: "Healthy" },
            { label: "Files changed", value: `${modified.length} modified` },
            { label: "Checkpoints", value: String(checkpoints) },
            { label: "Capabilities", value: "No new server capabilities" },
          ].map((r, i) => (
            <div key={i} className="flex justify-between gap-3 px-3.5 py-2.5 border-b border-neutral-200 last:border-0 text-[12.5px]">
              <span className="text-neutral-500">{r.label}</span>
              <span className="font-semibold text-right">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <PillButton variant="secondary" onClick={() => setModal(null)}>
            Cancel
          </PillButton>
          <PillButton variant="secondary" onClick={() => {
            setModal(null);
            benchToast(`Saved as version v${draftVersion} — not published yet.`);
          }}>
            Save as version
          </PillButton>
          <PillButton onClick={() => {
            setModal(null);
            benchToast(`Version ${draftVersion} published from the shared draft.`);
          }}>
            Publish now
          </PillButton>
        </div>
      </Modal>

      {/* Restore Modal */}
      <Modal
        open={modal === "restore"}
        title="RESTORE DRAFT"
        headBg="#e9ccff"
        onClose={() => setModal(null)}
      >
        <p className="text-[13px] leading-relaxed mb-4">
          Restore the draft to an earlier checkpoint? This removes later draft
          changes. The live application is unaffected.
        </p>
        <div className="flex gap-2 justify-end">
          <PillButton variant="secondary" onClick={() => setModal(null)}>
            Keep current draft
          </PillButton>
          <PillButton
            variant="danger"
            onClick={() => {
              setModal(null);
              setCheckpoints(Math.max(0, checkpoints - 1));
              setErrorBanner(false);
              setSaveState("Saved");
              benchToast("Draft restored to an earlier checkpoint.");
            }}
          >
            Restore checkpoint
          </PillButton>
        </div>
      </Modal>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
