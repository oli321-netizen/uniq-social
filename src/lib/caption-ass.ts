import { mapWords, type Segment, type WordStamp } from "@/lib/edit-timeline";

export type CaptionStyle = {
  preset: "big" | "outline" | "highlight" | "karaoke" | "boxed";
  font: "DM Sans" | "Georgia" | "Impact";
  size: number;
  color: string;
  highlight: string;
  position: "top" | "middle" | "bottom";
};

export const DEFAULT_STYLE: CaptionStyle = {
  preset: "highlight",
  font: "DM Sans",
  size: 64,
  color: "#fffdfb",
  highlight: "#e07a3d",
  position: "bottom",
};

export function parseStyle(raw: unknown): CaptionStyle {
  const value = raw && typeof raw === "object" ? (raw as Partial<CaptionStyle>) : {};
  const presets = ["big", "outline", "highlight", "karaoke", "boxed"] as const;
  const fonts = ["DM Sans", "Georgia", "Impact"] as const;
  const positions = ["top", "middle", "bottom"] as const;
  const preset = presets.includes(value.preset as (typeof presets)[number]) ? (value.preset as CaptionStyle["preset"]) : DEFAULT_STYLE.preset;
  const font = fonts.includes(value.font as (typeof fonts)[number]) ? (value.font as CaptionStyle["font"]) : DEFAULT_STYLE.font;
  const position = positions.includes(value.position as (typeof positions)[number]) ? (value.position as CaptionStyle["position"]) : DEFAULT_STYLE.position;
  const size = Math.max(28, Math.min(110, Math.round(Number(value.size) || DEFAULT_STYLE.size)));
  return {
    preset,
    font,
    size,
    color: hex(value.color, DEFAULT_STYLE.color),
    highlight: hex(value.highlight, DEFAULT_STYLE.highlight),
    position,
  };
}

function hex(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
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

function fontName(font: CaptionStyle["font"]) {
  if (font === "Georgia") return "Liberation Serif";
  return "Liberation Sans";
}

function esc(text: string) {
  return text.replace(/[{}\\]/g, "").replace(/\r?\n/g, " ");
}

export function buildAss(words: WordStamp[], segments: Segment[], style: CaptionStyle) {
  const timed = mapWords(words, segments);
  const align = style.position === "top" ? 8 : style.position === "middle" ? 5 : 2;
  const bold = style.preset === "karaoke" || style.preset === "big" ? -1 : 0;
  const outline = style.preset === "outline" ? 5 : style.preset === "boxed" ? 0 : 2;
  const border = style.preset === "boxed" ? 3 : 1;
  const primary = assColour(style.color);
  const hi = assColour(style.highlight);
  const back = style.preset === "boxed" ? "&H64000000&" : "&H00000000&";
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${fontName(style.font)},${style.size},${primary},${hi},&H00000000&,${back},${bold},0,0,0,100,100,0,0,${border},${outline},0,${align},80,80,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines: string[] = [];
  if (style.preset === "karaoke") {
    for (const word of timed) {
      lines.push(`Dialogue: 0,${assTime(word.composedStart)},${assTime(word.composedEnd)},Cap,,0,0,0,,${esc(word.word)}`);
    }
  } else {
    const groups = groupWords(timed, style.preset === "big" ? 3 : 5);
    for (const group of groups) {
      for (const active of group) {
        const text = group
          .map((word) => {
            if (word === active && (style.preset === "highlight" || style.preset === "big")) {
              return `{\\c${hi}\\b1}${esc(word.word)}{\\c${primary}\\b${bold === -1 ? 1 : 0}}`;
            }
            return esc(word.word);
          })
          .join(" ");
        lines.push(`Dialogue: 0,${assTime(active.composedStart)},${assTime(active.composedEnd)},Cap,,0,0,0,,${text}`);
      }
    }
  }
  return `${header}${lines.join("\n")}\n`;
}

function groupWords<T extends { composedStart: number; composedEnd: number }>(words: T[], size: number) {
  const groups: T[][] = [];
  for (let i = 0; i < words.length; i += size) groups.push(words.slice(i, i + size));
  return groups;
}
