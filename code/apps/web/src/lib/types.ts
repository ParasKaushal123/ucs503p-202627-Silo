export type AuthUser =
  | { authenticated: true; email: string; id: string }
  | { authenticated: false };

export type App = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string;
  approved_version_id: string | null;
};

export type Version = {
  id: string;
  app_id: string;
  version_no: number;
  status: "building" | "live" | "failed" | "pending" | "superseded" | "ready";
  container_id: string | null;
  internal_port: number | null;
  created_at: string;
};

// ----- Workbench types (frontend-only) -----

export type BenchMessage = {
  id: string;
  kind: "human" | "proposal";
  author: string;
  role?: string;
  initials: string;
  color: string;
  when: string;
  content: string;
  attachment?: string | null;
  attachments?: { id: string; name: string }[];
  buildStatus?: string;
  // proposal-specific
  title?: string;
  status?: "proposed" | "queued" | "applying" | "applied" | "failed" | "cancelled";
  cap?: "none" | "reducing" | "expanding";
  planned?: string[];
  files?: string[];
};

export type BenchThread = {
  id: string;
  author: string;
  initials: string;
  color: string;
  when: string;
  body: string;
  resolved: boolean;
  file?: string;
  replies?: { id: string; author: string; body: string }[];
};

export type BenchChange = {
  id: string;
  title: string;
  meta: string;
  build: string;
  dot: string;
};

export type FileNode = {
  id: string;
  name: string;
  indent: number;
  folder?: boolean;
  modified?: boolean;
};

// --- Security track (GET /apps/{id}/security, /apps/{id}/security/{version}) ---

export type Severity = "high" | "medium" | "low" | "info";
export type Classification = "origin" | "expanding" | "reducing" | "neutral";
export type SeverityCounts = Record<Severity, number>;

export type SecurityNode = {
  version_id: string;
  version_no: number;
  status: string;
  created_at: string;
  kind: "upload" | "workbench";
  label: string;
  release_id: string | null;
  published: boolean;
  actor: { id: string; name: string; email: string };
  source_available: boolean;
  risk: number;
  counts: SeverityCounts;
  capabilities: number;
  dependencies: number;
  origin: boolean;
  classification: Classification;
  files_changed?: number;
  capabilities_added?: number;
  capabilities_removed?: number;
  findings_new?: number;
  findings_fixed?: number;
  capability_keys: string[];
  /** Child nodes in the flow: what this build added or fixed (the origin: what it can reach). */
  items: FlowItem[];
};

export type FlowItem = {
  type: "access" | "finding" | "fixed" | "dependency";
  id: string;
  title: string;
  detail: string;
  tone: string;
};

export type Capability = {
  key: string;
  kind: string;
  label: string;
  detail: string;
  tone: "low" | "medium" | "high";
  uncertain: boolean;
  evidence: { file: string; line: number }[];
};

export type Dependency = { name: string; version: string; ecosystem: string; source: string };

export type Finding = {
  rule_id: string;
  severity: Severity;
  cwe: string;
  title: string;
  file: string;
  line: number;
  snippet: string;
  why: string;
  fix: string;
  engine: string;
  fingerprint: string;
};

export type FileChange = {
  path: string;
  status: "added" | "removed" | "modified";
  added: number;
  removed: number;
  diff: string;
};

export type SecurityDiff = {
  classification: Exclude<Classification, "origin">;
  verdict: string;
  risk_before: number;
  risk_after: number;
  files: FileChange[];
  capabilities_added: Capability[];
  capabilities_removed: Capability[];
  dependencies_added: Dependency[];
  dependencies_removed: Dependency[];
  dependencies_changed: { name: string; ecosystem: string; from: string; to: string }[];
  findings_new: Finding[];
  findings_fixed: Finding[];
  base: { version_id: string; version_no: number };
};

export type SecurityTrack = {
  app: { id: string; name: string };
  capabilities: Pick<Capability, "key" | "label" | "detail" | "tone">[];
  role: string;
  engine: { semgrep: string | null; label: string };
  nodes: SecurityNode[];
  summary: {
    builds: number;
    risk: number;
    risk_trend: number[];
    counts: SeverityCounts;
    capabilities: number;
    dependencies: number;
    expanding: number;
  };
};

export type SecurityNodeDetail = {
  node: SecurityNode;
  label: {
    capabilities: Capability[];
    dependencies: Dependency[];
    files: number;
    lines: number;
    languages: string[];
    manifest_digest: string;
    risk: number;
    counts: SeverityCounts;
  };
  findings: Finding[];
  engines: string[];
  diff: SecurityDiff | null;
  files: string[];
};
