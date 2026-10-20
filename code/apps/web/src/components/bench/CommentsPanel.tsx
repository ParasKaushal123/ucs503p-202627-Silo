"use client";

import type { BenchThread } from "@/lib/types";
import { useState } from "react";

interface Props {
  threads: BenchThread[];
  onToggleResolve: (id: string) => void;
  onToast: (msg: string) => void;
  canComment?: boolean;
  fileName?: string;
  onCreate?: (body: string, parentId?: string) => Promise<void>;
}

export default function CommentsPanel({ threads, onToggleResolve, onToast, canComment = true,
  fileName, onCreate }: Props) {
  const unresolved = threads.filter((t) => !t.resolved).length;
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  return (
    <div className="p-3 space-y-3">
      <div className="text-[11px] text-neutral-500">
        {unresolved} unresolved comment{unresolved !== 1 ? "s" : ""}
      </div>
      {threads.map((t) => (
        <div key={t.id} className="border border-black rounded-[14px] p-3">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-6 h-6 rounded-full border border-black flex items-center justify-center text-[9px] font-bold"
              style={{ background: t.color }}
            >
              {t.initials}
            </span>
            <span className="text-[12px] font-semibold">{t.author}</span>
            <span className="text-[10px] text-neutral-400">{t.when}</span>
            <span
              className="ml-auto text-[10px] font-bold rounded-pill px-2 py-0.5"
              style={{
                background: t.resolved ? "#e9e9e9" : "#ffd731",
              }}
            >
              {t.resolved ? "Resolved" : "Open"}
            </span>
          </div>
          {t.file && <div className="text-[10px] text-silo-purple font-mono mb-2">{t.file}</div>}
          <p className="text-[12.5px] leading-relaxed mb-2">{t.body}</p>
          {t.replies?.map(reply => <div key={reply.id} className="ml-3 pl-3 border-l-2 border-silo-lilac my-3"><div className="font-semibold text-[11px]">{reply.author}</div><p className="text-xs whitespace-pre-wrap mt-1">{reply.body}</p></div>)}
          {canComment && <div className="flex gap-2">
            <button
              onClick={() => setReplyTo(t.id)}
              className="rounded-pill border border-black bg-white px-3 py-1 text-[11px] font-bold cursor-pointer hover:bg-neutral-100"
            >
              Reply
            </button>
            <button
              onClick={() => onToggleResolve(t.id)}
              className="rounded-pill border border-black px-3 py-1 text-[11px] font-bold cursor-pointer"
              style={{
                background: t.resolved ? "#fff" : "#55db9c",
              }}
            >
              {t.resolved ? "Reopen" : "Resolve"}
            </button>
          </div>}
        </div>
      ))}
      {!threads.length && <p className="text-xs text-neutral-500 py-5">No comments yet. Start a discussion about the shared draft.</p>}
      {canComment && onCreate && <form className="border border-black rounded-[14px] p-3 bg-silo-cream" onSubmit={async e => {
        e.preventDefault(); if (!body.trim()) return; setSaving(true);
        try { await onCreate(body.trim(), replyTo); setBody(""); setReplyTo(undefined); }
        catch (error) { onToast(error instanceof Error ? error.message : "Could not save comment"); }
        finally { setSaving(false); }
      }}>
        <div className="text-[10px] font-bold mb-2 flex justify-between">{replyTo ? "Reply to thread" : fileName ? `Comment on ${fileName}` : "New comment"}{replyTo && <button type="button" onClick={() => setReplyTo(undefined)}>Cancel reply</button>}</div>
        <textarea aria-label="Comment" placeholder="Add a comment…" required value={body} onChange={e => setBody(e.target.value)} className="w-full border border-black rounded-[10px] bg-white px-3 py-2 text-xs min-h-[85px] outline-none" />
        <button disabled={saving || !body.trim()} className="rounded-pill border border-black bg-black text-white px-3 py-1.5 text-xs mt-2 disabled:opacity-40">{saving ? "Saving…" : replyTo ? "Post reply" : "Post comment"}</button>
      </form>}
    </div>
  );
}
