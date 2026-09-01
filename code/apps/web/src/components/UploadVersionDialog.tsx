"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";

type Props = {
  open: boolean;
  appId: string;
  onClose: () => void;
  onUploaded: () => void;
};

export default function UploadVersionDialog({ open, appId, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      setFile(null);
      setError(null);
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      await api.uploadVersion(appId, file);
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Upload New Version</h2>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? "border-neutral-500 bg-neutral-50"
              : "border-neutral-200 hover:border-neutral-300"
          }`}
        >
          {file ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-neutral-700">{file.name}</p>
              <p className="text-xs text-neutral-400">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-3xl">📁</div>
              <p className="text-sm text-neutral-500">
                Drop a <strong>.zip</strong> or <strong>.py</strong> file here
              </p>
              <p className="text-xs text-neutral-400">or click to browse</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.py"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !file}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Uploading..." : "Upload & Build"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
