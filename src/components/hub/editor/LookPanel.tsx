"use client";

import { useEffect, useState } from "react";
import type { CaptionStyle } from "@/lib/caption-ass";
import type { CaptionCue } from "@/lib/caption-cues";
import { FILTER_PRESETS, beatsFromPeaks, type EditorDoc } from "@/lib/editor-doc";
import { clampSpeed, composedStart, newId, setSegmentSpeed, splitAt, type Segment } from "@/lib/edit-timeline";

const LANGUAGES = [
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["en", "English"],
];

type Change = { editor?: EditorDoc; segments?: Segment[]; cues?: CaptionCue[]; style?: CaptionStyle };
type Template = { id: string; name: string; doc: { style?: CaptionStyle; editor?: Partial<EditorDoc>; look?: Partial<Segment> } };

export default function LookPanel(props: {
  projectId: string | null;
  editor: EditorDoc;
  clip: Segment | null;
  segments: Segment[];
  cues: CaptionCue[];
  style: CaptionStyle;
  peaks: number[];
  sourceDuration: number;
  time: number;
  onChange: (change: Change) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [language, setLanguage] = useState("es");
  const [voice, setVoice] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const { editor, clip } = props;

  useEffect(() => {
    fetch("/api/hooks/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.templates) setTemplates(data.templates);
      })
      .catch(() => {});
  }, [props.projectId]);

  function patchClip(partial: Partial<Segment>) {
    if (!clip) {
      props.onError("Select a clip first.");
      return;
    }
    props.onChange({ segments: props.segments.map((seg) => (seg.id === clip.id ? { ...seg, ...partial } : seg)) });
  }

  function patchEditor(partial: Partial<EditorDoc>) {
    props.onChange({ editor: { ...editor, ...partial } });
  }

  function ramp() {
    if (!clip) return;
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
    props.onNotice("Second half plays at 0.5×. A continuous speed curve is not available.");
  }

  async function translate() {
    props.onError("");
    const res = await fetch("/api/hooks/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cues: props.cues, language }),
    });
    const data = await res.json();
    if (!res.ok) {
      props.onError(data.error || "Could not translate.");
      return;
    }
    props.onChange({ cues: data.cues });
    props.onNotice("Captions translated. Timings stay on the original words.");
  }

  async function speak() {
    if (!props.projectId) return;
    const text = voice.trim();
    if (!text) return;
    const res = await fetch(`/api/hooks/projects/${props.projectId}/voiceover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      props.onError(data.error || "Could not make a voice-over.");
      return;
    }
    const span = Math.max(0.4, Number(data.asset.duration) || 2);
    props.onChange({
      editor: {
        ...editor,
        assets: [...editor.assets, data.asset].slice(0, 16),
        audios: [...editor.audios, { id: newId(), assetId: data.asset.id, start: props.time, in: 0, out: span, volume: 1, fadeIn: 0.05, fadeOut: 0.15 }].slice(0, 4),
      },
    });
    props.onNotice(data.notice || "Voice-over added on the music track.");
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const res = await fetch("/api/hooks/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        doc: {
          style: props.style,
          editor,
          look: clip
            ? {
                brightness: clip.brightness,
                contrast: clip.contrast,
                saturation: clip.saturation,
                temperature: clip.temperature,
                filter: clip.filter,
                effect: clip.effect,
                transition: clip.transition,
                volume: clip.volume,
                fadeIn: clip.fadeIn,
                fadeOut: clip.fadeOut,
              }
            : {},
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      props.onError(data.error || "Could not save the template.");
      return;
    }
    setTemplates((current) => [data.template, ...current]);
    setTemplateName("");
    props.onNotice("Template saved for this account.");
  }

  function applyTemplate(template: Template) {
    const nextEditor = template.doc.editor || {};
    const look = template.doc.look || {};
    props.onChange({
      style: template.doc.style,
      editor: {
        ...editor,
        aspect: nextEditor.aspect || editor.aspect,
        fps: nextEditor.fps || editor.fps,
        resolution: nextEditor.resolution || editor.resolution,
        background: nextEditor.background || editor.background,
      },
      segments: clip ? props.segments.map((seg) => (seg.id === clip.id ? { ...seg, ...look } : seg)) : props.segments,
    });
    props.onNotice(`Applied ${template.name}. Imported media stays on this project.`);
  }

  async function removeTemplate(id: string) {
    const res = await fetch(`/api/hooks/templates/${id}`, { method: "DELETE" });
    if (res.ok) setTemplates((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-3 border-b border-white/10 pb-3 text-[13px]">
      <h2 className="text-[14px] font-medium">Canvas</h2>
      <div className="flex flex-wrap gap-1">
        {(["9:16", "1:1", "16:9"] as const).map((aspect) => (
          <button key={aspect} type="button" aria-pressed={editor.aspect === aspect} onClick={() => patchEditor({ aspect })} className={`rounded-md border px-2 py-1 ${editor.aspect === aspect ? "border-purple-500" : "border-white/10"}`}>
            {aspect}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {([720, 1080] as const).map((resolution) => (
          <button key={resolution} type="button" aria-pressed={editor.resolution === resolution} onClick={() => patchEditor({ resolution })} className={`rounded-md border px-2 py-1 ${editor.resolution === resolution ? "border-purple-500" : "border-white/10"}`}>
            {resolution}p
          </button>
        ))}
        {([24, 30, 60] as const).map((fps) => (
          <button key={fps} type="button" aria-pressed={editor.fps === fps} onClick={() => patchEditor({ fps })} className={`rounded-md border px-2 py-1 ${editor.fps === fps ? "border-purple-500" : "border-white/10"}`}>
            {fps} fps
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button type="button" aria-pressed={editor.background === "black"} onClick={() => patchEditor({ background: "black" })} className={`rounded-md border px-2 py-1 ${editor.background === "black" ? "border-purple-500" : "border-white/10"}`}>Black bars</button>
        <button type="button" aria-pressed={editor.background === "blur"} onClick={() => patchEditor({ background: "blur" })} className={`rounded-md border px-2 py-1 ${editor.background === "blur" ? "border-purple-500" : "border-white/10"}`}>Blur fill</button>
      </div>
      <h2 className="text-[14px] font-medium">Clip</h2>
      {clip ? (
        <div className="space-y-2">
          <label className="block">Volume {Math.round((clip.volume ?? 1) * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={clip.volume ?? 1} onChange={(event) => patchClip({ volume: Number(event.target.value) })} className="w-full" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>Fade in
              <input type="number" min={0} max={3} step={0.1} value={clip.fadeIn || 0} onChange={(event) => patchClip({ fadeIn: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-white/10 bg-[#12121A] px-2 py-1" />
            </label>
            <label>Fade out
              <input type="number" min={0} max={3} step={0.1} value={clip.fadeOut || 0} onChange={(event) => patchClip({ fadeOut: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-white/10 bg-[#12121A] px-2 py-1" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={ramp} className="rounded-md border border-white/10 px-2 py-1">Speed ramp</button>
            <button type="button" aria-pressed={Boolean(clip.reverse)} onClick={() => patchClip({ reverse: !clip.reverse })} className="rounded-md border border-white/10 px-2 py-1">Reverse</button>
            <button type="button" aria-pressed={Boolean(clip.freeze)} onClick={() => patchClip({ freeze: !clip.freeze })} className="rounded-md border border-white/10 px-2 py-1">Freeze</button>
            <button type="button" aria-pressed={Boolean(clip.flipX)} onClick={() => patchClip({ flipX: !clip.flipX })} className="rounded-md border border-white/10 px-2 py-1">Flip H</button>
            <button type="button" aria-pressed={Boolean(clip.flipY)} onClick={() => patchClip({ flipY: !clip.flipY })} className="rounded-md border border-white/10 px-2 py-1">Flip V</button>
          </div>
          <label className="block">Rotate {clip.rotate || 0}°
            <input type="range" min={-45} max={45} step={1} value={clip.rotate || 0} onChange={(event) => patchClip({ rotate: Number(event.target.value) })} className="w-full" />
          </label>
          <label className="block">Crop {Math.round((clip.crop || 0) * 100)}%
            <input type="range" min={0} max={0.3} step={0.01} value={clip.crop || 0} onChange={(event) => patchClip({ crop: Number(event.target.value) })} className="w-full" />
          </label>
          <label className="block">Scale {(clip.scale ?? 1).toFixed(2)}
            <input type="range" min={0.4} max={1.6} step={0.02} value={clip.scale ?? 1} onChange={(event) => patchClip({ scale: Number(event.target.value) })} className="w-full" />
          </label>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(FILTER_PRESETS) as (keyof typeof FILTER_PRESETS)[]).map((name) => (
              <button key={name} type="button" aria-pressed={(clip.filter || "none") === name} onClick={() => patchClip({ filter: name, ...FILTER_PRESETS[name] })} className={`rounded-md border px-2 py-1 ${(clip.filter || "none") === name ? "border-purple-500" : "border-white/10"}`}>
                {name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["none", "punch", "shake", "blur"] as const).map((effect) => (
              <button key={effect} type="button" aria-pressed={(clip.effect || "none") === effect} onClick={() => patchClip({ effect })} className={`rounded-md border px-2 py-1 ${(clip.effect || "none") === effect ? "border-purple-500" : "border-white/10"}`}>{effect}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["none", "fade", "slide"] as const).map((transition) => (
              <button key={transition} type="button" aria-pressed={(clip.transition || "none") === transition} onClick={() => patchClip({ transition })} className={`rounded-md border px-2 py-1 ${(clip.transition || "none") === transition ? "border-purple-500" : "border-white/10"}`}>{transition}</button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              patchClip({
                keyframes: [
                  { t: 0, x: clip.x || 0, y: clip.y || 0, scale: clip.scale || 1 },
                  { t: 1, x: (clip.x || 0) + 90, y: clip.y || 0, scale: clip.scale || 1 },
                ],
              })
            }
            className="rounded-md border border-white/10 px-2 py-1"
          >
            Keyframes: move right
          </button>
          <p className="text-[12px] text-slate-400">Position moves between the two keys. Scale on those keys stays at the first value in the export.</p>
        </div>
      ) : (
        <p className="text-slate-400">Select a clip to grade, move, or restyle it.</p>
      )}
      <h2 className="text-[14px] font-medium">Text</h2>
      <div className="flex gap-1">
        <button type="button" onClick={() => patchEditor({ texts: [...editor.texts, { id: newId(), text: "Title", start: props.time, end: props.time + 2, x: 0, y: -420, size: 72, color: "#ffffff" }].slice(0, 12) })} className="rounded-md border border-white/10 px-2 py-1">Add title</button>
        <button type="button" onClick={() => patchEditor({ texts: [...editor.texts, { id: newId(), text: "✨", start: props.time, end: props.time + 2, x: 0, y: -180, size: 140, color: "#ffffff", emoji: true }].slice(0, 12) })} className="rounded-md border border-white/10 px-2 py-1">Add emoji</button>
      </div>
      {editor.texts.map((text) => (
        <div key={text.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{text.text}</span>
          <button type="button" onClick={() => patchEditor({ texts: editor.texts.filter((item) => item.id !== text.id) })} className="text-slate-400">Remove</button>
        </div>
      ))}
      <h2 className="text-[14px] font-medium">Captions</h2>
      <div className="flex gap-1">
        <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Caption language" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#12121A] px-2 py-1">
          {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <button type="button" onClick={translate} disabled={!props.cues.length} className="rounded-md border border-white/10 px-2 py-1 disabled:opacity-40">Translate</button>
      </div>
      <h2 className="text-[14px] font-medium">Voice-over</h2>
      <textarea value={voice} onChange={(event) => setVoice(event.target.value)} rows={2} placeholder="Line to speak" className="w-full rounded-md border border-white/10 bg-[#12121A] px-2 py-1" />
      <button type="button" onClick={speak} disabled={!props.projectId || !voice.trim()} className="rounded-md border border-white/10 px-2 py-1 disabled:opacity-40">Add voice-over</button>
      <h2 className="text-[14px] font-medium">Beats</h2>
      <button
        type="button"
        onClick={() => {
          const beats = beatsFromPeaks(props.peaks, props.sourceDuration, props.segments);
          patchEditor({ beats });
          props.onNotice(beats.length ? `${beats.length} beat markers. They snap; they do not recut the timeline.` : "No strong beats in this waveform.");
        }}
        className="rounded-md border border-white/10 px-2 py-1"
      >
        Mark beats
      </button>
      <h2 className="text-[14px] font-medium">Templates</h2>
      <div className="flex gap-1">
        <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#12121A] px-2 py-1" />
        <button type="button" onClick={saveTemplate} className="rounded-md border border-white/10 px-2 py-1">Save</button>
      </div>
      {templates.map((template) => (
        <div key={template.id} className="flex items-center gap-2">
          <button type="button" onClick={() => applyTemplate(template)} className="min-w-0 flex-1 truncate text-left">{template.name}</button>
          <button type="button" onClick={() => removeTemplate(template.id)} className="text-slate-400">Delete</button>
        </div>
      ))}
      {editor.overlays.map((layer) => (
        <div key={layer.id} className="flex items-center gap-2 text-slate-400">
          <span className="min-w-0 flex-1 truncate">Overlay</span>
          <button type="button" onClick={() => patchEditor({ overlays: editor.overlays.filter((item) => item.id !== layer.id) })}>Remove</button>
        </div>
      ))}
      {editor.audios.map((layer) => (
        <div key={layer.id} className="flex items-center gap-2 text-slate-400">
          <span className="min-w-0 flex-1 truncate">Audio</span>
          <button type="button" onClick={() => patchEditor({ audios: editor.audios.filter((item) => item.id !== layer.id) })}>Remove</button>
        </div>
      ))}
    </div>
  );
}
