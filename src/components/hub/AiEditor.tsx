"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Loader2, Settings, Upload } from "lucide-react";
import type { AiPlan } from "@/lib/ai-editor/plan";

type ClipView = {
  id: string;
  title: string;
  hook: string;
  reason: string;
  start: number;
  end: number;
  enabled: boolean;
  speed: number;
  status: string;
  error: string;
  download: string;
};

type JobView = {
  id: string;
  fileName: string;
  mode: "prompt" | "full";
  status: string;
  error: string;
  notice: string;
  lines: string[];
  plan: AiPlan | null;
  clips: ClipView[];
  transcript: string;
  duration: number;
  download: string;
};

type Row = {
  localId: string;
  file: File;
  job?: JobView;
  error: string;
};

type Mode = "prompt" | "full";

const STATUS: Record<string, string> = {
  queued: "Queued",
  transcribing: "Transcribing",
  planned: "Ready",
  proposed: "Ready",
  rendering: "Rendering",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

export default function AiEditor() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<Mode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [captions, setCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<"bold" | "karaoke" | "minimal">("bold");
  const [captionPosition, setCaptionPosition] = useState<"top" | "middle" | "bottom">("bottom");
  const [fontSize, setFontSize] = useState(64);
  const [language, setLanguage] = useState("auto");
  const [autoEdit, setAutoEdit] = useState(true);
  const [silence, setSilence] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [vertical, setVertical] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [active, setActive] = useState("");
  const [zipping, setZipping] = useState(false);
  const [banner, setBanner] = useState("");

  const toggles = { captions, captionStyle, captionPosition, fontSize, language, autoEdit, silence, zoom, vertical };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRows((current) => {
        current.forEach((row) => {
          const status = row.job?.status;
          if (!row.job || status === "done" || status === "failed" || status === "planned") return;
          fetch(`/api/ai-editor/jobs/${row.job.id}`)
            .then((res) => res.json())
            .then((data) => {
              if (!data.job) return;
              setRows((latest) => latest.map((item) => {
                if (item.localId !== row.localId || !item.job) return item;
                const clips = data.job.mode === "full"
                  ? (data.job.clips as ClipView[]).map((clip) => {
                      const local = item.job?.clips.find((entry) => entry.id === clip.id);
                      return local && data.job.status === "planned" ? { ...clip, enabled: local.enabled } : clip;
                    })
                  : data.job.clips;
                return { ...item, job: { ...data.job, clips }, error: data.job.error || "" };
              }));
              if (data.job.notice) setBanner(data.job.notice);
            })
            .catch(() => {});
        });
        return current;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function addFiles(list: File[]) {
    const videos = list.filter((file) => file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(file.name));
    setRows((current) => [
      ...current,
      ...videos.map((file) => ({ localId: `${file.name}-${file.size}-${Math.random().toString(16).slice(2)}`, file, error: "" })),
    ]);
  }

  async function prepare(row: Row) {
    setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, error: "", job: item.job ? { ...item.job, status: "queued", error: "" } : item.job } : item)));
    const body = new FormData();
    body.append("video", row.file);
    body.append("fileName", row.file.name);
    body.append("prompt", mode === "full" ? "" : prompt);
    body.append("mode", mode);
    appendToggles(body, toggles);
    const res = await fetch("/api/ai-editor/jobs", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) {
      setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, error: data.error || "Could not start." } : item)));
      return;
    }
    setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, job: data.job } : item)));
    setActive(row.localId);
    if (data.job.notice) setBanner(data.job.notice);
  }

  async function rerun(row: Row) {
    if (!row.job) {
      await prepare(row);
      return;
    }
    const res = await fetch(`/api/ai-editor/jobs/${row.job.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: row.job.mode === "full" ? "" : prompt, toggles }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, error: data.error || "Could not update the plan." } : item)));
      return;
    }
    setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, job: data.job } : item)));
    if (row.job.mode === "full") return;
    window.setTimeout(() => {
      setRows((current) => {
        const latest = current.find((item) => item.localId === row.localId);
        if (latest?.job?.status === "planned" && latest.job.plan) void render(latest, latest.job.plan);
        return current;
      });
    }, 1200);
  }

  async function render(row: Row, plan: AiPlan) {
    if (!row.job) return;
    const res = await fetch(`/api/ai-editor/jobs/${row.job.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, error: data.error || "Could not render." } : item)));
      return;
    }
    setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, job: data.job, error: "" } : item)));
    window.dispatchEvent(new Event("uniq-credits"));
  }

  async function renderClips(row: Row) {
    if (!row.job) return;
    const res = await fetch(`/api/ai-editor/jobs/${row.job.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clips: row.job.clips.map((clip) => ({ id: clip.id, enabled: clip.enabled })),
        captions,
        captionStyle,
        captionPosition,
        fontSize,
        language,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, error: data.error || "Could not render." } : item)));
      return;
    }
    setRows((current) => current.map((item) => (item.localId === row.localId ? { ...item, job: data.job, error: "" } : item)));
    window.dispatchEvent(new Event("uniq-credits"));
  }

  function patchPlan(localId: string, partial: Partial<AiPlan>) {
    setRows((current) =>
      current.map((item) => {
        if (item.localId !== localId || !item.job?.plan) return item;
        const plan = { ...item.job.plan, ...partial };
        return { ...item, job: { ...item.job, plan } };
      })
    );
  }

  function toggleClip(localId: string, clipId: string) {
    setRows((current) =>
      current.map((item) => {
        if (item.localId !== localId || !item.job) return item;
        return {
          ...item,
          job: {
            ...item.job,
            clips: item.job.clips.map((clip) => (clip.id === clipId ? { ...clip, enabled: !clip.enabled } : clip)),
          },
        };
      })
    );
  }

  function downloads() {
    const files: { name: string; url: string }[] = [];
    for (const row of rows) {
      const base = row.file.name.replace(/\.mp4$/i, "");
      if (row.job?.download) files.push({ name: `${base}-ai.mp4`, url: row.job.download });
      for (const clip of row.job?.clips || []) {
        if (clip.download) files.push({ name: `${base}-${clip.id}.mp4`, url: clip.download });
      }
    }
    return files;
  }

  async function downloadZip() {
    const ready = downloads();
    if (ready.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        ready.map(async (file) => {
          const res = await fetch(file.url);
          if (!res.ok) return;
          zip.file(file.name, await res.blob());
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

  const selected = rows.find((row) => row.localId === active) || rows[0];
  const fullRows = rows.filter((row) => row.job?.mode === "full" && (row.job.clips?.length || 0) > 0);

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3 text-[13px] text-[#e6e7ee] sm:p-4 lg:flex-row lg:p-5">
      <section
        className="flex min-w-0 flex-1 flex-col gap-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="flex w-fit overflow-hidden rounded-[8px] border border-[#1e2130] text-[12px]">
          <button type="button" aria-pressed={mode === "prompt"} onClick={() => setMode("prompt")} className={`px-3 py-1.5 ${mode === "prompt" ? "bg-[#171a2b] text-[#c9bcff]" : "text-[#8a8ea3]"}`}>Prompt</button>
          <button type="button" aria-pressed={mode === "full"} onClick={() => setMode("full")} className={`px-3 py-1.5 ${mode === "full" ? "bg-[#171a2b] text-[#c9bcff]" : "text-[#8a8ea3]"}`}>Full auto</button>
        </div>
        <div className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-[#2c3046] bg-[#0d0f19] px-4 py-4" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="video/*" multiple className="hidden" onChange={(event) => { if (event.target.files) addFiles(Array.from(event.target.files)); }} />
          <Upload className="h-5 w-5 text-[#8a8ea3]" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Upload a video</p>
            <p className="text-[#8a8ea3]">or drag and drop one or more files</p>
          </div>
          <span className="hidden text-[12px] text-[#8a8ea3] sm:inline">MP4, MOV, WebM · Max 200MB · 10 min</span>
        </div>
        {mode === "prompt" ? (
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a8ea3]">Prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} placeholder="Add bold captions, cut the silences, zoom in on key moments, make it 9:16, punchy pacing" className="w-full resize-none rounded-[10px] border border-[#1e2130] bg-[#10121c] px-3 py-2 text-[13px] outline-none" />
          </label>
        ) : (
          <p className="text-[12px] text-[#8a8ea3]">Upload a video and find clips. No prompt.</p>
        )}
        {banner && <p className="rounded-[8px] border border-[#1e2130] bg-[#10121c] px-3 py-2 text-[12px] text-[#c9bcff]">{banner}</p>}
        <p className="text-[12px] text-[#8a8ea3]">
          {mode === "prompt"
            ? "The prompt box uses OPENAI_API_KEY. Without that key, the switches still render the video."
            : "Clip ideas use OPENAI_API_KEY. Without that key, clips follow sentence breaks and the edit still runs."}
        </p>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Results <span className="ml-1 rounded border border-[#1e2130] px-1.5 text-[11px] font-normal text-[#8a8ea3]">{rows.length}</span></h2>
          <button type="button" disabled={zipping || downloads().length === 0} onClick={downloadZip} className="rounded-md border border-[#1e2130] px-2 py-1 text-[12px] text-[#b4b7c8] disabled:opacity-40">
            {zipping ? "Zipping…" : "Download all"}
          </button>
        </div>
        <div className="overflow-auto rounded-[10px] border border-[#1e2130] bg-[#10121c]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[12px] text-[#8a8ea3]">
                <th className="px-3 py-2 font-medium">Video</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Preview</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-[12px] text-[#8a8ea3]">No videos yet.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.localId} className="border-t border-[#191c2a]">
                  <td className="max-w-[180px] px-3 py-2">
                    <div className="truncate font-medium">{row.file.name}</div>
                    {row.error && <div className="text-[12px] text-red-300">{row.error}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[12px]">
                    {row.job?.status === "transcribing" || row.job?.status === "rendering" ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                    {row.job ? STATUS[row.job.status] || row.job.status : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.job?.download ? <video src={row.job.download} controls playsInline className="h-16 w-10 rounded bg-black object-cover" /> : <span className="text-[#8a8ea3]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!row.job && mode === "prompt" && <button type="button" className="px-2 text-[12px] text-[#c9bcff]" onClick={() => prepare(row)}>Build plan</button>}
                    {!row.job && mode === "full" && <button type="button" className="px-2 text-[12px] text-[#c9bcff]" onClick={() => prepare(row)}>Find clips</button>}
                    {row.job?.mode !== "full" && row.job?.status === "planned" && row.job.plan && <button type="button" className="px-2 text-[12px] text-[#c9bcff]" onClick={() => render(row, row.job!.plan!)}>Render</button>}
                    {row.job?.mode === "full" && (row.job.status === "planned" || row.job.status === "done" || row.job.status === "failed") && (
                      <button type="button" className="px-2 text-[12px] text-[#c9bcff]" onClick={() => renderClips(row)}>Render selected</button>
                    )}
                    {row.job?.download && <a href={row.job.download} className="px-2 text-[12px] text-[#c9bcff]">Download</a>}
                    {row.job?.mode !== "full" && row.job && <button type="button" className="px-2 text-[12px] text-[#b4b7c8]" onClick={() => rerun(row)}>Edit prompt and re-run</button>}
                    {row.job?.mode === "full" && <button type="button" className="px-2 text-[12px] text-[#b4b7c8]" onClick={() => rerun(row)}>Find again</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected?.job?.mode !== "full" && selected?.job?.lines && selected.job.lines.length > 0 && (
          <div className="rounded-[10px] border border-[#1e2130] bg-[#10121c] px-3 py-2">
            <p className="mb-1 font-medium">{selected.file.name}</p>
            <ul className="list-disc space-y-1 pl-4 text-[12px] text-[#c9cbd8]">
              {selected.job.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {selected.job.plan && (
              <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                <Toggle label="Captions" on={selected.job.plan.captions} onClick={() => patchPlan(selected.localId, { captions: !selected.job!.plan!.captions })} />
                <Toggle label="Silences" on={selected.job.plan.silence} onClick={() => patchPlan(selected.localId, { silence: !selected.job!.plan!.silence })} />
                <Toggle label="Zoom" on={selected.job.plan.zoom} onClick={() => patchPlan(selected.localId, { zoom: !selected.job!.plan!.zoom })} />
                <Toggle label="9:16" on={selected.job.plan.aspect === "9:16"} onClick={() => patchPlan(selected.localId, { aspect: selected.job!.plan!.aspect === "9:16" ? "original" : "9:16" })} />
              </div>
            )}
          </div>
        )}
        {fullRows.map((row) => (
          <div key={row.localId} className="rounded-[10px] border border-[#1e2130] bg-[#10121c]">
            <p className="border-b border-[#191c2a] px-3 py-2 font-medium">{row.file.name}</p>
            <ul>
              {row.job!.clips.map((clip) => (
                <li key={clip.id} className="border-b border-[#191c2a] px-3 py-2 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <button type="button" aria-label={`Include ${clip.title}`} aria-pressed={clip.enabled} onClick={() => toggleClip(row.localId, clip.id)} className="mt-0.5 shrink-0">
                      <span className={`block h-4 w-4 rounded-[3px] border ${clip.enabled ? "border-[#7c5cff] bg-[#7c5cff]" : "border-[#3a3f56]"}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{clip.title}</span>
                        <span className="text-[12px] text-[#8a8ea3]">{fmt(clip.start)}–{fmt(clip.end)}</span>
                        <span className="text-[12px] text-[#8a8ea3]">{STATUS[clip.status] || clip.status}</span>
                      </div>
                      <p className="text-[12px] text-[#c9cbd8]">{clip.hook}</p>
                      <p className="text-[12px] text-[#8a8ea3]">{clip.reason}</p>
                      <p className="text-[12px] text-[#8a8ea3]">Dead air removed, {Number(clip.speed || 1.08).toFixed(2)}× pacing, zoom, 9:16.</p>
                      {clip.error && <p className="text-[12px] text-red-300">{clip.error}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {clip.download ? <video src={clip.download} controls playsInline className="h-16 w-10 rounded bg-black object-cover" /> : null}
                      {clip.download && <a href={clip.download} className="text-[12px] text-[#c9bcff]">Download</a>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button type="button" className="fixed bottom-3 left-3 right-3 z-30 flex items-center justify-center gap-2 rounded-[9px] bg-[#7c5cff] py-2.5 font-medium text-white lg:hidden" onClick={() => setSheet(true)}>
          <Settings className="h-4 w-4" /> Settings
        </button>
      </section>
      {sheet && <button type="button" aria-label="Close settings" className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setSheet(false)} />}
      <aside className={`${sheet ? "fixed inset-x-0 bottom-0 z-40 flex max-h-[86vh]" : "hidden"} w-full flex-col overflow-y-auto rounded-t-[14px] border border-[#1e2130] bg-[#10121c] p-3 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-84px)] lg:w-[320px] lg:shrink-0 lg:rounded-[10px]`}>
        <div className="mb-2 flex items-center justify-between lg:hidden">
          <span className="font-semibold">Settings</span>
          <button type="button" className="text-[#b3a2ff]" onClick={() => setSheet(false)}>Done</button>
        </div>
        <p className="mb-2 font-medium">Captions</p>
        <Toggle label="Burn captions" on={captions} onClick={() => setCaptions(!captions)} />
        <label className="mt-2 block text-[12px] text-[#8a8ea3]">Style
          <select aria-label="Caption style" value={captionStyle} onChange={(event) => setCaptionStyle(event.target.value as typeof captionStyle)} className="mt-1 h-8 w-full rounded-[6px] border border-[#262a3c] bg-[#0d0f19] px-2 text-[13px]">
            <option value="bold">Bold white with outline</option>
            <option value="karaoke">Karaoke word highlight in purple</option>
            <option value="minimal">Minimal lower third</option>
          </select>
        </label>
        <label className="mt-2 block text-[12px] text-[#8a8ea3]">Position
          <select aria-label="Caption position" value={captionPosition} onChange={(event) => setCaptionPosition(event.target.value as typeof captionPosition)} className="mt-1 h-8 w-full rounded-[6px] border border-[#262a3c] bg-[#0d0f19] px-2 text-[13px]">
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label className="mt-2 block text-[12px] text-[#8a8ea3]">Font size {fontSize}
          <input aria-label="Font size" type="range" min={32} max={96} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} className="mt-1 w-full accent-[#7c5cff]" />
        </label>
        <label className="mt-2 block text-[12px] text-[#8a8ea3]">Language
          <select aria-label="Caption language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 h-8 w-full rounded-[6px] border border-[#262a3c] bg-[#0d0f19] px-2 text-[13px]">
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
          </select>
        </label>
        {mode === "prompt" ? (
          <>
            <p className="mb-1 mt-4 font-medium">Auto edit</p>
            <Toggle label="Auto AI edit" on={autoEdit} onClick={() => setAutoEdit(!autoEdit)} />
            <Toggle label="Remove silences" on={silence} onClick={() => setSilence(!silence)} />
            <Toggle label="Zoom punch-ins" on={zoom} onClick={() => setZoom(!zoom)} />
            <Toggle label="Reframe to 9:16" on={vertical} onClick={() => setVertical(!vertical)} />
          </>
        ) : (
          <p className="mt-4 text-[12px] text-[#8a8ea3]">Full auto trims dead air, tightens pacing, punches in, and frames 9:16. Captions stay optional.</p>
        )}
      </aside>
    </div>
  );
}

function fmt(seconds: number) {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const rest = (safe % 60).toFixed(1);
  if (mins <= 0) return `${Number(rest).toFixed(1)}s`;
  return `${mins}:${rest.padStart(4, "0")}`;
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between gap-3 py-1 text-left text-[13px] text-[#c9cbd8]">
      <span>{label}</span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full ${on ? "bg-[#7c5cff]" : "bg-[#2a2e42]"}`} aria-pressed={on}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full ${on ? "left-3.5 bg-white" : "left-0.5 bg-[#9a9eb2]"}`} />
      </span>
    </button>
  );
}

function appendToggles(body: FormData, toggles: { captions: boolean; captionStyle: string; captionPosition: string; fontSize: number; language: string; autoEdit: boolean; silence: boolean; zoom: boolean; vertical: boolean }) {
  body.append("captions", toggles.captions ? "1" : "0");
  body.append("captionStyle", toggles.captionStyle);
  body.append("captionPosition", toggles.captionPosition);
  body.append("fontSize", String(toggles.fontSize));
  body.append("language", toggles.language);
  body.append("autoEdit", toggles.autoEdit ? "1" : "0");
  body.append("silence", toggles.silence ? "1" : "0");
  body.append("zoom", toggles.zoom ? "1" : "0");
  body.append("vertical", toggles.vertical ? "1" : "0");
}
