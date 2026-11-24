"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { post, type Draft, type Person, type SourceFiles } from "@/lib/workspace";

const REMOTE = "silo-remote";
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const base64 = (value: Uint8Array) => {
  let raw = "";
  for (let i = 0; i < value.length; i += 8192) raw += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(raw);
};

function extract(doc: Y.Doc): SourceFiles {
  const files: SourceFiles = {};
  doc.getMap<Y.Map<any>>("files").forEach((file, id) => {
    files[id] = { path: file.get("path"), content: file.get("text").toString() };
  });
  return files;
}

export function useCollaboration(draft: Draft | null) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [files, setFiles] = useState<SourceFiles>({});
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [revision, setRevision] = useState(0);
  const [role, setRole] = useState("viewer");
  const [hash, setHash] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const pending = useRef(new Map<string, { type: string; operation: string; update?: string }>());
  const callbacks = useRef(new Map<string, { resolve: () => void; reject: (e: Error) => void }>());

  useEffect(() => {
    if (!draft) return;
    const commandCallbacks = callbacks.current;
    const ydoc = new Y.Doc();
    const aware = new Awareness(ydoc);
    let disposed = false, timer: ReturnType<typeof setTimeout>, connecting = false;
    let connected = false, initialized = false, denied = false;
    setDoc(null); setAwareness(null); setFiles(draft.files);
    setRevision(draft.revision); setRole(draft.role); setHash(draft.source_hash);
    pending.current.clear();
    const local = (update: Uint8Array, origin: any) => {
      setFiles(extract(ydoc));
      if (origin === REMOTE || !initialized) return;
      const operation = crypto.randomUUID();
      const message = { type: "update", operation, update: base64(update) };
      pending.current.set(operation, message);
      setStatus(connected ? "Saving" : "Offline — changes pending");
      if (connected) socketRef.current?.send(JSON.stringify(message));
    };
    ydoc.on("update", local);
    const awarenessChanged = ({ added, updated, removed }: any, origin: any) => {
      if (origin === REMOTE || !connected) return;
      const localIds = [...added, ...updated, ...removed].filter(id => id === ydoc.clientID);
      if (!localIds.length) return;
      const update = encodeAwarenessUpdate(aware, localIds);
      socketRef.current?.send(JSON.stringify({ type: "awareness", update: base64(update) }));
    };
    aware.on("update", awarenessChanged);
    async function connect() {
      if (disposed || connecting || denied) return;
      if (!navigator.onLine) { setStatus("Offline"); return; }
      connecting = true;
      try {
        const auth = await post(`/drafts/${draft!.id}/ticket`);
        if (disposed) return;
        const socket = new WebSocket(auth.url + "/collab");
        socketRef.current = socket;
        socket.onopen = () => socket.send(JSON.stringify({ type: "hello", ticket: auth.ticket }));
        socket.onmessage = event => {
          const message = JSON.parse(event.data);
          if (message.type === "ready") {
            Y.applyUpdate(ydoc, bytes(message.state), REMOTE);
            initialized = true; connected = true; connecting = false;
            setDoc(ydoc); setAwareness(aware); setRole(message.role);
            setFiles(extract(ydoc)); setRevision(message.revision); setHash(message.source_hash || draft!.source_hash); setError(null);
            aware.setLocalStateField("user", {
              name: auth.user.name, color: "#9333ea", colorLight: "#e9ccff66",
            });
            for (const message of pending.current.values()) socket.send(JSON.stringify(message));
            setStatus(pending.current.size ? "Saving" : "Saved");
          } else if (message.type === "update") {
            Y.applyUpdate(ydoc, bytes(message.update), REMOTE);
            setRevision(message.revision); setHash(message.source_hash);
          } else if (message.type === "ack") {
            pending.current.delete(message.operation);
            commandCallbacks.get(message.operation)?.resolve();
            commandCallbacks.delete(message.operation);
            setRevision(message.revision); setHash(message.source_hash);
            setStatus(pending.current.size ? "Saving" : "Saved");
          } else if (message.type === "presence") setPeople(message.people);
          else if (message.type === "reauthenticated") setRole(message.role);
          else if (message.type === "awareness") applyAwarenessUpdate(aware, bytes(message.update), REMOTE);
          else if (message.type === "error") {
            const isCommand = commandCallbacks.has(message.operation);
            setError(message.message); setStatus(isCommand ? "Saved" : "Save failed");
            if (message.operation) {
              commandCallbacks.get(message.operation)?.reject(new Error(message.message));
              commandCallbacks.delete(message.operation);
            }
          }
        };
        socket.onclose = event => {
          connected = false; connecting = false;
          for (const callback of commandCallbacks.values()) callback.reject(new Error("Connection interrupted; retry after reconnecting"));
          commandCallbacks.clear();
          setPeople([]);
          if (disposed) return;
          if (event.code === 4409) {
            denied = true; setStatus("Draft restored — reload");
            setError("This draft was restored. Reload to join the new draft; export any unsaved text first.");
          } else if (event.code === 4403 || event.code === 4401) {
            denied = true; setStatus("Access changed — reload");
            setError("Your access or session changed. Reload to reconnect with current permissions.");
          } else {
            setStatus(pending.current.size ? "Offline — changes pending" : "Reconnecting");
            timer = setTimeout(connect, 1500);
          }
        };
        socket.onerror = () => setError("Cannot reach the collaboration server. Reconnecting…");
      } catch (e) {
        connecting = false;
        setError(e instanceof Error ? e.message : "Connection failed");
        setStatus("Disconnected");
        if (!disposed) timer = setTimeout(connect, 4000);
      }
    }
    const offline = () => {
      connected = false;
      setStatus(pending.current.size ? "Offline — changes pending" : "Offline");
      socketRef.current?.close();
    };
    const online = () => { clearTimeout(timer); connect(); };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    connect();
    const renewal = setInterval(async () => {
      if (!connected || disposed) return;
      try {
        const auth = await post(`/drafts/${draft.id}/ticket`);
        if (connected && !disposed) socketRef.current?.send(JSON.stringify({ type: "reauth", ticket: auth.ticket }));
      } catch {
        socketRef.current?.close(4403, "Session changed");
      }
    }, 8 * 60 * 1000);
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(renewal);
      window.removeEventListener("offline", offline); window.removeEventListener("online", online);
      socketRef.current?.close();
      aware.off("update", awarenessChanged); aware.destroy();
      ydoc.off("update", local); ydoc.destroy();
      for (const callback of commandCallbacks.values()) callback.reject(new Error("Workspace closed"));
      commandCallbacks.clear();
    };
  }, [draft]);

  const command = useCallback((action: string, values: Record<string, any> = {}) => {
    return new Promise<void>((resolve, reject) => {
      if (socketRef.current?.readyState !== WebSocket.OPEN || status !== "Saved") {
        reject(new Error("Wait until the workspace is connected and Saved")); return;
      }
      const operation = crypto.randomUUID();
      callbacks.current.set(operation, { resolve, reject });
      socketRef.current.send(JSON.stringify({ type: "command", operation, action, ...values }));
      setStatus("Saving");
    });
  }, [status]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current.size && status !== "Saving") return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [status]);
  return { doc, awareness, files, status, error, people, revision, role, hash, command,
           editable: ["editor", "owner"].includes(role) && ["Saved", "Saving"].includes(status) };
}
