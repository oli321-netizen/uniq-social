"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Pause, Play, Star, Trash2 } from "lucide-react";
import type { CreatorDTO, HookDTO } from "@/lib/serialize";
import CaptionStudio from "@/components/hub/CaptionStudio";
import EditorTimeline, { type FilmstripInfo } from "@/components/hub/editor/Timeline";
import { applyPreset, DEFAULT_STYLE, PRESET_LIST, type CaptionStyle } from "@/lib/caption-ass";
import { FONT_FACE_CSS, cssFamily, CAPTION_FONTS } from "@/lib/caption-fonts";
import { breakCueLines, buildCues, type CaptionCue } from "@/lib/caption-cues";
import {
  clampSpeed,
  composedDuration,
  cutSourceRanges,
  fillerIndexes,
  mapWords,
  rangesForIndexes,
  sentenceGroups,
  setSegmentSpeed,
  silenceRanges,
  sourceAt,
  splitAt,
  type Segment,
  type WordStamp,
} from "@/lib/edit-timeline";

type Project = {
  id: string;
  creatorId: string | null;
  fileName: string;
  durationSec: number;
  words: WordStamp[];
  segments: Segment[];
  style: CaptionStyle;
  cues: CaptionCue[];
};

type Doc = { words: WordStamp[]; segments: Segment[]; cues: CaptionCue[]; style: CaptionStyle };
type LeftTab = "Media" | "Transcript" | "Hooks" | "Posts";

const EMPTY: Doc = { words: [], segments: [], cues: [], style: DEFAULT_STYLE };

export default function HookLab() {
  const search = useSearchParams();
  const [left, setLeft] = useState<LeftTab>("Transcript");
  const [creators, setCreators] = useState<CreatorDTO[]>([]);
  const [creatorId, setCreatorId] = useState(search.get("creator") || "");
  const [project, setProject] = useState<Project | null>(null);
  const [doc, setDoc] = useState<Doc>(EMPTY);
  const docRef = useRef(doc);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const gestureBase = useRef<Doc | null>(null);
  const [hooks, setHooks] = useState<HookDTO[] | null>(null);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const segRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const [zoom, setZoom] = useState(72);
  const [snap, setSnap] = useState(true);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [editingWord, setEditingWord] = useState<number | null>(null);
  const [filmstrip, setFilmstrip] = useState<FilmstripInfo>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [downloadHref, setDownloadHref] = useState("");
  const [saveVariant, setSaveVariant] = useState(true);
  const [frameHeight, setFrameHeight] = useState(640);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);

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
        if (data.project) openProject(data.project);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setFrameHeight(node.clientHeight || 640));
    observer.observe(node);
    return () => observer.disconnect();
  }, [project?.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      actions.current.onKey(event);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openProject(next: Project) {
    const cues = next.cues?.length ? next.cues : buildCues(next.words, next.segments);
    const incoming: Doc = { words: next.words, segments: next.segments, cues, style: next.style || DEFAULT_STYLE };
    past.current = [];
    future.current = [];
    gestureBase.current = null;
    docRef.current = incoming;
    setDoc(incoming);
    setProject(next);
    setTime(0);
    timeRef.current = 0;
    setSelectedClip(next.segments[0]?.id || null);
    setSelectedCue(null);
    setSelectedWord(null);
    setDownloadHref("");
    setExportProgress(null);
    if (next.creatorId) setCreatorId(next.creatorId);
    loadHooks(next.id);
    loadMedia(next.id);
  }

  function loadMedia(id: string) {
    setFilmstrip(null);
    setPeaks([]);
    fetch(`/api/hooks/projects/${id}/filmstrip`)
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setFilmstrip({
          url,
          frames: Number(res.headers.get("x-frames") || 0),
          interval: Number(res.headers.get("x-interval") || 1),
        });
      })
      .catch(() => {});
    fetch(`/api/hooks/projects/${id}/waveform`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.peaks)) setPeaks(data.peaks);
      })
      .catch(() => {});
  }

  async function loadHooks(projectId: string) {
    const res = await fetch(`/api/hooks?projectId=${encodeURIComponent(projectId)}`);
    const data = await res.json();
    if (!res.ok) return;
    setHooks(data.hooks || []);
    setSelectedHook((current) => current || data.hooks?.[0]?.id || null);
  }

  function scheduleSave(next: Doc) {
    if (!project) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveLabel("Saving");
    saveTimer.current = window.setTimeout(async () => {
      const res = await fetch(`/api/hooks/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words: next.words,
          segments: next.segments,
          cues: next.cues,
          style: next.style,
          transcript: next.words.map((word) => word.word).join(" "),
        }),
      });
      setSaveLabel(res.ok ? "Saved" : "Save failed");
    }, 700);
  }

  function adopt(next: Doc, history: boolean) {
    if (history) {
      past.current.push(docRef.current);
      if (past.current.length > 60) past.current.shift();
      future.current = [];
    }
    docRef.current = next;
    setDoc(next);
    scheduleSave(next);
  }

  function commit(next: Doc) {
    setError("");
    adopt(next, true);
  }

  function undo() {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(docRef.current);
    docRef.current = previous;
    setDoc(previous);
    scheduleSave(previous);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    docRef.current = next;
    setDoc(next);
    scheduleSave(next);
  }

  function beginGesture() {
    if (!gestureBase.current) gestureBase.current = docRef.current;
  }

  function endGesture(kind: "clips" | "cues") {
    const base = gestureBase.current;
    gestureBase.current = null;
    if (!base) return;
    let next = docRef.current;
    if (kind === "clips" && JSON.stringify(base.segments) !== JSON.stringify(next.segments)) {
      next = { ...next, cues: buildCues(next.words, next.segments) };
      docRef.current = next;
      setDoc(next);
    }
    if (JSON.stringify(base) === JSON.stringify(next)) return;
    past.current.push(base);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    scheduleSave(next);
  }

  function previewSegments(segments: Segment[]) {
    const next = { ...docRef.current, segments };
    docRef.current = next;
    setDoc(next);
  }

  function previewCues(cues: CaptionCue[]) {
    const next = { ...docRef.current, cues };
    docRef.current = next;
    setDoc(next);
  }

  function previewStyle(partial: Partial<CaptionStyle>) {
    if (!gestureBase.current) gestureBase.current = docRef.current;
    const next = { ...docRef.current, style: { ...docRef.current.style, ...partial } };
    docRef.current = next;
    setDoc(next);
  }

  function seek(composed: number) {
    const list = docRef.current.segments;
    if (list.length === 0) return;
    const pos = sourceAt(list, composed);
    segRef.current = pos.index;
    const video = videoRef.current;
    const seg = list[pos.index];
    if (video && seg) {
      video.playbackRate = pos.speed;
      const cap = Math.max(seg.start, seg.end - 0.02);
      video.currentTime = Math.min(cap, Math.max(seg.start, pos.source));
    }
    timeRef.current = pos.composed;
    setTime(pos.composed);
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    const list = docRef.current.segments;
    const index = segRef.current;
    const seg = list[index];
    if (!video || !seg) return;
    if (video.currentTime >= seg.end - 0.04) {
      const next = list[index + 1];
      if (next && !video.paused) {
        segRef.current = index + 1;
        video.playbackRate = clampSpeed(next.speed);
        video.currentTime = next.start;
        return;
      }
      video.pause();
      setPlaying(false);
      const end = composedDuration(list);
      timeRef.current = end;
      setTime(end);
      return;
    }
    let cursor = 0;
    for (let i = 0; i < index; i++) cursor += Math.max(0, list[i].end - list[i].start) / clampSpeed(list[i].speed);
    const composed = cursor + Math.max(0, video.currentTime - seg.start) / clampSpeed(seg.speed);
    timeRef.current = composed;
    setTime(composed);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video || docRef.current.segments.length === 0) return;
    if (video.paused) {
      const total = composedDuration(docRef.current.segments);
      if (timeRef.current >= total - 0.05) seek(0);
      else seek(timeRef.current);
      video.play().catch(() => {});
    } else video.pause();
  }

  function doSplit() {
    const next = splitAt(docRef.current.segments, timeRef.current);
    if (next.length === docRef.current.segments.length) {
      setError("Move the playhead inside a clip before splitting.");
      return;
    }
    const cues = buildCues(docRef.current.words, next);
    commit({ ...docRef.current, segments: next, cues });
  }

  function rippleDelete() {
    const current = docRef.current;
    if (selectedCue) {
      commit({ ...current, cues: current.cues.filter((cue) => cue.id !== selectedCue) });
      setSelectedCue(null);
      return;
    }
    if (selectedClip) {
      if (current.segments.length < 2) {
        setError("Keep at least one clip.");
        return;
      }
      const segments = current.segments.filter((seg) => seg.id !== selectedClip);
      commit({ ...current, segments, cues: buildCues(current.words, segments) });
      setSelectedClip(segments[0]?.id || null);
      return;
    }
    if (selectedWord !== null) deleteWords([selectedWord]);
  }

  function deleteWords(indexes: number[]) {
    const current = docRef.current;
    const drop = new Set(indexes);
    const ranges = rangesForIndexes(current.words, drop);
    const words = current.words.filter((_, index) => !drop.has(index));
    if (words.length === 0) {
      setError("Keep at least one word.");
      return;
    }
    const segments = cutSourceRanges(current.segments, ranges, project?.durationSec || 0);
    commit({ ...current, words, segments, cues: buildCues(words, segments) });
    setSelectedWord(null);
    setNotice("");
  }

  function nudge(direction: number, amount: number) {
    const current = docRef.current;
    if (selectedCue) {
      const cue = current.cues.find((item) => item.id === selectedCue);
      if (!cue) return;
      const delta = direction * amount;
      const cues = current.cues.map((item) =>
        item.id === cue.id
          ? {
              ...item,
              start: item.start + delta,
              end: item.end + delta,
              words: item.words.map((word) => ({ ...word, start: word.start + delta, end: word.end + delta })),
            }
          : item
      );
      commit({ ...current, cues });
      return;
    }
    if (selectedClip) {
      const segments = current.segments.map((seg) => {
        if (seg.id !== selectedClip) return seg;
        const length = seg.end - seg.start;
        const start = Math.max(0, Math.min((project?.durationSec || seg.end) - length, seg.start + direction * amount));
        return { ...seg, start, end: start + length };
      });
      commit({ ...current, segments, cues: buildCues(current.words, segments) });
      return;
    }
    seek(Math.max(0, timeRef.current + direction * amount));
  }

  const actions = useRef<{ onKey: (event: KeyboardEvent) => void }>({ onKey: () => {} });
  actions.current.onKey = (event: KeyboardEvent) => {
    if (!project) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    } else if (event.key.toLowerCase() === "s" && !meta) {
      event.preventDefault();
      doSplit();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      rippleDelete();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      nudge(event.key === "ArrowRight" ? 1 : -1, event.shiftKey ? 0.5 : 0.05);
    }
  };

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
      openProject(data.project);
      setHooks(data.hooks || []);
      setSelectedHook(data.hooks?.[0]?.id || null);
      setNotice(data.notice || "");
      setLeft("Transcript");
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
      const transcript = docRef.current.words.map((word) => word.word).join(" ");
      const res = await fetch("/api/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, projectId: project.id, creatorId: creatorId || null, count: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not write hooks.");
      setHooks(data.hooks || []);
      setSelectedHook(data.hooks?.[0]?.id || null);
      setNotice(data.notice || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write hooks.");
    } finally {
      setPhase("");
    }
  }

  async function exportVideo() {
    if (!project) return;
    setExportProgress(0);
    setDownloadHref("");
    setError("");
    try {
      const current = docRef.current;
      const res = await fetch("/api/hooks/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          words: current.words,
          segments: current.segments,
          style: current.style,
          cues: current.cues,
          saveVariant,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let download = "";
      let variantId = "";
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as { progress?: number; error?: string; download?: string; variantId?: string | null };
          if (message.error) throw new Error(message.error);
          if (typeof message.progress === "number") setExportProgress(message.progress);
          if (message.download) download = message.download;
          if (message.variantId) variantId = message.variantId;
        }
      }
      if (!download) throw new Error("Export finished without a file.");
      setDownloadHref(download);
      setExportProgress(1);
      setNotice(variantId ? "Exported 1080×1920. A copy was saved under Variants." : "Exported 1080×1920.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setExportProgress(null);
    }
  }

  function removeSilences() {
    const ranges = silenceRanges(doc.words);
    if (ranges.length === 0) {
      setError("No silences longer than 0.35s between words.");
      return;
    }
    const segments = cutSourceRanges(doc.segments, ranges, project?.durationSec || 0);
    commit({ ...doc, segments, cues: buildCues(doc.words, segments) });
    setNotice(`Removed ${ranges.length} silent gaps.`);
  }

  function removeFillers() {
    const indexes = fillerIndexes(doc.words);
    if (indexes.size === 0) {
      setError("No filler words in this transcript.");
      return;
    }
    deleteWords(Array.from(indexes));
    setNotice(`Removed ${indexes.size} filler words.`);
  }

  function setStyle(style: CaptionStyle) {
    commit({ ...docRef.current, style });
  }

  const duration = composedDuration(doc.segments);
  const activeCue = doc.cues.find((cue) => time >= cue.start && time < cue.end) || null;
  const logged = (hooks || []).filter((hook) => hook.loggedResults > 0);
  const selected = hooks?.find((hook) => hook.id === selectedHook) || null;
  const clip = doc.segments.find((seg) => seg.id === selectedClip) || null;
  const sentences = useMemo(() => sentenceGroups(doc.words), [doc.words]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#010313] text-white" data-editor="hook-lab">
      <style>{`${FONT_FACE_CSS}@keyframes hookPop{from{transform:scale(.82)}to{transform:scale(1)}}@keyframes hookScale{from{transform:scale(.94)}to{transform:scale(1.04)}}`}</style>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <p className="min-w-0 truncate text-[15px]">{project?.fileName || "Hook Lab"}</p>
        <span className="text-[13px] text-slate-400">{saveLabel}</span>
        <button type="button" onClick={undo} className="rounded-md border border-white/10 px-2 py-1 text-[13px]">Undo</button>
        <button type="button" onClick={redo} className="rounded-md border border-white/10 px-2 py-1 text-[13px]">Redo</button>
        <button type="button" onClick={doSplit} disabled={!project} className="rounded-md border border-white/10 px-2 py-1 text-[13px] disabled:opacity-40">Split</button>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-slate-300">
          <input type="checkbox" checked={saveVariant} onChange={(event) => setSaveVariant(event.target.checked)} />
          Save to Variants
        </label>
        <button type="button" onClick={exportVideo} disabled={!project || exportProgress !== null && exportProgress < 1} className="rounded-md bg-purple-600 px-3 py-1.5 text-[14px] disabled:opacity-40">
          Export 1080×1920
        </button>
        {downloadHref && (
          <a href={downloadHref} className="rounded-md border border-white/10 px-3 py-1.5 text-[14px]">Download</a>
        )}
      </div>
      {exportProgress !== null && (
        <div className="h-1 bg-white/10">
          <div className="h-full bg-purple-500" style={{ width: `${Math.round(exportProgress * 100)}%` }} />
        </div>
      )}
      {phase && (
        <p className="flex items-center gap-2 border-b border-white/10 bg-[#0a0a1a] px-3 py-2 text-[14px]">
          <Loader2 className="h-4 w-4 animate-spin" /> {phase}
        </p>
      )}
      {error && <p className="border-b border-white/10 bg-purple-500/10 px-3 py-2 text-[14px] text-purple-200" role="alert">{error}</p>}
      {notice && !error && <p className="border-b border-white/10 px-3 py-2 text-[14px] text-slate-400">{notice}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
        <aside className="flex max-h-40 flex-col overflow-hidden border-b border-white/10 lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-2" role="tablist">
            {(["Media", "Transcript", "Hooks", "Posts"] as LeftTab[]).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={left === tab} onClick={() => setLeft(tab)} className={`shrink-0 border-b-2 px-2 py-2 text-[13px] ${left === tab ? "border-purple-500" : "border-transparent text-slate-400"}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {left === "Media" && (
              <div className="space-y-3 text-[14px]">
                <label className="block">
                  Creator
                  <select value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-[#12121A] px-2 py-2">
                    <option value="">No creator</option>
                    {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
                  </select>
                </label>
                <label className="flex cursor-pointer flex-col items-center rounded-md border border-dashed border-white/20 bg-[#12121A] px-3 py-8 text-center">
                  <span>{project ? "Replace video" : "Upload a video"}</span>
                  <span className="mt-1 text-[13px] text-slate-400">MP4, MOV, or WebM. Speech is transcribed.</span>
                  <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0] || null)} />
                </label>
                <p className="text-[13px] text-slate-400">Reframe and B-roll are not part of this editor. Splits, speed, and captions export on their own and do not use the processor.</p>
              </div>
            )}
            {left === "Transcript" && (
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={removeSilences} disabled={!project} className="rounded-md border border-white/10 px-2 py-1 text-[13px] disabled:opacity-40">Remove silences</button>
                  <button type="button" onClick={removeFillers} disabled={!project} className="rounded-md border border-white/10 px-2 py-1 text-[13px] disabled:opacity-40">Remove fillers</button>
                </div>
                {doc.words.length === 0 && <p className="text-[14px] text-slate-400">Upload a talking video. Deleting a word cuts that moment out of the video.</p>}
                <div className="space-y-3" aria-label="Transcript">
                  {sentences.map((sentence, sentenceIndex) => (
                    <div key={`${sentence[0]?.start}-${sentenceIndex}`} className="rounded-md border border-white/10 bg-[#12121A] p-2">
                      <div className="mb-1 flex justify-end">
                        <button type="button" className="text-[12px] text-slate-400" onClick={() => deleteWords(sentence.map((word) => doc.words.indexOf(word)).filter((index) => index >= 0))}>
                          Delete sentence
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sentence.map((word) => {
                          const index = doc.words.indexOf(word);
                          return (
                            <button
                              key={`${word.start}-${index}`}
                              type="button"
                              onClick={() => {
                                setSelectedWord(index);
                                setEditingWord((current) => (current === index ? index : selectedWord === index ? index : null));
                                const timed = mapWords([word], doc.segments)[0];
                                if (timed) seek(timed.composedStart);
                              }}
                              onDoubleClick={() => setEditingWord(index)}
                              className={`rounded px-1 py-0.5 text-[14px] ${selectedWord === index ? "bg-purple-600" : "bg-white/10"}`}
                            >
                              {editingWord === index ? (
                                <input
                                  autoFocus
                                  defaultValue={word.word}
                                  aria-label={`Edit ${word.word}`}
                                  className="w-16 bg-transparent outline-none"
                                  onClick={(event) => event.stopPropagation()}
                                  onBlur={(event) => {
                                    const text = event.target.value.trim() || word.word;
                                    const words = docRef.current.words.map((item, itemIndex) => (itemIndex === index ? { ...item, word: text } : item));
                                    commit({ ...docRef.current, words, cues: buildCues(words, docRef.current.segments) });
                                    setEditingWord(null);
                                  }}
                                />
                              ) : word.word}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {left === "Hooks" && (
              <div className="space-y-2">
                <button type="button" onClick={() => rewrite()} disabled={!project || Boolean(phase)} className="w-full rounded-md border border-white/10 bg-[#12121A] px-3 py-2 text-[14px] disabled:opacity-40">
                  Write hooks from this transcript
                </button>
                {hooks?.length === 0 && <p className="text-[14px] text-slate-400">Hooks are quoted from the transcript.</p>}
                {hooks?.map((hook) => (
                  <article key={hook.id} className={`rounded-md border p-2 ${selected?.id === hook.id ? "border-purple-500 bg-purple-500/10" : "border-white/10 bg-[#12121A]"}`}>
                    <button type="button" onClick={() => setSelectedHook(hook.id)} className="w-full text-left text-[14px]">{hook.text}</button>
                    <div className="mt-2 flex items-center justify-between text-[12px] text-slate-400">
                      <span title="Estimate, not a measured result">{hook.score}</span>
                      <span className="flex gap-1">
                        <button type="button" aria-label="Favourite hook" onClick={() => toggleFavourite(hook)}><Star className="h-4 w-4" fill={hook.favourite ? "currentColor" : "none"} /></button>
                        <button type="button" aria-label="Delete hook" onClick={() => removeHook(hook)}><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                  </article>
                ))}
                <p className="text-[13px] text-slate-400">{logged.length ? `${logged.length} hooks have logged results.` : "No results logged for these hooks yet."}</p>
              </div>
            )}
            {left === "Posts" && <CaptionStudio creatorId={creatorId} topicDefault={selected?.text || doc.words.map((word) => word.word).join(" ")} />}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col bg-[#07080f]">
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {project ? (
              <div ref={frameRef} className="relative h-full max-h-full w-auto max-w-full overflow-hidden rounded-md border border-white/10 bg-black" style={{ aspectRatio: "9 / 16" }}>
                <video
                  ref={videoRef}
                  src={`/api/hooks/projects/${project.id}/file`}
                  className="h-full w-full object-cover"
                  playsInline
                  onTimeUpdate={onTimeUpdate}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-white/40" />
                  <div className="absolute inset-x-0 bottom-0 h-[20%] border-t border-dashed border-white/40" />
                  <div className="absolute inset-y-0 left-0 w-[6%] border-r border-dashed border-white/30" />
                  <div className="absolute inset-y-0 right-0 w-[6%] border-l border-dashed border-white/30" />
                </div>
                <CaptionOverlay cue={activeCue} time={time} style={doc.style} frameHeight={frameHeight} />
              </div>
            ) : (
              <label
                className="flex w-full max-w-md cursor-pointer flex-col items-center rounded-md border border-dashed border-white/20 bg-[#12121A] px-6 py-16 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onUpload(event.dataTransfer.files?.[0] || null);
                }}
              >
                <span className="text-[18px]">Upload a talking video</span>
                <span className="mt-2 text-[14px] text-slate-400">The editor opens a 9:16 canvas with the transcript on a timeline.</span>
                <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0] || null)} />
              </label>
            )}
          </div>
          {project && (
            <div className="flex items-center gap-3 border-t border-white/10 px-3 py-2">
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} className="rounded-md bg-purple-600 p-2">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <input
                aria-label="Scrub preview"
                type="range"
                min={0}
                max={Math.max(duration, 0.01)}
                step={0.01}
                value={Math.min(time, duration)}
                onChange={(event) => seek(Number(event.target.value))}
                className="min-w-0 flex-1"
              />
              <span className="w-24 text-right text-[13px] text-slate-400">{formatClock(time)} / {formatClock(duration)}</span>
            </div>
          )}
        </section>

        <aside className="max-h-48 overflow-y-auto border-t border-white/10 p-3 lg:max-h-none lg:border-l lg:border-t-0">
          <h2 className="text-[14px] font-medium">Properties</h2>
          {clip ? (
            <label className="mt-3 block text-[13px]">
              Clip speed {clampSpeed(clip.speed).toFixed(2)}×
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={clampSpeed(clip.speed)}
                onPointerDown={beginGesture}
                onChange={(event) => {
                  const segments = setSegmentSpeed(docRef.current.segments, clip.id, Number(event.target.value));
                  previewSegments(segments);
                }}
                onPointerUp={() => endGesture("clips")}
                className="w-full"
              />
            </label>
          ) : (
            <p className="mt-2 text-[13px] text-slate-400">Select a clip to change its speed.</p>
          )}
          <h2 className="mt-4 text-[14px] font-medium">Caption preset</h2>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {PRESET_LIST.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={doc.style.preset === preset.id}
                onClick={() => setStyle(applyPreset(preset.id))}
                className={`rounded-md border px-2 py-1 text-left text-[12px] ${doc.style.preset === preset.id ? "border-purple-500 bg-purple-500/15" : "border-white/10 bg-[#12121A]"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-[13px]">
            Font
            <select value={doc.style.font} onChange={(event) => setStyle({ ...doc.style, font: event.target.value as CaptionStyle["font"] })} className="mt-1 w-full rounded-md border border-white/10 bg-[#12121A] px-2 py-2">
              {CAPTION_FONTS.map((font) => <option key={font.id}>{font.id}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-[13px]">
            Size {doc.style.size}
            <input type="range" min={32} max={120} value={doc.style.size} onPointerDown={beginGesture} onChange={(event) => previewStyle({ size: Number(event.target.value) })} onPointerUp={() => endGesture("cues")} onKeyUp={() => endGesture("cues")} onBlur={() => endGesture("cues")} className="w-full" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <label>Colour<input type="color" value={doc.style.color} onChange={(event) => setStyle({ ...docRef.current.style, color: event.target.value })} className="mt-1 block h-8 w-full bg-transparent" /></label>
            <label>Active word<input type="color" value={doc.style.highlight} onChange={(event) => setStyle({ ...docRef.current.style, highlight: event.target.value })} className="mt-1 block h-8 w-full bg-transparent" /></label>
            <label>Stroke<input type="color" value={doc.style.stroke} onChange={(event) => setStyle({ ...docRef.current.style, stroke: event.target.value })} className="mt-1 block h-8 w-full bg-transparent" /></label>
            <label>Stroke {doc.style.strokeWidth}<input type="range" min={0} max={12} value={doc.style.strokeWidth} onPointerDown={beginGesture} onChange={(event) => previewStyle({ strokeWidth: Number(event.target.value) })} onPointerUp={() => endGesture("cues")} onKeyUp={() => endGesture("cues")} onBlur={() => endGesture("cues")} className="w-full" /></label>
          </div>
          <label className="mt-3 block text-[13px]">
            Shadow {doc.style.shadow}
            <input type="range" min={0} max={10} value={doc.style.shadow} onPointerDown={beginGesture} onChange={(event) => previewStyle({ shadow: Number(event.target.value) })} onPointerUp={() => endGesture("cues")} onKeyUp={() => endGesture("cues")} onBlur={() => endGesture("cues")} className="w-full" />
          </label>
          <div className="mt-3 flex flex-wrap gap-1">
            {(["top", "middle", "bottom"] as const).map((position) => (
              <button key={position} type="button" aria-pressed={doc.style.position === position} onClick={() => setStyle({ ...docRef.current.style, position })} className={`rounded-md border px-2 py-1 text-[12px] ${doc.style.position === position ? "border-purple-500" : "border-white/10"}`}>{position}</button>
            ))}
            {(["none", "pop", "scale"] as const).map((animation) => (
              <button key={animation} type="button" aria-pressed={doc.style.animation === animation} onClick={() => setStyle({ ...docRef.current.style, animation })} className={`rounded-md border px-2 py-1 text-[12px] ${doc.style.animation === animation ? "border-purple-500" : "border-white/10"}`}>{animation}</button>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-slate-400">Longer words and emphasis words render larger in the highlight colour. Lines wrap automatically. The same fonts are burned in on export.</p>
        </aside>
      </div>

      {project && (
        <EditorTimeline
          segments={doc.segments}
          cues={doc.cues}
          time={time}
          sourceDuration={project.durationSec}
          zoom={zoom}
          snap={snap}
          peaks={peaks}
          filmstrip={filmstrip}
          selectedClip={selectedClip}
          selectedCue={selectedCue}
          onZoom={setZoom}
          onSnap={setSnap}
          onSeek={seek}
          onSelectClip={setSelectedClip}
          onSelectCue={setSelectedCue}
          onSegments={previewSegments}
          onCues={previewCues}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
        />
      )}
    </div>
  );

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
}

function CaptionOverlay({ cue, time, style, frameHeight }: { cue: CaptionCue | null; time: number; style: CaptionStyle; frameHeight: number }) {
  if (!cue) return null;
  const active = cue.words.findIndex((word) => time >= word.start && time < word.end);
  const lines = breakCueLines(cue.words);
  const fontSize = Math.max(13, (style.size * frameHeight) / 1920);
  const stroke = (style.strokeWidth * frameHeight) / 1920;
  const place = style.position === "top" ? { top: "14%" } : style.position === "middle" ? { top: "42%" } : { bottom: "18%" };
  const animation = style.animation === "pop" ? "hookPop 140ms ease-out" : style.animation === "scale" ? "hookScale 160ms ease-out" : undefined;
  return (
    <div
      key={`${cue.id}-${active}`}
      className="pointer-events-none absolute inset-x-[8%] text-center font-bold leading-none"
      style={{
        ...place,
        fontFamily: cssFamily(style.font),
        fontSize,
        color: style.color,
        WebkitTextStroke: style.preset === "boxed" || stroke <= 0 ? undefined : `${Math.max(0.4, stroke)}px ${style.stroke}`,
        textShadow: style.shadow > 0 ? `${style.shadow}px ${style.shadow}px 0 ${style.stroke}` : undefined,
        paintOrder: "stroke fill",
        animation,
      }}
    >
      <span className={style.preset === "boxed" ? "inline-block bg-black px-2 py-1" : undefined}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex} className="block">
            {line.map((word) => {
              const index = cue.words.indexOf(word);
              const hot = index === active || word.emphasis;
              return (
                <span key={`${word.start}-${index}`} style={{ color: hot ? style.highlight : style.color, fontSize: word.emphasis && index !== active ? fontSize * 1.12 : undefined }}>
                  {word.text}{" "}
                </span>
              );
            })}
          </span>
        ))}
      </span>
    </div>
  );
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remain = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}
