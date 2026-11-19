import type { WordStamp } from "@/lib/edit-timeline";

export type ContentKind = "talking" | "process" | "before-after" | "montage" | "product" | "gym" | "food" | "b-roll" | "other";

export type CaptionLook = "bold" | "karaoke" | "minimal";

export type Shot = {
  start: number;
  end: number;
  summary: string;
  quality: number;
  continuous: boolean;
};

export type ReadResult = {
  kind: ContentKind;
  summary: string;
  shots: Shot[];
  speech: boolean;
  words: WordStamp[];
  transcript: string;
  duration: number;
};

export type EditorSettings = {
  variants: number;
  captions: boolean;
  captionStyle: CaptionLook;
  mode: "auto" | "describe";
  prompt: string;
  keepOriginal: boolean;
  musicVolume: number;
  duck: boolean;
  fade: boolean;
  beatSync: boolean;
};

export type Segment = { start: number; end: number };

export type VariantPlan = {
  title: string;
  why: string;
  segments: Segment[];
  speed: number;
  silence: boolean;
  zoom: boolean;
  zoomScale: number;
  captions: boolean;
  captionStyle: CaptionLook;
  captionPosition: "top" | "middle" | "bottom";
  fontSize: number;
  keepOriginal: boolean;
  musicVolume: number;
  musicOffset: number;
  duck: boolean;
  fade: boolean;
};
