"use client";

interface Tool {
  key: string;
  glyph: string;
  label: string;
  badge?: number;
}

interface Props {
  tools: Tool[];
  activeKey: string | null;
  onPick: (key: string) => void;
}

const TOOLS: Tool[] = [
  { key: "preview", glyph: "▣", label: "App preview" },
  { key: "files", glyph: "🗀", label: "Files" },
  { key: "changes", glyph: "✦", label: "Changes" },
  { key: "versions", glyph: "⏱", label: "Versions" },
  { key: "comments", glyph: "💬", label: "Comments" },
  { key: "build", glyph: "⌁", label: "Build details" },
];

export { TOOLS };

export default function ToolRail({ tools, activeKey, onPick }: Props) {
  return (
    <div className="shrink-0 w-14 border-r border-black bg-canvas flex flex-col items-center py-3 gap-1.5">
      {tools.map((t) => {
        const active = t.key === "preview" ? !activeKey || activeKey === "preview" : activeKey === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onPick(t.key)}
            title={t.label}
            className={`relative w-10 h-10 rounded-[12px] border-[1.5px] flex items-center justify-center cursor-pointer transition-colors text-sm ${
              active ? "bg-silo-green border-silo-green" : "bg-white border-transparent hover:border-black"
            }`}
          >
            {t.glyph}
            {t.badge && t.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-silo-red text-white text-[9px] font-bold flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
