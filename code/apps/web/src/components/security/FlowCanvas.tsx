"use client";

import { memo, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyRound, Package, ShieldAlert, ShieldCheck } from "lucide-react";
import type { FlowItem, SecurityNode } from "@/lib/types";
import { CLASSIFICATION, SEVERITY_FILL, riskStroke } from "./tones";

const BUILD_GAP = 660;
const ITEM_TOP = 230;
const ITEM_GAP = 66;
const COLUMN_GAP = 285;
const MAX_PER_COLUMN = 5;
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };

// Edge and minimap colours come from the theme variables (globals.css).
const EDGE_COLOR: Record<string, string> = {
  expanding: "rgb(var(--peach))",
  reducing: "rgb(var(--mint))",
  neutral: "rgb(var(--neutral-400))",
  origin: "rgb(var(--mint))",
};
const ITEM_COLOR: Record<string, string> = {
  high: "rgb(var(--danger))",
  medium: "rgb(var(--peach))",
  low: "rgb(var(--sky))",
  info: "rgb(var(--neutral-400))",
  fixed: "rgb(var(--mint))",
  dependency: "rgb(var(--lilac))",
};
const ITEM_ICON: Record<FlowItem["type"], typeof ShieldAlert> = {
  access: KeyRound,
  finding: ShieldAlert,
  fixed: ShieldCheck,
  dependency: Package,
};

const ITEM_WORD: Record<FlowItem["type"], string> = {
  access: "Access",
  finding: "Finding",
  fixed: "Fixed",
  dependency: "Dependency",
};

type BuildData = { node: SecurityNode; selected: boolean; compared: boolean };
type ItemData = { item: FlowItem; buildId: string; more?: number; origin: boolean };

function when(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Risk as a ring: 0 to 100, filled clockwise. */
function RiskRing({ risk }: { risk: number }) {
  const r = 22;
  const length = 2 * Math.PI * r;
  return (
    <div className="relative w-14 h-14 shrink-0" title="Risk score, 0 to 100, lower is better">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-neutral-200" />
        <circle
          cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(Math.max(2, risk) / 100) * length} ${length}`}
          className={riskStroke(risk)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-[17px]">{risk}</span>
    </div>
  );
}

const BuildNode = memo(function BuildNode({ data }: NodeProps<Node<BuildData>>) {
  const { node, selected, compared } = data;
  const total = node.counts.high + node.counts.medium + node.counts.low;
  return (
    <div
      className={`w-[300px] rounded-[20px] border-[1.5px] p-4 transition-shadow cursor-pointer ${
        node.origin ? "bg-silo-green border-silo-green" : "bg-white border-black"
      } ${selected ? "shadow-[0_0_0_3px_rgb(var(--mint)),0_10px_30px_rgb(0_0_0/0.5)]" : "hover:shadow-[0_0_0_2px_rgb(var(--neutral-400))]"} ${
        compared ? "outline outline-2 outline-dashed outline-silo-yellow outline-offset-4" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-silo-green !border-0 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-silo-green !border-0 !w-2.5 !h-2.5" />
      <Handle id="items" type="source" position={Position.Bottom} className="!bg-neutral-400 !border-0 !w-2 !h-2" />
      <div className="flex items-start gap-3">
        <RiskRing risk={node.risk} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase">
            <span className={node.origin ? "" : "text-neutral-500"}>v{node.version_no} · {node.origin ? "Origin" : node.kind}</span>
            {node.published && <span className="rounded-pill bg-black text-white px-1.5 py-0.5">Live</span>}
            {compared && <span className="rounded-pill bg-silo-yellow text-onaccent px-1.5 py-0.5">Compare</span>}
          </div>
          <div className="mt-1 text-[15px] font-semibold leading-snug truncate" title={node.label}>{node.label}</div>
          <div className={`text-[11px] truncate ${node.origin ? "" : "text-neutral-500"}`}>{node.actor.name} · {when(node.created_at)}</div>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-pill overflow-hidden flex bg-neutral-100" aria-label={`${total} findings`}>
        {(["high", "medium", "low"] as const).map((s) =>
          node.counts[s] ? <span key={s} className={SEVERITY_FILL[s]} style={{ flex: node.counts[s] }} /> : null,
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px] uppercase">
        <span><strong className="text-[13px]">{total}</strong> findings</span>
        <span><strong className="text-[13px]">{node.capabilities}</strong> access</span>
        <span><strong className="text-[13px]">{node.dependencies}</strong> deps</span>
      </div>
      {!node.source_available && <div className="mt-2 font-mono text-[10px] text-silo-yellow">Source not available</div>}
    </div>
  );
});

const ItemNode = memo(function ItemNode({ data }: NodeProps<Node<ItemData>>) {
  const { item, more } = data;
  const Icon = ITEM_ICON[item.type];
  const color = item.type === "access" ? ITEM_COLOR[item.tone === "high" ? "high" : item.tone === "medium" ? "medium" : "low"]
    : item.type === "dependency" ? ITEM_COLOR.dependency : ITEM_COLOR[item.tone] || ITEM_COLOR.info;
  return (
    <div
      className="w-[260px] rounded-[14px] border-[1.5px] bg-neutral-50 px-3 py-2 cursor-pointer hover:bg-neutral-100 transition-colors"
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      {more ? (
        <div className="font-mono text-[11px] uppercase text-neutral-500 py-0.5">+{more} more · open the build</div>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 shrink-0 rounded-[8px] flex items-center justify-center text-onaccent" style={{ background: color }}>
            <Icon size={15} strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase text-neutral-500">
              {data.origin ? "Can" : item.type === "fixed" ? "Fixed" : "+ New"} {ITEM_WORD[item.type].toLowerCase()}
              {item.type === "finding" && ` · ${item.tone}`}
            </div>
            <div className={`text-[12.5px] font-semibold truncate ${item.type === "fixed" ? "line-through text-neutral-500" : ""}`} title={item.title}>
              {item.title}
            </div>
            {item.detail && <div className="font-mono text-[10px] text-neutral-500 truncate">{item.detail}</div>}
          </div>
        </div>
      )}
    </div>
  );
});

const nodeTypes = { build: BuildNode, item: ItemNode };

interface Props {
  nodes: SecurityNode[];
  selectedId: string | null;
  compareId: string | null;
  onSelect: (buildId: string, item?: FlowItem) => void;
  inspectorOpen: boolean;
}

function Graph({ nodes, selectedId, compareId, onSelect, inspectorOpen }: Props) {
  const flow = useReactFlow();
  const { graphNodes, graphEdges } = useMemo(() => {
    const graphNodes: Node[] = [];
    const graphEdges: Edge[] = [];
    nodes.forEach((build, index) => {
      const x = index * BUILD_GAP;
      graphNodes.push({
        id: build.version_id,
        type: "build",
        position: { x: x + 120, y: 0 },
        data: { node: build, selected: build.version_id === selectedId, compared: build.version_id === compareId },
      });
      // Two columns under each build: findings (worst first), then what it can reach.
      const risks = build.items
        .filter((i) => i.type === "finding" || i.type === "fixed")
        .sort((a, b) => (a.type === "fixed" ? 9 : SEVERITY_RANK[a.tone] ?? 5) - (b.type === "fixed" ? 9 : SEVERITY_RANK[b.tone] ?? 5));
      const reach = build.items.filter((i) => i.type === "access" || i.type === "dependency");
      [risks, reach].filter((column) => column.length).forEach((column, c) => {
        const cx = x + c * COLUMN_GAP;
        column.slice(0, MAX_PER_COLUMN).forEach((item, k) => {
          const id = `${build.version_id}:${item.id}`;
          graphNodes.push({
            id, type: "item", position: { x: cx, y: ITEM_TOP + k * ITEM_GAP },
            data: { item, buildId: build.version_id, origin: build.origin },
          });
          graphEdges.push({
            id: `e-${id}`, source: build.version_id, sourceHandle: "items", target: id, type: "smoothstep",
            style: { stroke: "rgb(var(--neutral-300))", strokeWidth: 1.5 },
          });
        });
        if (column.length > MAX_PER_COLUMN) {
          const id = `${build.version_id}:more-${c}`;
          graphNodes.push({
            id, type: "item", position: { x: cx, y: ITEM_TOP + MAX_PER_COLUMN * ITEM_GAP },
            data: { item: column[MAX_PER_COLUMN], buildId: build.version_id, more: column.length - MAX_PER_COLUMN, origin: build.origin },
          });
          graphEdges.push({
            id: `e-${id}`, source: build.version_id, sourceHandle: "items", target: id, type: "smoothstep",
            style: { stroke: "rgb(var(--neutral-300))", strokeWidth: 1.5, strokeDasharray: "4 4" },
          });
        }
      });
      if (index > 0) {
        const tone = CLASSIFICATION[build.classification];
        const delta = build.risk - nodes[index - 1].risk;
        graphEdges.push({
          id: `e-${nodes[index - 1].version_id}-${build.version_id}`,
          source: nodes[index - 1].version_id,
          target: build.version_id,
          animated: build.classification === "expanding",
          label: `${tone.word.toUpperCase()}${delta ? ` · RISK ${delta > 0 ? "+" : ""}${delta}` : ""}`,
          labelStyle: { fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, fill: "rgb(var(--on-accent))" },
          labelBgStyle: { fill: EDGE_COLOR[build.classification] },
          labelBgPadding: [8, 5],
          labelBgBorderRadius: 999,
          style: { stroke: EDGE_COLOR[build.classification], strokeWidth: 3 },
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[build.classification] },
        });
      }
    });
    return { graphNodes, graphEdges };
  }, [nodes, selectedId, compareId]);

  // Re-frame when builds arrive or the inspector opens beside the canvas.
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.18, duration: 400, maxZoom: 1 }), 60);
    return () => clearTimeout(t);
  }, [flow, nodes.length, inspectorOpen]);

  return (
    <ReactFlow
      nodes={graphNodes}
      edges={graphEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => {
        if (node.type === "build") onSelect(node.id);
        else {
          const data = node.data as ItemData;
          onSelect(data.buildId, data.more ? undefined : data.item);
        }
      }}
      nodesConnectable={false}
      minZoom={0.25}
      maxZoom={1.6}
      fitView
      proOptions={{ hideAttribution: true }}
      className="silo-flow"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="rgb(var(--neutral-300))" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

/** The build history as a pannable, zoomable graph: builds, and what each one changed. */
export default function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Graph {...props} />
    </ReactFlowProvider>
  );
}
