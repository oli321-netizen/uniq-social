import { parseStyle, type CaptionStyle } from "@/lib/caption-ass";
import { parseCues, type CaptionCue } from "@/lib/caption-cues";
import { clampSegments, parseWords, type Segment, type WordStamp } from "@/lib/edit-timeline";

export type ProjectRecord = {
  id: string;
  creatorId: string | null;
  fileName: string;
  durationSec: number;
  transcript: string;
  wordsJson: string;
  segmentsJson: string;
  styleJson: string;
};

export function readProject(project: ProjectRecord) {
  let words: WordStamp[] = [];
  let segments: Segment[] = [];
  let style: CaptionStyle = parseStyle(null);
  let cues: CaptionCue[] = [];
  try {
    words = parseWords(JSON.parse(project.wordsJson));
  } catch {
    words = [];
  }
  try {
    const parsed = JSON.parse(project.segmentsJson);
    segments = clampSegments(Array.isArray(parsed) ? parsed : [], project.durationSec);
  } catch {
    segments = clampSegments([], project.durationSec);
  }
  try {
    const parsed = JSON.parse(project.styleJson) as { cues?: unknown };
    style = parseStyle(parsed);
    cues = parseCues(parsed?.cues);
  } catch {
    style = parseStyle(null);
    cues = [];
  }
  return {
    id: project.id,
    creatorId: project.creatorId,
    fileName: project.fileName,
    durationSec: project.durationSec,
    transcript: project.transcript,
    words,
    segments,
    style,
    cues,
  };
}
