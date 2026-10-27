import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { buildAss, type CaptionStyle } from "@/lib/caption-ass";
import { type Segment, type WordStamp } from "@/lib/edit-timeline";
import { hasAudio } from "@/lib/transcribe";

const execFileAsync = promisify(execFile);

export async function exportEdit(input: {
  videoPath: string;
  words: WordStamp[];
  segments: Segment[];
  style: CaptionStyle;
}) {
  if (input.segments.length === 0) throw new Error("Nothing to export. Keep at least one segment.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "hook-export-"));
  const ass = path.join(dir, "captions.ass");
  const output = path.join(dir, "export.mp4");
  try {
    await writeFile(ass, buildAss(input.words, input.segments, input.style));
    const audio = await hasAudio(input.videoPath);
    const filter = filterGraph(input.segments, audio, ass);
    const args = ["-y", "-i", input.videoPath, "-filter_complex", filter, "-map", "[vout]"];
    if (audio) args.push("-map", "[aout]", "-c:a", "aac");
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
    await execFileAsync("ffmpeg", args, { timeout: 180000, maxBuffer: 30 * 1024 * 1024 });
    return await readFile(output);
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: string }).stderr || "") : "";
    const message = stderr.trim().split("\n").slice(-4).join(" ") || (error instanceof Error ? error.message : "Export failed");
    throw new Error(message.slice(0, 500));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function filterGraph(segments: Segment[], audio: boolean, assPath: string) {
  const parts: string[] = [];
  const labels: string[] = [];
  segments.forEach((seg, index) => {
    const start = seg.start.toFixed(3);
    const end = seg.end.toFixed(3);
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v${index}]`);
    if (audio) parts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
    labels.push(audio ? `[v${index}][a${index}]` : `[v${index}]`);
  });
  if (audio) parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=1[vc][aout]`);
  else parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=0[vc]`);
  parts.push(`[vc]subtitles=${escapeFilter(assPath)}:fontsdir=/usr/share/fonts[vout]`);
  return parts.join(";");
}

function escapeFilter(filePath: string) {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
