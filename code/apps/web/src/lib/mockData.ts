import type { BenchMessage, BenchThread, BenchChange, FileNode } from "./types";

// App card accents: the mockups' mint, peach, pink, lilac and sky (globals.css tokens).
export const APP_COLORS = ["#aafdc0", "#ff9a2e", "#ffc0e6", "#d3beff", "#b0f4ff"];

export function appColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return APP_COLORS[hash % APP_COLORS.length];
}

// --- Activity feed (mock) ---
export const ACTIVITY = [
  { glyph: "▲", color: "#55db9c", text: "Deployed Expense Splitter v4", when: "12 min ago" },
  { glyph: "●", color: "#ffd731", text: "Build started for CSV Analyser v2", when: "18 min ago" },
  { glyph: "✕", color: "#fb4903", text: "Build failed for Team Dashboard v3", when: "40 min ago" },
  { glyph: "✎", color: "#e9ccff", text: "Renamed Planner → Study Planner", when: "Yesterday" },
  { glyph: "↑", color: "#4da2ff", text: "Uploaded Invoice Generator", when: "2 days ago" },
];

// --- Build script for deploy simulation ---
export const SCRIPT_OK = [
  ["info", "Detecting Python application"],
  ["info", "Found entry point: app.py"],
  ["info", "Detected port: 8000"],
  ["info", "Resolving dependencies — flask, requests, pandas"],
  ["warning", "No requirements.txt — dependencies inferred from imports"],
  ["info", "Building container image"],
  ["info", "Starting application"],
  ["success", "Health check passed"],
  ["success", "Deployment complete — app is live"],
];

export const SCRIPT_FAIL = [
  ["info", "Detecting Python application"],
  ["info", "Found entry point: app.py"],
  ["info", "Detected port: 8000"],
  ["info", "Resolving dependencies — flask, requests, pandas"],
  ["warning", "No requirements.txt — dependencies inferred from imports"],
  ["info", "Building container image"],
  ["info", "Starting application"],
  ["error", "ModuleNotFoundError: No module named 'reportlab'"],
  ["error", "Container exited with code 1 — build failed at stage: starting"],
];

// --- Workbench mock data ---

export const INITIAL_MESSAGES: BenchMessage[] = [
  {
    id: "m1", kind: "human", author: "Paras", role: "Owner",
    initials: "PK", color: "#ffd731", when: "10:24",
    content: "Add category filters above the expense table.",
  },
  {
    id: "m2", kind: "human", author: "Aditi", role: "Editor",
    initials: "AD", color: "#e9ccff", when: "10:25",
    content: "Make the selected category persist after refresh.",
    attachment: "filters-sketch.png",
  },
  {
    id: "m3", kind: "proposal", author: "Silo", initials: "AI",
    color: "#4da2ff", when: "10:26", status: "proposed",
    content: "I can implement both requests in one update.",
    title: "Add persistent category filters", cap: "none",
    planned: [
      "Add a category selector above the expense table",
      "Filter visible rows using the selected category",
      "Store the selected category in browser storage",
    ],
    files: [
      "components/ExpenseTable.tsx",
      "components/CategoryFilter.tsx",
      "lib/preferences.ts",
    ],
  },
];

export const INITIAL_THREADS: BenchThread[] = [
  {
    id: "t1", author: "Rohan", initials: "RS", color: "#55db9c",
    when: "10:31", resolved: false,
    body: "Filter chips overlap the total row at mobile width. Worth a look before this ships.",
  },
  {
    id: "t2", author: "Aditi", initials: "AD", color: "#e9ccff",
    when: "10:12", resolved: true,
    body: "Can we keep the category order stable instead of alphabetising it? — resolved, Silo handled it in checkpoint 2.",
  },
];

export const INITIAL_CHANGES: BenchChange[] = [
  {
    id: "c1", title: "Add category filter",
    meta: "Proposed by Paras · Applied by Silo · 3 files changed",
    build: "Build passed", dot: "#16A34A",
  },
  {
    id: "c2", title: "Preserve filter selection",
    meta: "Requested by Aditi · Applied by Silo · 1 file changed",
    build: "Build passed", dot: "#16A34A",
  },
];

export const FILE_TREE: FileNode[] = [
  { id: "src", name: "src", indent: 14, folder: true },
  { id: "app", name: "app.tsx", indent: 30 },
  { id: "components", name: "components", indent: 30, folder: true },
  { id: "expense-table", name: "ExpenseTable.tsx", indent: 46 },
  { id: "category-filter", name: "CategoryFilter.tsx", indent: 46 },
  { id: "prefs", name: "lib/preferences.ts", indent: 30 },
  { id: "styles", name: "styles.css", indent: 30 },
  { id: "pkg", name: "package.json", indent: 14 },
];

export const CODE_PREVIEWS: Record<string, string> = {
  "expense-table": `export function ExpenseTable({ rows, category }) {
  const visible = category === 'all'
    ? rows
    : rows.filter(r => r.category === category);
  return <Table rows={visible} />;
}`,
  "category-filter": `export function CategoryFilter({ value, onChange }) {
  return CATEGORIES.map(c => (
    <Chip key={c} active={c === value}
          onClick={() => onChange(c)} />
  ));
}`,
  prefs: `const KEY = 'splitter.category';
export const readCategory = () =>
  localStorage.getItem(KEY) ?? 'all';
export const writeCategory = v =>
  localStorage.setItem(KEY, v);`,
};

export const PEOPLE = [
  { id: "paras", name: "Paras", initials: "PK", color: "#ffd731", role: "Owner", activity: "Viewing the shared draft", seen: "Active now" },
  { id: "aditi", name: "Aditi", initials: "AD", color: "#e9ccff", role: "Editor", activity: "Writing a prompt", seen: "Active now" },
  { id: "rohan", name: "Rohan", initials: "RS", color: "#55db9c", role: "User", activity: "Testing the draft preview", seen: "2 minutes ago" },
];

export const QUICK_ACTIONS = [
  "Fix this build",
  "Improve this screen",
  "Add a feature",
  "Explain current app",
  "Check permissions",
];
