import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { CREDITS_PER_VIDEO } from "@/lib/ai-editor/cost";
import { applyBeat, buildVariants, plainKind, settingsFrom } from "@/lib/ai-editor/plan";
import { readClip } from "@/lib/ai-editor/read";
import { renderVariant } from "@/lib/ai-editor/render";
import { detectBeats, downloadAudio } from "@/lib/ai-editor/music";
import type { EditorSettings, ReadResult, VariantPlan } from "@/lib/ai-editor/types";
import { mediaDuration } from "@/lib/transcribe";
import { refundCredits, spendCredits, type CreditSource } from "@/lib/users";

export type VariantStatus = "queued" | "reading" | "rendering" | "done" | "failed";

type StoredVariant = {
  index: number;
  status: VariantStatus;
  title: string;
  why: string;
  error: string;
  plan: VariantPlan | null;
};

export type AiJob = {
  id: string;
  userId: string;
  fileName: string;
  dir: string;
  inputPath: string;
  musicPath: string;
  status: VariantStatus;
  error: string;
  summary: string;
  settings: EditorSettings;
  read: ReadResult | null;
  variants: StoredVariant[];
  creditSource: CreditSource;
  createdAt: number;
};

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_SECONDS = 600;
const store = ((globalThis as { uniqAiEditorJobs?: Map<string, AiJob> }).uniqAiEditorJobs ||= new Map<string, AiJob>());

export function getJob(id: string, userId: string) {
  const job = store.get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}

export function variantFile(job: AiJob, index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 9) return "";
  const output = path.join(job.dir, `v${index}.mp4`);
  if (!output.startsWith(job.dir + path.sep)) return "";
  return output;
}

export async function createJob(userId: string, video: Blob, fileName: string, rawSettings: Partial<EditorSettings>, music?: { file?: Blob; url?: string }) {
  if (video.size > MAX_BYTES) throw new Error("Max video size is 200MB.");
  const settings = settingsFrom(rawSettings);
  const id = randomUUID();
  const dir = path.join(os.tmpdir(), "uniq-social-ai", id);
  await mkdir(dir, { recursive: true });
  const inputPath = path.join(dir, "source.mp4");
  const musicPath = path.join(dir, "music.mp3");
  try {
    await pipeline(Readable.fromWeb(video.stream() as import("stream/web").ReadableStream<Uint8Array>), createWriteStream(inputPath));
    const info = await stat(inputPath);
    if (info.size > MAX_BYTES) throw new Error("Max video size is 200MB.");
    const duration = await mediaDuration(inputPath);
    if (duration > MAX_SECONDS) throw new Error("Max video length is 10 minutes.");
    if (duration < 0.8) throw new Error("That video is too short.");
    let hasMusic = false;
    if (music?.file && music.file.size > 0) {
      if (music.file.size > 20 * 1024 * 1024) throw new Error("Music files can be up to 20MB.");
      await pipeline(Readable.fromWeb(music.file.stream() as import("stream/web").ReadableStream<Uint8Array>), createWriteStream(musicPath));
      hasMusic = true;
    } else if (music?.url) {
      await downloadAudio(music.url, musicPath);
      hasMusic = true;
    }
    const cost = settings.variants * CREDITS_PER_VIDEO;
    const source = await spendCredits(userId, cost);
    if (!source) throw new Error(`Not enough credits. This needs ${cost}.`);
    const job: AiJob = {
      id,
      userId,
      fileName: fileName.slice(0, 120) || "video.mp4",
      dir,
      inputPath,
      musicPath: hasMusic ? musicPath : "",
      status: "reading",
      error: "",
      summary: "",
      settings,
      read: null,
      variants: Array.from({ length: settings.variants }, (_, index) => ({
        index,
        status: "queued",
        title: `Edit ${index + 1}`,
        why: "",
        error: "",
        plan: null,
      })),
      creditSource: source,
      createdAt: Date.now(),
    };
    store.set(id, job);
    void runJob(job, duration);
    return publicJob(job);
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function regenerateVariant(job: AiJob, index: number) {
  const variant = job.variants.find((item) => item.index === index);
  if (!variant) throw new Error("That edit was not found.");
  if (variant.status === "rendering" || variant.status === "reading" || job.status === "reading") throw new Error("This video is still working.");
  const source = await spendCredits(job.userId, CREDITS_PER_VIDEO);
  if (!source) throw new Error(`Not enough credits. This needs ${CREDITS_PER_VIDEO}.`);
  variant.status = "rendering";
  variant.error = "";
  job.status = "rendering";
  void rerender(job, variant, source, job.variants.length + index + 3);
  return publicJob(job);
}

async function runJob(job: AiJob, duration: number) {
  try {
    job.status = "reading";
    const read = await readClip(job.inputPath, duration, job.dir);
    job.read = read;
    job.summary = read.summary || plainKind(read.kind);
    const beats = job.musicPath && job.settings.beatSync ? await detectBeats(job.musicPath).catch(() => []) : [];
    const plans = applyBeat(buildVariants(read, job.settings), beats, read.kind);
    plans.forEach((plan, index) => {
      const variant = job.variants[index];
      if (!variant) return;
      variant.plan = plan;
      variant.title = plan.title;
      variant.why = plan.why;
    });
    job.status = "rendering";
    for (const variant of job.variants) {
      variant.status = "rendering";
      await renderOne(job, variant, job.creditSource);
    }
    finish(job);
  } catch (error) {
    job.status = "failed";
    job.error = publicError(error);
    for (const variant of job.variants) {
      if (variant.status === "done") continue;
      if (variant.status !== "failed") {
        variant.status = "failed";
        variant.error = job.error;
        await refundCredits(job.userId, CREDITS_PER_VIDEO, job.creditSource).catch(() => {});
      }
    }
  }
}

async function rerender(job: AiJob, variant: StoredVariant, source: CreditSource, salt: number) {
  try {
    if (!job.read) throw new Error("Could not read that video.");
    const [plan] = buildVariants(job.read, { ...job.settings, variants: 1 }, salt);
    variant.plan = plan;
    variant.title = plan.title;
    variant.why = plan.why;
    await renderOne(job, variant, source);
    finish(job);
  } catch (error) {
    variant.status = "failed";
    variant.error = publicError(error);
    await refundCredits(job.userId, CREDITS_PER_VIDEO, source).catch(() => {});
    finish(job);
  }
}

async function renderOne(job: AiJob, variant: StoredVariant, source: CreditSource) {
  const output = variantFile(job, variant.index);
  try {
    if (!variant.plan || !output) throw new Error("Could not build that edit.");
    await renderVariant({
      videoPath: job.inputPath,
      musicPath: job.musicPath || undefined,
      outputPath: output,
      words: job.read?.words || [],
      plan: variant.plan,
      duration: job.read?.duration || 0,
    });
    variant.status = "done";
    variant.error = "";
  } catch (error) {
    variant.status = "failed";
    variant.error = publicError(error);
    if (output) await rm(output, { force: true }).catch(() => {});
    await refundCredits(job.userId, CREDITS_PER_VIDEO, source).catch(() => {});
  }
}

function finish(job: AiJob) {
  const done = job.variants.some((variant) => variant.status === "done");
  const pending = job.variants.some((variant) => variant.status === "queued" || variant.status === "rendering" || variant.status === "reading");
  if (pending) return;
  job.status = done ? "done" : "failed";
  if (!done) job.error = job.variants.find((variant) => variant.error)?.error || "Could not edit that video.";
}

export function publicJob(job: AiJob) {
  return {
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    error: job.error,
    summary: job.summary,
    variants: job.variants.map((variant) => ({
      index: variant.index,
      status: variant.status,
      title: variant.title,
      why: variant.why,
      error: variant.error,
      download: variant.status === "done" ? `/api/ai-editor/jobs/${job.id}/file?variant=${variant.index}` : "",
    })),
  };
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (/openai|api[_ ]?key|whisper|jamendo/i.test(message)) return "Couldn't read that clip.";
  if (/ffmpeg|invalid argument|error opening|no such file|timed out|\/tmp\//i.test(message)) return "Could not finish that edit.";
  return message.replace(/\s+/g, " ").trim().slice(0, 180);
}
