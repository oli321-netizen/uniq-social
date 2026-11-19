"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { Loader2, Upload } from "lucide-react";
import { CREDITS_PER_VIDEO } from "@/lib/ai-editor/cost";

type Access = { allowed: boolean; plan: string; label: string; credits: number; teamCredits: number };

type VariantView = {
  index: number;
  status: string;
  title: string;
  why: string;
  error: string;
  download: string;
};

type JobView = {
  id: string;
  fileName: string;
  status: string;
  error: string;
  summary: string;
  variants: VariantView[];
};

type Track = { id: string; name: string; artist: string; url: string };

const STATUS: Record<string, string> = {
  queued: "Queued",
  reading: "Reading",
  rendering: "Rendering",
  done: "Done",
  failed: "Failed",
};

export default function AiEditor() {
  const fileRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [variants, setVariants] = useState(3);
  const [captions, setCaptions] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<"bold" | "karaoke" | "minimal">("bold");
  const [mode, setMode] = useState<"auto" | "describe">("auto");
  const [prompt, setPrompt] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [musicNotice, setMusicNotice] = useState("");
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [volume, setVolume] = useState(0.35);
  const [duck, setDuck] = useState(true);
  const [fade, setFade] = useState(true);
  const [beat, setBeat] = useState(false);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zipping, setZipping] = useState(false);

  const cost = files.length * variants * CREDITS_PER_VIDEO;
  const affordable = !access || access.credits >= cost || access.teamCredits >= cost;

  useEffect(() => {
    fetch("/api/ai-editor/access")
      .then((res) => res.json())
      .then((data) => setAccess(data.access || { allowed: false, plan: "free", label: "Free", credits: 0, teamCredits: 0 }))
      .catch(() => setAccess({ allowed: false, plan: "free", label: "Free", credits: 0, teamCredits: 0 }));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      jobs.forEach((job) => {
        if (job.status === "done" || job.status === "failed") return;
        fetch(`/api/ai-editor/jobs/${job.id}`)
          .then((res) => res.json())
          .then((data) => {
            if (!data.job) return;
            setJobs((current) => current.map((item) => (item.id === job.id ? data.job : item)));
            if (data.job.status === "done" || data.job.status === "failed") window.dispatchEvent(new Event("uniq-credits"));
          })
          .catch(() => {});
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  function addFiles(list: File[]) {
    setFiles((current) => {
      const next = current.slice();
      for (const file of list) {
        const video = file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(file.name);
        if (!video) continue;
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (next.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) continue;
        next.push(file);
      }
      return next;
    });
    setError("");
  }

  async function searchMusic() {
    setMusicNotice("");
    const res = await fetch(`/api/ai-editor/music?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) {
      setMusicNotice(data.error || "Music search isn't set up yet. Upload your own audio instead.");
      return;
    }
    setTracks(data.tracks || []);
    setMusicNotice(data.notice || "");
  }

  async function generate() {
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("video", file);
        body.append("fileName", file.name);
        body.append("variants", String(variants));
        body.append("captions", captions ? "1" : "0");
        body.append("captionStyle", captionStyle);
        body.append("mode", mode);
        body.append("prompt", mode === "describe" ? prompt : "");
        body.append("keepOriginal", keepOriginal ? "1" : "0");
        body.append("musicVolume", String(volume));
        body.append("duck", duck ? "1" : "0");
        body.append("fade", fade ? "1" : "0");
        body.append("beatSync", beat ? "1" : "0");
        if (musicFile) body.append("music", musicFile);
        else if (musicUrl.trim()) body.append("musicUrl", musicUrl.trim());
        const res = await fetch("/api/ai-editor/jobs", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not start.");
          break;
        }
        setJobs((current) => [...current, data.job]);
        setFiles((current) => current.filter((item) => item !== file));
      }
      const refreshed = await fetch("/api/ai-editor/access").then((res) => res.json()).catch(() => null);
      if (refreshed?.access) setAccess(refreshed.access);
      window.dispatchEvent(new Event("uniq-credits"));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(jobId: string, index: number) {
    const res = await fetch(`/api/ai-editor/jobs/${jobId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not regenerate that edit.");
      return;
    }
    setJobs((current) => current.map((job) => (job.id === jobId ? data.job : job)));
    window.dispatchEvent(new Event("uniq-credits"));
  }

  async function downloadAll() {
    const ready = jobs.flatMap((job) => job.variants.filter((variant) => variant.download).map((variant) => ({ job, variant })));
    if (!ready.length) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        ready.map(async ({ job, variant }) => {
          const res = await fetch(variant.download);
          if (!res.ok) return;
          zip.file(`${job.fileName.replace(/\.mp4$/i, "")}-${variant.index + 1}.mp4`, await res.blob());
        })
      );
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `uniq-ai-${Date.now()}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setZipping(false);
    }
  }

  if (!access) return <p className="p-4 text-[13px] text-[#8a8ea3]">Loading…</p>;

  if (!access.allowed) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-10 text-[13px] text-[#e6e7ee]">
        <h1 className="text-[15px] font-medium">AI Editor</h1>
        <p className="text-[#b4b7c8]">AI Editor is part of a paid plan. You are on {access.label}.</p>
        <p className="text-[12px] text-[#8a8ea3]">Subscribe to generate edits. Credits are used when a video is created.</p>
        <Link href="/account#plans" className="mt-2 inline-flex h-10 items-center justify-center rounded-[9px] bg-[#7c5cff] px-4 font-medium text-white">
          View plans
        </Link>
      </div>
    );
  }

  const reason = !files.length ? "Add a video first." : !affordable ? `Not enough credits. This needs ${cost}.` : "";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 pb-28 pt-3 text-[13px] text-[#e6e7ee] lg:max-w-3xl lg:pb-8 lg:pt-5">
      <div
        className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-[#2c3046] bg-[#0d0f19] px-4 py-4"
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
        <Upload className="h-5 w-5 shrink-0 text-[#8a8ea3]" />
        <div>
          <p className="font-medium">Add a video</p>
          <p className="text-[12px] text-[#8a8ea3]">Or drop one or more files. Nothing runs until you press Generate.</p>
        </div>
      </div>
      {files.length > 0 && (
        <ul className="rounded-[10px] border border-[#1e2130] bg-[#10121c]">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 border-b border-[#191c2a] px-3 py-2 last:border-b-0">
              <span className="truncate">{file.name}</span>
              <button type="button" className="shrink-0 text-[12px] text-[#b3a2ff]" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <Field label="Variants" hint="How many different edits to make from each video.">
        <div className="flex items-center gap-2">
          <button type="button" className="h-8 w-8 rounded-[6px] border border-[#262a3c]" onClick={() => setVariants((value) => Math.max(1, value - 1))} aria-label="Fewer variants">–</button>
          <span className="w-6 text-center">{variants}</span>
          <button type="button" className="h-8 w-8 rounded-[6px] border border-[#262a3c]" onClick={() => setVariants((value) => Math.min(10, value + 1))} aria-label="More variants">+</button>
        </div>
      </Field>

      <Field label="Captions" hint="Words on the picture. Off until you turn them on.">
        <Toggle on={captions} label="Burn captions" onClick={() => setCaptions((value) => !value)} />
        {captions && (
          <select aria-label="Caption style" value={captionStyle} onChange={(event) => setCaptionStyle(event.target.value as typeof captionStyle)} className="mt-2 h-8 w-full rounded-[6px] border border-[#262a3c] bg-[#0d0f19] px-2">
            <option value="bold">Bold white with outline</option>
            <option value="karaoke">Karaoke highlight</option>
            <option value="minimal">Small lower line</option>
          </select>
        )}
      </Field>

      <Field label="Music" hint="Your own track, a search, or a link to an audio file.">
        <div className="flex flex-col gap-2">
          <input ref={musicRef} type="file" accept="audio/*,video/mp4" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setMusicFile(file);
            setMusicName(file.name);
            setMusicUrl("");
            event.target.value = "";
          }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-[6px] border border-[#262a3c] px-2 py-1 text-[12px]" onClick={() => musicRef.current?.click()}>Upload audio</button>
            {musicName && <span className="text-[12px] text-[#8a8ea3]">{musicName}</span>}
          </div>
          <div className="flex gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a song name" aria-label="Search songs" className="h-8 min-w-0 flex-1 rounded-[6px] border border-[#262a3c] bg-[#0d0f19] px-2" />
            <button type="button" className="rounded-[6px] border border-[#262a3c] px-2 text-[12px]" onClick={searchMusic}>Search</button>
          </div>
          {musicNotice && <p className="text-[12px] text-[#c9bcff]">{musicNotice}</p>}
          {tracks.length > 0 && (
            <ul className="rounded-[8px] border border-[#1e2130]">
              {tracks.map((track) => (
                <li key={track.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-[#171a2b]" onClick={() => { setMusicUrl(track.url); setMusicFile(null); setMusicName(`${track.name} — ${track.artist}`); }}>
                    <span className="truncate">{track.name}</span>
                    <span className="shrink-0 text-[#8a8ea3]">{track.artist}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input value={musicUrl} onChange={(event) => { setMusicUrl(event.target.value); setMusicFile(null); }} placeholder="Or paste a direct audio link" aria-label="Audio link" className="h-8 w-full rounded-[6px] border border-[#262a3c] bg-[#0d0f19] px-2" />
          <label className="text-[12px] text-[#8a8ea3]">Volume {Math.round(volume * 100)}%
            <input aria-label="Music volume" type="range" min={5} max={100} value={Math.round(volume * 100)} onChange={(event) => setVolume(Number(event.target.value) / 100)} className="mt-1 w-full accent-[#7c5cff]" />
          </label>
          <Toggle on={keepOriginal} label="Keep original audio" onClick={() => setKeepOriginal((value) => !value)} />
          <Toggle on={duck} label="Lower music under speech" onClick={() => setDuck((value) => !value)} />
          <Toggle on={fade} label="Fade in and out" onClick={() => setFade((value) => !value)} />
          <Toggle on={beat} label="Cut montages on the beat" onClick={() => setBeat((value) => !value)} />
          <p className="text-[12px] text-[#8a8ea3]">Trending Instagram songs have to be added in Instagram when you post.</p>
        </div>
      </Field>

      <Field label="Mode" hint={mode === "auto" ? "Reads the clip and edits it." : "Say what you want, in plain words."}>
        <div className="flex w-fit overflow-hidden rounded-[8px] border border-[#1e2130] text-[12px]">
          <button type="button" aria-pressed={mode === "auto"} className={`px-3 py-1.5 ${mode === "auto" ? "bg-[#171a2b] text-[#c9bcff]" : "text-[#8a8ea3]"}`} onClick={() => setMode("auto")}>Auto</button>
          <button type="button" aria-pressed={mode === "describe"} className={`px-3 py-1.5 ${mode === "describe" ? "bg-[#171a2b] text-[#c9bcff]" : "text-[#8a8ea3]"}`} onClick={() => setMode("describe")}>Describe it</button>
        </div>
        {mode === "describe" && (
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} placeholder="Keep the haircut in order and end on the reveal" className="mt-2 w-full resize-none rounded-[8px] border border-[#1e2130] bg-[#10121c] px-3 py-2 outline-none" />
        )}
      </Field>

      {error && <p className="rounded-[8px] border border-[#1e2130] px-3 py-2 text-[12px] text-red-300">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#1e2130] bg-[#0a0b14] p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        {reason && <p className="mb-2 text-center text-[12px] text-[#8a8ea3] lg:text-left">{reason}</p>}
        <button type="button" disabled={Boolean(reason) || busy} onClick={generate} className="flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-[#7c5cff] font-medium text-white disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Generate{files.length ? ` · ${cost} credits` : ""}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-medium">Results</h2>
        <button type="button" disabled={zipping || jobs.every((job) => job.variants.every((variant) => !variant.download))} onClick={downloadAll} className="rounded-md border border-[#1e2130] px-2 py-1 text-[12px] text-[#b4b7c8] disabled:opacity-40">
          {zipping ? "Zipping…" : "Download all"}
        </button>
      </div>
      {jobs.length === 0 && <p className="text-[12px] text-[#8a8ea3]">Edits show up here after you generate.</p>}
      {jobs.map((job) => (
        <section key={job.id} className="rounded-[10px] border border-[#1e2130] bg-[#10121c]">
          <div className="border-b border-[#191c2a] px-3 py-2">
            <p className="truncate font-medium">{job.fileName}</p>
            <p className="text-[12px] text-[#8a8ea3]">{STATUS[job.status] || job.status}{job.summary ? ` · ${job.summary}` : ""}</p>
            {job.error && <p className="text-[12px] text-red-300">{job.error}</p>}
          </div>
          {job.variants.map((variant) => (
            <div key={variant.index} className="flex flex-col gap-2 border-b border-[#191c2a] px-3 py-3 last:border-b-0 sm:flex-row">
              <div className="w-full max-w-[180px] shrink-0">
                {variant.download ? (
                  <video src={variant.download} controls playsInline className="aspect-[9/16] w-full rounded bg-black object-cover" />
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center rounded bg-[#0a0b14] text-[12px] text-[#8a8ea3]">
                    {variant.status === "rendering" || variant.status === "reading" || job.status === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "—"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{variant.title}</p>
                <p className="text-[12px] text-[#c9cbd8]">{variant.why}</p>
                <p className="mt-1 text-[12px] text-[#8a8ea3]">{STATUS[variant.status] || variant.status}</p>
                {variant.error && <p className="text-[12px] text-red-300">{variant.error}</p>}
                <div className="mt-2 flex gap-3 text-[12px]">
                  {variant.download && <a href={variant.download} className="text-[#c9bcff]">Download</a>}
                  <button type="button" className="text-[#b4b7c8]" onClick={() => regenerate(job.id, variant.index)}>Regenerate</button>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-[#1e2130] bg-[#10121c] px-3 py-3">
      <p className="font-medium">{label}</p>
      <p className="mb-2 text-[12px] text-[#8a8ea3]">{hint}</p>
      {children}
    </section>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 py-1 text-left text-[13px]">
      <span>{label}</span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full ${on ? "bg-[#7c5cff]" : "bg-[#2a2e42]"}`} aria-pressed={on}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full ${on ? "left-3.5 bg-white" : "left-0.5 bg-[#9a9eb2]"}`} />
      </span>
    </button>
  );
}
