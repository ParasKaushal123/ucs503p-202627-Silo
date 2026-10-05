"use client";

import type { FileNode } from "@/lib/types";

interface Props {
  files: FileNode[];
  openFileId: string;
  fileQuery: string;
  onQueryChange: (q: string) => void;
  onPick: (id: string) => void;
  openFile: { name: string; meta: string; code: string } | null;
  canEdit?: boolean;
  onCreate?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onCheckpoint?: () => void;
}

export default function FileTree({
  files,
  openFileId,
  fileQuery,
  onQueryChange,
  onPick,
  openFile,
  canEdit, onCreate, onRename, onDelete, onDownload, onImport, onExport, onCheckpoint,
}: Props) {
  const fq = fileQuery.trim().toLowerCase();
  const visible = files.filter(
    (f) => !fq || f.name.toLowerCase().includes(fq)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="flex flex-wrap gap-1 mb-2">
          {onCreate && <button className="rounded-pill border border-black bg-silo-lilac px-2 py-1 text-[10px] font-bold disabled:opacity-40" disabled={!canEdit} onClick={onCreate}>+ New file</button>}
          {onImport && <button className="rounded-pill border border-black bg-white px-2 py-1 text-[10px] font-bold disabled:opacity-40" disabled={!canEdit} onClick={onImport}>Upload source</button>}
          {onExport && <button className="rounded-pill border border-black bg-white px-2 py-1 text-[10px] font-bold" onClick={onExport}>Export ZIP</button>}
          {onCheckpoint && <button className="rounded-pill border border-black bg-white px-2 py-1 text-[10px] font-bold disabled:opacity-40" disabled={!canEdit} onClick={onCheckpoint}>Checkpoint</button>}
        </div>
        <input
          value={fileQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter files…"
          className="w-full border border-black rounded-pill px-3 py-1.5 text-xs outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto silo-scroll">
        {visible.map((f) => (
          <button
            key={f.id}
            onClick={() => !f.folder && onPick(f.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs cursor-pointer border-0 transition-colors ${
              openFileId === f.id ? "bg-silo-cream" : "bg-white hover:bg-neutral-50"
            }`}
            style={{ paddingLeft: f.indent }}
          >
            <span className="text-neutral-400 text-[10px]">
              {f.folder ? "▾" : "·"}
            </span>
            <span
              className={`truncate ${f.folder ? "" : "font-mono"} ${
                f.modified ? "text-silo-purple font-semibold" : ""
              }`}
            >
              {f.name}
            </span>
            {f.modified && (
              <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-silo-purple" />
            )}
          </button>
        ))}
      </div>

      {/* Code preview */}
      {openFile && (
        <div className="border-t border-black bg-neutral-50 text-neutral-800 p-3 max-h-[200px] overflow-y-auto silo-scroll">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-silo-blue">
              {openFile.name}
            </span>
            <span className="text-[10px] text-neutral-500">{openFile.meta}</span>
          </div>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
            {openFile.code}
          </pre>
          <div className="flex flex-wrap gap-2 mt-3 text-[10px]">
            {onRename && <button disabled={!canEdit} onClick={onRename} className="underline disabled:opacity-40">Rename</button>}
            {onDelete && <button disabled={!canEdit} onClick={onDelete} className="underline disabled:opacity-40">Delete</button>}
            {onDownload && <button onClick={onDownload} className="underline">Download</button>}
          </div>
        </div>
      )}
    </div>
  );
}
