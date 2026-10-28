"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

export default function QuickUpload({ onFile }: { onFile?: (file: File | null) => void }) {
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  function take(file: File | null) {
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      setError("Max file size is 500MB.");
      return;
    }
    const allowed = /\.(mp4|mov|webm)$/i.test(file.name) || file.type.startsWith("video/");
    if (!allowed) {
      setError("Use MP4, MOV, or WebM.");
      return;
    }
    setError("");
    setName(file.name);
    setProgress(0);
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    reader.onload = () => {
      setProgress(null);
      onFile?.(file);
    };
    reader.onerror = () => {
      setProgress(null);
      setError("Could not read that file.");
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <section className="rounded-md border border-dashed border-white/10 bg-[#10121c] p-3" aria-label="Quick upload">
      <label
        className="flex cursor-pointer items-center gap-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          take(event.dataTransfer.files?.[0] || null);
        }}
      >
        <Upload className="h-4 w-4 text-slate-400" aria-hidden />
        <span>
          <span className="block text-[13px] font-medium">Quick upload</span>
          <span className="block text-[12px] text-[#8A8A9A]">
            {progress === null ? "One clip. It stays in this page for preview and is not a library." : `Reading ${name} · ${progress}%`}
          </span>
        </span>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="sr-only"
          onChange={(event) => take(event.target.files?.[0] || null)}
        />
      </label>
      {progress !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1e2130]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full bg-[#7c5cff]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-[#F87171]" role="alert">{error}</p>}
      {name && progress === null && (
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="truncate">{name}</span>
          <button
            type="button"
            aria-label={`Remove ${name}`}
            onClick={() => {
              setName("");
              onFile?.(null);
            }}
            className="rounded p-1 text-[#8A8A9A] hover:text-[#F87171]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}
