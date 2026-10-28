"use client";

import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { Magnet, Redo2, Scissors, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
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
export type TimelineSpan = { id: string; start: number; end: number; label: string };
export type SelKind = "clip" | "audio" | "overlay" | "cue" | "text";

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
  selKind: SelKind | null;
  layerId: string | null;
  clipTrack: "video" | "audio";
  layerMuted?: boolean;
  clipNames?: string[];
  overlays?: TimelineSpan[];
  extraAudio?: TimelineSpan[];
  texts?: TimelineSpan[];
  enabled?: boolean;
  onZoom: (zoom: number) => void;
  onSnap: (snap: boolean) => void;
  onSeek: (time: number) => void;
  onActivate: (kind: SelKind, id: string, track: "video" | "audio", x: number, y: number, context: boolean) => void;
  onDeselect: () => void;
  onSegments: (segments: Segment[]) => void;
  onCues: (cues: CaptionCue[]) => void;
  onTrimLayer: (kind: "overlay" | "audio" | "text", id: string, start: number, end: number) => void;
  onGestureStart: () => void;
  onGestureEnd: (kind: "clips" | "cues") => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMirror: () => void;
  onFlipV: () => void;
  onRotate: () => void;
  onCrop: () => void;
  onReverse: () => void;
  onFreeze: () => void;
  onMute: () => void;
  onSpeed: (rect: DOMRect) => void;
  onVolume: (rect: DOMRect) => void;
  onUndo: () => void;
  onRedo: () => void;
  marks?: number[];
};

const RULER = 20;
const VIDEO_H = 48;
const ROW_H = 32;

export default function EditorTimeline(props: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(640);
  const duration = Math.max(0.2, composedDuration(props.segments));
  const width = Math.max(view, duration * props.zoom);
  const overlays = props.overlays || [];
  const texts = props.texts || [];
  const extraAudio = props.extraAudio || [];
  const selectedSeg = props.segments.find((seg) => seg.id === props.selectedClip) || null;

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setView(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const target = props.time * props.zoom - node.clientWidth * 0.5;
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
    for (const mark of props.marks || []) marks.push(mark);
    return marks;
  }

  function seekFromEvent(clientX: number) {
    const node = scroller.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = clientX - rect.left + node.scrollLeft;
    props.onSeek(Math.max(0, Math.min(duration, x / props.zoom)));
  }

  function activate(event: ReactPointerEvent, kind: SelKind, id: string, track: "video" | "audio") {
    props.onActivate(kind, id, track, event.clientX, event.clientY, false);
  }

  function context(event: ReactPointerEvent | ReactMouseEvent, kind: SelKind, id: string, track: "video" | "audio") {
    event.preventDefault();
    event.stopPropagation();
    props.onActivate(kind, id, track, event.clientX, event.clientY, true);
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
      else end = Math.max(seg.start + 0.12, Math.min(props.sourceDuration || seg.end, seg.end + delta * speed));
      if (props.snap && edge === "end") {
        const composedEnd = base + (end - start) / speed;
        const snapped = snapTime(composedEnd, points(seg.id), 10 / props.zoom);
        end = Math.min(props.sourceDuration || seg.end, start + Math.max(0.12, snapped - base) * speed);
      }
      const next = props.segments.map((item, itemIndex) => (itemIndex === index ? { ...item, start, end } : item));
      props.onSegments(next);
    };
    listen(move, () => props.onGestureEnd("clips"));
  }

  function trimSpan(event: ReactPointerEvent<HTMLButtonElement>, span: TimelineSpan, kind: "overlay" | "audio" | "text", edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    props.onGestureStart();
    const originX = event.clientX;
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - originX) / props.zoom;
      let start = span.start;
      let end = span.end;
      if (edge === "start") start = Math.min(span.end - 0.12, Math.max(0, span.start + delta));
      else end = Math.max(span.start + 0.12, span.end + delta);
      props.onTrimLayer(kind, span.id, start, end);
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
      if (!moved) {
        props.onGestureEnd("clips");
        return;
      }
      const node = scroller.current;
      if (!node) return;
      const x = ev.clientX - node.getBoundingClientRect().left + node.scrollLeft;
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
  const clips = props.segments.map((seg, index) => {
    const left = cursor;
    const span = playDuration(seg);
    cursor += span;
    return { seg, left, span, name: props.clipNames?.[index] || `Clip ${index + 1}` };
  });
  const tick = props.zoom < 48 ? 5 : props.zoom < 90 ? 2 : 1;
  const iconBtn = "flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#c8ccd2] hover:bg-white/10 disabled:opacity-30";
  const toolBtn = "h-7 shrink-0 whitespace-nowrap rounded px-2 text-[11px] text-[#e8e8e8] hover:bg-white/10";
  const toolOn = "h-7 shrink-0 whitespace-nowrap rounded bg-white/10 px-2 text-[11px] text-[#22d3ee]";
  const videoOn = props.selKind === "clip";
  const muteOn = videoOn ? (selectedSeg?.volume ?? 1) <= 0 : Boolean(props.layerMuted);

  function tool(label: string, onClick: () => void, pressed = false, title?: string) {
    return (
      <button key={label} type="button" title={title || label} aria-pressed={pressed} onClick={onClick} className={pressed ? toolOn : toolBtn}>
        {label}
      </button>
    );
  }

  function rectTool(label: string, open: (rect: DOMRect) => void) {
    return (
      <button
        key={label}
        type="button"
        onClick={(event) => open(event.currentTarget.getBoundingClientRect())}
        className={toolBtn}
      >
        {label}
      </button>
    );
  }

  const tools = !props.selKind ? null : props.selKind === "clip" ? (
    <>
      {tool("Split", props.onSplit)}
      {tool("Delete", props.onDelete)}
      {tool("Duplicate", props.onDuplicate)}
      {tool("Mirror", props.onMirror, Boolean(selectedSeg?.flipX), "Flip horizontal")}
      {tool("Flip V", props.onFlipV, Boolean(selectedSeg?.flipY), "Flip vertical")}
      {tool("Rotate 90°", props.onRotate, Boolean(selectedSeg?.rotate))}
      {tool("Crop", props.onCrop, (selectedSeg?.crop || 0) > 0)}
      {tool("Reverse", props.onReverse, Boolean(selectedSeg?.reverse))}
      {tool("Freeze", props.onFreeze, Boolean(selectedSeg?.freeze), "Freeze frame")}
      {rectTool("Speed", props.onSpeed)}
      {rectTool("Volume", props.onVolume)}
      {tool("Mute", props.onMute, muteOn)}
    </>
  ) : props.selKind === "audio" ? (
    <>
      {tool("Split", props.onSplit)}
      {tool("Delete", props.onDelete)}
      {tool("Duplicate", props.onDuplicate)}
      {rectTool("Volume", props.onVolume)}
      {tool("Mute", props.onMute, muteOn)}
    </>
  ) : props.selKind === "cue" || props.selKind === "overlay" ? (
    <>
      {tool("Split", props.onSplit)}
      {tool("Delete", props.onDelete)}
      {tool("Duplicate", props.onDuplicate)}
    </>
  ) : (
    <>
      {tool("Split", props.onSplit)}
      {tool("Delete", props.onDelete)}
      {tool("Duplicate", props.onDuplicate)}
    </>
  );

  return (
    <section className="shrink-0 border-t border-[#2c3038] bg-[#14161c]" aria-label="Timeline">
      <div className="flex h-8 min-w-0 items-center gap-1 border-b border-[#2c3038] px-2">
        {props.selKind ? (
          <div aria-label="Clip toolbar" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
            {tools}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button type="button" title="Split (S)" aria-label="Split" disabled={!props.enabled} onClick={props.onSplit} className={iconBtn}>
              <Scissors className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Delete" aria-label="Delete" disabled={!props.enabled} onClick={props.onDelete} className={iconBtn}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!props.enabled} onClick={props.onUndo} className={iconBtn}>
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Redo" aria-label="Redo" disabled={!props.enabled} onClick={props.onRedo} className={iconBtn}>
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => props.onZoom(Math.max(36, props.zoom / 1.25))} className={iconBtn}>
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <input aria-label="Zoom timeline" type="range" min={36} max={280} value={props.zoom} onChange={(event) => props.onZoom(Number(event.target.value))} className="w-24 accent-[#22d3ee]" />
          <button type="button" aria-label="Zoom in" onClick={() => props.onZoom(Math.min(280, props.zoom * 1.25))} className={iconBtn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Snap" aria-label="Snap" aria-pressed={props.snap} onClick={() => props.onSnap(!props.snap)} className={`${iconBtn} ${props.snap ? "text-[#22d3ee]" : ""}`}>
            <Magnet className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex">
        <div className="w-[92px] shrink-0 border-r border-[#2c3038] bg-[#121418] text-[11px] text-[#9aa0a8]">
          <div style={{ height: RULER }} />
          <Label height={VIDEO_H}>Video 1</Label>
          <Label height={ROW_H}>Audio 1</Label>
          {overlays.length > 0 && <Label height={ROW_H}>Overlay</Label>}
          <Label height={ROW_H}>Captions</Label>
        </div>
        <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width }}>
            <button type="button" aria-label="Scrub timeline" className="relative block w-full text-left" style={{ height: RULER }} onPointerDown={(event) => seekFromEvent(event.clientX)}>
              {Array.from({ length: Math.ceil(duration) + 1 }, (_, second) =>
                second % tick === 0 ? (
                  <span key={second} className="absolute top-0.5 whitespace-nowrap text-[10px] text-[#9aa0a8]" style={{ left: second * props.zoom + 2 }}>
                    {formatTick(second)}
                  </span>
                ) : null
              )}
              {(props.marks || []).map((mark) => (
                <span key={mark} className="absolute top-0 h-full w-px bg-[#c4a35a]/80" style={{ left: mark * props.zoom }} />
              ))}
            </button>
            <Track height={VIDEO_H} onEmpty={props.onDeselect}>
              {clips.map(({ seg, left, span, name }, index) => {
                const selected = props.selKind === "clip" && props.selectedClip === seg.id && props.clipTrack !== "audio";
                return (
                  <div
                    key={seg.id}
                    title={name}
                    data-kind="clip"
                    data-clip={seg.id}
                    data-track="video"
                    data-selected={selected ? "true" : "false"}
                    className={`absolute top-1 overflow-hidden rounded-sm border-2 ${selected ? "border-[#22d3ee]" : "border-white/10"} bg-[#2a3344]`}
                    style={{ left: left * props.zoom, width: Math.max(18, span * props.zoom), height: VIDEO_H - 8 }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      activate(event, "clip", seg.id, "video");
                      dragClip(event, index);
                    }}
                    onContextMenu={(event) => context(event, "clip", seg.id, "video")}
                  >
                    <Filmstrip seg={seg} span={span} zoom={props.zoom} filmstrip={props.filmstrip} sourceDuration={props.sourceDuration} />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[10px] leading-4 text-white">
                      {name}
                      {seg.reverse ? " · rev" : ""}
                      {seg.freeze ? " · freeze" : ""}
                      {clampSpeed(seg.speed) !== 1 ? ` · ${clampSpeed(seg.speed)}×` : ""}
                    </span>
                    {selected && (
                      <>
                        <button type="button" aria-label="Trim clip start" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white" onPointerDown={(event) => trim(event, index, "start")} />
                        <button type="button" aria-label="Trim clip end" className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white" onPointerDown={(event) => trim(event, index, "end")} />
                      </>
                    )}
                  </div>
                );
              })}
            </Track>
            <Track height={ROW_H} onEmpty={props.onDeselect}>
              {clips.map(({ seg, left, span }, index) => {
                const selected = props.selKind === "clip" && props.selectedClip === seg.id && props.clipTrack === "audio";
                return (
                  <div
                    key={seg.id}
                    data-kind="clip"
                    data-clip={seg.id}
                    data-track="audio"
                    data-selected={selected ? "true" : "false"}
                    className={`absolute top-1 overflow-hidden rounded-sm border-2 ${selected ? "border-[#22d3ee]" : "border-transparent"} bg-[#163528]`}
                    style={{ left: left * props.zoom, width: Math.max(18, span * props.zoom), height: ROW_H - 8 }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      activate(event, "clip", seg.id, "audio");
                      dragClip(event, index);
                    }}
                    onContextMenu={(event) => context(event, "clip", seg.id, "audio")}
                  >
                    <Wave peaks={props.peaks} seg={seg} sourceDuration={props.sourceDuration} />
                    {selected && (
                      <>
                        <button type="button" aria-label="Trim clip start" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white" onPointerDown={(event) => trim(event, index, "start")} />
                        <button type="button" aria-label="Trim clip end" className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white" onPointerDown={(event) => trim(event, index, "end")} />
                      </>
                    )}
                  </div>
                );
              })}
              {extraAudio.map((layer) => (
                <SpanBlock
                  key={layer.id}
                  span={layer}
                  zoom={props.zoom}
                  kind="audio"
                  className="bg-[#1f6b45] text-[10px] text-white"
                  selected={props.selKind === "audio" && props.layerId === layer.id}
                  onPointerDown={(event) => activate(event, "audio", layer.id, "audio")}
                  onContextMenu={(event) => context(event, "audio", layer.id, "audio")}
                  onTrim={(event, edge) => trimSpan(event, layer, "audio", edge)}
                />
              ))}
            </Track>
            {overlays.length > 0 && (
              <Track height={ROW_H} onEmpty={props.onDeselect}>
                {overlays.map((layer) => (
                  <SpanBlock
                    key={layer.id}
                    span={layer}
                    zoom={props.zoom}
                    kind="overlay"
                    className="bg-[#3d5a73] text-[10px] text-white"
                    selected={props.selKind === "overlay" && props.layerId === layer.id}
                    onPointerDown={(event) => activate(event, "overlay", layer.id, "video")}
                    onContextMenu={(event) => context(event, "overlay", layer.id, "video")}
                    onTrim={(event, edge) => trimSpan(event, layer, "overlay", edge)}
                  />
                ))}
              </Track>
            )}
            <Track height={ROW_H} onEmpty={props.onDeselect}>
              {props.cues.map((cue) => {
                const selected = props.selKind === "cue" && props.selectedCue === cue.id;
                return (
                  <div
                    key={cue.id}
                    title={cue.words.map((word) => word.text).join(" ")}
                    data-kind="cue"
                    data-clip={cue.id}
                    data-selected={selected ? "true" : "false"}
                    className={`absolute top-1 flex items-center overflow-hidden rounded-sm border-2 px-1.5 text-[11px] text-[#f6edd4] ${selected ? "border-[#22d3ee] bg-[#b08a3e]" : "border-transparent bg-[#8d6b32]"}`}
                    style={{ left: cue.start * props.zoom, width: Math.max(16, (cue.end - cue.start) * props.zoom), height: ROW_H - 8 }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      activate(event, "cue", cue.id, "video");
                      dragCue(event, cue);
                    }}
                    onContextMenu={(event) => context(event, "cue", cue.id, "video")}
                  >
                    {selected && <button type="button" aria-label="Trim caption start" className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-white" onPointerDown={(event) => resizeCaption(event, cue, "start")} />}
                    <span className="pointer-events-none truncate">{cue.words.map((word) => word.text).join(" ")}</span>
                    {selected && <button type="button" aria-label="Trim caption end" className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-white" onPointerDown={(event) => resizeCaption(event, cue, "end")} />}
                  </div>
                );
              })}
              {texts.map((layer) => (
                <SpanBlock
                  key={layer.id}
                  span={layer}
                  zoom={props.zoom}
                  kind="text"
                  className="bg-[#3a4a5c] text-[10px] text-white"
                  selected={props.selKind === "text" && props.layerId === layer.id}
                  onPointerDown={(event) => activate(event, "text", layer.id, "video")}
                  onContextMenu={(event) => context(event, "text", layer.id, "video")}
                  onTrim={(event, edge) => trimSpan(event, layer, "text", edge)}
                />
              ))}
            </Track>
            <div className="pointer-events-none absolute bottom-0 z-20 w-px bg-[#ff3344]" style={{ left: props.time * props.zoom, top: 0 }}>
              <span className="absolute -left-[4px] top-0 h-2 w-2 rounded-full bg-[#ff3344]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Label({ children, height }: { children: string; height: number }) {
  return (
    <div className="flex items-center border-t border-[#2c3038] px-2" style={{ height }}>
      <span className="truncate">{children}</span>
    </div>
  );
}

function Track({ children, height, onEmpty }: { children: ReactNode; height: number; onEmpty: () => void }) {
  return (
    <div
      className="relative border-t border-[#2c3038] bg-[#1b1e25]"
      style={{ height }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onEmpty();
      }}
    >
      {children}
    </div>
  );
}

function SpanBlock({
  span,
  zoom,
  kind,
  className,
  selected,
  onPointerDown,
  onContextMenu,
  onTrim,
}: {
  span: TimelineSpan;
  zoom: number;
  kind: SelKind;
  className: string;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onTrim: (event: ReactPointerEvent<HTMLButtonElement>, edge: "start" | "end") => void;
}) {
  return (
    <div
      title={span.label}
      data-kind={kind}
      data-clip={span.id}
      data-selected={selected ? "true" : "false"}
      className={`absolute top-1 flex items-center overflow-hidden rounded-sm border-2 px-1.5 ${selected ? "border-[#22d3ee]" : "border-transparent"} ${className}`}
      style={{ left: span.start * zoom, width: Math.max(16, (span.end - span.start) * zoom), height: ROW_H - 8 }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        onPointerDown(event);
      }}
      onContextMenu={onContextMenu}
    >
      {selected && <button type="button" aria-label="Trim clip start" className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-white" onPointerDown={(event) => onTrim(event, "start")} />}
      <span className="pointer-events-none truncate">{span.label}</span>
      {selected && <button type="button" aria-label="Trim clip end" className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-white" onPointerDown={(event) => onTrim(event, "end")} />}
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
  if (!filmstrip || filmstrip.frames < 1 || sourceDuration <= 0 || seg.assetId) return null;
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
  if (peaks.length === 0 || sourceDuration <= 0 || seg.assetId) return <div className="h-full w-full bg-[#3ecf8e]/30" />;
  const start = Math.max(0, Math.floor((seg.start / sourceDuration) * peaks.length));
  const end = Math.max(start + 1, Math.ceil((seg.end / sourceDuration) * peaks.length));
  const slice = peaks.slice(start, end);
  const shown = slice.length > 80 ? slice.filter((_, index) => index % Math.ceil(slice.length / 80) === 0) : slice;
  return (
    <div className="pointer-events-none flex h-full items-center gap-px px-0.5">
      {shown.map((peak, index) => (
        <span key={index} className="w-px flex-1 bg-[#3ecf8e]" style={{ height: `${Math.max(12, peak * 100)}%` }} />
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
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}
