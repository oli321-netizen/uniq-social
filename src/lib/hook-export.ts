import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { buildAss, cuesForExport, type CaptionStyle } from "@/lib/caption-ass";
import { composedDuration, clampSpeed, type Segment, type WordStamp } from "@/lib/edit-timeline";
import { parseCues, type CaptionCue } from "@/lib/caption-cues";
import { hasAudio } from "@/lib/transcribe";

export async function exportEdit(input: {
  videoPath: string;
  words: WordStamp[];
  segments: Segment[];
  style: CaptionStyle;
  cues?: CaptionCue[];
  onProgress?: (ratio: number) => void;
}) {
  if (input.segments.length === 0) throw new Error("Nothing to export. Keep at least one segment.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "hook-export-"));
  const ass = path.join(dir, "captions.ass");
  const output = path.join(dir, "export.mp4");
  try {
    const cues = cuesForExport(input.words, input.segments, parseCues(input.cues));
    await writeFile(ass, buildAss(cues, input.style));
    const audio = await hasAudio(input.videoPath);
    const duration = Math.max(0.2, composedDuration(input.segments));
    const fontsDir = path.join(process.cwd(), "public", "fonts");
    const args = [
      "-i",
      input.videoPath,
      "-filter_complex",
      filterGraph(input.segments, audio, ass, fontsDir),
      "-map",
      "[vout]",
    ];
    if (audio) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "160k");
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "30", output);
    input.onProgress?.(0.02);
    await runFfmpeg(args, {
      timeout: 180000,
      duration,
      onProgress: (ratio) => input.onProgress?.(0.02 + ratio * 0.96),
    });
    input.onProgress?.(1);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function filterGraph(segments: Segment[], audio: boolean, assPath: string, fontsDir: string) {
  const parts: string[] = [];
  const labels: string[] = [];
  segments.forEach((seg, index) => {
    const start = seg.start.toFixed(3);
    const end = seg.end.toFixed(3);
    const speed = clampSpeed(seg.speed).toFixed(3);
    parts.push(
      `[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[v${index}]`
    );
    if (audio) {
      parts.push(
        `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,atempo=${speed},aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`
      );
    }
    labels.push(audio ? `[v${index}][a${index}]` : `[v${index}]`);
  });
  if (audio) parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=1[vc][aout]`);
  else parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=0[vc]`);
  parts.push(`[vc]subtitles=${escapeFilter(assPath)}:fontsdir=${escapeFilter(fontsDir)}[vout]`);
  return parts.join(";");
}

function runFfmpeg(args: string[], opts: { timeout: number; duration: number; onProgress?: (ratio: number) => void }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args, "-progress", "pipe:1", "-nostats"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const match = /out_time_ms=(\d+)/.exec(line);
        if (!match || opts.duration <= 0) continue;
        const raw = Number(match[1]);
        const seconds = raw > opts.duration * 1000 ? raw / 1e6 : raw / 1000;
        opts.onProgress?.(Math.max(0, Math.min(0.99, seconds / opts.duration)));
      }
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Export timed out."));
    }, opts.timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error((stderr.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${code}`).slice(0, 500)));
    });
  });
}

function escapeFilter(filePath: string) {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
