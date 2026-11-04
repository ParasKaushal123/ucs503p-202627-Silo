"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { post, request } from "@/lib/workspace";
import type { Finding, FlowItem, SecurityNodeDetail, SecurityTrack } from "@/lib/types";
import PillButton from "@/components/ui/PillButton";
import Label from "@/components/ui/Label";
import Toast from "@/components/ui/Toast";
import FlowCanvas from "@/components/security/FlowCanvas";
import Inspector, { type InspectorTab } from "@/components/security/Inspector";
import CapabilityMatrix from "@/components/security/CapabilityMatrix";
import RiskChart from "@/components/security/RiskChart";
import { riskFill } from "@/components/security/tones";

function tabFor(origin: boolean, item?: FlowItem): InspectorTab {
  if (!item) return origin ? "label" : "changes";
  if (item.type === "finding") return "findings";
  if (item.type === "dependency") return origin ? "dependencies" : "changes";
  return origin ? "label" : "changes";
}

export default function SecurityTrackPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [track, setTrack] = useState<SecurityTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SecurityNodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("label");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [ai, setAi] = useState<{ enabled: boolean; provider?: string }>({ enabled: false });
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/");
  }, [authLoading, isAuthenticated, router]);

  const loadTrack = useCallback(async () => {
    try {
      const data = await request<SecurityTrack>(`/apps/${id}/security`);
      setTrack(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyse this app");
    }
  }, [id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadTrack();
    request("/ai/config").then(setAi).catch(() => undefined);
    // New builds appear without a reload; analyses are cached on the server.
    const timer = setInterval(loadTrack, 15000);
    return () => clearInterval(timer);
  }, [isAuthenticated, loadTrack]);

  const buildCount = track?.nodes.length ?? 0;
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    setDetailLoading(true);
    const query = compareId && compareId !== selectedId ? `?compare_to=${compareId}` : "";
    request<SecurityNodeDetail>(`/apps/${id}/security/${selectedId}${query}`)
      .then((d) => { if (active) setDetail(d); })
      .catch((e) => active && setToast(e instanceof Error ? e.message : "Could not load this build"))
      .finally(() => active && setDetailLoading(false));
    return () => { active = false; };
  }, [id, selectedId, compareId, buildCount]);

  const select = useCallback((buildId: string, item?: FlowItem) => {
    if (comparing && selectedId && buildId !== selectedId) {
      setCompareId(buildId);
      setTab("changes");
      return;
    }
    const origin = track?.nodes.find((n) => n.version_id === buildId)?.origin ?? false;
    setSelectedId(buildId);
    setTab(tabFor(origin, item));
    setFocusId(item?.id ?? null);
  }, [comparing, selectedId, track]);

  // ← and → walk the builds; Escape closes the inspector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!track || (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") { setSelectedId(null); setCompareId(null); setComparing(false); return; }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const index = track.nodes.findIndex((n) => n.version_id === selectedId);
      const next = track.nodes[index < 0 ? track.nodes.length - 1 : index + (e.key === "ArrowRight" ? 1 : -1)];
      if (next) { e.preventDefault(); setCompareId(null); setSelectedId(next.version_id); setTab(next.origin ? "label" : "changes"); setFocusId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [track, selectedId]);

  const canFix = track ? ["owner", "editor"].includes(track.role) : false;
  const fixReason = !canFix
    ? "Only editors can request fixes"
    : !ai.enabled
      ? "Add GEMINI_API_KEY on the server to enable AI fixes"
      : undefined;

  async function fix(finding: Finding) {
    if (!selectedId) return;
    setFixing(finding.fingerprint);
    try {
      await post(`/apps/${id}/security/${selectedId}/fix`, { fingerprint: finding.fingerprint });
      setFixed(finding.title);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not request a fix");
    } finally {
      setFixing(null);
    }
  }

  if (authLoading || !isAuthenticated || (!track && !error)) {
    return (
      <div data-theme="dark" className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        <p className="font-mono text-[11px] uppercase text-neutral-500">Analysing every build…</p>
      </div>
    );
  }

  if (!track) {
    return (
      <div data-theme="dark" className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm">{error}</p>
        <PillButton onClick={() => router.push("/dashboard")}>Back to Home</PillButton>
      </div>
    );
  }

  const { summary } = track;
  const openFindings = summary.counts.high + summary.counts.medium + summary.counts.low;
  const stat = "text-onaccent rounded-panel border-[1.5px] border-black px-5 py-3.5";

  return (
    <div data-theme="dark" className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 h-14 border-b border-black bg-white flex items-center px-4 gap-3 z-20">
        <button
          onClick={() => router.push(`/apps/${id}`)}
          aria-label="Back to the App Room"
          className="w-8 h-8 rounded-pill border border-black bg-white flex items-center justify-center cursor-pointer hover:bg-neutral-100 text-sm"
        >
          ←
        </button>
        <div className="w-8 h-8 rounded-[9px] border-[1.5px] border-black bg-silo-green flex items-center justify-center font-display font-bold text-sm">
          {track.app.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold truncate">{track.app.name}</span>
        <Label tone="mint" dot>Security track</Label>
        <span className="hidden lg:inline font-mono text-[11px] uppercase text-neutral-500">{track.engine.label}</span>
        <div className="flex-1" />
        <PillButton variant="secondary" size="sm" onClick={() => router.push(`/apps/${id}`)}>App Room</PillButton>
        <PillButton variant="secondary" size="sm" onClick={() => router.push(`/apps/${id}/workbench`)}>Workbench</PillButton>
      </header>

      <main className="flex-1 overflow-y-auto silo-scroll bg-canvas">
        <div className="mx-auto max-w-[1600px] px-5 py-5 space-y-5">
          {/* Latest build at a glance */}
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4" aria-label="Latest build">
            <div className={`${riskFill(summary.risk)} ${stat}`}>
              <div className="font-mono text-[10px] uppercase">Risk now</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-bold text-[38px] leading-none">{summary.risk}</span>
                <span className="text-[11px]">/ 100 · lower is better</span>
              </div>
            </div>
            <div className={`bg-silo-pink ${stat}`}>
              <div className="font-mono text-[10px] uppercase">Open findings</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-bold text-[38px] leading-none">{openFindings}</span>
                <span className="text-[11px] font-mono">{summary.counts.high}H · {summary.counts.medium}M · {summary.counts.low}L</span>
              </div>
            </div>
            <div className={`bg-silo-lilac ${stat}`}>
              <div className="font-mono text-[10px] uppercase">Can access</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-bold text-[38px] leading-none">{summary.capabilities}</span>
                <span className="text-[11px]">capabilities · {summary.dependencies} deps</span>
              </div>
            </div>
            <div className={`bg-silo-sky ${stat}`}>
              <div className="font-mono text-[10px] uppercase">Builds</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-bold text-[38px] leading-none">{summary.builds}</span>
                <span className="text-[11px]">{summary.expanding} widened access</span>
              </div>
            </div>
          </section>

          {/* The flow, with the selected build beside it */}
          <section className="rounded-panel border-[1.5px] border-black bg-white overflow-hidden flex flex-col h-[min(680px,calc(100vh-200px))] min-h-[480px]" aria-label="Build flow">
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-black">
              <Label>Build flow · {summary.builds} build{summary.builds === 1 ? "" : "s"}</Label>
              <span className="hidden md:flex items-center gap-3 font-mono text-[10px] uppercase text-neutral-500">
                <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-pill bg-silo-yellow" />Expanding</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-pill bg-silo-green" />Reducing</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-pill bg-neutral-400" />No change</span>
              </span>
              <div className="flex-1" />
              <span className="hidden xl:inline font-mono text-[10px] uppercase text-neutral-500">
                Click a node · drag to pan · scroll to zoom · ← → between builds
              </span>
              <button
                onClick={() => { setComparing(!comparing); setCompareId(null); }}
                aria-pressed={comparing}
                disabled={summary.builds < 2}
                className={`rounded-pill border-[1.5px] px-3 py-1.5 text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40 ${
                  comparing ? "bg-silo-yellow border-silo-yellow text-onaccent" : "border-black hover:bg-neutral-100"
                }`}
              >
                {comparing ? (selectedId ? "Comparing · click another build" : "Comparing · pick a build") : "Compare two builds"}
              </button>
            </div>
            <div className="flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 relative bg-canvas">
                {track.nodes.length ? (
                  <FlowCanvas
                    nodes={track.nodes}
                    selectedId={selectedId}
                    compareId={compareId}
                    onSelect={select}
                    inspectorOpen={!!detail}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-4">
                    <p className="text-sm text-neutral-500">No builds yet. Upload a version in the App Room to start the track.</p>
                    <PillButton size="sm" onClick={() => router.push(`/apps/${id}`)}>Open App Room</PillButton>
                  </div>
                )}
                {!selectedId && track.nodes.length > 0 && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-pill bg-black text-white px-4 py-2 text-[12px] font-semibold pointer-events-none">
                    Click a build to open its nutrition label and changes
                  </div>
                )}
              </div>
              {detail && selectedId && (
                <Inspector
                  detail={detail}
                  engine={track.engine.label}
                  tab={tab}
                  onTab={setTab}
                  focusId={focusId}
                  loading={detailLoading}
                  onClose={() => { setSelectedId(null); setCompareId(null); }}
                  onFix={fix}
                  fixing={fixing}
                  fixReason={fixReason}
                />
              )}
            </div>
          </section>

          {fixed && (
            <div role="status" className="rounded-panel border-[1.5px] border-silo-green bg-silo-green/10 px-5 py-3 flex flex-wrap items-center gap-3">
              <span className="text-[13px]">
                <strong>{ai.provider || "AI"} is drafting a fix</strong> for “{fixed}”. It goes into the shared draft for review;
                nothing changes until someone applies it.
              </span>
              <div className="flex-1" />
              <PillButton size="sm" onClick={() => router.push(`/apps/${id}/workbench`)}>Review in Workbench</PillButton>
              <button onClick={() => setFixed(null)} className="text-xs underline">Dismiss</button>
            </div>
          )}

          {/* Across all builds */}
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-panel border-[1.5px] border-black bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <Label>Capability matrix</Label>
                <span className="font-mono text-[10px] uppercase text-neutral-500">{track.capabilities.length} capabilities × {summary.builds} builds</span>
              </div>
              <CapabilityMatrix track={track} selectedId={selectedId} onSelect={(b) => select(b)} />
            </div>
            <div className="rounded-panel border-[1.5px] border-black bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <Label>Risk by build</Label>
                <span className="font-mono text-[10px] uppercase text-neutral-500">Click a bar to open it</span>
              </div>
              <RiskChart nodes={track.nodes} selectedId={selectedId} onSelect={(b) => select(b)} />
            </div>
          </section>
        </div>
      </main>
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
