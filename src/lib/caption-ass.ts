import { CAPTION_FONTS, type CaptionFontId } from "@/lib/caption-fonts";
import { breakCueLines, buildCues, type CaptionCue } from "@/lib/caption-cues";
import type { Segment, WordStamp } from "@/lib/edit-timeline";

export type CaptionPreset =
  | "yellow"
  | "hormozi"
  | "karaoke"
  | "outline"
  | "boxed"
  | "minimal"
  | "purple"
  | "red"
  | "bebas"
  | "komika"
  | "clean";

export type CaptionAnimation = "none" | "pop" | "scale";

export type CaptionStyle = {
  preset: CaptionPreset;
  font: CaptionFontId;
  size: number;
  color: string;
  highlight: string;
  stroke: string;
  strokeWidth: number;
  shadow: number;
  position: "top" | "middle" | "bottom";
  animation: CaptionAnimation;
};

const PRESETS: CaptionStyle[] = [
  { preset: "yellow", font: "Montserrat", size: 78, color: "#FFFFFF", highlight: "#FFE14A", stroke: "#000000", strokeWidth: 4, shadow: 0, position: "bottom", animation: "pop" },
  { preset: "hormozi", font: "Anton", size: 96, color: "#FFFFFF", highlight: "#FFE14A", stroke: "#000000", strokeWidth: 8, shadow: 2, position: "middle", animation: "pop" },
  { preset: "karaoke", font: "Poppins", size: 74, color: "#FFFFFF", highlight: "#C084FC", stroke: "#1A0533", strokeWidth: 3, shadow: 0, position: "bottom", animation: "pop" },
  { preset: "outline", font: "Bebas Neue", size: 90, color: "#FFFFFF", highlight: "#FFFFFF", stroke: "#000000", strokeWidth: 6, shadow: 0, position: "bottom", animation: "none" },
  { preset: "boxed", font: "Inter", size: 64, color: "#FFFFFF", highlight: "#FFE14A", stroke: "#000000", strokeWidth: 0, shadow: 0, position: "bottom", animation: "none" },
  { preset: "minimal", font: "Inter", size: 48, color: "#F4F4F5", highlight: "#E9D5FF", stroke: "#000000", strokeWidth: 0, shadow: 0, position: "bottom", animation: "none" },
  { preset: "purple", font: "Montserrat", size: 76, color: "#FFFFFF", highlight: "#C084FC", stroke: "#2E1065", strokeWidth: 4, shadow: 0, position: "bottom", animation: "scale" },
  { preset: "red", font: "Anton", size: 90, color: "#FFFFFF", highlight: "#FF4D4D", stroke: "#000000", strokeWidth: 6, shadow: 0, position: "middle", animation: "pop" },
  { preset: "bebas", font: "Bebas Neue", size: 92, color: "#FFFFFF", highlight: "#FFE14A", stroke: "#000000", strokeWidth: 0, shadow: 4, position: "bottom", animation: "none" },
  { preset: "komika", font: "Lilita One", size: 82, color: "#FFFFFF", highlight: "#FFE14A", stroke: "#111111", strokeWidth: 7, shadow: 0, position: "bottom", animation: "pop" },
  { preset: "clean", font: "Poppins", size: 58, color: "#F8FAFC", highlight: "#A78BFA", stroke: "#0F172A", strokeWidth: 2, shadow: 1, position: "bottom", animation: "scale" },
];

export const PRESET_LIST = PRESETS.map((preset) => ({ id: preset.preset, label: labelFor(preset.preset), style: preset }));

export const DEFAULT_STYLE: CaptionStyle = { ...PRESETS[0] };

const LEGACY_PRESET: Record<string, CaptionPreset> = {
  big: "hormozi",
  highlight: "yellow",
  outline: "outline",
  karaoke: "karaoke",
  boxed: "boxed",
};

const LEGACY_FONT: Record<string, CaptionFontId> = {
  "DM Sans": "Montserrat",
  Georgia: "Poppins",
  Impact: "Anton",
};

export function applyPreset(id: string): CaptionStyle {
  const found = PRESETS.find((preset) => preset.preset === id);
  return { ...(found || DEFAULT_STYLE) };
}

export function parseStyle(raw: unknown): CaptionStyle {
  const value = raw && typeof raw === "object" ? (raw as Partial<CaptionStyle> & { preset?: string; font?: string }) : {};
  const presetId = LEGACY_PRESET[String(value.preset || "")] || String(value.preset || "");
  const base = applyPreset(presetId);
  const fontId = LEGACY_FONT[String(value.font || "")] || String(value.font || "");
  const font = CAPTION_FONTS.some((item) => item.id === fontId) ? (fontId as CaptionFontId) : base.font;
  const positions = ["top", "middle", "bottom"] as const;
  const animations = ["none", "pop", "scale"] as const;
  const position = positions.includes(value.position as (typeof positions)[number]) ? (value.position as CaptionStyle["position"]) : base.position;
  const animation = animations.includes(value.animation as (typeof animations)[number]) ? (value.animation as CaptionAnimation) : base.animation;
  return {
    preset: base.preset,
    font,
    size: clampNum(value.size, 28, 140, base.size),
    color: hex(value.color, base.color),
    highlight: hex(value.highlight, base.highlight),
    stroke: hex(value.stroke, base.stroke),
    strokeWidth: clampNum(value.strokeWidth, 0, 14, base.strokeWidth),
    shadow: clampNum(value.shadow, 0, 12, base.shadow),
    position,
    animation,
  };
}

export function buildAss(cues: CaptionCue[], style: CaptionStyle, canvas?: { width: number; height: number }) {
  const align = style.position === "top" ? 8 : style.position === "middle" ? 5 : 2;
  const boxed = style.preset === "boxed";
  const border = boxed ? 3 : 1;
  const outline = boxed ? 18 : style.strokeWidth;
  const shadow = boxed ? 0 : style.shadow;
  const primary = assColour(style.color);
  const hi = assColour(style.highlight);
  const stroke = assColour(style.stroke);
  const back = boxed ? "&H00000000&" : "&H00000000&";
  const width = canvas?.width || 1080;
  const height = canvas?.height || 1920;
  const scale = height / 1920;
  const marginV = Math.round((style.position === "middle" ? 0 : style.position === "top" ? 220 : 280) * scale);
  const fontSize = Math.max(8, Math.round(style.size * scale));
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${style.font},${fontSize},${primary},${hi},${stroke},${back},-1,0,0,0,100,100,0,0,${border},${Math.max(0, Math.round(outline * scale))},${Math.round(shadow * scale)},${align},${Math.round(70 * scale)},${Math.round(70 * scale)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines: string[] = [];
  for (const cue of cues) {
    if (style.preset === "karaoke") {
      for (const word of cue.words) {
        const pop = animPrefix(style);
        lines.push(`Dialogue: 0,${assTime(word.start)},${assTime(word.end)},Cap,,0,0,0,,${pop}${esc(word.text)}`);
      }
      continue;
    }
    for (let index = 0; index < cue.words.length; index++) {
      const active = cue.words[index];
      const next = cue.words[index + 1];
      const end = next ? next.start : Math.max(active.end, cue.end);
      lines.push(`Dialogue: 0,${assTime(active.start)},${assTime(end)},Cap,,0,0,0,,${animPrefix(style)}${lineText(cue, index, style, hi)}`);
    }
  }
  return `${header}${lines.join("\n")}\n`;
}

export function cuesForExport(words: WordStamp[], segments: Segment[], cues: CaptionCue[]) {
  return cues.length ? cues : buildCues(words, segments);
}

function lineText(cue: CaptionCue, activeIndex: number, style: CaptionStyle, hi: string) {
  const primary = assColour(style.color);
  const body = `{\\c${primary}\\fs${style.size}\\b1}`;
  const lines = breakCueLines(cue.words);
  return lines
    .map((line) =>
      line
        .map((word) => {
          const index = cue.words.indexOf(word);
          if (index === activeIndex) return `{\\c${hi}\\fs${style.size}\\b1}${esc(word.text)}${body}`;
          if (word.emphasis) return `{\\c${hi}\\fs${Math.round(style.size * 1.12)}\\b1}${esc(word.text)}${body}`;
          return esc(word.text);
        })
        .join(" ")
    )
    .join("\\N");
}

function animPrefix(style: CaptionStyle) {
  if (style.animation === "pop") return "{\\fscx82\\fscy82\\t(0,140,\\fscx100\\fscy100)}";
  if (style.animation === "scale") return "{\\fscx92\\fscy92\\t(0,160,\\fscx104\\fscy104)}";
  return "";
}

function labelFor(preset: CaptionPreset) {
  const labels: Record<CaptionPreset, string> = {
    yellow: "Bold yellow",
    hormozi: "Hormozi",
    karaoke: "Karaoke pop",
    outline: "Outlined",
    boxed: "Boxed",
    minimal: "Minimal",
    purple: "Purple punch",
    red: "Red punch",
    bebas: "Bebas stack",
    komika: "Komika",
    clean: "Clean lower",
  };
  return labels[preset];
}

function assColour(value: string) {
  const r = value.slice(1, 3);
  const g = value.slice(3, 5);
  const b = value.slice(5, 7);
  return `&H00${b}${g}${r}&`.toUpperCase();
}

function assTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remain = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${remain.toFixed(2).padStart(5, "0")}`;
}

function esc(text: string) {
  return text.replace(/[{}\\]/g, "").replace(/\r?\n/g, " ");
}

function hex(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : fallback;
}

function clampNum(value: unknown, min: number, max: number, fallback: number) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
