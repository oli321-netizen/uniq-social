"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useRef, type ReactNode } from "react";
import { moveCue, resizeCue, type CaptionCue } from "@/lib/caption-cues";
import {
  clampSpeed,
  composedDuration,
  composedStart,
  playDuration,
  reorderSegments,
  snapTime,
  type Segment,
} from "@/lib/edit-timeline";

export type FilmstripInfo = { url: string; frames: number; interval: number } | null;

type Props = {
  segments: Segment[];
  cues: CaptionCue[];
  time: number;
  sourceDuration: number;
  zoom: number;
  snap: boolean;
  peaks: number[];
  filmstrip: FilmstripInfo;
  selectedClip: string | null;
  selectedCue: string | null;
  onZoom: (zoom: number) => void;
  onSnap: (snap: boolean) => void;
  onSeek: (time: number) => void;
  onSelectClip: (id: string | null) => void;
  onSelectCue: (id: string | null) => void;
  onSegments: (segments: Segment[]) => void;
  onCues: (cues: CaptionCue[]) => void;
  onGestureStart: () => void;
  onGestureEnd: (kind: "clips" | "cues") => void;
};

const LABEL = 72;

export default function EditorTimeline(props: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const duration = Math.max(0.2, composedDuration(props.segments));
  const width = Math.max(640, duration * props.zoom);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const target = LABEL + props.time * props.zoom - node.clientWidth * 0.5;
    if (props.time * props.zoom < node.scrollLeft + 40 || props.time * props.zoom > node.scrollLeft + node.clientWidth - 80) {
      node.scrollLeft = Math.max(0, target);
    }
  }, [props.time, props.zoom]);

  function points(exceptClip?: string, exceptCue?: string) {
    const marks = [0, duration, props.time];
    let cursor = 0;
    for (const seg of props.segments) {
      if (seg.id !== exceptClip) marks.push(cursor, cursor + playDuration(seg));
      cursor += playDuration(seg);
    }
    for (const cue of props.cues) {
      if (cue.id !== exceptCue) marks.push(cue.start, cue.end);
    }
    return marks;
  }

  function seekFromEvent(clientX: number) {
    const node = scroller.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = clientX - rect.left + node.scrollLeft - LABEL;
    props.onSeek(Math.max(0, Math.min(duration, x / props.zoom)));
  }

  function trim(event: ReactPointerEvent<HTMLButtonElement>, index: number, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    props.onGestureStart();
    const seg = props.segments[index];
    const originX = event.clientX;
    const speed = clampSpeed(seg.speed);
    const base = composedStart(props.segments, index);
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - originX) / props.zoom;
      let start = seg.start;
      let end = seg.end;
      if (edge === "start") start = Math.min(seg.end - 0.12, Math.max(0, seg.start + delta * speed));
      else end = Math.max(seg.start + 0.12, Math.min(props.sourceDuration, seg.end + delta * speed));
      if (props.snap && edge === "end") {
        const composedEnd = base + (end - start) / speed;
        const snapped = snapTime(composedEnd, points(seg.id), 10 / props.zoom);
        end = Math.min(props.sourceDuration, start + Math.max(0.12, snapped - base) * speed);
      }
      const next = props.segments.map((item, itemIndex) => (itemIndex === index ? { ...item, start, end } : item));
      props.onSegments(next);
    };
    listen(move, () => props.onGestureEnd("clips"));
  }

  function dragClip(event: ReactPointerEvent<HTMLDivElement>, index: number) {
    if (event.button !== 0) return;
    props.onGestureStart();
    const originX = event.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - originX) > 6) moved = true;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      if (!moved) return;
      const node = scroller.current;
      if (!node) return;
      const x = ev.clientX - node.getBoundingClientRect().left + node.scrollLeft - LABEL;
      const at = Math.max(0, x / props.zoom);
      let cursor = 0;
      let target = props.segments.length - 1;
      for (let i = 0; i < props.segments.length; i++) {
        const len = playDuration(props.segments[i]);
        if (at < cursor + len / 2) {
          target = i;
          break;
        }
        cursor += len;
      }
      if (target !== index) props.onSegments(reorderSegments(props.segments, index, target));
      props.onGestureEnd("clips");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function dragCue(event: ReactPointerEvent<HTMLDivElement>, cue: CaptionCue) {
    event.preventDefault();
    event.stopPropagation();
    props.onGestureStart();
    const originX = event.clientX;
    const move = (ev: PointerEvent) => {
      let delta = (ev.clientX - originX) / props.zoom;
      if (props.snap) {
        const snapped = snapTime(cue.start + delta, points(undefined, cue.id), 10 / props.zoom);
        delta = snapped - cue.start;
      }
      props.onCues(props.cues.map((item) => (item.id === cue.id ? moveCue(cue, delta, duration) : item)));
    };
    listen(move, () => props.onGestureEnd("cues"));
  }

  function resizeCaption(event: ReactPointerEvent<HTMLButtonElement>, cue: CaptionCue, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    props.onGestureStart();
    const originX = event.clientX;
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - originX) / props.zoom;
      let edgeTime = edge === "start" ? cue.start + delta : cue.end + delta;
      if (props.snap) edgeTime = snapTime(edgeTime, points(undefined, cue.id), 10 / props.zoom);
      props.onCues(props.cues.map((item) => (item.id === cue.id ? resizeCue(cue, edge, edgeTime, duration) : item)));
    };
    listen(move, () => props.onGestureEnd("cues"));
  }

  let cursor = 0;
  const clips = props.segments.map((seg) => {
    const left = cursor;
    const span = playDuration(seg);
    cursor += span;
    return { seg, left, span };
  });

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#07080f]" aria-label="Timeline">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[13px] text-slate-400">
        <span className="text-slate-300">Timeline</span>
        <button type="button" onClick={() => props.onZoom(Math.max(36, props.zoom / 1.25))} className="rounded border border-white/10 px-2 py-0.5">−</button>
        <input aria-label="Zoom timeline" type="range" min={36} max={280} value={props.zoom} onChange={(event) => props.onZoom(Number(event.target.value))} className="w-28" />
        <button type="button" onClick={() => props.onZoom(Math.min(280, props.zoom * 1.25))} className="rounded border border-white/10 px-2 py-0.5">+</button>
        <button type="button" aria-pressed={props.snap} onClick={() => props.onSnap(!props.snap)} className={`rounded border px-2 py-0.5 ${props.snap ? "border-purple-500 text-purple-200" : "border-white/10"}`}>
          Snap
        </button>
        <span className="ml-auto hidden sm:inline">Space play · S split · Del ripple · arrows nudge · ⌘Z undo</span>
      </div>
      <div
        ref={scroller}
        className="relative overflow-x-auto overflow-y-hidden"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) props.onSeek(0);
        }}
      >
        <div className="relative" style={{ width: width + LABEL }}>
          <button type="button" aria-label="Scrub timeline" className="relative block h-6 w-full text-left" onPointerDown={(event) => seekFromEvent(event.clientX)}>
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, second) => (
              <span key={second} className="absolute top-1 text-[11px] text-slate-500" style={{ left: LABEL + second * props.zoom }}>
                {formatTick(second)}
              </span>
            ))}
          </button>
          <Track label="Video">
            {clips.map(({ seg, left, span }, index) => (
              <div
                key={seg.id}
                className={`absolute top-1 h-12 overflow-hidden rounded-sm border ${props.selectedClip === seg.id ? "border-purple-400" : "border-white/15"} bg-purple-950`}
                style={{ left: left * props.zoom, width: Math.max(18, span * props.zoom) }}
                onPointerDown={(event) => {
                  props.onSelectClip(seg.id);
                  props.onSelectCue(null);
                  dragClip(event, index);
                }}
              >
                <Filmstrip seg={seg} span={span} zoom={props.zoom} filmstrip={props.filmstrip} sourceDuration={props.sourceDuration} />
                <span className="pointer-events-none absolute left-2 top-0.5 text-[11px] text-white">Clip {index + 1}{clampSpeed(seg.speed) !== 1 ? ` · ${clampSpeed(seg.speed)}x` : ""}</span>
                <button type="button" aria-label="Trim clip start" className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/30" onPointerDown={(event) => trim(event, index, "start")} />
                <button type="button" aria-label="Trim clip end" className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/30" onPointerDown={(event) => trim(event, index, "end")} />
              </div>
            ))}
          </Track>
          <Track label="Audio" short>
            {clips.map(({ seg, left, span }) => (
              <div key={seg.id} className="absolute top-1 h-8 overflow-hidden rounded-sm bg-purple-900/40" style={{ left: left * props.zoom, width: Math.max(18, span * props.zoom) }}>
                <Wave peaks={props.peaks} seg={seg} sourceDuration={props.sourceDuration} />
              </div>
            ))}
          </Track>
          <Track label="Captions" short>
            {props.cues.map((cue) => (
              <div
                key={cue.id}
                className={`absolute top-1 flex h-8 items-center overflow-hidden rounded-sm px-2 text-[12px] ${props.selectedCue === cue.id ? "bg-purple-500 text-white" : "bg-purple-700/80 text-white"}`}
                style={{ left: cue.start * props.zoom, width: Math.max(16, (cue.end - cue.start) * props.zoom) }}
                onPointerDown={(event) => {
                  props.onSelectCue(cue.id);
                  props.onSelectClip(null);
                  dragCue(event, cue);
                }}
              >
                <button type="button" aria-label="Trim caption start" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/40" onPointerDown={(event) => resizeCaption(event, cue, "start")} />
                <span className="pointer-events-none truncate">{cue.words.map((word) => word.text).join(" ")}</span>
                <button type="button" aria-label="Trim caption end" className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/40" onPointerDown={(event) => resizeCaption(event, cue, "end")} />
              </div>
            ))}
          </Track>
          <div className="pointer-events-none absolute bottom-0 top-6 w-px bg-purple-300" style={{ left: LABEL + props.time * props.zoom }} />
        </div>
      </div>
    </section>
  );
}

function Track({ label, children, short }: { label: string; children: ReactNode; short?: boolean }) {
  return (
    <div className={`relative border-t border-white/10 ${short ? "h-10" : "h-14"}`}>
      <div className="absolute inset-y-0 left-0 z-10 flex w-[72px] items-center border-r border-white/10 bg-[#0a0a1a] px-2 text-[12px] text-slate-400">{label}</div>
      <div className="absolute inset-y-0" style={{ left: LABEL, right: 0 }}>{children}</div>
    </div>
  );
}

function Filmstrip({
  seg,
  span,
  zoom,
  filmstrip,
  sourceDuration,
}: {
  seg: Segment;
  span: number;
  zoom: number;
  filmstrip: FilmstripInfo;
  sourceDuration: number;
}) {
  if (!filmstrip || filmstrip.frames < 1 || sourceDuration <= 0) return null;
  const cells = Math.max(1, Math.round((span * zoom) / 36));
  return (
    <div className="absolute inset-0 flex">
      {Array.from({ length: cells }, (_, cell) => {
        const source = seg.start + ((cell + 0.5) / cells) * (seg.end - seg.start);
        const frame = Math.max(0, Math.min(filmstrip.frames - 1, Math.floor(source / filmstrip.interval)));
        return (
          <span
            key={cell}
            className="h-full flex-1 bg-cover bg-center"
            style={{
              backgroundImage: `url(${filmstrip.url})`,
              backgroundSize: `${filmstrip.frames * 100}% 100%`,
              backgroundPosition: `${filmstrip.frames === 1 ? 0 : (frame / (filmstrip.frames - 1)) * 100}% 0`,
            }}
          />
        );
      })}
    </div>
  );
}

function Wave({ peaks, seg, sourceDuration }: { peaks: number[]; seg: Segment; sourceDuration: number }) {
  if (peaks.length === 0 || sourceDuration <= 0) return <div className="h-full w-full bg-purple-500/20" />;
  const start = Math.max(0, Math.floor((seg.start / sourceDuration) * peaks.length));
  const end = Math.max(start + 1, Math.ceil((seg.end / sourceDuration) * peaks.length));
  const slice = peaks.slice(start, end);
  return (
    <div className="flex h-full items-center gap-px px-1">
      {slice.map((peak, index) => (
        <span key={index} className="w-px flex-1 bg-purple-300/80" style={{ height: `${Math.max(8, peak * 100)}%` }} />
      ))}
    </div>
  );
}

function listen(move: (event: PointerEvent) => void, done: () => void) {
  const up = () => {
    window.removeEventListener("pointermove", move);
    done();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function formatTick(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}
