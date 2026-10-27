"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, LayoutGrid, Loader2, Maximize, Pause, Play, Redo2, Undo2 } from "lucide-react";
import type { CreatorDTO, HookDTO } from "@/lib/serialize";
import { SECTIONS, editorLabHref, rememberEditorProject } from "@/components/hub/SectionNav";
import AssetBin, { type RailTab } from "@/components/hub/editor/AssetBin";
import Inspector from "@/components/hub/editor/Inspector";
import EditorTimeline, { type FilmstripInfo, type SelKind } from "@/components/hub/editor/Timeline";
import { DEFAULT_STYLE, type CaptionStyle } from "@/lib/caption-ass";
import { FONT_FACE_CSS, cssFamily } from "@/lib/caption-fonts";
import { breakCueLines, buildCues, type CaptionCue } from "@/lib/caption-cues";
import {
  clampSpeed,
  composedDuration,
  composedStart,
  cutSourceRanges,
  fillerIndexes,
  mapWords,
  newId,
  playDuration,
  rangesForIndexes,
  setSegmentSpeed,
  silenceRanges,
  sourceAt,
  splitAt,
  type Segment,
  type WordStamp,
} from "@/lib/edit-timeline";
import { canvasSize, cssFilter, DEFAULT_EDITOR, transformAt, type EditorDoc } from "@/lib/editor-doc";

type Project = {
  id: string;
  creatorId: string | null;
  fileName: string;
  durationSec: number;
  words: WordStamp[];
  segments: Segment[];
  style: CaptionStyle;
  cues: CaptionCue[];
  editor?: EditorDoc;
};

type Doc = { words: WordStamp[]; segments: Segment[]; cues: CaptionCue[]; style: CaptionStyle; editor: EditorDoc };
const EMPTY: Doc = { words: [], segments: [], cues: [], style: DEFAULT_STYLE, editor: DEFAULT_EDITOR };

function isSpecial(seg?: Segment) {
  return Boolean(seg && (seg.reverse || seg.freeze || seg.kind === "image"));
}

function shownTime(seg: Segment, source: number) {
  if (seg.freeze) return seg.start;
  if (seg.reverse) return Math.max(seg.start, seg.end - (source - seg.start));
  return source;
}

export default function HookLab() {
  const search = useSearchParams();
  const [rail, setRail] = useState<RailTab>("Media");
  const [menuOpen, setMenuOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
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
  const [selKind, setSelKind] = useState<SelKind | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [clipTrack, setClipTrack] = useState<"video" | "audio">("video");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [popover, setPopover] = useState<{ kind: "speed" | "volume"; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState("");
  const [focusToken, setFocusToken] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [editingWord, setEditingWord] = useState<number | null>(null);
  const [filmstrip, setFilmstrip] = useState<FilmstripInfo>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [downloadHref, setDownloadHref] = useState("");
  const saveVariant = true;
  const [frameHeight, setFrameHeight] = useState(640);
  const [frameWidth, setFrameWidth] = useState(360);
  const videoRef = useRef<HTMLVideoElement>(null);
  const blurRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | null>(null);
  const playingRef = useRef(false);
  const holdPlay = useRef(false);
  const projectRef = useRef<Project | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const sectionMenuRef = useRef<HTMLDivElement>(null);

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
    const node = stageRef.current;
    if (!node) return;
    const fit = () => {
      const box = canvasSize(docRef.current.editor);
      const aspect = box.width / Math.max(1, box.height);
      const maxW = Math.max(0, node.clientWidth - 24);
      const maxH = Math.max(0, node.clientHeight - 24);
      if (maxW < 8 || maxH < 8) return;
      let height = maxH;
      let width = height * aspect;
      if (width > maxW) {
        width = maxW;
        height = width / aspect;
      }
      setFrameWidth(Math.max(1, Math.floor(width)));
      setFrameHeight(Math.max(1, Math.floor(height)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    fit();
    return () => observer.disconnect();
  }, [doc.editor.aspect, doc.editor.resolution]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      actions.current.onKey(event);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function down(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && sectionMenuRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menu && !popover) return;
    function down(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || popRef.current?.contains(target))) return;
      setMenu(null);
      setPopover(null);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu(null);
      setPopover(null);
    }
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menu, popover]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const list = docRef.current.segments;
      const index = segRef.current;
      const seg = list[index];
      if (!seg || !isSpecial(seg)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const len = playDuration(seg);
      let nextTime = timeRef.current + dt;
      const video = videoRef.current;
      if (seg.reverse && video && seg.kind !== "image") {
        video.currentTime = Math.max(seg.start, (video.currentTime || seg.end) - dt * clampSpeed(seg.speed));
      }
      if (nextTime >= composedStart(list, index) + len - 0.02) {
        const following = list[index + 1];
        if (!following) {
          holdPlay.current = false;
          playingRef.current = false;
          setPlaying(false);
          timeRef.current = composedDuration(list);
          setTime(timeRef.current);
          return;
        }
        segRef.current = index + 1;
        nextTime = composedStart(list, index + 1);
        if (video && !isSpecial(following)) {
          holdPlay.current = false;
          video.playbackRate = clampSpeed(following.speed);
          video.currentTime = following.reverse ? Math.max(following.start, following.end - 0.05) : following.start;
          video.play().catch(() => {});
        } else holdPlay.current = true;
      }
      timeRef.current = nextTime;
      setTime(nextTime);
      syncMusic(nextTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  function openProject(next: Project) {
    const cues = next.cues?.length ? next.cues : buildCues(next.words, next.segments);
    const incoming: Doc = {
      words: next.words,
      segments: next.segments,
      cues,
      style: next.style || DEFAULT_STYLE,
      editor: next.editor || DEFAULT_EDITOR,
    };
    past.current = [];
    future.current = [];
    gestureBase.current = null;
    docRef.current = incoming;
    setDoc(incoming);
    setProject(next);
    rememberEditorProject(next.id);
    setTime(0);
    timeRef.current = 0;
    setSelectedClip(next.segments[0]?.id || null);
    setSelKind(next.segments[0] ? "clip" : null);
    setLayerId(null);
    setClipTrack("video");
    setSelectedCue(null);
    setMenu(null);
    setPopover(null);
    setFocus(next.segments[0] ? "basic" : "");
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
          editor: next.editor,
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

  function previewEditor(editor: EditorDoc) {
    const next = { ...docRef.current, editor };
    docRef.current = next;
    setDoc(next);
  }

  function previewCaptionStyle(style: CaptionStyle) {
    const next = { ...docRef.current, style };
    docRef.current = next;
    setDoc(next);
  }

  function trimLayer(kind: "overlay" | "audio" | "text", id: string, start: number, end: number) {
    const editor = docRef.current.editor;
    const safeStart = Math.max(0, start);
    const safeEnd = Math.max(safeStart + 0.12, end);
    if (kind === "text") {
      previewEditor({
        ...editor,
        texts: editor.texts.map((item) => (item.id === id ? { ...item, start: safeStart, end: safeEnd } : item)),
      });
      return;
    }
    const key = kind === "overlay" ? "overlays" : "audios";
    previewEditor({
      ...editor,
      [key]: editor[key].map((layer) => {
        if (layer.id !== id) return layer;
        const oldEnd = layer.start + Math.max(0.12, layer.out - layer.in);
        const startMoved = Math.abs(safeStart - layer.start) > 0.0001;
        const endMoved = Math.abs(safeEnd - oldEnd) > 0.0001;
        if (startMoved && !endMoved) {
          const delta = safeStart - layer.start;
          return { ...layer, start: safeStart, in: Math.max(0, layer.in + delta) };
        }
        return { ...layer, out: layer.in + Math.max(0.12, safeEnd - layer.start) };
      }),
    });
  }

  function seek(composed: number) {
    const list = docRef.current.segments;
    if (list.length === 0) return;
    const pos = sourceAt(list, composed);
    segRef.current = pos.index;
    const video = videoRef.current;
    const seg = list[pos.index];
    if (video && seg && seg.kind !== "image") {
      video.playbackRate = pos.speed;
      const cap = Math.max(seg.start, seg.end - 0.02);
      video.currentTime = Math.min(cap, Math.max(seg.start, shownTime(seg, pos.source)));
      video.volume = seg.volume ?? 1;
    }
    timeRef.current = pos.composed;
    setTime(pos.composed);
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    const list = docRef.current.segments;
    const index = segRef.current;
    const seg = list[index];
    if (!video || !seg || isSpecial(seg)) return;
    const local = Math.max(0, video.currentTime - seg.start) / clampSpeed(seg.speed);
    let volume = seg.volume ?? 1;
    if ((seg.fadeIn || 0) > 0 && local < (seg.fadeIn || 0)) volume *= local / (seg.fadeIn || 1);
    const span = playDuration(seg);
    if ((seg.fadeOut || 0) > 0 && span - local < (seg.fadeOut || 0)) volume *= Math.max(0, (span - local) / (seg.fadeOut || 1));
    video.volume = Math.max(0, Math.min(1, volume));
    syncMusic(cursorOf(list, index) + local);
    if (video.currentTime >= (seg.reverse ? seg.start + 0.04 : seg.end - 0.04)) {
      const next = list[index + 1];
      if (next && !video.paused) {
        segRef.current = index + 1;
        if (isSpecial(next) || next.assetId !== seg.assetId || next.kind === "image") {
          holdPlay.current = isSpecial(next);
          const composed = composedStart(list, index + 1);
          timeRef.current = composed;
          setTime(composed);
          video.pause();
          return;
        }
        video.playbackRate = clampSpeed(next.speed);
        video.currentTime = next.reverse ? Math.max(next.start, next.end - 0.04) : next.start;
        return;
      }
      video.pause();
      playingRef.current = false;
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
    const list = docRef.current.segments;
    if (list.length === 0) return;
    if (playingRef.current) {
      holdPlay.current = false;
      playingRef.current = false;
      setPlaying(false);
      videoRef.current?.pause();
      musicRef.current?.pause();
      return;
    }
    const total = composedDuration(list);
    if (timeRef.current >= total - 0.05) seek(0);
    else seek(timeRef.current);
    const pos = sourceAt(list, timeRef.current);
    const seg = list[pos.index];
    playingRef.current = true;
    setPlaying(true);
    if (isSpecial(seg)) {
      holdPlay.current = true;
      videoRef.current?.pause();
      return;
    }
    holdPlay.current = false;
    videoRef.current?.play().catch(() => setPlaying(false));
  }

  function cursorOf(list: Segment[], index: number) {
    let cursor = 0;
    for (let i = 0; i < index; i++) cursor += playDuration(list[i]);
    return cursor;
  }

  function syncMusic(composed: number) {
    const music = musicRef.current;
    const current = projectRef.current;
    if (!music || !current) return;
    const layer = docRef.current.editor.audios.find((item) => composed >= item.start && composed < item.start + Math.max(0.12, item.out - item.in));
    if (!layer) {
      music.pause();
      return;
    }
    const url = `/api/hooks/projects/${current.id}/assets/${layer.assetId}`;
    if (!music.src.includes(layer.assetId)) music.src = url;
    const local = layer.in + (composed - layer.start);
    if (Math.abs((music.currentTime || 0) - local) > 0.35) music.currentTime = Math.max(0, local);
    const span = Math.max(0.12, layer.out - layer.in);
    const into = composed - layer.start;
    let vol = layer.volume ?? 0.8;
    if ((layer.fadeIn || 0) > 0 && into < (layer.fadeIn || 0)) vol *= into / (layer.fadeIn || 1);
    if ((layer.fadeOut || 0) > 0 && span - into < (layer.fadeOut || 0)) vol *= Math.max(0, (span - into) / (layer.fadeOut || 1));
    music.volume = Math.max(0, Math.min(1, vol));
    if (playingRef.current) music.play().catch(() => {});
    else music.pause();
    const blur = blurRef.current;
    const video = videoRef.current;
    if (blur && video && docRef.current.editor.background === "blur" && Math.abs(blur.currentTime - video.currentTime) > 0.25) {
      blur.currentTime = video.currentTime;
    }
  }

  function deselect() {
    setSelKind(null);
    setSelectedClip(null);
    setSelectedCue(null);
    setLayerId(null);
    setMenu(null);
    setPopover(null);
    setFocus("");
  }

  function activate(kind: SelKind, id: string, track: "video" | "audio", x: number, y: number, context: boolean) {
    setPopover(null);
    setSelKind(kind);
    setClipTrack(track);
    if (kind === "clip") {
      setSelectedClip(id);
      setSelectedCue(null);
      setLayerId(null);
      setFocus(track === "audio" ? "volume" : "basic");
      setFocusToken((token) => token + 1);
    } else if (kind === "cue") {
      setSelectedCue(id);
      setSelectedClip(null);
      setLayerId(null);
      setFocus("");
    } else {
      setLayerId(id);
      setSelectedClip(null);
      setSelectedCue(null);
      setFocus(kind === "audio" ? "volume" : "");
      setFocusToken((token) => token + 1);
    }
    if (context) {
      const left = Math.max(8, Math.min(x, window.innerWidth - 196));
      const top = Math.max(8, Math.min(y, window.innerHeight - 380));
      setMenu({ x: left, y: top });
    } else setMenu(null);
    if (kind === "clip") {
      const index = docRef.current.segments.findIndex((seg) => seg.id === id);
      const seg = docRef.current.segments[index];
      if (seg) {
        const start = composedStart(docRef.current.segments, index);
        const end = start + playDuration(seg);
        if (timeRef.current < start || timeRef.current >= end - 0.01) seek(Math.min(start + 0.02, Math.max(start, end - 0.04)));
      }
    } else if (kind === "cue") {
      const cue = docRef.current.cues.find((item) => item.id === id);
      if (cue && (timeRef.current < cue.start || timeRef.current >= cue.end)) seek(Math.min(cue.end - 0.02, cue.start + 0.02));
    }
  }

  function syncActiveLook(seekFrame: boolean) {
    const video = videoRef.current;
    const list = docRef.current.segments;
    if (!video || list.length === 0) return;
    const pos = sourceAt(list, timeRef.current);
    const seg = list[pos.index];
    if (!seg || seg.kind === "image") return;
    video.volume = Math.max(0, Math.min(1, seg.volume ?? 1));
    if (!isSpecial(seg)) video.playbackRate = clampSpeed(seg.speed);
    if (seekFrame && !playingRef.current) {
      const cap = Math.max(seg.start, seg.end - 0.02);
      const target = Math.min(cap, Math.max(seg.start, shownTime(seg, pos.source)));
      if (Math.abs((video.currentTime || 0) - target) > 0.02) video.currentTime = target;
    }
  }

  function patchClip(partial: Partial<Segment>, seekFrame = false) {
    if (!selectedClip) return;
    const segments = docRef.current.segments.map((seg) => (seg.id === selectedClip ? { ...seg, ...partial } : seg));
    applyChange({ segments });
    syncActiveLook(seekFrame);
  }

  function selectedSegment() {
    return docRef.current.segments.find((seg) => seg.id === selectedClip) || null;
  }

  function mirror() {
    const clip = selectedSegment();
    if (!clip) return;
    patchClip({ flipX: !clip.flipX });
  }

  function flipV() {
    const clip = selectedSegment();
    if (!clip) return;
    patchClip({ flipY: !clip.flipY });
  }

  function rotate90() {
    const clip = selectedSegment();
    if (!clip) return;
    const turned = ((((clip.rotate || 0) + 90) % 360) + 360) % 360;
    patchClip({ rotate: turned > 180 ? turned - 360 : turned });
  }

  function toggleCrop() {
    const clip = selectedSegment();
    if (!clip) return;
    patchClip({ crop: (clip.crop || 0) > 0 ? 0 : 0.1 });
  }

  function toggleReverse() {
    const clip = selectedSegment();
    if (!clip) return;
    patchClip({ reverse: !clip.reverse }, true);
  }

  function toggleFreeze() {
    const clip = selectedSegment();
    if (!clip) return;
    patchClip({ freeze: !clip.freeze }, true);
  }

  function toggleMute() {
    if (selKind === "audio" && layerId) {
      const editor = docRef.current.editor;
      const audios = editor.audios.map((layer) => (layer.id === layerId ? { ...layer, volume: (layer.volume ?? 1) <= 0 ? 1 : 0 } : layer));
      applyChange({ editor: { ...editor, audios } });
      syncMusic(timeRef.current);
      return;
    }
    const clip = selectedSegment();
    if (!clip) return;
    patchClip({ volume: (clip.volume ?? 1) <= 0 ? 1 : 0 });
  }

  function previewSpeed(value: number) {
    if (!selectedClip) return;
    beginGesture();
    previewSegments(setSegmentSpeed(docRef.current.segments, selectedClip, value));
    syncActiveLook(false);
  }

  function previewVolume(value: number) {
    beginGesture();
    if (selKind === "audio" && layerId) {
      const editor = docRef.current.editor;
      const audios = editor.audios.map((layer) => (layer.id === layerId ? { ...layer, volume: value } : layer));
      previewEditor({ ...editor, audios });
      syncMusic(timeRef.current);
      return;
    }
    if (!selectedClip) return;
    previewSegments(docRef.current.segments.map((seg) => (seg.id === selectedClip ? { ...seg, volume: value } : seg)));
    syncActiveLook(false);
  }

  function openPopover(kind: "speed" | "volume", anchor: { left: number; top: number; bottom: number }) {
    const width = 224;
    const height = 78;
    let top = anchor.top - height - 8;
    if (top < 8) top = anchor.bottom + 8;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    setMenu(null);
    setPopover({ kind, x: left, y: top });
    setFocus(kind);
    setFocusToken((token) => token + 1);
  }

  function doSplit() {
    const current = docRef.current;
    const t = timeRef.current;
    if (selKind === "cue" && selectedCue) {
      const cue = current.cues.find((item) => item.id === selectedCue);
      if (cue && t > cue.start + 0.04 && t < cue.end - 0.04) {
        const leftWords: CaptionCue["words"] = [];
        const rightWords: CaptionCue["words"] = [];
        for (const word of cue.words) {
          if ((word.start + word.end) / 2 < t) leftWords.push(word);
          else rightWords.push(word);
        }
        if (leftWords.length > 0 && rightWords.length > 0) {
          const left = { ...cue, end: t, words: leftWords };
          const right = { ...cue, id: newId(), start: t, words: rightWords };
          const cues: CaptionCue[] = [];
          for (const item of current.cues) {
            if (item.id === cue.id) cues.push(left, right);
            else cues.push(item);
          }
          commit({ ...current, cues });
          setSelectedCue(right.id);
          return;
        }
      }
    }
    if ((selKind === "overlay" || selKind === "audio") && layerId) {
      const key = selKind === "overlay" ? "overlays" : "audios";
      const layer = current.editor[key].find((item) => item.id === layerId);
      if (layer) {
        const dur = Math.max(0.12, layer.out - layer.in);
        const end = layer.start + dur;
        if (t > layer.start + 0.12 && t < end - 0.12) {
          const layers = [];
          let copyId = "";
          for (const item of current.editor[key]) {
            if (item.id !== layer.id) {
              layers.push(item);
              continue;
            }
            const leftSpan = t - layer.start;
            layers.push({ ...layer, out: layer.in + leftSpan });
            copyId = newId();
            layers.push({ ...layer, id: copyId, start: t, in: layer.in + leftSpan });
          }
          if (layers.length > 4) {
            setError(key === "overlays" ? "You can add up to 4 overlays." : "You can add up to 4 audio clips.");
            return;
          }
          applyChange({ editor: { ...current.editor, [key]: layers } });
          setLayerId(copyId);
          return;
        }
      }
    }
    if (selKind === "text" && layerId) {
      const layer = current.editor.texts.find((item) => item.id === layerId);
      if (layer && t > layer.start + 0.12 && t < layer.end - 0.12) {
        if (current.editor.texts.length >= 12) {
          setError("You can add up to 12 text clips.");
          return;
        }
        const texts = [];
        let copyId = "";
        for (const item of current.editor.texts) {
          if (item.id !== layer.id) {
            texts.push(item);
            continue;
          }
          texts.push({ ...layer, end: t });
          copyId = newId();
          texts.push({ ...layer, id: copyId, start: t });
        }
        applyChange({ editor: { ...current.editor, texts } });
        setLayerId(copyId);
        return;
      }
    }
    const next = splitAt(current.segments, t);
    if (next.length === current.segments.length) {
      setError("Move the playhead inside a clip before splitting.");
      return;
    }
    commit({ ...current, segments: next, cues: buildCues(current.words, next) });
  }

  function rippleDelete() {
    const current = docRef.current;
    if (selKind === "cue" && selectedCue) {
      commit({ ...current, cues: current.cues.filter((cue) => cue.id !== selectedCue) });
      deselect();
      return;
    }
    if (selKind === "overlay" && layerId) {
      applyChange({ editor: { ...current.editor, overlays: current.editor.overlays.filter((layer) => layer.id !== layerId) } });
      deselect();
      return;
    }
    if (selKind === "audio" && layerId) {
      applyChange({ editor: { ...current.editor, audios: current.editor.audios.filter((layer) => layer.id !== layerId) } });
      deselect();
      return;
    }
    if (selKind === "text" && layerId) {
      applyChange({ editor: { ...current.editor, texts: current.editor.texts.filter((layer) => layer.id !== layerId) } });
      deselect();
      return;
    }
    if (selectedClip && (selKind === "clip" || selKind === null)) {
      if (current.segments.length < 2) {
        setError("Keep at least one clip.");
        return;
      }
      const segments = current.segments.filter((seg) => seg.id !== selectedClip);
      commit({ ...current, segments, cues: buildCues(current.words, segments) });
      setSelectedClip(segments[0]?.id || null);
      setSelKind(segments[0] ? "clip" : null);
      setClipTrack("video");
      setLayerId(null);
      setSelectedCue(null);
      return;
    }
    if (selectedWord !== null) deleteWords([selectedWord]);
  }

  function duplicate() {
    const current = docRef.current;
    if (selKind === "clip" && selectedClip) {
      if (current.segments.length >= 80) {
        setError("You can add up to 80 clips.");
        return;
      }
      const index = current.segments.findIndex((seg) => seg.id === selectedClip);
      if (index < 0) return;
      const source = current.segments[index];
      const copy: Segment = {
        ...source,
        id: newId(),
        keyframes: source.keyframes ? source.keyframes.map((key) => ({ ...key })) : undefined,
      };
      const segments = current.segments.slice();
      segments.splice(index + 1, 0, copy);
      commit({ ...current, segments, cues: buildCues(current.words, segments) });
      setSelectedClip(copy.id);
      setSelKind("clip");
      return;
    }
    if (selKind === "cue" && selectedCue) {
      const cue = current.cues.find((item) => item.id === selectedCue);
      if (!cue) return;
      const span = Math.max(0.12, cue.end - cue.start);
      const total = composedDuration(current.segments);
      let start = cue.end;
      if (start + span > total + 0.001) start = Math.min(cue.start + 0.25, Math.max(0, total - span));
      const delta = start - cue.start;
      const copy = {
        ...cue,
        id: newId(),
        start,
        end: start + span,
        words: cue.words.map((word) => ({ ...word, start: word.start + delta, end: word.end + delta })),
      };
      commit({ ...current, cues: [...current.cues, copy] });
      setSelectedCue(copy.id);
      return;
    }
    if (selKind === "overlay" && layerId) {
      const layer = current.editor.overlays.find((item) => item.id === layerId);
      if (!layer) return;
      if (current.editor.overlays.length >= 4) {
        setError("You can add up to 4 overlays.");
        return;
      }
      const dur = Math.max(0.12, layer.out - layer.in);
      const copy = { ...layer, id: newId(), start: layer.start + dur };
      applyChange({ editor: { ...current.editor, overlays: [...current.editor.overlays, copy] } });
      setLayerId(copy.id);
      return;
    }
    if (selKind === "audio" && layerId) {
      const layer = current.editor.audios.find((item) => item.id === layerId);
      if (!layer) return;
      if (current.editor.audios.length >= 4) {
        setError("You can add up to 4 audio clips.");
        return;
      }
      const dur = Math.max(0.12, layer.out - layer.in);
      const copy = { ...layer, id: newId(), start: layer.start + dur };
      applyChange({ editor: { ...current.editor, audios: [...current.editor.audios, copy] } });
      setLayerId(copy.id);
      return;
    }
    if (selKind === "text" && layerId) {
      const layer = current.editor.texts.find((item) => item.id === layerId);
      if (!layer) return;
      if (current.editor.texts.length >= 12) {
        setError("You can add up to 12 text clips.");
        return;
      }
      const span = Math.max(0.12, layer.end - layer.start);
      const copy = { ...layer, id: newId(), start: layer.start + span, end: layer.end + span };
      applyChange({ editor: { ...current.editor, texts: [...current.editor.texts, copy] } });
      setLayerId(copy.id);
    }
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
    if (meta && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicate();
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
      setRail("Media");
      window.history.replaceState(null, "", `/hub/editor-lab?project=${data.project.id}`);
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
          editor: current.editor,
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
      const size = canvasSize(docRef.current.editor);
      setNotice(variantId ? `Exported ${size.width}×${size.height}. A copy was saved under Variants.` : `Exported ${size.width}×${size.height}.`);
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

  function applyChange(change: { editor?: EditorDoc; segments?: Segment[]; cues?: CaptionCue[]; style?: CaptionStyle }) {
    let next: Doc = { ...docRef.current, ...change };
    if (change.segments && !change.cues) next = { ...next, cues: buildCues(next.words, next.segments) };
    commit(next);
  }

  async function importFile(file: File | null, slot: "main" | "overlay" | "audio") {
    if (!file || !project) return;
    setError("");
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/hooks/projects/${project.id}/assets`, { method: "POST", body });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not import that file.");
      return;
    }
    const asset = data.asset as EditorDoc["assets"][number];
    const editor: EditorDoc = { ...docRef.current.editor, assets: [...docRef.current.editor.assets, asset].slice(0, 16) };
    const span = asset.kind === "image" ? 3 : Math.max(0.4, Math.min(slot === "audio" ? 60 : 30, asset.duration || 3));
    if (slot === "main") {
      if (asset.kind === "audio") {
        setError("Add audio on the music track.");
        return;
      }
      applyChange({
        editor,
        segments: [
          ...docRef.current.segments,
          {
            id: newId(),
            start: 0,
            end: span,
            speed: 1,
            kind: asset.kind === "image" ? "image" : "video",
            assetId: asset.id,
            mediaDuration: span,
          },
        ],
      });
      setNotice(asset.kind === "image" ? "Image added as a 3s clip." : "Clip added after the current edit.");
      return;
    }
    if (slot === "overlay") {
      if (asset.kind === "audio") {
        setError("Audio goes on the music track.");
        return;
      }
      applyChange({
        editor: {
          ...editor,
          overlays: [...editor.overlays, { id: newId(), assetId: asset.id, start: timeRef.current, in: 0, out: Math.min(span, 8), scale: 0.45 }].slice(0, 4),
        },
      });
      setNotice("Overlay added.");
      return;
    }
    applyChange({
      editor: {
        ...editor,
        audios: [...editor.audios, { id: newId(), assetId: asset.id, start: timeRef.current, in: 0, out: span, volume: 0.7, fadeIn: 0.15, fadeOut: 0.3 }].slice(0, 4),
      },
    });
    setNotice("Audio added on the music track.");
  }

  const duration = composedDuration(doc.segments);
  projectRef.current = project;
  playingRef.current = playing;
  const canvas = canvasSize(doc.editor);
  const playPos = doc.segments.length ? sourceAt(doc.segments, Math.min(time, duration)) : { index: 0, source: 0, composed: 0, speed: 1 };
  const active = doc.segments[playPos.index];
  const imageMode = active?.kind === "image" && Boolean(active.assetId);
  const videoSrc = project ? `/api/hooks/projects/${project.id}/${active?.assetId && !imageMode ? `assets/${active.assetId}` : "file"}` : "";
  const imageSrc = project && imageMode ? `/api/hooks/projects/${project.id}/assets/${active?.assetId}` : "";
  const clipRatio = active ? Math.max(0, Math.min(1, (time - composedStart(doc.segments, playPos.index)) / Math.max(0.001, playDuration(active)))) : 0;
  const motion = active ? transformAt(active, clipRatio) : { x: 0, y: 0, scale: 1 };
  const localPlay = active ? clipRatio * playDuration(active) : 0;
  const fit = !active || (doc.editor.background !== "blur" && doc.editor.aspect === "9:16" && Math.abs(motion.scale - 1) < 0.02 && !motion.x && !motion.y && !active.rotate && !(active.crop || 0))
    ? "cover"
    : doc.editor.background === "blur"
      ? "blur"
      : "contain";
  const punch = fit === "cover" && active?.effect === "punch" ? 1 + 0.16 * Math.min(1, localPlay / 0.45) : 1;
  const shakeX = fit === "cover" && active?.effect === "shake" ? Math.sin(localPlay * 16) * 10 : 0;
  const shakeY = fit === "cover" && active?.effect === "shake" ? Math.cos(localPlay * 19) * 7 : 0;
  const slide = active?.transition === "slide" && localPlay < 0.35 ? (1 - localPlay / 0.35) * 15 : 0;
  const fade = active?.transition === "fade" && localPlay < 0.35 ? Math.max(0, localPlay / 0.35) : 1;
  const frameStyle = {
    filter: active ? cssFilter(active) : undefined,
    opacity: fade * (active?.opacity ?? 1),
    transform: `translate(calc(${slide}% + ${(motion.x + shakeX) * (frameWidth / canvas.width)}px), ${(motion.y + shakeY) * (frameHeight / canvas.height)}px) scale(${motion.scale * punch * (active?.flipX ? -1 : 1)}, ${motion.scale * punch * (active?.flipY ? -1 : 1)}) rotate(${active?.rotate || 0}deg)`,
    clipPath: active?.crop ? `inset(${active.crop * 100}%)` : undefined,
  };
  const activeCue = doc.cues.find((cue) => time >= cue.start && time < cue.end) || null;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active || active.kind === "image") return;
    video.volume = Math.max(0, Math.min(1, active.volume ?? 1));
    if (!isSpecial(active)) video.playbackRate = clampSpeed(active.speed);
    if (playingRef.current) return;
    const list = docRef.current.segments;
    const pos = sourceAt(list, timeRef.current);
    const seg = list[pos.index];
    if (!seg) return;
    const cap = Math.max(seg.start, seg.end - 0.02);
    const target = Math.min(cap, Math.max(seg.start, shownTime(seg, pos.source)));
    if (Math.abs((video.currentTime || 0) - target) > 0.04) video.currentTime = target;
  }, [active]);
  const clip = doc.segments.find((seg) => seg.id === selectedClip) || null;
  const selectedCueItem = doc.cues.find((cue) => cue.id === selectedCue) || null;
  const audioLayer = selKind === "audio" ? doc.editor.audios.find((layer) => layer.id === layerId) || null : null;
  const overlayLayer = selKind === "overlay" ? doc.editor.overlays.find((layer) => layer.id === layerId) || null : null;
  const textLayer = selKind === "text" ? doc.editor.texts.find((layer) => layer.id === layerId) || null : null;
  const clipNames = doc.segments.map((seg) => {
    if (!seg.assetId) return project?.fileName || "Video";
    return doc.editor.assets.find((asset) => asset.id === seg.assetId)?.name || "Clip";
  });
  const status = error || notice || phase || saveLabel;
  const clipIndex = doc.segments.findIndex((seg) => seg.id === selectedClip);
  const volumeValue = selKind === "audio" ? audioLayer?.volume ?? 1 : clip?.volume ?? 1;
  const menuRows: { label: string; pressed?: boolean; run: () => void }[] = [];
  if (menu && selKind === "clip" && clip) {
    menuRows.push(
      { label: "Split", run: doSplit },
      { label: "Delete", run: rippleDelete },
      { label: "Duplicate", run: duplicate },
      { label: "Mirror", pressed: Boolean(clip.flipX), run: mirror },
      { label: "Flip V", pressed: Boolean(clip.flipY), run: flipV },
      { label: "Rotate 90°", pressed: Boolean(clip.rotate), run: rotate90 },
      { label: "Crop", pressed: (clip.crop || 0) > 0, run: toggleCrop },
      { label: "Reverse", pressed: Boolean(clip.reverse), run: toggleReverse },
      { label: "Freeze frame", pressed: Boolean(clip.freeze), run: toggleFreeze },
      { label: "Speed", run: () => openPopover("speed", { left: menu.x, top: menu.y, bottom: menu.y + 32 }) },
      { label: "Volume", run: () => openPopover("volume", { left: menu.x, top: menu.y, bottom: menu.y + 32 }) },
      { label: "Mute", pressed: (clip.volume ?? 1) <= 0, run: toggleMute }
    );
  } else if (menu && selKind === "audio") {
    menuRows.push(
      { label: "Split", run: doSplit },
      { label: "Delete", run: rippleDelete },
      { label: "Duplicate", run: duplicate },
      { label: "Volume", run: () => openPopover("volume", { left: menu.x, top: menu.y, bottom: menu.y + 32 }) },
      { label: "Mute", pressed: (audioLayer?.volume ?? 1) <= 0, run: toggleMute }
    );
  } else if (menu && selKind) {
    menuRows.push(
      { label: "Split", run: doSplit },
      { label: "Delete", run: rippleDelete },
      { label: "Duplicate", run: duplicate }
    );
  }

  function pickVideo(replace: boolean) {
    setReplacing(replace);
    const input = fileRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  function onPicked(file: File | null) {
    if (!file) return;
    if (!project || replacing) onUpload(file);
    else importFile(file, "main");
    setReplacing(false);
  }

  function toggleFull() {
    const node = frameRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen().catch(() => {});
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#121418] text-[#f2f2f2]" data-editor="editor-lab">
      <style>{`${FONT_FACE_CSS}@keyframes hookPop{from{transform:scale(.82)}to{transform:scale(1)}}@keyframes hookScale{from{transform:scale(.94)}to{transform:scale(1.04)}}`}</style>
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => onPicked(event.target.files?.[0] || null)}
      />
      <header className="relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-[#2c3038] bg-[#16181d] px-2">
        <div ref={sectionMenuRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Sections"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-7 w-7 items-center justify-center rounded text-[#d5d8de] hover:bg-white/10"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div role="menu" aria-label="Section list" className="absolute left-0 top-8 z-40 w-40 rounded-md border border-[#2c3038] bg-[#1a1d24] py-1 shadow-lg">
              {SECTIONS.map((item) => {
                const here = item.href === "/hub/editor-lab";
                return (
                  <a
                    key={item.href}
                    role="menuitem"
                    href={here ? editorLabHref(project?.id) : item.href}
                    aria-current={here ? "page" : undefined}
                    className={`block h-7 truncate whitespace-nowrap px-3 text-[12px] leading-7 ${here ? "text-[#22d3ee]" : "text-[#d5d8de] hover:bg-white/5"}`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          )}
        </div>
        <a href="/dashboard" className="shrink-0 whitespace-nowrap text-[13px] font-medium text-[#f2f2f2] hover:text-white">Editor Lab</a>
        <p className={`min-w-0 flex-1 truncate text-center text-[11px] ${error ? "text-[#f0b4b4]" : "text-[#8e939c]"}`} role={error ? "alert" : undefined}>{status}</p>
        <div className="flex shrink-0 items-center gap-1">
          {downloadHref && (
            <a href={downloadHref} title="Download" className="flex h-7 w-7 items-center justify-center rounded text-[#d5d8de] hover:bg-white/10">
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={exportVideo}
            disabled={!project || (exportProgress !== null && exportProgress < 1)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[#22d3ee] px-3 text-[12px] font-medium text-[#062126] disabled:opacity-40"
          >
            Export
          </button>
          <button type="button" title="Undo" aria-label="Undo" onClick={undo} className="flex h-7 w-7 items-center justify-center rounded text-[#d5d8de] hover:bg-white/10">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Redo" aria-label="Redo" onClick={redo} className="flex h-7 w-7 items-center justify-center rounded text-[#d5d8de] hover:bg-white/10">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      {exportProgress !== null && (
        <div className="h-0.5 shrink-0 bg-[#2c3038]">
          <div className="h-full bg-[#22d3ee]" style={{ width: `${Math.round(exportProgress * 100)}%` }} />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <AssetBin
          tab={rail}
          onTab={setRail}
          projectId={project?.id || null}
          fileName={project?.fileName || ""}
          duration={project?.durationSec || 0}
          filmstrip={filmstrip}
          creators={creators}
          creatorId={creatorId}
          onCreator={setCreatorId}
          onPickVideo={() => pickVideo(false)}
          onReplace={() => pickVideo(true)}
          editor={doc.editor}
          clip={clip}
          segments={doc.segments}
          words={doc.words}
          cues={doc.cues}
          style={doc.style}
          peaks={peaks}
          time={time}
          hooks={hooks}
          selectedHook={selectedHook}
          onSelectHook={setSelectedHook}
          onToggleHook={toggleFavourite}
          onDeleteHook={removeHook}
          onRewrite={() => rewrite()}
          busy={Boolean(phase)}
          selectedWord={selectedWord}
          editingWord={editingWord}
          onWord={(index) => {
            setSelectedWord(index);
            const timed = mapWords([doc.words[index]], doc.segments)[0];
            if (timed) seek(timed.composedStart);
          }}
          onEditWord={(index, text) => {
            const words = docRef.current.words.map((item, itemIndex) => (itemIndex === index ? { ...item, word: text } : item));
            commit({ ...docRef.current, words, cues: buildCues(words, docRef.current.segments) });
            setEditingWord(null);
          }}
          onStartEdit={setEditingWord}
          onDeleteWords={deleteWords}
          onSilences={removeSilences}
          onFillers={removeFillers}
          onImport={(file, slot) => importFile(file, slot)}
          onChange={applyChange}
          onNotice={setNotice}
          onError={setError}
        />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#101216]">
          <div ref={stageRef} className="min-h-0 flex-1">
            <div className="flex h-full w-full items-center justify-center">
              <div
                ref={frameRef}
                className="relative overflow-hidden bg-black"
                style={{ width: frameWidth, height: frameHeight }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onPicked(event.dataTransfer.files?.[0] || null);
                }}
              >
                {project ? (
                  <>
                    {fit === "blur" && !imageMode && (
                      <video ref={blurRef} src={videoSrc} muted className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" playsInline />
                    )}
                    {imageMode ? (
                      <>
                        {fit === "blur" && <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />}
                        <img src={imageSrc} alt="" className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`} style={frameStyle} />
                      </>
                    ) : (
                      <video
                        ref={videoRef}
                        src={videoSrc}
                        className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
                        style={frameStyle}
                        data-look={`flipx:${active?.flipX ? 1 : 0};flipy:${active?.flipY ? 1 : 0};rot:${active?.rotate || 0};crop:${active?.crop || 0};rev:${active?.reverse ? 1 : 0};freeze:${active?.freeze ? 1 : 0}`}
                        playsInline
                        onTimeUpdate={onTimeUpdate}
                        onLoadedData={() => {
                          const list = docRef.current.segments;
                          const pos = sourceAt(list, timeRef.current);
                          const seg = list[pos.index];
                          const video = videoRef.current;
                          if (!video || !seg || seg.kind === "image") return;
                          video.playbackRate = clampSpeed(seg.speed);
                          video.currentTime = shownTime(seg, pos.source);
                          if (playingRef.current && !isSpecial(seg)) video.play().catch(() => {});
                        }}
                        onPlay={() => {
                          playingRef.current = true;
                          setPlaying(true);
                        }}
                        onPause={() => {
                          if (!holdPlay.current) {
                            playingRef.current = false;
                            setPlaying(false);
                          }
                        }}
                      />
                    )}
                    {doc.editor.texts.filter((text) => time >= text.start && time < text.end).map((text) => (
                      <div
                        key={text.id}
                        title={text.text}
                        className="pointer-events-none absolute max-w-[88%] truncate text-center font-bold"
                        style={{
                          left: "50%",
                          top: `calc(50% + ${text.y * (frameHeight / canvas.height)}px)`,
                          transform: "translate(-50%, -50%)",
                          color: text.color,
                          fontSize: Math.max(12, (text.size * frameHeight) / canvas.height),
                          fontFamily: text.emoji ? "sans-serif" : cssFamily("Montserrat"),
                          whiteSpace: "nowrap",
                        }}
                      >
                        {text.text}
                      </div>
                    ))}
                    <CaptionOverlay cue={activeCue} time={time} style={doc.style} frameHeight={frameHeight} canvasHeight={canvas.height} />
                    <audio ref={musicRef} />
                    {phase && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[12px]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span className="truncate">{phase}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <button type="button" onClick={() => pickVideo(false)} className="flex h-full w-full flex-col items-center justify-center gap-2 text-[13px] text-[#9aa0a8]">
                    <span className="text-[20px] leading-none text-[#3ad6e4]">+</span>
                    Video
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex h-10 shrink-0 items-center gap-2 border-t border-[#2c3038] px-3">
            <button type="button" aria-label={playing ? "Pause" : "Play"} disabled={!project} onClick={togglePlay} className="flex h-7 w-7 shrink-0 items-center justify-center text-white disabled:opacity-30">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="w-[108px] shrink-0 text-[12px] tabular-nums text-[#d5d8de]">{formatClock(time)} / {formatClock(duration)}</span>
            <input
              aria-label="Scrub preview"
              type="range"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.01}
              value={Math.min(time, duration || 0)}
              disabled={!project}
              onChange={(event) => seek(Number(event.target.value))}
              className="min-w-0 flex-1 accent-[#22d3ee] disabled:opacity-30"
            />
            <button type="button" aria-label="Fullscreen" onClick={toggleFull} className="flex h-7 w-7 shrink-0 items-center justify-center text-[#d5d8de]">
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
        <Inspector
          mode={selKind || "none"}
          heading={clipIndex >= 0 ? clipNames[clipIndex] : "Clip"}
          focus={focus}
          focusToken={focusToken}
          clip={clip}
          segments={doc.segments}
          editor={doc.editor}
          style={doc.style}
          cue={selectedCueItem}
          cues={doc.cues}
          audioLayer={audioLayer}
          overlayLayer={overlayLayer}
          textLayer={textLayer}
          onChange={applyChange}
          onPreview={previewSegments}
          onPreviewCues={previewCues}
          onPreviewStyle={previewCaptionStyle}
          onPreviewEditor={previewEditor}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
          onNotice={setNotice}
          onError={setError}
        />
      </div>
      <EditorTimeline
        segments={doc.segments}
        cues={doc.cues}
        time={time}
        sourceDuration={project?.durationSec || 0}
        zoom={zoom}
        snap={snap}
        peaks={peaks}
        filmstrip={filmstrip}
        selectedClip={selectedClip}
        selectedCue={selectedCue}
        selKind={selKind}
        layerId={layerId}
        clipTrack={clipTrack}
        layerMuted={(audioLayer?.volume ?? 1) <= 0}
        clipNames={clipNames}
        overlays={doc.editor.overlays.map((layer) => ({ id: layer.id, start: layer.start, end: layer.start + Math.max(0.12, layer.out - layer.in), label: "Overlay" }))}
        extraAudio={doc.editor.audios.map((layer) => ({ id: layer.id, start: layer.start, end: layer.start + Math.max(0.12, layer.out - layer.in), label: "Audio" }))}
        texts={doc.editor.texts.map((layer) => ({ id: layer.id, start: layer.start, end: layer.end, label: layer.text }))}
        enabled={Boolean(project)}
        onZoom={setZoom}
        onSnap={setSnap}
        onSeek={seek}
        onActivate={activate}
        onDeselect={deselect}
        onSegments={previewSegments}
        onCues={previewCues}
        onTrimLayer={trimLayer}
        onGestureStart={beginGesture}
        onGestureEnd={endGesture}
        onSplit={doSplit}
        onDelete={rippleDelete}
        onDuplicate={duplicate}
        onMirror={mirror}
        onFlipV={flipV}
        onRotate={rotate90}
        onCrop={toggleCrop}
        onReverse={toggleReverse}
        onFreeze={toggleFreeze}
        onMute={toggleMute}
        onSpeed={(rect) => openPopover("speed", rect)}
        onVolume={(rect) => openPopover("volume", rect)}
        onUndo={undo}
        onRedo={redo}
        marks={doc.editor.beats}
      />
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Clip menu"
          className="fixed z-50 max-h-[320px] w-44 overflow-y-auto rounded-md border border-[#2c3038] bg-[#1a1d24] py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          {menuRows.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                item.run();
              }}
              className="flex h-8 w-full items-center gap-2 px-3 text-left text-[12px] text-[#e8e8e8] hover:bg-white/10"
            >
              <span className="w-3 shrink-0 text-[#22d3ee]">{item.pressed ? "✓" : ""}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
      {popover && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={popover.kind === "speed" ? "Speed" : "Volume"}
          className="fixed z-50 w-56 rounded-md border border-[#2c3038] bg-[#1a1d24] p-3 shadow-xl"
          style={{ left: popover.x, top: popover.y }}
        >
          {popover.kind === "speed" ? (
            <label className="block text-[11px] text-[#b7bcc4]">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span>Speed</span>
                <span className="tabular-nums text-[#e8e8e8]">{clampSpeed(clip?.speed).toFixed(2)}×</span>
              </span>
              <input
                aria-label="Speed"
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={clampSpeed(clip?.speed)}
                onPointerDown={beginGesture}
                onChange={(event) => previewSpeed(Number(event.target.value))}
                onPointerUp={() => {
                  endGesture("clips");
                  syncActiveLook(true);
                }}
                onBlur={() => endGesture("clips")}
                className="h-1 w-full accent-[#22d3ee]"
              />
            </label>
          ) : (
            <label className="block text-[11px] text-[#b7bcc4]">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span>Volume</span>
                <span className="tabular-nums text-[#e8e8e8]">{Math.round(volumeValue * 100)}%</span>
              </span>
              <input
                aria-label="Volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volumeValue}
                onPointerDown={beginGesture}
                onChange={(event) => previewVolume(Number(event.target.value))}
                onPointerUp={() => endGesture("clips")}
                onBlur={() => endGesture("clips")}
                className="h-1 w-full accent-[#22d3ee]"
              />
            </label>
          )}
        </div>
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

function CaptionOverlay({ cue, time, style, frameHeight, canvasHeight }: { cue: CaptionCue | null; time: number; style: CaptionStyle; frameHeight: number; canvasHeight: number }) {
  if (!cue) return null;
  const active = cue.words.findIndex((word) => time >= word.start && time < word.end);
  const lines = breakCueLines(cue.words);
  const fontSize = Math.max(13, (style.size * frameHeight) / canvasHeight);
  const stroke = (style.strokeWidth * frameHeight) / canvasHeight;
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
