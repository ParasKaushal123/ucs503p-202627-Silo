"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useWorkbench } from "@/hooks/useWorkbench";
import { API, post, request } from "@/lib/workspace";
import type { BenchMessage, BenchThread, BenchChange, FileNode } from "@/lib/types";
import { QUICK_ACTIONS, appColor } from "@/lib/mockData";
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
import Label from "@/components/ui/Label";
import StatusDot from "@/components/ui/StatusDot";
import Toast from "@/components/ui/Toast";

const CodeEditor = dynamic(() => import("@/components/bench/CodeEditor"), { ssr: false });
type DrawerKey = "files" | "changes" | "versions" | "comments" | "build" | null;
const dateLabel = (value: string) => new Date(value.endsWith("Z") || value.includes("+") ? value : value + "Z").toLocaleString();

export default function Workbench() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const router = useRouter();
  const bench = useWorkbench(id, isAuthenticated);
  const { data, collab } = bench;
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [viewport, setViewport] = useState("desktop");
  const [selection, setSelection] = useState<any>(null);
  const [editingFile, setEditingFile] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [composer, setComposer] = useState("");
  const [composerFiles, setComposerFiles] = useState<{ id: string; name: string }[]>([]);
  const [openFileId, setOpenFileId] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [presence, setPresence] = useState<any>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [restoreTarget, setRestoreTarget] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteUrl, setInviteUrl] = useState("");
  const [review, setReview] = useState<any>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const sourceInput = useRef<HTMLInputElement>(null);
  const title = data.meta?.title || "Shared draft";
  const saveState = collab.status;
  const checkpoints = data.checkpoints.length;
  const baseVersion = data.meta?.base_version_no || 0;
  const latestNo = Math.max(0, ...data.versions.map((v: any) => v.version_no));
  const currentRelease = data.releases.find((r: any) => r.id === bench.preview?.releaseId);
  const draftVersion = currentRelease && bench.preview?.source_hash === collab.hash ? currentRelease.version_no : latestNo + 1;
  const canEdit = ["editor", "owner"].includes(collab.role);
  const canComment = collab.role !== "viewer";
  const applying = bench.busy === "apply";
  const applyStep = 0;
  const applyEvent = applying ? "Saving the reviewed patch to the shared draft" : "";
  const errorBanner = bench.buildStatus === "failed";
  const readyChip = bench.preview && bench.preview.source_hash === collab.hash ? "Preview matches the saved draft" : null;
  const stage = bench.loading ? "preparing" : "preview";
  const modified = [...bench.modified.map(id => collab.files[id]?.path || id), ...bench.deleted.map(id => bench.baseline[id]?.path || id)];
  const changesBadge = modified.length;
  const colors = ["#ffd731", "#e9ccff", "#55db9c", "#4da2ff"];
  const people = collab.people.filter((p, i, all) => all.findIndex(a => a.id === p.id) === i).map((p, i) => ({
    id: p.id, name: p.name, initials: p.name.split(/\s+/).map(n => n[0]).join("").slice(0, 2).toUpperCase(),
    color: colors[i % colors.length], role: p.role, activity: "In this shared workbench", seen: "Online now",
  }));
  const benchToast = useCallback((message: string) => setToast(message), []);
  const act = async (name: string, operation: () => Promise<void>) => {
    try { await bench.perform(name, operation); } catch (e) { benchToast(e instanceof Error ? e.message : "Request failed"); }
  };
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/");
  }, [authLoading, isAuthenticated, router]);
  useEffect(() => {
    if (!collab.files[openFileId]) setOpenFileId(Object.keys(collab.files).find(key => /(?:app|main)\.py$|index\.html$/.test(collab.files[key].path)) || Object.keys(collab.files)[0] || "");
  }, [collab.files, openFileId]);
  const files: FileNode[] = [];
  const folders = new Set<string>();
  Object.entries(collab.files).sort((a, b) => a[1].path.localeCompare(b[1].path)).forEach(([key, file]) => {
    const parts = file.path.split("/");
    parts.slice(0, -1).forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (!folders.has(path)) { folders.add(path); files.push({ id: "folder:" + path, name: part, indent: 12 + i * 12, folder: true }); }
    });
    files.push({ id: key, name: parts[parts.length - 1], indent: 12 + (parts.length - 1) * 12, modified: bench.modified.includes(key) });
  });
  const sourceFile = collab.files[openFileId];
  const openFile = sourceFile ? { name: sourceFile.path, code: sourceFile.content,
    meta: canEdit ? "Shared draft · editable" : "Shared draft · read-only" } : null;
  const messages: BenchMessage[] = [
    ...data.messages.map((m: any) => ({ id: m.id, kind: "human" as const, author: m.actor.name,
      role: m.actor.id === data.app?.owner_id ? "Owner" : "Collaborator", initials: m.actor.name.slice(0, 2).toUpperCase(),
      color: "#ffd731", when: dateLabel(m.created_at), content: m.body,
      attachment: m.attachments.map((a: any) => a.name).join(", "), attachments: m.attachments,
      timestamp: m.created_at })),
    ...data.proposals.map((p: any) => ({ id: p.id, kind: "proposal" as const, author: "Silo", initials: "AI", color: "#4da2ff",
      when: dateLabel(p.created_at), title: p.prompt, content: p.summary || p.error || "Generating a change proposal…",
      status: ({ ready: "proposed", generating: "queued", applied: "applied", rejected: "cancelled", failed: "failed" } as Record<string, string>)[p.status] || "proposed",
      files: p.files || [], timestamp: p.created_at, buildStatus: "not-built" })),
  ].sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
  const threads: BenchThread[] = data.comments.filter((c: any) => !c.parent_id).map((c: any) => ({
    id: c.id, author: c.actor.name, initials: c.actor.name.slice(0, 2).toUpperCase(), color: "#e9ccff", when: dateLabel(c.created_at), body: c.body, resolved: c.resolved,
    file: collab.files[c.file_id]?.path, replies: data.comments.filter((r: any) => r.parent_id === c.id).map((r: any) => ({ id: r.id, author: r.actor.name, body: r.body })),
  }));
  const previewCurrent = !!bench.preview && bench.preview.source_hash === collab.hash;
  const previewHealthy = previewCurrent && ["ready", "live"].includes(bench.buildStatus);
  const changes: BenchChange[] = modified.map((path, i) => ({ id: path, title: path,
    meta: bench.deleted.some(id => bench.baseline[id]?.path === path) ? "Deleted in this draft" : "Modified in this shared draft",
    build: previewHealthy ? "Current snapshot preview ready" : "Changes saved · build preview to verify", dot: previewHealthy ? "#16a34a" : "#d97706" }));
  const timeline = [
    ...data.releases.map((r: any) => ({ id: "release:" + r.id, title: `v${r.version_no || "?"} · ${r.label}`, meta: `${r.status} · ${dateLabel(r.created_at)}`, swatch: r.status === "published" ? "#55db9c" : "#dceeff", action: "Preview" })),
    { id: "draft", title: `Shared Draft v${draftVersion}`, meta: `${title} · ${checkpoints} checkpoints`, swatch: "#ffd731", action: "Viewing" },
    ...data.checkpoints.map((c: any) => ({ id: "cp:" + c.id, title: c.label, meta: `${c.actor.name} · ${dateLabel(c.created_at)}`, swatch: "#e9ccff", action: "Restore" })),
  ];
  const handleToolPick = (key: string) => {
    if (key === "preview") { setDrawer(null); setEditingFile(false); }
    else { setDrawer(drawer === key ? null : key as DrawerKey); if (key === "files") setEditingFile(true); }
  };
  const pushPrompt = (text: string, askAi = /^@ai\b/i.test(text.trim())) => {
    if (!text.trim()) return;
    act("message", async () => {
      await bench.sendMessage(text.trim(), composerFiles, askAi); setComposer(""); setComposerFiles([]);
      if (askAi && !bench.ai.enabled) benchToast("Message saved. Add GEMINI_API_KEY on the server to generate code changes.");
      else if (askAi) benchToast(`${bench.ai.provider || "AI"} is drafting a change for review.`);
    });
  };
  const getActions = (msg: BenchMessage) => {
    if (msg.status === "proposed") return [
      { label: "Apply to draft", bg: "#000", fg: "#fff", disabled: !canEdit || saveState !== "Saved" || !!bench.busy,
        onPick: () => act("review", async () => { setReview(await request(`/proposals/${msg.id}`)); setModal("review"); }) },
      { label: "Edit", bg: "#fff", fg: "#000", onPick: () => setComposer(`Revise: ${msg.title}`) },
      { label: "Cancel", bg: "#fff", fg: "#000", disabled: !canEdit, onPick: () => act("reject", async () => { await post(`/proposals/${msg.id}/reject`); await bench.refresh(bench.draft!.id); }) },
    ];
    if (msg.status === "applied") return [
      { label: "View changes", bg: "#000", fg: "#fff", onPick: () => setDrawer("changes") },
      { label: "Test preview", bg: "#fff", fg: "#000", disabled: !canEdit || saveState !== "Saved", onPick: () => act("preview", async () => { await bench.buildPreview(); setEditingFile(false); }) },
    ];
    if (["failed", "cancelled"].includes(msg.status || "")) return [{ label: "Re-propose", bg: "#fff", fg: "#000", disabled: !canEdit || !bench.ai.enabled,
      onPick: () => act("regenerate", async () => { await post(`/proposals/${msg.id}/regenerate`); await bench.refresh(bench.draft!.id); }) }];
    return [];
  };
  const vpWidths: Record<string, string> = { desktop: "100%", tablet: "834px", mobile: "390px", fit: "100%" };
  const unresolved = threads.filter(t => !t.resolved).length;
  const drawerTitle: Record<string, string> = { files: "Files", changes: `Draft v${draftVersion} changes`, versions: "Versions & checkpoints", comments: "Comments", build: "Build details" };
  const changeSummary = `${modified.length} files modified · ${previewHealthy ? "Preview ready" : "Unbuilt changes"}`;
  const exportRecovery = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ draft_id: bench.draft?.id, generation: bench.draft?.generation, files: collab.files }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "silo-unsaved-recovery.json"; a.click(); URL.revokeObjectURL(url); };
  const downloadFile = () => { if (!sourceFile) return; const url = URL.createObjectURL(new Blob([sourceFile.content], { type: "text/plain" })); const a = document.createElement("a"); a.href = url; a.download = sourceFile.path.split("/").pop()!; a.click(); URL.revokeObjectURL(url); };
  const attach = async (file: File) => { if (!bench.draft) return; const form = new FormData(); form.append("file", file); const a = await request(`/drafts/${bench.draft.id}/attachments`, { method: "POST", body: form }); setComposerFiles(prev => [...prev, { id: a.id, name: a.name }]); };
  if (authLoading || !isAuthenticated || bench.loading) return <div data-theme="dark" className="min-h-screen flex items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" /></div>;
  if (!data.app || !bench.draft) return <div data-theme="dark" className="min-h-screen flex flex-col items-center justify-center gap-4"><p>{bench.error || "Workspace could not be loaded"}</p><PillButton onClick={() => router.push("/dashboard")}>Back to Home</PillButton></div>;
  return (
    <div data-theme="dark" className="h-screen flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="shrink-0 h-14 border-b border-black bg-white flex items-center px-4 gap-3 z-40">
        <button
          onClick={() => router.push(`/apps/${id}`)}
          className="w-8 h-8 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
        >
          ←
        </button>

        <div className="w-8 h-8 rounded-[9px] border-[1.5px] border-black bg-silo-green flex items-center justify-center font-display font-bold text-sm">
          {data.app.name.charAt(0).toUpperCase()}
        </div>

        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditingTitle(false);
              if (titleDraft.trim()) act("title", async () => {
                await request(`/drafts/${bench.draft!.id}`, { method: "PATCH", body: JSON.stringify({ title: titleDraft.trim() }) });
                await bench.refresh(bench.draft!.id);
              });
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

        <Label dot tone={saveState === "Saved" ? "mint" : saveState === "Saving" ? "peach" : "danger"}>{saveState}</Label>

        <span className="hidden md:inline font-mono text-[11px] uppercase text-neutral-500">
          Live v{baseVersion} <span className="text-neutral-400">→</span> Draft v{draftVersion}
        </span>

        <div className="flex-1" />

        {/* Presence avatars */}
        <div className="flex -space-x-1.5 mr-2">
          {people.map((p) => (
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
          onClick={() => router.push(`/apps/${id}/security`)}
          className="rounded-pill border border-black bg-white px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-neutral-100"
        >
          Security
        </button>

        <button
          onClick={() => setModal("share")}
          className="rounded-pill border border-black bg-white px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-neutral-100"
        >
          Share
        </button>

        <PillButton size="sm" disabled={!canEdit || saveState !== "Saved" || !!bench.busy} onClick={() => setModal("push")}>
          Push update
        </PillButton>
      </header>

      {bench.error && <div role="alert" className="shrink-0 border-b border-black bg-red-100 px-4 py-2 text-xs flex items-center justify-between"><span>{bench.error}</span><button className="underline ml-auto" onClick={exportRecovery}>Export recovery</button><button className="underline ml-3" onClick={() => window.location.reload()}>Reconnect workspace</button></div>}
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
          open={!!drawer}
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
              onPick={(key) => { setOpenFileId(key); setEditingFile(true); }}
              openFile={openFile}
              canEdit={canEdit && saveState === "Saved"}
              onCreate={() => { setEntry(""); setModal("new-file"); }}
              onRename={() => { setEntry(sourceFile?.path || ""); setModal("rename-file"); }}
              onDelete={() => setModal("delete-file")}
              onDownload={downloadFile}
              onImport={() => sourceInput.current?.click()}
              onExport={() => window.open(`${API}/drafts/${bench.draft!.id}/export`, "_blank")}
              onCheckpoint={() => { setEntry(""); setModal("checkpoint"); }}
            />
          )}
          {drawer === "changes" && (
            <ChangesList changes={changes} summary={changeSummary} />
          )}
          {drawer === "versions" && (
            <Timeline
              items={timeline}
              onAction={(item) => {
                if (item.action === "Restore") { setRestoreTarget(item.id.slice(3)); setModal("restore"); }
                else if (item.action === "Preview") {
                  const release = data.releases.find((r: any) => r.id === item.id.slice(8));
                  if (release) act("preview", async () => { await bench.openRelease(release); setEditingFile(false); });
                } else { setDrawer(null); setEditingFile(false); }
              }}
            />
          )}
          {drawer === "comments" && (
            <CommentsPanel
              threads={threads}
              onToggleResolve={(tid) => act("comment", async () => {
                await post(`/comments/${tid}/resolve`); await bench.refresh(bench.draft!.id);
              })}
              canComment={canComment}
              fileName={sourceFile?.path}
              onCreate={async (body, parentId) => {
                await post(`/drafts/${bench.draft!.id}/comments`, { body, parent_id: parentId || null,
                  file_id: parentId ? null : openFileId, anchor: !parentId && selection?.file_id === openFileId ? { ...selection, generation: bench.draft!.generation } : null });
                await bench.refresh(bench.draft!.id);
              }}
              onToast={benchToast}
            />
          )}
          {drawer === "build" && (
            <div className="p-3 space-y-3">
              <div className="border border-black rounded-[14px] overflow-hidden">
                {[
                  { label: "Draft build", value: bench.buildStatus },
                  { label: "Runtime", value: Object.values(collab.files).some(f => f.path.endsWith(".py")) ? "Python · see build logs" : "Static source" },
                  { label: "Entry point", value: bench.buildLogs.find((l: any) => l.message.startsWith("Entry point:"))?.message || "Detected during build" },
                  { label: "Port", value: data.versions.find((v: any) => v.id === bench.preview?.version_id)?.internal_port || "—" },
                  { label: "Dependencies", value: "See dependency phase in build logs" },
                  { label: "Preview URL", value: bench.preview?.url.split("?")[0] || "Not built yet" },
                ].map((f, i) => (
                  <div key={i} className="flex justify-between gap-3 px-3.5 py-2.5 border-b border-neutral-200 last:border-0 text-[12px]">
                    <span className="text-neutral-500">{f.label}</span>
                    <span className="font-semibold text-right">{f.value}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-[14px] border border-black bg-neutral-50 p-3 text-xs font-mono text-neutral-800 space-y-2">
                {bench.buildLogs.length ? bench.buildLogs.map((log: any) => <div key={log.id} className={log.level === "error" ? "text-orange-300" : ""}><span className="text-neutral-500">[{log.phase}] </span><span className="whitespace-pre-wrap break-words">{log.message}</span></div>) : <p>No build logs yet. Build a preview to see actual output.</p>}
              </div>
            </div>
          )}
        </Drawer>

        {/* Center preview */}
        <div
          className="flex-1 flex flex-col relative bg-silo-cream overflow-hidden transition-all"
          style={{
            paddingLeft: drawer ? "300px" : "0px",
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
            <PillButton size="sm" variant="secondary" onClick={() => { setEditingFile(!editingFile); if (!drawer) setDrawer("files"); }}>{editingFile ? "App preview" : "Edit files"}</PillButton>
            <PillButton size="sm" disabled={!canEdit || saveState !== "Saved" || !!bench.busy || bench.buildStatus === "building"} onClick={() => act("preview", async () => { await bench.buildPreview(); setEditingFile(false); })}>{bench.buildStatus === "building" ? "Building…" : "Build preview"}</PillButton>
          </div>

          {/* Preview area */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 relative">
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
                className="border-[1.5px] border-black rounded-panel bg-white overflow-hidden transition-all"
                style={{
                  width: vpWidths[viewport],
                  maxWidth: "100%",
                  height: "100%",
                }}
              >
                {editingFile && sourceFile && collab.doc && collab.awareness ? (
                  <div className="h-full flex flex-col" data-testid="original-code-pane">
                    <div className="shrink-0 px-3 py-2 border-b border-black bg-silo-lilac flex items-center justify-between text-xs"><span className="font-mono">{sourceFile.path}</span><span>{collab.editable ? "Editing together" : "Read only"}</span></div>
                    <div className="flex-1 min-h-0"><CodeEditor doc={collab.doc} awareness={collab.awareness} fileId={openFileId} path={sourceFile.path} editable={collab.editable} onSelection={setSelection} /></div>
                  </div>
                ) : bench.preview ? (
                  <iframe key={`${bench.preview.url}:${previewKey}`} title="Shared draft preview" srcDoc={bench.preview.html || undefined} src={bench.preview.html ? undefined : bench.preview.url} sandbox={bench.preview.html ? "allow-scripts" : "allow-scripts allow-forms allow-same-origin"} className="w-full h-full border-0" />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-sm gap-3 p-6 text-center">
                    <div className="font-display text-2xl text-black">{data.app.name}</div>
                    <p>Your app preview appears here after a successful build.</p>
                    <PillButton size="sm" disabled={!canEdit || saveState !== "Saved" || !!bench.busy} onClick={() => act("preview", bench.buildPreview)}>Build preview</PillButton>
                    <button className="text-xs underline" onClick={() => sourceInput.current?.click()}>Upload source files</button>
                  </div>
                )}
              </div>
            )}

            {/* Bottom controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <button
                onClick={() => { setPreviewKey(k => k + 1); setEditingFile(false); }} title="Reload preview"
                className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
              >
                ↻
              </button>
              <button title="Open preview" onClick={() => bench.preview && window.open(bench.preview.url, "_blank", "noopener")} disabled={!bench.preview} className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm">
                ↗
              </button>
              <button
                onClick={() => act("copy", async () => { if (!bench.preview) throw new Error("Build a preview first"); await navigator.clipboard.writeText(bench.preview.url); benchToast("Copied the actual preview URL"); })} title="Copy preview URL"
                className="w-9 h-9 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
              >
                📋
              </button>
            </div>
          </div>

          {/* Status strip */}
          <div className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-canvas text-neutral-400 text-[10px] font-mono border-t border-black">
            <span>{saveState === "Saved" ? "Draft saved" : saveState} · {bench.buildStatus}</span>
            <span>{viewport.charAt(0).toUpperCase() + viewport.slice(1)} · Preview {bench.preview ? previewCurrent ? "current" : "older snapshot" : "not built"}</span>
            <span>Capabilities unverified · {collab.role}</span>
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
          onScreenshot={() => { if (attachmentInput.current) { attachmentInput.current.accept = "image/png,image/jpeg,image/webp"; attachmentInput.current.click(); } }}
          onAttach={() => { if (attachmentInput.current) { attachmentInput.current.accept = "image/*,.txt,.md,.py,.js,.ts,.json,.css,.html"; attachmentInput.current.click(); } }}
          onMention={() => { const other = data.members.find((m: any) => m.id !== (user?.authenticated ? user.id : "")); if (other) setComposer(prev => prev + ` @${other.name} `); else benchToast("Invite a collaborator using Share first"); }}
          sendDisabled={!composer.trim() || !canComment || !!bench.busy}
          onAskAi={() => pushPrompt(composer, true)}
          askDisabled={!composer.trim() || !canEdit || !bench.ai.enabled || saveState !== "Saved" || !!bench.busy}
          askLabel={`Ask ${bench.ai.provider || "AI"}`}
          askTitle={bench.ai.enabled ? `Ask ${bench.ai.provider} (${bench.ai.model}) for a reviewable change` : "Add GEMINI_API_KEY on the server to enable AI changes"}
          notice={!bench.ai.enabled ? "Conversation is shared and saved. Add GEMINI_API_KEY on the server to let AI propose changes." : `${bench.ai.provider} · ${bench.ai.model} · Send messages the team, Ask ${bench.ai.provider} drafts a change`}

          quickActions={QUICK_ACTIONS.map((label) => ({
            label,
            onPick: () => pushPrompt(label, bench.ai.enabled && canEdit),
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
        {["Preview", "AI", "Files", "Changes", "Comments"].map((label) => {
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
                  setDrawer(k as DrawerKey);
                  if (k === "files") setEditingFile(true);
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
            { label: "Build", value: bench.buildStatus },
            { label: "Preview", value: previewHealthy ? "Ready for this snapshot" : "Build the current draft first" },
            { label: "Files changed", value: `${modified.length} modified` },
            { label: "Checkpoints", value: String(checkpoints) },
            { label: "Capabilities", value: "Advisory source scan · review required" },
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
          <PillButton variant="secondary" disabled={!canEdit || saveState !== "Saved" || !!bench.busy} onClick={() => act("snapshot", async () => {
            const release = await bench.snapshot(`Version v${draftVersion}`); setModal(null); benchToast(`Saved v${release.version_no} — not published`);
          })}>Save as version</PillButton>
          <PillButton disabled={!canEdit || !previewHealthy || !!bench.busy || saveState !== "Saved"} onClick={() => act("publish", async () => {
            await bench.publish(); setModal(null); benchToast("Published the reviewed snapshot. New draft edits remain separate.");
          })}>Publish now</PillButton>
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
            disabled={!canEdit || saveState !== "Saved" || !!bench.busy}
            onClick={() => act("restore", async () => { await bench.restore(restoreTarget); setModal(null); benchToast("Checkpoint restored; current source was saved as a recovery checkpoint."); })}
          >
            Restore checkpoint
          </PillButton>
        </div>
      </Modal>

      <input ref={attachmentInput} hidden type="file" onChange={e => { const file = e.target.files?.[0]; if (file) act("attachment", async () => { await attach(file); benchToast("Attachment uploaded to this shared conversation"); }); e.target.value = ""; }} />
      <input ref={sourceInput} hidden type="file" accept=".zip,.py,.html,.js,.css" onChange={e => { const file = e.target.files?.[0]; if (file) act("import", async () => { await bench.importSource(file); benchToast("Source imported. A recovery checkpoint was saved."); }); e.target.value = ""; }} />
      <Modal open={modal === "share"} title="SHARE WORKBENCH" headBg="#e9ccff" onClose={() => setModal(null)}>
        <div className="flex gap-2 mb-4"><PillButton size="sm" variant="secondary" onClick={() => window.open(`/apps/${id}/live`, "_blank")}>Open live app</PillButton>{canEdit && <PillButton size="sm" variant="secondary" disabled={saveState !== "Saved" || !!bench.busy} onClick={() => act("fork", async () => { const fork = await post(`/apps/${id}/fork`); router.push(`/apps/${fork.id}/workbench`); })}>Fork app</PillButton>}</div>
        <p className="text-[13px] mb-4">Share {data.app.name} with your team. Permissions apply to saved files, comments, and live editing.</p>
        <div className="space-y-3 mb-5">{data.members.map((member: any) => <div key={member.id} className="flex items-center gap-3 border border-black rounded-[14px] p-3"><span className="w-8 h-8 rounded-full border border-black bg-silo-yellow flex items-center justify-center text-xs font-bold">{member.name[0]}</span><div className="flex-1 min-w-0"><div className="text-xs font-semibold">{member.name}</div><div className="text-[11px] text-neutral-500 truncate">{member.email}</div></div>{collab.role === "owner" && member.role !== "owner" ? <><select aria-label={`Role for ${member.name}`} className="rounded-pill border border-black px-2 py-1 text-xs" value={member.role} onChange={e => { const role = e.target.value; act("role", async () => { await request(`/apps/${id}/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) }); await bench.refresh(bench.draft!.id); }); }}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option></select><button aria-label={`Remove ${member.name}`} onClick={() => act("revoke", async () => { await request(`/apps/${id}/members/${member.id}`, { method: "DELETE" }); await bench.refresh(bench.draft!.id); })} className="w-6 h-6 border border-black rounded-full">×</button></> : <span className="text-xs capitalize">{member.role}</span>}</div>)}</div>
        {collab.role === "owner" && <><div className="flex gap-2"><select aria-label="Invite role" value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="rounded-pill border border-black px-3 py-2 text-xs"><option value="editor">Can edit</option><option value="commenter">Can comment</option><option value="viewer">Can view</option></select><PillButton size="sm" disabled={!!bench.busy} onClick={() => act("invite", async () => { const invite = await post(`/apps/${id}/invites`, { role: inviteRole }); setInviteUrl(invite.url); await navigator.clipboard.writeText(invite.url); benchToast("Invitation copied. It expires in 48 hours."); })}>Copy invitation link</PillButton></div>{inviteUrl && <input className="w-full rounded-pill border border-black px-3 py-2 text-xs mt-3" aria-label="Invitation link" readOnly value={inviteUrl} onFocus={e => e.target.select()} />}<div className="mt-4"><button className="underline text-xs" onClick={() => act("invites", async () => { await request(`/apps/${id}/invites`, { method: "DELETE" }); setInviteUrl(""); benchToast("Invitation links revoked. Existing memberships are unchanged."); })}>Revoke invitation links</button></div></>}
      </Modal>
      <Modal open={["new-file", "rename-file", "checkpoint"].includes(modal || "")} title={modal === "checkpoint" ? "SAVE CHECKPOINT" : modal === "rename-file" ? "RENAME FILE" : "NEW FILE"} headBg="#dceeff" onClose={() => setModal(null)}>
        <form onSubmit={e => { e.preventDefault(); act("file", async () => { if (modal === "checkpoint") await bench.saveCheckpoint(entry); else await collab.command(modal === "new-file" ? "create" : "rename", { path: entry, fileId: openFileId }); setModal(null); }); }}><label className="block text-xs font-bold mb-2">{modal === "checkpoint" ? "Checkpoint name" : "File path"}<input autoFocus required value={entry} onChange={e => setEntry(e.target.value)} className="w-full mt-2 rounded-pill border border-black px-4 py-2.5 text-sm outline-none" placeholder={modal === "checkpoint" ? "Before the next change" : "app/main.py"} /></label><div className="flex justify-end gap-2 mt-5"><PillButton variant="secondary" type="button" onClick={() => setModal(null)}>Cancel</PillButton><PillButton disabled={!!bench.busy || saveState !== "Saved"}>Save {modal === "checkpoint" ? "checkpoint" : "file"}</PillButton></div></form>
      </Modal>
      <Modal open={modal === "delete-file"} title="DELETE FILE" headBg="#ffd731" onClose={() => setModal(null)}><p className="text-sm mb-5">Delete {sourceFile?.path} from the shared draft? Save a checkpoint first if you may need it again.</p><div className="flex justify-end gap-2"><PillButton variant="secondary" onClick={() => setModal(null)}>Keep file</PillButton><PillButton variant="danger" disabled={!canEdit || Object.keys(collab.files).length <= 1 || !!bench.busy} onClick={() => act("file", async () => { await collab.command("delete", { fileId: openFileId }); setModal(null); })}>Delete file</PillButton></div></Modal>
      <Modal open={modal === "review" && !!review} title="REVIEW CHANGE" headBg="#dceeff" onClose={() => setModal(null)}>{review && <><p className="text-sm mb-4">{review.summary}</p>{review.stale && <p role="alert" className="text-xs border border-black bg-silo-yellow rounded-[12px] p-3 mb-3">The draft changed after this proposal was generated. Regenerate it before applying.</p>}<div className="max-h-[45vh] overflow-auto border border-black rounded-[14px]">{review.diffs.map((file: any) => <div key={file.path}><div className="bg-silo-cream p-3 text-xs font-bold border-b border-black">{file.path}</div><pre className="bg-neutral-50 text-neutral-800 font-mono p-3 text-[11px] whitespace-pre-wrap break-words">{file.diff}</pre></div>)}</div><div className="flex justify-end gap-2 mt-5"><PillButton variant="secondary" onClick={() => setModal(null)}>Cancel</PillButton><PillButton disabled={review.stale || review.status !== "ready" || !canEdit || saveState !== "Saved" || !!bench.busy} onClick={() => act("apply", async () => { await bench.applyProposal(review.id); setModal(null); await bench.buildPreview(); setEditingFile(false); benchToast("Change saved to the draft. Preview status comes from the actual build."); })}>Apply reviewed change</PillButton></div></>}</Modal>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
