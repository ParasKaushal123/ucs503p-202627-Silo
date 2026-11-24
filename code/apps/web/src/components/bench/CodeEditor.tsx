"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

export default function CodeEditor({ doc, awareness, fileId, path, editable, onSelection }: {
  doc: Y.Doc; awareness: Awareness; fileId: string; path: string; editable: boolean;
  onSelection?: (selection: any) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const selectionCallback = useRef(onSelection);
  selectionCallback.current = onSelection;
  useEffect(() => {
    if (!root.current) return;
    const file = doc.getMap<Y.Map<any>>("files").get(fileId);
    if (!file) return;
    const text = file.get("text") as Y.Text;
    const lang = path.endsWith(".py") ? python() : path.endsWith(".html") ? html() :
      path.endsWith(".css") ? css() : /\.[jt]sx?$/.test(path) ? javascript({ typescript: path.endsWith("ts"), jsx: true }) : [];
    const undo = new Y.UndoManager(text);
    const view = new EditorView({
      parent: root.current,
      state: EditorState.create({ doc: text.toString(), extensions: [
        basicSetup, lang, yCollab(text, awareness, { undoManager: undo }),
        EditorView.editable.of(editable), EditorState.readOnly.of(!editable),
        EditorView.updateListener.of(update => {
          if (!update.selectionSet) return;
          const { from, to } = update.state.selection.main;
          selectionCallback.current?.(from === to ? null : {
            file_id: fileId,
            start: JSON.parse(JSON.stringify(Y.createRelativePositionFromTypeIndex(text, from))),
            end: JSON.parse(JSON.stringify(Y.createRelativePositionFromTypeIndex(text, to))),
            excerpt: text.toString().slice(from, to).slice(0, 2000),
          });
        }),
        EditorView.theme({
          // Colours come from the page theme (globals.css) so the editor matches light or dark.
          "&": { height: "100%", fontSize: "13px", backgroundColor: "rgb(var(--surface))", color: "rgb(var(--ink))" },
          ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: "1.85" },
          ".cm-content": { padding: "20px 0", caretColor: "rgb(var(--mint))" },
          ".cm-cursor": { borderLeftColor: "rgb(var(--mint))" },
          ".cm-gutters": { backgroundColor: "rgb(var(--surface))", color: "rgb(var(--neutral-400))", border: "none", paddingRight: "14px" },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgb(var(--neutral-100))" },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "rgb(var(--mint) / 0.25)" },
          "&.cm-focused": { outline: "none" },
          ".cm-line": { padding: "0 20px 0 4px" },
        }),
        // Syntax colours for the dark Workbench; the token theme above keeps precedence.
        oneDark,
      ] }),
    });
    return () => { view.destroy(); undo.destroy(); };
  }, [doc, awareness, fileId, path, editable]);
  return <div ref={root} className="h-full min-h-0" data-testid="code-editor" />;
}
