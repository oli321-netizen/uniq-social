"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Star, Trash2 } from "lucide-react";
import type { CreatorDTO, HookDTO } from "@/lib/serialize";
import CaptionStudio from "@/components/hub/CaptionStudio";
import {
  composedDuration,
  mapWords,
  sourceAt,
  splitAt,
  type Segment,
  type WordStamp,
} from "@/lib/edit-timeline";
import { DEFAULT_STYLE, type CaptionStyle } from "@/lib/caption-ass";

const TABS = ["Hook Lab", "Captions", "Reframe", "B-roll", "Metrics"] as const;
type Tab = (typeof TABS)[number];

type Project = {
  id: string;
  creatorId: string | null;
  fileName: string;
  durationSec: number;
  transcript: string;
  words: WordStamp[];
  segments: Segment[];
  style: CaptionStyle;
};

const PRESETS: { id: CaptionStyle["preset"]; label: string }[] = [
  { id: "big", label: "Big bold" },
  { id: "outline", label: "Outlined" },
  { id: "highlight", label: "Highlighted word" },
  { id: "karaoke", label: "Karaoke pop" },
  { id: "boxed", label: "Boxed" },
];

export default function HookLab() {
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>("Hook Lab");
  const [creators, setCreators] = useState<CreatorDTO[]>([]);
  const [creatorId, setCreatorId] = useState(search.get("creator") || "");
  const [project, setProject] = useState<Project | null>(null);
  const [hooks, setHooks] = useState<HookDTO[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [words, setWords] = useState<WordStamp[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [style, setStyle] = useState<CaptionStyle>(DEFAULT_STYLE);
  const [time, setTime] = useState(0);
  const segRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/creators")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.creators)) {
          setCreators(data.creators);
          setCreatorId((current) => current || data.creators[0]?.id || "");
        }
      })
      .catch(() => setError("Could not load creators."));
  }, []);

  useEffect(() => {
    const id = search.get("project");
    if (!id) return;
    fetch(`/api/hooks/projects/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.project) return;
        applyProject(data.project);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function applyProject(next: Project) {
    setProject(next);
    setWords(next.words);
    setSegments(next.segments);
    setStyle(next.style);
    if (next.creatorId) setCreatorId(next.creatorId);
    loadHooks(next.id);
  }

  async function loadHooks(projectId: string) {
    const res = await fetch(`/api/hooks?projectId=${encodeURIComponent(projectId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load hooks.");
    setHooks(data.hooks || []);
    setSelectedId((current) => current || data.hooks?.[0]?.id || null);
  }

  useEffect(() => {
    if (segments.length === 0) return;
    const pos = sourceAt(segments, time);
    segRef.current = pos.index;
    const video = videoRef.current;
    const seg = segments[pos.index];
    if (!video || !seg) return;
    if (video.currentTime < seg.start - 0.05 || video.currentTime > seg.end + 0.05) {
      video.currentTime = pos.source;
    }
    // Seek only when the cut list changes. `time` is the playhead at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  const duration = composedDuration(segments);
  const timed = useMemo(() => mapWords(words, segments), [words, segments]);
  const active = timed.find((word) => time >= word.composedStart && time < word.composedEnd) || null;
  const selected = hooks?.find((hook) => hook.id === selectedId) || null;
  const logged = (hooks || []).filter((hook) => hook.loggedResults > 0);
  const totals = useMemo(() => {
    const list = hooks || [];
    const views = list.reduce((sum, hook) => sum + hook.views, 0);
    const watch = list.length ? list.reduce((sum, hook) => sum + hook.watchTimeSec, 0) / list.length : 0;
    return { views, watch, logs: logged.length };
  }, [hooks, logged.length]);

  function seekComposed(composed: number) {
    const video = videoRef.current;
    if (!video || segments.length === 0) return;
    const pos = sourceAt(segments, composed);
    segRef.current = pos.index;
    video.currentTime = pos.source;
    setTime(pos.composed);
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    const index = segRef.current;
    const seg = segments[index];
    if (!video || !seg) return;
    if (video.currentTime >= seg.end - 0.05) {
      const next = segments[index + 1];
      if (next && !video.paused) {
        segRef.current = index + 1;
        video.currentTime = next.start;
        return;
      }
      video.pause();
      setPlaying(false);
      return;
    }
    let cursor = 0;
    for (let i = 0; i < index; i++) cursor += segments[i].end - segments[i].start;
    setTime(cursor + Math.max(0, video.currentTime - seg.start));
  }

  async function saveEdit(next?: { words?: WordStamp[]; segments?: Segment[]; style?: CaptionStyle }) {
    if (!project) return;
    const payload = {
      words: next?.words || words,
      segments: next?.segments || segments,
      style: next?.style || style,
      transcript: (next?.words || words).map((word) => word.word).join(" "),
    };
    await fetch(`/api/hooks/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setError("");
    setNotice("");
    setPhase("Extracting audio and transcribing");
    try {
      const body = new FormData();
      body.append("video", file);
      body.append("fileName", file.name);
      if (creatorId) body.append("creatorId", creatorId);
      const res = await fetch("/api/hooks/transcribe", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not transcribe that video.");
      applyProject(data.project);
      setHooks(data.hooks || []);
      setSelectedId(data.hooks?.[0]?.id || null);
      setNotice(data.notice || "");
      window.history.replaceState(null, "", `/hub/hook-lab?project=${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transcribe that video.");
    } finally {
      setPhase("");
    }
  }

  async function rewrite(event?: FormEvent) {
    event?.preventDefault();
    if (!project) return;
    setPhase("Writing hooks from the transcript");
    setError("");
    try {
      const transcript = words.map((word) => word.word).join(" ");
      const res = await fetch("/api/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, projectId: project.id, creatorId: creatorId || null, count: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not write hooks.");
      setHooks(data.hooks || []);
      setSelectedId(data.hooks?.[0]?.id || null);
      setNotice(data.notice || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write hooks.");
    } finally {
      setPhase("");
    }
  }

  async function exportVideo(saveVariant: boolean) {
    if (!project) return;
    setPhase(saveVariant ? "Exporting and saving a variant" : "Burning captions");
    setError("");
    try {
      const res = await fetch("/api/hooks/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, words, segments, style, saveVariant }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.fileName || "hook-lab"}-captions.mp4`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(res.headers.get("X-Variant-Id") ? "Exported, and a copy was saved under Variants." : "Exported. This did not use the existing processor.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setPhase("");
    }
  }

  function doSplit() {
    const next = splitAt(segments, time);
    if (next.length === segments.length) {
      setError("Move the playhead into a segment before splitting.");
      return;
    }
    setError("");
    setSegments(next);
    saveEdit({ segments: next });
  }

  function removeSegment(id: string) {
    if (segments.length < 2) {
      setError("Keep at least one segment.");
      return;
    }
    const next = segments.filter((seg) => seg.id !== id);
    setSegments(next);
    saveEdit({ segments: next });
  }

  function moveSegment(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= segments.length) return;
    const next = segments.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setSegments(next);
    saveEdit({ segments: next });
  }

  async function toggleFavourite(hook: HookDTO) {
    const res = await fetch(`/api/hooks/${hook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favourite: !hook.favourite }),
    });
    const data = await res.json();
    if (res.ok) setHooks((prev) => prev?.map((item) => (item.id === hook.id ? data.hook : item)) ?? []);
  }

  async function removeHook(hook: HookDTO) {
    const res = await fetch(`/api/hooks/${hook.id}`, { method: "DELETE" });
    if (res.ok) setHooks((prev) => prev?.filter((item) => item.id !== hook.id) ?? []);
  }

  const showEditor = tab === "Hook Lab" || tab === "Captions";

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[#f4efe8] text-[#2c241c]">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#e4d5c6] px-3" role="tablist">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`shrink-0 border-b-2 px-3 py-3 text-[15px] ${tab === item ? "border-[#9a3412] font-medium" : "border-transparent text-[#6d5e53]"}`}
          >
            {item}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 py-2">
          <button type="button" disabled={!project || Boolean(phase)} onClick={() => exportVideo(false)} className="rounded-md bg-[#9a3412] px-3 py-1.5 text-[15px] text-[#fffdfb] disabled:opacity-40">
            Export
          </button>
          <button type="button" disabled={!project || Boolean(phase)} onClick={() => exportVideo(true)} className="rounded-md border border-[#e4d5c6] bg-white px-3 py-1.5 text-[15px] disabled:opacity-40">
            Export and save
          </button>
        </div>
      </div>

      {phase && (
        <p className="flex items-center gap-2 border-b border-[#e4d5c6] bg-[#fffdfb] px-4 py-2 text-[15px]">
          <Loader2 className="h-4 w-4 animate-spin" /> {phase}
        </p>
      )}
      {error && <p className="border-b border-[#e4d5c6] bg-[#fff4ef] px-4 py-2 text-[15px] text-[#9a3412]" role="alert">{error}</p>}
      {notice && !error && <p className="border-b border-[#e4d5c6] px-4 py-2 text-[15px] text-[#6d5e53]">{notice}</p>}

      {tab === "Reframe" || tab === "B-roll" ? (
        <div className="mx-auto max-w-lg px-6 py-16">
          <h1 className="text-2xl font-medium">{tab}</h1>
          <p className="mt-2 text-[16px] leading-relaxed text-[#6d5e53]">
            {tab} is not part of this editor. Hook Lab can split the clip and burn captions. The existing processor is unchanged.
          </p>
        </div>
      ) : null}

      {tab === "Metrics" && (
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-medium">Metrics</h1>
          <p className="mt-2 text-[16px] text-[#6d5e53]">Numbers come from results logged on these hooks. Estimates in the list are not measured retention.</p>
          <div className="mt-4 overflow-x-auto rounded-md border border-[#e4d5c6] bg-white">
            <table className="w-full text-left text-[15px]">
              <thead className="text-[#6d5e53]">
                <tr>
                  <th className="px-3 py-2 font-medium">Hook</th>
                  <th className="px-3 py-2 font-medium">Views</th>
                  <th className="px-3 py-2 font-medium">Watch</th>
                  <th className="px-3 py-2 font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {(hooks || []).map((hook) => (
                  <tr key={hook.id} className="border-t border-[#e4d5c6]">
                    <td className="px-3 py-2">{hook.text}</td>
                    <td className="px-3 py-2">{hook.views}</td>
                    <td className="px-3 py-2">{hook.watchTimeSec.toFixed(1)}s</td>
                    <td className="px-3 py-2">{hook.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hooks?.length === 0 && <p className="px-3 py-8 text-center text-[15px] text-[#6d5e53]">No hooks yet.</p>}
          </div>
        </div>
      )}

      {showEditor && (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <aside className="overflow-y-auto border-b border-[#e4d5c6] lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-[#e4d5c6] p-3">
              <label className="block text-[15px]">
                Creator
                <select value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="mt-1 w-full rounded-md border border-[#e4d5c6] bg-white px-2 py-2">
                  <option value="">No creator</option>
                  {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => rewrite()} disabled={!project || Boolean(phase)} className="w-full rounded-md border border-[#e4d5c6] bg-white px-3 py-2 text-[15px] disabled:opacity-40">
                Write hooks from this transcript
              </button>
            </div>
            <div className="px-3 py-2 text-[15px] font-medium">Hooks · {hooks?.length ?? 0}</div>
            <div className="space-y-2 px-3 pb-4">
              {hooks === null && project && <p className="text-[15px] text-[#6d5e53]">Loading hooks</p>}
              {hooks?.length === 0 && <p className="rounded-md border border-dashed border-[#e4d5c6] px-3 py-6 text-center text-[15px] text-[#6d5e53]">Upload a talking video. Hooks are written from what they say.</p>}
              {hooks?.map((hook) => (
                <article key={hook.id} className={`rounded-md border p-2 ${selected?.id === hook.id ? "border-[#9a3412] bg-[#fff4ef]" : "border-[#e4d5c6] bg-white"}`}>
                  <button type="button" onClick={() => setSelectedId(hook.id)} className="w-full text-left text-[15px] leading-snug">{hook.text}</button>
                  <div className="mt-2 flex items-center justify-between text-[14px] text-[#6d5e53]">
                    <span title="Estimate, not a measured result">{hook.score}</span>
                    <span className="flex gap-1">
                      <button type="button" aria-label="Favourite hook" onClick={() => toggleFavourite(hook)} className="rounded p-1">
                        <Star className="h-4 w-4" fill={hook.favourite ? "currentColor" : "none"} />
                      </button>
                      <button type="button" aria-label="Delete hook" onClick={() => removeHook(hook)} className="rounded p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </aside>

          <section className="flex min-h-[320px] flex-col bg-[#f7f2eb]">
            <div className="relative flex flex-1 items-center justify-center p-4">
              {project ? (
                <div className="relative max-h-[520px] w-full max-w-[360px]">
                  <video
                    ref={videoRef}
                    src={`/api/hooks/projects/${project.id}/file`}
                    className="max-h-[520px] w-full bg-[#1c1612]"
                    playsInline
                    onTimeUpdate={onTimeUpdate}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                  />
                  <CaptionOverlay word={active} nearby={timed} style={style} />
                </div>
              ) : (
                <label
                  className="flex w-full max-w-xl cursor-pointer flex-col items-center rounded-md border border-dashed border-[#c8b6a4] bg-white px-6 py-16 text-center"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    onUpload(event.dataTransfer.files?.[0] || null);
                  }}
                >
                  <span className="text-[18px] font-medium">Upload a video</span>
                  <span className="mt-2 max-w-sm text-[16px] text-[#6d5e53]">MP4, MOV, or WebM. The audio is transcribed, then hooks are written from those words.</span>
                  <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0] || null)} />
                </label>
              )}
            </div>
            {project && (
              <div className="flex flex-wrap items-center gap-2 border-t border-[#e4d5c6] px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      seekComposed(time);
                      video.play().catch(() => {});
                    } else video.pause();
                  }}
                  className="rounded-md border border-[#e4d5c6] bg-white px-3 py-1.5 text-[15px]"
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={doSplit} className="rounded-md border border-[#e4d5c6] bg-white px-3 py-1.5 text-[15px]">Split at playhead</button>
                <span className="text-[15px] text-[#6d5e53]">{formatClock(time)} / {formatClock(duration)}</span>
                <label className="ml-auto cursor-pointer text-[15px] text-[#9a3412]">
                  Replace video
                  <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0] || null)} />
                </label>
              </div>
            )}
          </section>

          <aside className="overflow-y-auto border-t border-[#e4d5c6] p-3 lg:border-l lg:border-t-0">
            <h2 className="text-[16px] font-medium">Caption style</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={style.preset === preset.id}
                  onClick={() => {
                    const next = { ...style, preset: preset.id };
                    setStyle(next);
                    saveEdit({ style: next });
                  }}
                  className={`rounded-md border px-2 py-1 text-[14px] ${style.preset === preset.id ? "border-[#9a3412] bg-[#fff4ef]" : "border-[#e4d5c6] bg-white"}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-[15px]">
              Font
              <select value={style.font} onChange={(event) => { const next = { ...style, font: event.target.value as CaptionStyle["font"] }; setStyle(next); saveEdit({ style: next }); }} className="mt-1 w-full rounded-md border border-[#e4d5c6] bg-white px-2 py-2">
                <option>DM Sans</option>
                <option>Georgia</option>
                <option>Impact</option>
              </select>
            </label>
            <label className="mt-3 block text-[15px]">
              Size {style.size}
              <input type="range" min={32} max={96} value={style.size} onChange={(event) => setStyle({ ...style, size: Number(event.target.value) })} onMouseUp={() => saveEdit()} onTouchEnd={() => saveEdit()} className="w-full" />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[15px]">
              <label>Colour <input type="color" value={style.color} onChange={(event) => { const next = { ...style, color: event.target.value }; setStyle(next); saveEdit({ style: next }); }} className="mt-1 block h-9 w-full" /></label>
              <label>Highlight <input type="color" value={style.highlight} onChange={(event) => { const next = { ...style, highlight: event.target.value }; setStyle(next); saveEdit({ style: next }); }} className="mt-1 block h-9 w-full" /></label>
            </div>
            <div className="mt-3 flex gap-2">
              {(["top", "middle", "bottom"] as const).map((position) => (
                <button key={position} type="button" aria-pressed={style.position === position} onClick={() => { const next = { ...style, position }; setStyle(next); saveEdit({ style: next }); }} className={`rounded-md border px-2 py-1 text-[14px] ${style.position === position ? "border-[#9a3412]" : "border-[#e4d5c6]"}`}>
                  {position}
                </button>
              ))}
            </div>
            <h2 className="mt-6 text-[16px] font-medium">Live metrics</h2>
            {totals.logs === 0 ? (
              <p className="mt-2 text-[15px] text-[#6d5e53]">No results logged for these hooks yet.</p>
            ) : (
              <dl className="mt-2 space-y-2 text-[15px]">
                <div className="flex justify-between rounded-md border border-[#e4d5c6] bg-white px-3 py-2"><dt>Views</dt><dd>{totals.views.toLocaleString()}</dd></div>
                <div className="flex justify-between rounded-md border border-[#e4d5c6] bg-white px-3 py-2"><dt>Watch</dt><dd>{totals.watch.toFixed(1)}s</dd></div>
              </dl>
            )}
          </aside>
        </div>
      )}

      {showEditor && project && (
        <div className="border-t border-[#e4d5c6] bg-[#fffdfb] px-3 py-3">
          <div
            ref={barRef}
            className="relative h-16 cursor-pointer rounded-md bg-[#efe4d8]"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              seekComposed(ratio * duration);
            }}
          >
            <div className="absolute inset-1 flex gap-1">
              {segments.map((seg, index) => {
                const width = duration > 0 ? ((seg.end - seg.start) / duration) * 100 : 0;
                return (
                  <div key={seg.id} className="relative h-full rounded-sm bg-[#d8b79a]" style={{ width: `${width}%` }}>
                    <button type="button" aria-label="Trim start" className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" onPointerDown={(event) => trim(event, index, "start")} />
                    <button type="button" aria-label="Trim end" className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" onPointerDown={(event) => trim(event, index, "end")} />
                    <span className="absolute left-2 top-1 text-[12px] text-[#2c241c]">Clip {index + 1}</span>
                    <span className="absolute bottom-1 right-2 flex gap-1 text-[12px]">
                      <button type="button" onClick={(event) => { event.stopPropagation(); moveSegment(index, -1); }}>Earlier</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); moveSegment(index, 1); }}>Later</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); removeSegment(seg.id); }}>Delete</button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="absolute top-0 h-full w-px bg-[#9a3412]" style={{ left: `${duration > 0 ? (time / duration) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 flex max-h-24 flex-wrap gap-1 overflow-y-auto" aria-label="Transcript">
            {timed.map((word, index) => (
              <button
                key={`${word.word}-${word.start}-${index}`}
                type="button"
                onClick={() => {
                  const video = videoRef.current;
                  const indexInSegments = segments.findIndex((seg) => word.start >= seg.start && word.start < seg.end);
                  if (indexInSegments >= 0) {
                    segRef.current = indexInSegments;
                    let cursor = 0;
                    for (let i = 0; i < indexInSegments; i++) cursor += segments[i].end - segments[i].start;
                    setTime(cursor + (word.start - segments[indexInSegments].start));
                  }
                  if (video) video.currentTime = word.start;
                  setEditing(index);
                }}
                className={`rounded px-1.5 py-0.5 text-[15px] ${active === word ? "bg-[#e07a3d] text-[#fffdfb]" : "bg-[#efe4d8]"}`}
              >
                {editing === index ? (
                  <input
                    autoFocus
                    defaultValue={word.word}
                    className="w-20 bg-transparent outline-none"
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      const next = words.map((item) => (item.start === word.start && item.word === word.word ? { ...item, word: event.target.value.trim() || item.word } : item));
                      setWords(next);
                      setEditing(null);
                      saveEdit({ words: next });
                    }}
                  />
                ) : word.word}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "Captions" && (
        <div className="border-t border-[#e4d5c6] px-4 py-4">
          <CaptionStudio creatorId={creatorId} topicDefault={selected?.text || words.map((word) => word.word).join(" ")} />
        </div>
      )}
    </div>
  );

  function trim(event: ReactPointerEvent<HTMLButtonElement>, index: number, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const bar = barRef.current;
    if (!bar) return;
    const total = composedDuration(segments) || 1;
    const width = bar.getBoundingClientRect().width || 1;
    const originX = event.clientX;
    const original = segments[index];
    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - originX) / width) * total;
      setSegments((prev) => prev.map((seg, i) => {
        if (i !== index) return seg;
        if (edge === "start") return { ...seg, start: Math.min(original.end - 0.12, Math.max(0, original.start + delta)) };
        return { ...seg, end: Math.max(original.start + 0.12, Math.min(project?.durationSec || original.end, original.end + delta)) };
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      setSegments((current) => {
        saveEdit({ segments: current });
        return current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remain = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function CaptionOverlay({
  word,
  nearby,
  style,
}: {
  word: { word: string; composedStart: number; composedEnd: number } | null;
  nearby: { word: string; composedStart: number; composedEnd: number }[];
  style: CaptionStyle;
}) {
  if (!word) return null;
  const index = nearby.indexOf(word);
  const group = nearby.slice(Math.max(0, index - 2), index + 3);
  const font = style.font === "Georgia" ? "Georgia, serif" : style.font === "Impact" ? "Impact, 'Arial Black', sans-serif" : '"DM Sans", "Segoe UI", sans-serif';
  const place = style.position === "top" ? "top-6" : style.position === "middle" ? "top-1/2 -translate-y-1/2" : "bottom-8";
  const shared = { fontFamily: font, fontSize: `${Math.round(style.size / 3)}px`, color: style.color };
  if (style.preset === "karaoke") {
    return <p className={`pointer-events-none absolute left-0 right-0 text-center font-bold ${place}`} style={{ ...shared, fontSize: `${Math.round(style.size / 2.4)}px`, transform: "scale(1.06)" }}>{word.word}</p>;
  }
  return (
    <p className={`pointer-events-none absolute left-3 right-3 text-center font-bold leading-tight ${place}`} style={shared}>
      <span
        className={style.preset === "boxed" ? "rounded bg-black/75 px-2 py-1" : ""}
        style={style.preset === "outline" ? { WebkitTextStroke: "1px #1c1612" } : undefined}
      >
        {(style.preset === "highlight" || style.preset === "big" ? group : [word]).map((item) => (
          <span key={`${item.composedStart}-${item.word}`} style={{ color: item === word ? style.highlight : style.color, marginRight: 6 }}>
            {item.word}
          </span>
        ))}
      </span>
    </p>
  );
}
