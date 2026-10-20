"use client";

import { useCallback, useEffect, useState } from "react";
import { post, request, type Draft, type Release, type SourceFiles } from "@/lib/workspace";
import { useCollaboration } from "./useCollaboration";

export type Preview = { url: string; html?: string; source_hash?: string; releaseId?: string; version_id?: string; label: string };

export function useWorkbench(appId: string, enabled: boolean) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [data, setData] = useState<any>({ app: null, meta: null, members: [], comments: [],
    checkpoints: [], releases: [], versions: [], messages: [], proposals: [], activity: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ enabled: boolean; model?: string; provider?: string }>({ enabled: false });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [buildRelease, setBuildRelease] = useState<Release | null>(null);
  const [buildStatus, setBuildStatus] = useState("not-built");
  const [buildLogs, setBuildLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const collab = useCollaboration(draft);

  const refresh = useCallback(async (draftId: string) => {
    const [app, meta, members, comments, checkpoints, releases, versions, messages, proposals, activity] = await Promise.all([
      request(`/apps/${appId}`), request(`/drafts/${draftId}`), request(`/apps/${appId}/members`),
      request(`/drafts/${draftId}/comments`), request(`/drafts/${draftId}/checkpoints`),
      request(`/apps/${appId}/releases`), request(`/apps/${appId}/versions`),
      request(`/drafts/${draftId}/messages`), request(`/drafts/${draftId}/proposals`), request(`/apps/${appId}/activity`),
    ]);
    setData({ app, meta, members, comments, checkpoints, releases, versions, messages, proposals, activity });
  }, [appId]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError(null);
    Promise.all([post<Draft>(`/apps/${appId}/draft`), request(`/ai/config`)])
      .then(async ([d, config]) => {
        if (!active) return;
        setDraft(d); setAi(config); await refresh(d.id);
        try {
          const p = await request(`/apps/${appId}/preview`);
          if (active) { setPreview({ ...p, label: "Current live version" }); setBuildStatus("live"); }
        } catch { /* An undeployed app legitimately has no preview. */ }
      }).catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appId, enabled, refresh]);

  useEffect(() => {
    if (!draft) return;
    const timer = setInterval(() => refresh(draft.id).catch(e => setError(e.message)), 3000);
    return () => clearInterval(timer);
  }, [draft, refresh]);

  const openRelease = useCallback(async (release: Release) => {
    const p = await post(`/releases/${release.id}/ticket`);
    setPreview({ ...p, releaseId: release.id, version_id: release.version_id, label: release.label });
    setBuildStatus(release.kind === "static" ? "ready" : "live");
  }, []);

  useEffect(() => {
    if (!draft || preview || !data.releases.length) return;
    const release = data.releases.find((r: Release) => r.status === "published") || data.releases[0];
    if (release.kind === "static") openRelease(release).catch(e => setError(e.message));
    else if (release.version_id) { setBuildRelease(release); setBuildId(release.version_id); }
  }, [draft, preview, data.releases, openRelease]);

  useEffect(() => {
    if (!buildId || !buildRelease || !draft) return;
    let active = true;
    const load = async () => {
      try {
        const [version, logs] = await Promise.all([request(`/versions/${buildId}`), request(`/versions/${buildId}/logs`)]);
        if (!active) return;
        setBuildStatus(version.status); setBuildLogs(logs);
        if (version.status === "live") {
          await openRelease(buildRelease); setBuildId(null); await refresh(draft.id);
        } else if (version.status === "failed") setBuildId(null);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Build status unavailable"); }
    };
    load(); const timer = setInterval(load, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [buildId, buildRelease, draft, openRelease, refresh]);

  const perform = useCallback(async (action: string, operation: () => Promise<void>) => {
    setBusy(action); setError(null);
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); throw e; }
    finally { setBusy(null); }
  }, []);

  async function snapshot(label: string) {
    if (!draft) throw new Error("Workspace is still loading");
    const current = await request<Draft>(`/drafts/${draft.id}`);
    const release = await post<Release>(`/drafts/${draft.id}/releases`, { label, expected_hash: current.source_hash });
    await refresh(draft.id);
    return release;
  }

  async function buildPreview() {
    if (!draft || collab.status !== "Saved") throw new Error("Wait for the shared draft to be Saved");
    const release = await snapshot(`Draft preview · revision ${collab.revision}`);
    if (release.kind === "static") await openRelease(release);
    else {
      const job = await post(`/releases/${release.id}/build`);
      setBuildRelease(release); setBuildId(job.version_id); setBuildStatus("building"); setBuildLogs([]);
    }
  }

  async function publish() {
    if (!draft || !preview?.releaseId || preview.source_hash !== collab.hash || !["ready", "live"].includes(buildStatus)) {
      throw new Error("Build a preview of the current saved draft before publishing");
    }
    await post(`/releases/${preview.releaseId}/publish`, { expected_approved_version_id: data.app.approved_version_id });
    await refresh(draft.id);
  }

  async function saveCheckpoint(label: string) {
    if (!draft || collab.status !== "Saved") throw new Error("Wait for Saved before checkpointing");
    await post(`/drafts/${draft.id}/checkpoints`, { label, expected_hash: collab.hash }); await refresh(draft.id);
  }

  async function restore(checkpointId: string) {
    if (!draft || collab.status !== "Saved") throw new Error("Save pending changes first");
    await post(`/drafts/${draft.id}/restore`, { checkpoint_id: checkpointId, expected_revision: collab.revision });
    const restored = await request<Draft>(`/drafts/${draft.id}`); setDraft(restored); await refresh(restored.id);
  }

  // Team messages stay messages; only an explicit Ask AI creates a proposal.
  async function sendMessage(text: string, attachments: { id: string; name: string }[], askAi = false) {
    if (!draft) return;
    await post(`/drafts/${draft.id}/messages`, { body: text, attachments: attachments.map(a => a.id) });
    if (askAi && ai.enabled && ["owner", "editor"].includes(collab.role)) {
      await post(`/drafts/${draft.id}/proposals`, { prompt: text.replace(/^@ai\b\s*/i, ""),
        expected_hash: collab.hash, attachments: attachments.map(a => a.id) });
    }
    await refresh(draft.id);
  }

  async function applyProposal(proposalId: string) {
    await collab.command("proposal", { proposalId });
    if (draft) await refresh(draft.id);
    // The proposal changes source only. Preview readiness is reported separately.
    setBuildStatus("not-built");
  }

  async function importSource(file: File) {
    if (!draft || collab.status !== "Saved") throw new Error("Wait for Saved before importing");
    const form = new FormData(); form.append("file", file); form.append("expected_revision", String(collab.revision));
    const next = await request<Draft>(`/drafts/${draft.id}/import`, { method: "POST", body: form });
    setDraft(next); await refresh(next.id); setBuildStatus("not-built");
  }

  const baseline: SourceFiles = data.meta?.base_files || draft?.base_files || {};
  const modified = Object.keys(collab.files).filter(id => !baseline[id] || baseline[id].content !== collab.files[id].content || baseline[id].path !== collab.files[id].path);
  const deleted = Object.keys(baseline).filter(id => !collab.files[id]);
  return { data, draft, collab, loading, error: error || collab.error, setError, ai, preview,
    setPreview, buildStatus, buildLogs, busy, perform, refresh, snapshot, openRelease,
    buildPreview, publish, saveCheckpoint, restore, sendMessage, applyProposal, importSource,
    modified, deleted, baseline };
}
