"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRESET_LIST, type CaptionStyle } from "@/lib/caption-ass";
import { CAPTION_FONTS, type CaptionFontId } from "@/lib/caption-fonts";
import { isEmphasis, type CaptionCue } from "@/lib/caption-cues";
import { clampSpeed, composedStart, setSegmentSpeed, splitAt, type Segment } from "@/lib/edit-timeline";
import { FILTER_PRESETS, type EditorDoc, type EditorLayer, type TextLayer } from "@/lib/editor-doc";
import type { SelKind } from "@/components/hub/editor/Timeline";

type Tab = "Video" | "Audio" | "Speed" | "Animation" | "Adjustment";

const TABS: Tab[] = ["Video", "Audio", "Speed", "Animation", "Adjustment"];

export default function Inspector(props: {
  mode: SelKind | "none";
  heading: string;
  focus: string;
  focusToken: number;
  clip: Segment | null;
  segments: Segment[];
  editor: EditorDoc;
  style: CaptionStyle;
  cue: CaptionCue | null;
  cues: CaptionCue[];
  audioLayer: EditorLayer | null;
  overlayLayer: EditorLayer | null;
  textLayer: TextLayer | null;
  onChange: (change: { segments?: Segment[]; editor?: EditorDoc; style?: CaptionStyle; cues?: CaptionCue[] }) => void;
  onPreview: (segments: Segment[]) => void;
  onPreviewCues: (cues: CaptionCue[]) => void;
  onPreviewStyle: (style: CaptionStyle) => void;
  onPreviewEditor: (editor: EditorDoc) => void;
  onGestureStart: () => void;
  onGestureEnd: (kind: "clips" | "cues") => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("Video");
  const panelRef = useRef<HTMLDivElement>(null);
  const clip = props.clip;

  useEffect(() => {
    if (props.mode !== "clip" || !props.focus) return;
    const id = props.focus === "speed" ? "insp-speed" : props.focus === "volume" ? "insp-volume" : "insp-basic";
    panelRef.current?.querySelector(`#${id}`)?.scrollIntoView({ block: "start" });
  }, [props.mode, props.focus, props.focusToken]);

  function patch(partial: Partial<Segment>, commit: boolean) {
    if (!clip) {
      props.onError("Select a clip first.");
      return;
    }
    const segments = props.segments.map((seg) => (seg.id === clip.id ? { ...seg, ...partial } : seg));
    if (commit) props.onChange({ segments });
    else props.onPreview(segments);
  }

  function ramp() {
    if (!clip) {
      props.onError("Select a clip first.");
      return;
    }
    const index = props.segments.findIndex((seg) => seg.id === clip.id);
    const mid = (clip.start + clip.end) / 2;
    const at = composedStart(props.segments, index) + (mid - clip.start) / clampSpeed(clip.speed);
    const split = splitAt(props.segments, at);
    if (split.length === props.segments.length) {
      props.onError("The clip is too short to split for a ramp.");
      return;
    }
    const second = split[index + 1];
    props.onChange({ segments: setSegmentSpeed(split, second.id, 0.5) });
    props.onNotice("Second half plays at 0.5×.");
  }

  function rotate90() {
    if (!clip) return;
    const turned = ((((clip.rotate || 0) + 90) % 360) + 360) % 360;
    patch({ rotate: turned > 180 ? turned - 360 : turned }, true);
  }

  function patchEditor(kind: "overlays" | "audios" | "texts", id: string, partial: Partial<EditorLayer & TextLayer>, commit: boolean) {
    const editor = props.editor;
    const next = {
      ...editor,
      [kind]: editor[kind].map((layer) => (layer.id === id ? { ...layer, ...partial } : layer)),
    };
    if (commit) props.onChange({ editor: next });
    else props.onPreviewEditor(next);
  }

  const shell = "flex w-[360px] shrink-0 flex-col border-l border-[#2a2c38] bg-[#12131c]";

  if (props.mode === "clip") {
    return (
      <aside className={shell} data-inspector="clip">
        <header className="flex h-9 shrink-0 items-center border-b border-[#2a2c38] px-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-[#f4f4f5]">{props.heading || "Clip"}</p>
        </header>
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#2a2c38] px-3 py-1.5">
          {[
            ["Basic", "insp-basic"],
            ["Speed", "insp-speed"],
            ["Volume", "insp-volume"],
          ].map(([label, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => panelRef.current?.querySelector(`#${id}`)?.scrollIntoView({ block: "start" })}
              className="h-6 shrink-0 whitespace-nowrap rounded bg-white/5 px-2 text-[11px] text-[#d5d8de] hover:bg-white/10"
            >
              {label}
            </button>
          ))}
        </div>
        <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div id="insp-basic">
            <Section title="Basic">
              <Slider label="Scale" min={40} max={160} step={1} value={Math.round((clip?.scale ?? 1) * 100)} display={`${Math.round((clip?.scale ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ scale: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
              <div className="flex items-center gap-2 text-[11px] text-[#b7bcc4]">
                <span className="w-14 shrink-0">Position</span>
                <Num label="X" value={clip?.x || 0} disabled={!clip} onCommit={(value) => patch({ x: value }, true)} />
                <Num label="Y" value={clip?.y || 0} disabled={!clip} onCommit={(value) => patch({ y: value }, true)} />
              </div>
              <div className="flex flex-wrap gap-1">
                <Toggle on={Boolean(clip?.flipX)} disabled={!clip} onClick={() => patch({ flipX: !clip?.flipX }, true)}>Mirror</Toggle>
                <Toggle on={Boolean(clip?.flipY)} disabled={!clip} onClick={() => patch({ flipY: !clip?.flipY }, true)}>Flip V</Toggle>
                <Toggle on={Boolean(clip?.rotate)} disabled={!clip} onClick={rotate90}>Rotate 90°</Toggle>
                <Toggle on={(clip?.crop || 0) > 0} disabled={!clip} onClick={() => patch({ crop: (clip?.crop || 0) > 0 ? 0 : 0.1 }, true)}>Crop</Toggle>
              </div>
              <Slider label="Rotation" min={-180} max={180} step={1} value={clip?.rotate || 0} display={`${clip?.rotate || 0}°`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ rotate: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
              {(clip?.crop || 0) > 0 && (
                <Slider label="Crop" min={0} max={30} step={1} value={Math.round((clip?.crop || 0) * 100)} display={`${Math.round((clip?.crop || 0) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ crop: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
              )}
            </Section>
          </div>
          <Section title="Opacity">
            <Slider label="Opacity" min={0} max={100} step={1} value={Math.round((clip?.opacity ?? 1) * 100)} display={`${Math.round((clip?.opacity ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ opacity: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
          <div id="insp-speed">
            <Section title="Speed">
              <Slider
                label="Speed"
                min={0.25}
                max={4}
                step={0.05}
                value={clampSpeed(clip?.speed)}
                display={`${clampSpeed(clip?.speed).toFixed(2)}×`}
                disabled={!clip}
                onStart={props.onGestureStart}
                onChange={(value) => {
                  if (!clip) return;
                  props.onPreview(setSegmentSpeed(props.segments, clip.id, value));
                }}
                onEnd={() => props.onGestureEnd("clips")}
              />
              <div className="flex flex-wrap gap-1">
                <Toggle on={false} disabled={!clip} onClick={ramp}>Ramp</Toggle>
                <Toggle on={Boolean(clip?.reverse)} disabled={!clip} onClick={() => patch({ reverse: !clip?.reverse }, true)}>Reverse</Toggle>
                <Toggle on={Boolean(clip?.freeze)} disabled={!clip} onClick={() => patch({ freeze: !clip?.freeze }, true)}>Freeze</Toggle>
              </div>
            </Section>
          </div>
          <div id="insp-volume">
            <Section title="Volume">
              <Slider label="Volume" min={0} max={100} step={1} value={Math.round((clip?.volume ?? 1) * 100)} display={`${Math.round((clip?.volume ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ volume: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
              <Toggle on={(clip?.volume ?? 1) <= 0} disabled={!clip} onClick={() => patch({ volume: (clip?.volume ?? 1) <= 0 ? 1 : 0 }, true)}>Mute</Toggle>
            </Section>
          </div>
          <Section title="Fade">
            <Slider label="Fade in" min={0} max={3} step={0.1} value={clip?.fadeIn || 0} display={`${(clip?.fadeIn || 0).toFixed(1)}s`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ fadeIn: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Fade out" min={0} max={3} step={0.1} value={clip?.fadeOut || 0} display={`${(clip?.fadeOut || 0).toFixed(1)}s`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ fadeOut: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
          <Section title="Filters">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(FILTER_PRESETS) as (keyof typeof FILTER_PRESETS)[]).map((name) => (
                <Toggle key={name} on={(clip?.filter || "none") === name} disabled={!clip} onClick={() => patch({ filter: name, ...FILTER_PRESETS[name] }, true)}>
                  {name}
                </Toggle>
              ))}
            </div>
          </Section>
          <Section title="Adjustment">
            <Slider label="Brightness" min={-30} max={30} step={1} value={Math.round((clip?.brightness || 0) * 100)} display={`${Math.round((clip?.brightness || 0) * 100)}`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ brightness: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Contrast" min={40} max={200} step={1} value={Math.round((clip?.contrast ?? 1) * 100)} display={`${Math.round((clip?.contrast ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ contrast: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Saturation" min={0} max={200} step={1} value={Math.round((clip?.saturation ?? 1) * 100)} display={`${Math.round((clip?.saturation ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ saturation: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Temperature" min={-100} max={100} step={1} value={Math.round((clip?.temperature || 0) * 100)} display={`${Math.round((clip?.temperature || 0) * 100)}`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ temperature: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
        </div>
      </aside>
    );
  }

  if (props.mode === "cue" && props.cue) {
    const cue = props.cue;
    return (
      <aside className={shell} data-inspector="cue">
        <header className="flex h-9 shrink-0 items-center border-b border-[#2a2c38] px-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-[#f4f4f5]">Caption</p>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3">
          <label className="block text-[11px] text-[#b7bcc4]">
            Text
            <textarea
              aria-label="Caption text"
              value={cue.words.map((word) => word.text).join(" ")}
              onFocus={props.onGestureStart}
              onChange={(event) => {
                const parts = event.target.value.split(/\s+/).filter(Boolean);
                if (parts.length === 0) return;
                const span = Math.max(0.08, cue.end - cue.start);
                const step = span / parts.length;
                const words = parts.map((word, index) => ({
                  text: word.slice(0, 80),
                  start: cue.start + index * step,
                  end: cue.start + (index + 1) * step,
                  emphasis: isEmphasis(word),
                }));
                props.onGestureStart();
                props.onPreviewCues(props.cues.map((item) => (item.id === cue.id ? { ...item, words } : item)));
              }}
              onBlur={() => props.onGestureEnd("cues")}
              className="mt-1 h-20 w-full resize-none rounded border border-[#2a2c38] bg-[#0a0b14] px-2 py-1.5 text-[12px] text-[#e8e8e8]"
            />
          </label>
          <div>
            <p className="mb-1 text-[11px] text-[#b7bcc4]">Style</p>
            <div className="flex flex-wrap gap-1">
              {PRESET_LIST.map((preset) => (
                <Toggle key={preset.id} on={props.style.preset === preset.id} onClick={() => props.onChange({ style: preset.style })}>
                  {preset.label}
                </Toggle>
              ))}
            </div>
          </div>
          <label className="block text-[11px] text-[#b7bcc4]">
            Font
            <select
              aria-label="Caption font"
              value={props.style.font}
              onChange={(event) => props.onChange({ style: { ...props.style, font: event.target.value as CaptionFontId } })}
              className="mt-1 h-7 w-full truncate rounded border border-[#2a2c38] bg-[#0a0b14] px-2 text-[12px] text-[#e8e8e8]"
            >
              {CAPTION_FONTS.map((font) => (
                <option key={font.id} value={font.id}>{font.id}</option>
              ))}
            </select>
          </label>
          <Slider
            label="Size"
            min={24}
            max={140}
            step={1}
            value={props.style.size}
            display={`${props.style.size}`}
            onStart={props.onGestureStart}
            onChange={(value) => props.onPreviewStyle({ ...props.style, size: value })}
            onEnd={() => props.onGestureEnd("cues")}
          />
          <div className="flex gap-2">
            <ColorField label="Colour" value={props.style.color} onChange={(color) => props.onChange({ style: { ...props.style, color } })} />
            <ColorField label="Highlight" value={props.style.highlight} onChange={(highlight) => props.onChange({ style: { ...props.style, highlight } })} />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["top", "middle", "bottom"] as const).map((position) => (
              <Toggle key={position} on={props.style.position === position} onClick={() => props.onChange({ style: { ...props.style, position } })}>
                {position}
              </Toggle>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  if (props.mode === "audio" && props.audioLayer) {
    const layer = props.audioLayer;
    return (
      <aside className={shell} data-inspector="audio">
        <header className="flex h-9 shrink-0 items-center border-b border-[#2a2c38] px-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-[#f4f4f5]">Audio</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Section title="Volume">
            <Slider label="Volume" min={0} max={100} step={1} value={Math.round((layer.volume ?? 1) * 100)} display={`${Math.round((layer.volume ?? 1) * 100)}%`} onStart={props.onGestureStart} onChange={(value) => patchEditor("audios", layer.id, { volume: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Toggle on={(layer.volume ?? 1) <= 0} onClick={() => patchEditor("audios", layer.id, { volume: (layer.volume ?? 1) <= 0 ? 1 : 0 }, true)}>Mute</Toggle>
          </Section>
          <Section title="Fade">
            <Slider label="Fade in" min={0} max={3} step={0.1} value={layer.fadeIn || 0} display={`${(layer.fadeIn || 0).toFixed(1)}s`} onStart={props.onGestureStart} onChange={(value) => patchEditor("audios", layer.id, { fadeIn: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Fade out" min={0} max={3} step={0.1} value={layer.fadeOut || 0} display={`${(layer.fadeOut || 0).toFixed(1)}s`} onStart={props.onGestureStart} onChange={(value) => patchEditor("audios", layer.id, { fadeOut: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
        </div>
      </aside>
    );
  }

  if (props.mode === "overlay" && props.overlayLayer) {
    const layer = props.overlayLayer;
    return (
      <aside className={shell} data-inspector="overlay">
        <header className="flex h-9 shrink-0 items-center border-b border-[#2a2c38] px-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-[#f4f4f5]">Overlay</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Section title="Transform">
            <Slider label="Scale" min={10} max={200} step={1} value={Math.round((layer.scale ?? 1) * 100)} display={`${Math.round((layer.scale ?? 1) * 100)}%`} onStart={props.onGestureStart} onChange={(value) => patchEditor("overlays", layer.id, { scale: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <div className="flex items-center gap-2 text-[11px] text-[#b7bcc4]">
              <span className="w-14 shrink-0">Position</span>
              <Num label="X" value={layer.x || 0} onCommit={(value) => patchEditor("overlays", layer.id, { x: value }, true)} />
              <Num label="Y" value={layer.y || 0} onCommit={(value) => patchEditor("overlays", layer.id, { y: value }, true)} />
            </div>
          </Section>
        </div>
      </aside>
    );
  }

  if (props.mode === "text" && props.textLayer) {
    const layer = props.textLayer;
    return (
      <aside className={shell} data-inspector="text">
        <header className="flex h-9 shrink-0 items-center border-b border-[#2a2c38] px-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-[#f4f4f5]">Text</p>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3">
          <label className="block text-[11px] text-[#b7bcc4]">
            Text
            <textarea
              aria-label="Title text"
              value={layer.text}
              onFocus={props.onGestureStart}
              onChange={(event) => {
                props.onGestureStart();
                patchEditor("texts", layer.id, { text: event.target.value.slice(0, 120) }, false);
              }}
              onBlur={() => props.onGestureEnd("clips")}
              className="mt-1 h-20 w-full resize-none rounded border border-[#2a2c38] bg-[#0a0b14] px-2 py-1.5 text-[12px] text-[#e8e8e8]"
            />
          </label>
          <Slider label="Size" min={24} max={160} step={1} value={layer.size} display={`${layer.size}`} onStart={props.onGestureStart} onChange={(value) => patchEditor("texts", layer.id, { size: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
          <ColorField label="Colour" value={layer.color} onChange={(color) => patchEditor("texts", layer.id, { color }, true)} />
        </div>
      </aside>
    );
  }

  return (
    <aside className={shell} data-inspector="none">
      <div className="grid h-9 shrink-0 grid-cols-5 border-b border-[#2a2c38]" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            title={name}
            onClick={() => setTab(name)}
            className={`min-w-0 truncate px-0.5 text-center text-[11px] ${tab === name ? "border-b-2 border-[#7c5cff] text-[#f4f4f5]" : "text-[#8e939c]"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {tab === "Video" && (
          <>
            <Section title="Transform">
              <Slider label="Scale" min={40} max={160} step={1} value={Math.round((clip?.scale ?? 1) * 100)} display={`${Math.round((clip?.scale ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ scale: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
              <div className="flex items-center gap-2 text-[11px] text-[#b7bcc4]">
                <span className="w-14 shrink-0">Position</span>
                <Num label="X" value={clip?.x || 0} disabled={!clip} onCommit={(value) => patch({ x: value }, true)} />
                <Num label="Y" value={clip?.y || 0} disabled={!clip} onCommit={(value) => patch({ y: value }, true)} />
              </div>
              <Slider label="Rotation" min={-180} max={180} step={1} value={clip?.rotate || 0} display={`${clip?.rotate || 0}°`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ rotate: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
              <div className="flex gap-1">
                <Toggle on={Boolean(clip?.flipX)} disabled={!clip} onClick={() => patch({ flipX: !clip?.flipX }, true)}>Mirror</Toggle>
                <Toggle on={Boolean(clip?.flipY)} disabled={!clip} onClick={() => patch({ flipY: !clip?.flipY }, true)}>Flip V</Toggle>
              </div>
            </Section>
            <Section title="Compositing">
              <label className="block text-[11px] text-[#b7bcc4]">
                Blend mode
                <select aria-label="Blend mode" className="mt-1 h-7 w-full rounded border border-[#2a2c38] bg-[#0a0b14] px-2 text-[12px] text-[#e8e8e8]" defaultValue="normal">
                  <option value="normal">Normal</option>
                </select>
              </label>
              <Slider label="Opacity" min={0} max={100} step={1} value={Math.round((clip?.opacity ?? 1) * 100)} display={`${Math.round((clip?.opacity ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ opacity: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            </Section>
            <Section title="Mask">
              {(clip?.crop || 0) > 0 ? (
                <Slider label="Inset" min={0} max={30} step={1} value={Math.round((clip?.crop || 0) * 100)} display={`${Math.round((clip?.crop || 0) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ crop: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
              ) : (
                <button type="button" disabled={!clip} onClick={() => patch({ crop: 0.08 }, true)} className="flex h-7 w-full items-center justify-center rounded border border-[#2a2c38] text-[12px] text-[#d5d8de] disabled:opacity-40">
                  + Add Mask
                </button>
              )}
            </Section>
            <Section title="Video Effects">
              <div className="flex flex-wrap gap-1">
                {(["none", "punch", "shake", "blur"] as const).map((effect) => (
                  <Toggle key={effect} on={(clip?.effect || "none") === effect} disabled={!clip} onClick={() => patch({ effect }, true)}>
                    {effect}
                  </Toggle>
                ))}
              </div>
            </Section>
          </>
        )}
        {tab === "Audio" && (
          <Section title="Volume">
            <Slider label="Volume" min={0} max={100} step={1} value={Math.round((clip?.volume ?? 1) * 100)} display={`${Math.round((clip?.volume ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ volume: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Fade in" min={0} max={3} step={0.1} value={clip?.fadeIn || 0} display={`${(clip?.fadeIn || 0).toFixed(1)}s`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ fadeIn: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Fade out" min={0} max={3} step={0.1} value={clip?.fadeOut || 0} display={`${(clip?.fadeOut || 0).toFixed(1)}s`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ fadeOut: value }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
        )}
        {tab === "Speed" && (
          <Section title="Speed">
            <Slider
              label="Speed"
              min={0.25}
              max={4}
              step={0.05}
              value={clampSpeed(clip?.speed)}
              display={`${clampSpeed(clip?.speed).toFixed(2)}×`}
              disabled={!clip}
              onStart={props.onGestureStart}
              onChange={(value) => {
                if (!clip) return;
                props.onPreview(setSegmentSpeed(props.segments, clip.id, value));
              }}
              onEnd={() => props.onGestureEnd("clips")}
            />
            <div className="flex flex-wrap gap-1">
              <Toggle on={false} disabled={!clip} onClick={ramp}>Ramp</Toggle>
              <Toggle on={Boolean(clip?.reverse)} disabled={!clip} onClick={() => patch({ reverse: !clip?.reverse }, true)}>Reverse</Toggle>
              <Toggle on={Boolean(clip?.freeze)} disabled={!clip} onClick={() => patch({ freeze: !clip?.freeze }, true)}>Freeze</Toggle>
            </div>
          </Section>
        )}
        {tab === "Animation" && (
          <>
            <Section title="Transition">
              <div className="flex flex-wrap gap-1">
                {(["none", "fade", "slide"] as const).map((transition) => (
                  <Toggle key={transition} on={(clip?.transition || "none") === transition} disabled={!clip} onClick={() => patch({ transition }, true)}>
                    {transition}
                  </Toggle>
                ))}
              </div>
            </Section>
            <Section title="Caption">
              <div className="flex flex-wrap gap-1">
                {(["none", "pop", "scale"] as const).map((animation) => (
                  <Toggle key={animation} on={props.style.animation === animation} onClick={() => props.onChange({ style: { ...props.style, animation } })}>
                    {animation}
                  </Toggle>
                ))}
              </div>
            </Section>
            <Section title="Keyframes">
              <button
                type="button"
                disabled={!clip}
                onClick={() =>
                  patch(
                    {
                      keyframes: [
                        { t: 0, x: clip?.x || 0, y: clip?.y || 0, scale: clip?.scale || 1 },
                        { t: 1, x: (clip?.x || 0) + 90, y: clip?.y || 0, scale: clip?.scale || 1 },
                      ],
                    },
                    true
                  )
                }
                className="flex h-7 w-full items-center justify-center rounded border border-[#2a2c38] text-[12px] text-[#d5d8de] disabled:opacity-40"
              >
                Move right
              </button>
              <p className="text-[11px] text-[#8e939c]">Position moves between the two keys. Scale stays on the first key.</p>
            </Section>
          </>
        )}
        {tab === "Adjustment" && (
          <Section title="Colour">
            <Slider label="Brightness" min={-30} max={30} step={1} value={Math.round((clip?.brightness || 0) * 100)} display={`${Math.round((clip?.brightness || 0) * 100)}`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ brightness: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Contrast" min={40} max={200} step={1} value={Math.round((clip?.contrast ?? 1) * 100)} display={`${Math.round((clip?.contrast ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ contrast: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Saturation" min={0} max={200} step={1} value={Math.round((clip?.saturation ?? 1) * 100)} display={`${Math.round((clip?.saturation ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ saturation: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Temperature" min={-100} max={100} step={1} value={Math.round((clip?.temperature || 0) * 100)} display={`${Math.round((clip?.temperature || 0) * 100)}`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ temperature: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-[#2a2c38]">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-[12px] text-[#e4e4e7] [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8e939c] group-open:rotate-180" />
        <span className="truncate">{title}</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  disabled?: boolean;
  onStart: () => void;
  onChange: (value: number) => void;
  onEnd: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="shrink-0 text-[#b7bcc4]">{props.label}</span>
        <span className="shrink-0 tabular-nums text-[#e8e8e8]">{props.display}</span>
      </span>
      <input
        aria-label={props.label}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onPointerDown={props.onStart}
        onChange={(event) => {
          props.onStart();
          props.onChange(Number(event.target.value));
        }}
        onPointerUp={props.onEnd}
        onKeyUp={props.onEnd}
        onBlur={props.onEnd}
        className="h-1 w-full accent-[#7c5cff] disabled:opacity-40"
      />
    </label>
  );
}

function Num({ label, value, disabled, onCommit }: { label: string; value: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value);
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      <span className="shrink-0">{label}</span>
      <input
        aria-label={`Position ${label}`}
        type="number"
        disabled={disabled}
        value={shown}
        onFocus={() => {
          setFocused(true);
          setText(String(value));
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          setFocused(false);
          const next = Number(text);
          if (Number.isFinite(next)) onCommit(Math.max(-800, Math.min(800, Math.round(next))));
        }}
        className="h-7 w-full min-w-0 rounded border border-[#2a2c38] bg-[#0a0b14] px-1.5 text-[12px] text-[#e8e8e8] disabled:opacity-40"
      />
    </label>
  );
}

function Toggle({ children, on, disabled, onClick }: { children: React.ReactNode; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`h-7 min-w-0 truncate rounded border px-2 text-[11px] capitalize disabled:opacity-40 ${on ? "border-[#7c5cff] text-[#f4f4f5]" : "border-[#2a2c38] text-[#c8ccd2]"}`}
    >
      {children}
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-[#b7bcc4]">
      <span className="shrink-0">{label}</span>
      <input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-10 shrink-0 cursor-pointer rounded border border-[#2a2c38] bg-transparent" />
    </label>
  );
}
