import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import type { WordStamp } from "@/lib/edit-timeline";
import { mediaDuration, transcribeFile } from "@/lib/transcribe";
import { clampPlan, clipsFromSpeech, planFromPrompt, planLines, type AiClip, type AiPlan, type CaptionLook, type CaptionPlace, type ManualToggles } from "@/lib/ai-editor/plan";
import { renderAiVideo } from "@/lib/ai-editor/render";
import { deductCredits } from "@/lib/users";
import { prisma } from "@/lib/prisma";

export type JobStatus = "queued" | "transcribing" | "planned" | "rendering" | "done" | "failed";
export type EditorMode = "prompt" | "full";
export type ClipStatus = "proposed" | "rendering" | "done" | "failed" | "skipped";

type CaptionSettings = {
  captions: boolean;
  captionStyle: CaptionLook;
  captionPosition: CaptionPlace;
  fontSize: number;
  language: string;
};

export type RenderBody = {
  plan?: unknown;
  clips?: { id?: string; enabled?: boolean }[];
  captions?: boolean;
  captionStyle?: string;
  captionPosition?: string;
  fontSize?: number;
  language?: string;
};

type StoredClip = AiClip & { status: ClipStatus; error: string };

export type AiJob = {
  id: string;
  userId: string;
  fileName: string;
  mode: EditorMode;
  dir: string;
  inputPath: string;
  outputPath: string;
  status: JobStatus;
  error: string;
  notice: string;
  lines: string[];
  plan: AiPlan | null;
  clips: StoredClip[];
  captions: CaptionSettings;
  words: WordStamp[];
  transcript: string;
  duration: number;
  createdAt: number;
};

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_SECONDS = 600;
const store = ((globalThis as { uniqAiJobs?: Map<string, AiJob> }).uniqAiJobs ||= new Map<string, AiJob>());

export function listJobs(userId: string) {
  return Array.from(store.values()).filter((job) => job.userId === userId);
}

export function getJob(id: string, userId: string) {
  const job = store.get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}

export function clipOutput(job: AiJob, clipId: string) {
  if (!/^c[1-5]$/.test(clipId)) return "";
  const output = path.join(job.dir, `${clipId}.mp4`);
  if (!output.startsWith(job.dir + path.sep)) return "";
  return output;
}

export async function createJob(userId: string, file: Blob, fileName: string, toggles: ManualToggles, prompt: string, mode: EditorMode) {
  if (file.size > MAX_BYTES) throw new Error("Max video size is 200MB.");
  const id = randomUUID();
  const dir = path.join(os.tmpdir(), "uniq-social-ai", id);
  await mkdir(dir, { recursive: true });
  const inputPath = path.join(dir, "source.mp4");
  const outputPath = path.join(dir, "render.mp4");
  await pipeline(Readable.fromWeb(file.stream() as import("stream/web").ReadableStream<Uint8Array>), createWriteStream(inputPath));
  const info = await stat(inputPath);
  if (info.size > MAX_BYTES) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Max video size is 200MB.");
  }
  const duration = await mediaDuration(inputPath);
  if (duration > MAX_SECONDS) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Max video length is 10 minutes.");
  }
  const job: AiJob = {
    id,
    userId,
    fileName: fileName.slice(0, 120) || "video.mp4",
    mode,
    dir,
    inputPath,
    outputPath,
    status: "queued",
    error: "",
    notice: "",
    lines: [],
    plan: null,
    clips: [],
    captions: captionSettings(toggles),
    words: [],
    transcript: "",
    duration,
    createdAt: Date.now(),
  };
  store.set(id, job);
  void prepare(job, toggles, prompt);
  return publicJob(job);
}

export async function replan(job: AiJob, toggles: ManualToggles, prompt: string) {
  job.status = "transcribing";
  job.error = "";
  job.captions = captionSettings(toggles);
  void prepare(job, toggles, prompt, true);
  return publicJob(job);
}

export async function startRender(job: AiJob, rawPlan: unknown, body: RenderBody = {}) {
  if (job.mode === "full") return startFullRender(job, body);
  if (!job.plan && !rawPlan) throw new Error("Build a plan before rendering.");
  if (!(await canAfford(job.userId, 1))) throw new Error("Not enough credits.");
  const plan = rawPlan ? clampPlan(rawPlan, job.duration, job.words) : job.plan;
  if (!plan) throw new Error("Build a plan before rendering.");
  job.plan = plan;
  job.lines = planLines(plan);
  job.status = "rendering";
  job.error = "";
  void render(job, plan);
  return publicJob(job);
}

async function prepare(job: AiJob, toggles: ManualToggles, prompt: string, keepWords = false) {
  try {
    job.status = "transcribing";
    const needsSpeech = job.mode === "full" || toggles.captions || toggles.zoom || Boolean(prompt.trim());
    if (needsSpeech && (!keepWords || job.words.length === 0)) {
      const spoken = await transcribeFile(job.inputPath, job.duration, undefined, toggles.language);
      job.words = spoken.words;
      job.transcript = spoken.text;
      if (spoken.stub) job.notice = "Local stub transcript, not Whisper.";
    }
    if (job.mode === "full") {
      const planned = await clipsFromSpeech(job.transcript, job.duration, job.words);
      job.clips = planned.clips.map((clip) => ({ ...clip, status: "proposed", error: "" }));
      job.lines = [`${job.clips.length} clip${job.clips.length === 1 ? "" : "s"} from the transcript.`];
      job.plan = null;
      if (planned.notice) job.notice = planned.notice;
      job.status = "planned";
      return;
    }
    const planned = await planFromPrompt(prompt, job.transcript, toggles, job.duration, job.words);
    job.plan = planned.plan;
    job.lines = planLines(planned.plan);
    job.clips = [];
    if (planned.notice) job.notice = planned.notice;
    job.status = "planned";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Could not prepare that video.";
  }
}

async function render(job: AiJob, plan: AiPlan) {
  try {
    const charged = await deductCredits(job.userId, 1);
    if (!charged) throw new Error("Not enough credits.");
    await renderAiVideo({ videoPath: job.inputPath, outputPath: job.outputPath, words: job.words, plan, duration: job.duration });
    job.status = "done";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Render failed.";
    await rm(job.outputPath, { force: true }).catch(() => {});
  }
}

async function startFullRender(job: AiJob, body: RenderBody) {
  if (!job.clips.length) throw new Error("Find clips before rendering.");
  if (Array.isArray(body.clips)) {
    for (const clip of job.clips) {
      const match = body.clips.find((item) => item && item.id === clip.id);
      if (match) clip.enabled = Boolean(match.enabled);
    }
  }
  job.captions = captionSettings({
    captions: body.captions ?? job.captions.captions,
    captionStyle: body.captionStyle || job.captions.captionStyle,
    captionPosition: body.captionPosition || job.captions.captionPosition,
    fontSize: body.fontSize ?? job.captions.fontSize,
    language: body.language || job.captions.language,
  });
  const selected = job.clips.filter((clip) => clip.enabled);
  if (!selected.length) throw new Error("Select at least one clip.");
  if (!(await canAfford(job.userId, selected.length))) throw new Error("Not enough credits.");
  job.status = "rendering";
  job.error = "";
  void renderClips(job);
  return publicJob(job);
}

async function renderClips(job: AiJob) {
  let finished = 0;
  for (const clip of job.clips) {
    if (!clip.enabled) {
      clip.status = "skipped";
      clip.error = "";
      continue;
    }
    clip.status = "rendering";
    clip.error = "";
    const output = clipOutput(job, clip.id);
    try {
      const charged = await deductCredits(job.userId, 1);
      if (!charged) throw new Error("Not enough credits.");
      await renderAiVideo({
        videoPath: job.inputPath,
        outputPath: output,
        words: job.words,
        plan: planForClip(clip, job),
        duration: job.duration,
        window: { start: clip.start, end: clip.end },
      });
      clip.status = "done";
      finished += 1;
    } catch (error) {
      clip.status = "failed";
      clip.error = error instanceof Error ? error.message : "Render failed.";
      if (output) await rm(output, { force: true }).catch(() => {});
    }
  }
  if (finished > 0) {
    job.status = "done";
    job.error = "";
  } else {
    job.status = "failed";
    job.error = job.clips.find((clip) => clip.error)?.error || "Render failed.";
  }
}

function planForClip(clip: AiClip, job: AiJob): AiPlan {
  const localWords = job.words.filter((word) => {
    const point = (word.start + word.end) / 2;
    return point >= clip.start && point < clip.end;
  });
  const plan = clampPlan(
    {
      captions: job.captions.captions,
      captionStyle: job.captions.captionStyle,
      captionPosition: job.captions.captionPosition,
      fontSize: job.captions.fontSize,
      language: job.captions.language,
      silence: true,
      silenceDb: -32,
      silenceMin: 0.55,
      tighten: true,
      speed: clip.speed,
      zoom: true,
      zoomScale: clip.zoomScale,
      zoomMoments: clip.zoomMoments,
      aspect: "9:16",
      trimStart: 0,
      trimEnd: 0,
    },
    job.duration,
    localWords
  );
  plan.aspect = "9:16";
  plan.silence = true;
  plan.tighten = true;
  plan.speed = clip.speed;
  plan.zoom = true;
  plan.zoomMoments = plan.zoomMoments
    .map((moment) => ({ start: Math.max(clip.start, moment.start), end: Math.min(clip.end, moment.end) }))
    .filter((moment) => moment.end - moment.start >= 0.3);
  return plan;
}

function captionSettings(toggles: { captions?: boolean; captionStyle?: string; captionPosition?: string; fontSize?: number; language?: string }): CaptionSettings {
  const style = toggles.captionStyle === "karaoke" || toggles.captionStyle === "minimal" ? toggles.captionStyle : "bold";
  const position = toggles.captionPosition === "top" || toggles.captionPosition === "middle" ? toggles.captionPosition : "bottom";
  const language = /^[a-z]{2}$/i.test(String(toggles.language || "")) ? String(toggles.language).toLowerCase() : "auto";
  const fontSize = Number(toggles.fontSize);
  return {
    captions: Boolean(toggles.captions),
    captionStyle: style,
    captionPosition: position,
    fontSize: Number.isFinite(fontSize) ? Math.min(96, Math.max(32, fontSize)) : 64,
    language,
  };
}

async function canAfford(userId: string, amount: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.credits >= amount) return true;
  if (!user.teamId) return false;
  const team = await prisma.team.findUnique({ where: { id: user.teamId } });
  return Boolean(team && team.credits >= amount);
}

export function publicJob(job: AiJob) {
  return {
    id: job.id,
    fileName: job.fileName,
    mode: job.mode,
    status: job.status,
    error: job.error,
    notice: job.notice,
    lines: job.lines,
    plan: job.plan,
    clips: (job.clips || []).map((clip) => ({
      id: clip.id,
      title: clip.title,
      hook: clip.hook,
      reason: clip.reason,
      start: clip.start,
      end: clip.end,
      enabled: clip.enabled,
      speed: clip.speed,
      status: clip.status,
      error: clip.error,
      download: clip.status === "done" ? `/api/ai-editor/jobs/${job.id}/file?clip=${clip.id}` : "",
    })),
    transcript: job.transcript.slice(0, 500),
    duration: job.duration,
    download: job.mode === "prompt" && job.status === "done" ? `/api/ai-editor/jobs/${job.id}/file` : "",
  };
}
