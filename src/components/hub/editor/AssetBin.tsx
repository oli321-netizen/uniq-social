"use client";

import { useEffect, useState } from "react";
import {
  AudioLines,
  BetweenHorizontalStart,
  Captions,
  Film,
  SlidersHorizontal,
  Sparkles,
  Sticker,
  SunMedium,
  Type,
  type LucideIcon,
} from "lucide-react";
import CaptionStudio from "@/components/hub/CaptionStudio";
import type { CreatorDTO, HookDTO } from "@/lib/serialize";
import { applyPreset, PRESET_LIST, type CaptionStyle } from "@/lib/caption-ass";
import { CAPTION_FONTS } from "@/lib/caption-fonts";
import type { CaptionCue } from "@/lib/caption-cues";
import { FILTER_PRESETS, beatsFromPeaks, type EditorDoc } from "@/lib/editor-doc";
import { newId, type Segment, type WordStamp } from "@/lib/edit-timeline";
import type { FilmstripInfo } from "@/components/hub/editor/Timeline";

export type RailTab = "Media" | "Audio" | "Text" | "Stickers" | "Effects" | "Transitions" | "Captions" | "Filters" | "Adjustment";

const RAIL: { id: RailTab; label: string; icon: LucideIcon }[] = [
  { id: "Media", label: "Media", icon: Film },
  { id: "Audio", label: "Audio", icon: AudioLines },
  { id: "Text", label: "Text", icon: Type },
  { id: "Stickers", label: "Stickers", icon: Sticker },
  { id: "Effects", label: "Effects", icon: Sparkles },
  { id: "Transitions", label: "Transitions", icon: BetweenHorizontalStart },
  { id: "Captions", label: "Captions", icon: Captions },
  { id: "Filters", label: "Filters", icon: SunMedium },
  { id: "Adjustment", label: "Adjustment", icon: SlidersHorizontal },
];

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

const EMOJI = ["✨", "🔥", "😂", "👍", "💯", "⭐", "❤️", "🎬"];

type Change = { editor?: EditorDoc; segments?: Segment[]; cues?: CaptionCue[]; style?: CaptionStyle };
type Template = { id: string; name: string; doc: { style?: CaptionStyle; editor?: Partial<EditorDoc>; look?: Partial<Segment> } };

export default function AssetBin(props: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  projectId: string | null;
  fileName: string;
  duration: number;
  filmstrip: FilmstripInfo;
  creators: CreatorDTO[];
  creatorId: string;
  onCreator: (id: string) => void;
  onPickVideo: () => void;
  onReplace: () => void;
  editor: EditorDoc;
  clip: Segment | null;
  segments: Segment[];
  words: WordStamp[];
  cues: CaptionCue[];
  style: CaptionStyle;
  peaks: number[];
  time: number;
  hooks: HookDTO[] | null;
  selectedHook: string | null;
  onSelectHook: (id: string) => void;
  onToggleHook: (hook: HookDTO) => void;
  onDeleteHook: (hook: HookDTO) => void;
  onRewrite: () => void;
  busy: boolean;
  selectedWord: number | null;
  editingWord: number | null;
  onWord: (index: number) => void;
  onEditWord: (index: number, text: string) => void;
  onStartEdit: (index: number) => void;
  onDeleteWords: (indexes: number[]) => void;
  onSilences: () => void;
  onFillers: () => void;
  onImport: (file: File | null, slot: "overlay" | "audio") => void;
  onChange: (change: Change) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <nav className="flex w-[92px] shrink-0 flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-r border-[#2c3038] bg-[#121418] py-1" aria-label="Tools">
        {RAIL.map((item) => {
          const Icon = item.icon;
          const on = props.tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-pressed={on}
              onClick={() => props.onTab(item.id)}
              className={`flex h-12 w-full shrink-0 flex-col items-center justify-center gap-0.5 px-1 ${on ? "text-[#3ad6e4]" : "text-[#8d929a] hover:text-[#d5d8de]"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="w-full truncate text-center text-[10px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex w-[252px] shrink-0 flex-col border-r border-[#2c3038] bg-[#1a1d24]">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          {props.tab === "Media" && <Media {...props} />}
          {props.tab === "Audio" && <Audio {...props} />}
          {props.tab === "Text" && <Text {...props} />}
          {props.tab === "Stickers" && <Stickers {...props} />}
          {props.tab === "Effects" && <Effects {...props} />}
          {props.tab === "Transitions" && <Transitions {...props} />}
          {props.tab === "Captions" && <CaptionTools {...props} />}
          {props.tab === "Filters" && <Filters {...props} />}
          {props.tab === "Adjustment" && <Adjust {...props} />}
        </div>
      </div>
    </>
  );
}

function Media(props: {
  projectId: string | null;
  fileName: string;
  duration: number;
  filmstrip: FilmstripInfo;
  editor: EditorDoc;
  creators: CreatorDTO[];
  creatorId: string;
  onCreator: (id: string) => void;
  onPickVideo: () => void;
  onReplace: () => void;
}) {
  const cards: { key: string; name: string; duration: number; thumb?: string; frames?: number; image?: string }[] = [];
  if (props.projectId) {
    cards.push({
      key: "main",
      name: props.fileName || "Video",
      duration: props.duration,
      thumb: props.filmstrip?.url,
      frames: props.filmstrip?.frames,
    });
  }
  for (const asset of props.editor.assets) {
    if (asset.kind === "audio") continue;
    cards.push({
      key: asset.id,
      name: asset.name,
      duration: asset.duration,
      image: asset.kind === "image" && props.projectId ? `/api/hooks/projects/${props.projectId}/assets/${asset.id}` : undefined,
    });
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={props.onPickVideo} className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-[#2a3140] text-[12px] text-[#e8eef6] hover:bg-[#343c4e]">
        <span className="text-[#3ad6e4]">+</span> Video
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        {cards.map((card) => (
          <figure key={card.key} className="min-w-0" title={card.name}>
            <div className="relative aspect-video overflow-hidden rounded-sm bg-[#121418]">
              {card.image && <img src={card.image} alt="" className="h-full w-full object-cover" />}
              {card.thumb && card.frames && (
                <span
                  className="absolute inset-0 bg-cover"
                  style={{
                    backgroundImage: `url(${card.thumb})`,
                    backgroundSize: `${card.frames * 100}% 100%`,
                    backgroundPosition: "0 0",
                  }}
                />
              )}
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[10px] leading-4 text-white">{clock(card.duration)}</span>
            </div>
            <figcaption className="mt-0.5 truncate text-center text-[10px] text-[#c8ccd2]">{card.name}</figcaption>
          </figure>
        ))}
      </div>
      {props.projectId && (
        <button type="button" onClick={props.onReplace} className="text-[11px] text-[#8e939c] hover:text-[#e8e8e8]">
          Replace
        </button>
      )}
      <label className="block text-[11px] text-[#8e939c]">
        Creator
        <select value={props.creatorId} onChange={(event) => props.onCreator(event.target.value)} className="mt-1 h-7 w-full truncate rounded border border-[#2c3038] bg-[#121418] px-2 text-[12px] text-[#e8e8e8]">
          <option value="">No creator</option>
          {props.creators.map((creator) => (
            <option key={creator.id} value={creator.id}>{creator.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Audio(props: {
  projectId: string | null;
  editor: EditorDoc;
  time: number;
  onImport: (file: File | null, slot: "audio") => void;
  onChange: (change: Change) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [voice, setVoice] = useState("");
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
        ...props.editor,
        assets: [...props.editor.assets, data.asset].slice(0, 16),
        audios: [...props.editor.audios, { id: newId(), assetId: data.asset.id, start: props.time, in: 0, out: span, volume: 1, fadeIn: 0.05, fadeOut: 0.15 }].slice(0, 4),
      },
    });
    setVoice("");
    props.onNotice(data.notice || "Voice-over added.");
  }
  return (
    <div className="space-y-2 text-[12px]">
      <label className="flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-[#2a3140] text-[#e8eef6]">
        <span className="text-[#3ad6e4]">+</span> Audio
        <input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/*" className="sr-only" onChange={(event) => props.onImport(event.target.files?.[0] || null, "audio")} />
      </label>
      {props.editor.audios.map((layer) => {
        const asset = props.editor.assets.find((item) => item.id === layer.assetId);
        return (
          <div key={layer.id} className="flex min-w-0 items-center gap-2 text-[11px] text-[#c8ccd2]">
            <span className="min-w-0 flex-1 truncate">{asset?.name || "Audio"}</span>
            <span className="shrink-0 tabular-nums text-[#8e939c]">{clock(layer.out - layer.in)}</span>
            <button type="button" className="shrink-0 text-[#8e939c]" onClick={() => props.onChange({ editor: { ...props.editor, audios: props.editor.audios.filter((item) => item.id !== layer.id) } })}>Remove</button>
          </div>
        );
      })}
      <textarea value={voice} onChange={(event) => setVoice(event.target.value)} rows={3} placeholder="Voice-over line" className="w-full resize-none rounded border border-[#2c3038] bg-[#121418] px-2 py-1 text-[12px] outline-none" />
      <button type="button" disabled={!props.projectId || !voice.trim()} onClick={speak} className="h-7 w-full rounded border border-[#2c3038] text-[12px] disabled:opacity-40">Add voice-over</button>
    </div>
  );
}

function Text(props: { editor: EditorDoc; time: number; onChange: (change: Change) => void }) {
  function add() {
    props.onChange({
      editor: {
        ...props.editor,
        texts: [...props.editor.texts, { id: newId(), text: "Title", start: props.time, end: props.time + 2, x: 0, y: -640, size: 72, color: "#ffffff" }].slice(0, 12),
      },
    });
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={add} className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-[#2a3140] text-[12px] text-[#e8eef6]">
        <span className="text-[#3ad6e4]">+</span> Text
      </button>
      {props.editor.texts.filter((text) => !text.emoji).map((text) => (
        <Row key={text.id} label={text.text} onRemove={() => props.onChange({ editor: { ...props.editor, texts: props.editor.texts.filter((item) => item.id !== text.id) } })} />
      ))}
    </div>
  );
}

function Stickers(props: { editor: EditorDoc; time: number; onChange: (change: Change) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="flex h-10 items-center justify-center rounded bg-[#121418] text-[18px]"
          onClick={() =>
            props.onChange({
              editor: {
                ...props.editor,
                texts: [...props.editor.texts, { id: newId(), text: emoji, start: props.time, end: props.time + 2, x: 0, y: -220, size: 120, color: "#ffffff", emoji: true }].slice(0, 12),
              },
            })
          }
        >
          {emoji}
        </button>
      ))}
      {props.editor.texts.filter((text) => text.emoji).map((text) => (
        <button key={text.id} type="button" className="col-span-4 truncate text-left text-[11px] text-[#8e939c]" onClick={() => props.onChange({ editor: { ...props.editor, texts: props.editor.texts.filter((item) => item.id !== text.id) } })}>
          Remove {text.text}
        </button>
      ))}
    </div>
  );
}

function Effects(props: {
  projectId: string | null;
  clip: Segment | null;
  segments: Segment[];
  editor: EditorDoc;
  onImport: (file: File | null, slot: "overlay") => void;
  onChange: (change: Change) => void;
  onError: (message: string) => void;
}) {
  function setEffect(effect: Segment["effect"]) {
    if (!props.clip) {
      props.onError("Select a clip first.");
      return;
    }
    props.onChange({ segments: props.segments.map((seg) => (seg.id === props.clip?.id ? { ...seg, effect } : seg)) });
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        {(["none", "punch", "shake", "blur"] as const).map((effect) => (
          <button key={effect} type="button" aria-pressed={(props.clip?.effect || "none") === effect} onClick={() => setEffect(effect)} className={`h-8 truncate rounded border text-[12px] capitalize ${(props.clip?.effect || "none") === effect ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>
            {effect}
          </button>
        ))}
      </div>
      <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded border border-[#2c3038] text-[12px]">
        Import overlay
        <input type="file" accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp" className="sr-only" disabled={!props.projectId} onChange={(event) => props.onImport(event.target.files?.[0] || null, "overlay")} />
      </label>
      {props.editor.overlays.map((layer) => (
        <Row key={layer.id} label="Overlay" onRemove={() => props.onChange({ editor: { ...props.editor, overlays: props.editor.overlays.filter((item) => item.id !== layer.id) } })} />
      ))}
    </div>
  );
}

function Transitions(props: { clip: Segment | null; segments: Segment[]; onChange: (change: Change) => void; onError: (message: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {(["none", "fade", "slide"] as const).map((transition) => (
        <button
          key={transition}
          type="button"
          onClick={() => {
            if (!props.clip) {
              props.onError("Select a clip first.");
              return;
            }
            props.onChange({ segments: props.segments.map((seg) => (seg.id === props.clip?.id ? { ...seg, transition } : seg)) });
          }}
          className={`h-8 rounded border text-[12px] capitalize ${(props.clip?.transition || "none") === transition ? "border-[#22d3ee]" : "border-[#2c3038]"}`}
        >
          {transition}
        </button>
      ))}
    </div>
  );
}

function CaptionTools(props: {
  projectId: string | null;
  creatorId: string;
  words: WordStamp[];
  cues: CaptionCue[];
  style: CaptionStyle;
  hooks: HookDTO[] | null;
  selectedHook: string | null;
  onSelectHook: (id: string) => void;
  onToggleHook: (hook: HookDTO) => void;
  onDeleteHook: (hook: HookDTO) => void;
  onRewrite: () => void;
  busy: boolean;
  selectedWord: number | null;
  editingWord: number | null;
  onWord: (index: number) => void;
  onEditWord: (index: number, text: string) => void;
  onStartEdit: (index: number) => void;
  onDeleteWords: (indexes: number[]) => void;
  onSilences: () => void;
  onFillers: () => void;
  onChange: (change: Change) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [language, setLanguage] = useState("es");
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
    props.onNotice("Captions translated.");
  }
  const topic = props.hooks?.find((hook) => hook.id === props.selectedHook)?.text || props.words.map((word) => word.word).join(" ");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        {PRESET_LIST.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.label}
            aria-pressed={props.style.preset === preset.id}
            onClick={() => props.onChange({ style: applyPreset(preset.id) })}
            className={`h-7 truncate rounded border px-1.5 text-left text-[11px] ${props.style.preset === preset.id ? "border-[#22d3ee]" : "border-[#2c3038]"}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <select aria-label="Font" value={props.style.font} onChange={(event) => props.onChange({ style: { ...props.style, font: event.target.value as CaptionStyle["font"] } })} className="h-7 w-full truncate rounded border border-[#2c3038] bg-[#121418] px-2 text-[12px]">
        {CAPTION_FONTS.map((font) => <option key={font.id}>{font.id}</option>)}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-[#b7bcc4]">
        <span className="shrink-0">Size</span>
        <input aria-label="Caption size" type="range" min={32} max={120} value={props.style.size} onChange={(event) => props.onChange({ style: { ...props.style, size: Number(event.target.value) } })} className="min-w-0 flex-1 accent-[#22d3ee]" />
        <span className="w-6 shrink-0 tabular-nums text-[#e8e8e8]">{props.style.size}</span>
      </label>
      <div className="flex items-center gap-2 text-[11px] text-[#b7bcc4]">
        <label className="flex items-center gap-1">Colour<input aria-label="Caption colour" type="color" value={props.style.color} onChange={(event) => props.onChange({ style: { ...props.style, color: event.target.value } })} className="h-6 w-7 bg-transparent" /></label>
        <label className="flex items-center gap-1">Active<input aria-label="Active word colour" type="color" value={props.style.highlight} onChange={(event) => props.onChange({ style: { ...props.style, highlight: event.target.value } })} className="h-6 w-7 bg-transparent" /></label>
      </div>
      <div className="flex gap-1">
        {(["top", "middle", "bottom"] as const).map((position) => (
          <button key={position} type="button" aria-pressed={props.style.position === position} onClick={() => props.onChange({ style: { ...props.style, position } })} className={`h-7 min-w-0 flex-1 truncate rounded border text-[11px] capitalize ${props.style.position === position ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>{position}</button>
        ))}
      </div>
      <div className="flex gap-1">
        <button type="button" disabled={!props.projectId} onClick={props.onSilences} className="h-7 min-w-0 flex-1 truncate rounded border border-[#2c3038] px-1 text-[11px] disabled:opacity-40">Silences</button>
        <button type="button" disabled={!props.projectId} onClick={props.onFillers} className="h-7 min-w-0 flex-1 truncate rounded border border-[#2c3038] px-1 text-[11px] disabled:opacity-40">Fillers</button>
      </div>
      {props.words.length === 0 && <p className="text-[12px] text-[#8e939c]">Import a video.</p>}
      <div className="flex flex-wrap gap-1" aria-label="Transcript">
        {props.words.map((word, index) => (
          <button
            key={`${word.start}-${index}`}
            type="button"
            onClick={() => props.onWord(index)}
            onDoubleClick={() => props.onStartEdit(index)}
            className={`max-w-full truncate rounded px-1 py-0.5 text-[12px] ${props.selectedWord === index ? "bg-[#22d3ee] text-[#062126]" : "bg-white/10"}`}
          >
            {props.editingWord === index ? (
              <input
                autoFocus
                defaultValue={word.word}
                aria-label={`Edit ${word.word}`}
                className="w-16 bg-transparent text-[#062126] outline-none"
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => props.onEditWord(index, event.target.value.trim() || word.word)}
              />
            ) : word.word}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <select aria-label="Caption language" value={language} onChange={(event) => setLanguage(event.target.value)} className="h-7 min-w-0 flex-1 truncate rounded border border-[#2c3038] bg-[#121418] px-1 text-[12px]">
          {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <button type="button" disabled={!props.cues.length} onClick={translate} className="h-7 shrink-0 rounded border border-[#2c3038] px-2 text-[11px] disabled:opacity-40">Translate</button>
      </div>
      <details className="border-t border-[#2c3038] pt-2">
        <summary className="cursor-pointer text-[12px] text-[#d5d8de]">Hooks</summary>
        <div className="mt-2 space-y-1">
          <button type="button" disabled={!props.projectId || props.busy} onClick={props.onRewrite} className="h-7 w-full truncate rounded border border-[#2c3038] px-2 text-[11px] disabled:opacity-40">Write from transcript</button>
          {props.hooks?.map((hook) => (
            <div key={hook.id} className={`rounded border p-1.5 ${props.selectedHook === hook.id ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>
              <button type="button" onClick={() => props.onSelectHook(hook.id)} className="w-full break-words text-left text-[12px]">{hook.text}</button>
              <div className="mt-1 flex justify-end gap-2 text-[11px] text-[#8e939c]">
                <button type="button" onClick={() => props.onToggleHook(hook)}>{hook.favourite ? "Unfavourite" : "Favourite"}</button>
                <button type="button" onClick={() => props.onDeleteHook(hook)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </details>
      <details className="border-t border-[#2c3038] pt-2">
        <summary className="cursor-pointer text-[12px] text-[#d5d8de]">Posts</summary>
        <div className="mt-2 min-w-0">
          <CaptionStudio creatorId={props.creatorId} topicDefault={topic} />
        </div>
      </details>
    </div>
  );
}

function Filters(props: { clip: Segment | null; segments: Segment[]; onChange: (change: Change) => void; onError: (message: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {(Object.keys(FILTER_PRESETS) as (keyof typeof FILTER_PRESETS)[]).map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            if (!props.clip) {
              props.onError("Select a clip first.");
              return;
            }
            props.onChange({ segments: props.segments.map((seg) => (seg.id === props.clip?.id ? { ...seg, filter: name, ...FILTER_PRESETS[name] } : seg)) });
          }}
          className={`h-8 truncate rounded border text-[12px] capitalize ${(props.clip?.filter || "none") === name ? "border-[#22d3ee]" : "border-[#2c3038]"}`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function Adjust(props: {
  projectId: string | null;
  editor: EditorDoc;
  clip: Segment | null;
  segments: Segment[];
  style: CaptionStyle;
  peaks: number[];
  duration: number;
  onChange: (change: Change) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => {
    fetch("/api/hooks/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.templates) setTemplates(data.templates);
      })
      .catch(() => {});
  }, [props.projectId]);

  function patchEditor(partial: Partial<EditorDoc>) {
    props.onChange({ editor: { ...props.editor, ...partial } });
  }

  async function saveTemplate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/hooks/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        doc: {
          style: props.style,
          editor: props.editor,
          look: props.clip
            ? {
                brightness: props.clip.brightness,
                contrast: props.clip.contrast,
                saturation: props.clip.saturation,
                temperature: props.clip.temperature,
                filter: props.clip.filter,
                effect: props.clip.effect,
                transition: props.clip.transition,
                volume: props.clip.volume,
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
    setName("");
    props.onNotice("Template saved.");
  }

  function applyTemplate(template: Template) {
    const next = template.doc.editor || {};
    const look = template.doc.look || {};
    props.onChange({
      style: template.doc.style,
      editor: {
        ...props.editor,
        aspect: next.aspect || props.editor.aspect,
        fps: next.fps || props.editor.fps,
        resolution: next.resolution || props.editor.resolution,
        background: next.background || props.editor.background,
      },
      segments: props.clip ? props.segments.map((seg) => (seg.id === props.clip?.id ? { ...seg, ...look } : seg)) : props.segments,
    });
    props.onNotice(`Applied ${template.name}.`);
  }

  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex gap-1">
        {(["9:16", "1:1", "16:9"] as const).map((aspect) => (
          <button key={aspect} type="button" aria-pressed={props.editor.aspect === aspect} onClick={() => patchEditor({ aspect })} className={`h-7 flex-1 rounded border text-[11px] ${props.editor.aspect === aspect ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>{aspect}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {([720, 1080] as const).map((resolution) => (
          <button key={resolution} type="button" aria-pressed={props.editor.resolution === resolution} onClick={() => patchEditor({ resolution })} className={`h-7 rounded border px-2 text-[11px] ${props.editor.resolution === resolution ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>{resolution}p</button>
        ))}
        {([24, 30, 60] as const).map((fps) => (
          <button key={fps} type="button" aria-pressed={props.editor.fps === fps} onClick={() => patchEditor({ fps })} className={`h-7 rounded border px-2 text-[11px] ${props.editor.fps === fps ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>{fps} fps</button>
        ))}
      </div>
      <div className="flex gap-1">
        <button type="button" aria-pressed={props.editor.background === "black"} onClick={() => patchEditor({ background: "black" })} className={`h-7 flex-1 truncate rounded border text-[11px] ${props.editor.background === "black" ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>Black</button>
        <button type="button" aria-pressed={props.editor.background === "blur"} onClick={() => patchEditor({ background: "blur" })} className={`h-7 flex-1 truncate rounded border text-[11px] ${props.editor.background === "blur" ? "border-[#22d3ee]" : "border-[#2c3038]"}`}>Blur fill</button>
      </div>
      <button
        type="button"
        onClick={() => {
          const beats = beatsFromPeaks(props.peaks, props.duration, props.segments);
          patchEditor({ beats });
          props.onNotice(beats.length ? `${beats.length} beat markers.` : "No strong beats in this waveform.");
        }}
        className="h-7 w-full rounded border border-[#2c3038] text-[11px]"
      >
        Mark beats
      </button>
      <div className="flex gap-1">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Template" className="h-7 min-w-0 flex-1 rounded border border-[#2c3038] bg-[#121418] px-2 text-[12px]" />
        <button type="button" onClick={saveTemplate} className="h-7 shrink-0 rounded border border-[#2c3038] px-2 text-[11px]">Save</button>
      </div>
      {templates.map((template) => (
        <div key={template.id} className="flex min-w-0 items-center gap-2 text-[11px]">
          <button type="button" onClick={() => applyTemplate(template)} className="min-w-0 flex-1 truncate text-left">{template.name}</button>
          <button type="button" className="shrink-0 text-[#8e939c]" onClick={async () => {
            const res = await fetch(`/api/hooks/templates/${template.id}`, { method: "DELETE" });
            if (res.ok) setTemplates((current) => current.filter((item) => item.id !== template.id));
          }}>Delete</button>
        </div>
      ))}
    </div>
  );
}

function Row({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-[#c8ccd2]">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button type="button" className="shrink-0 text-[#8e939c]" onClick={onRemove}>Remove</button>
    </div>
  );
}

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}
