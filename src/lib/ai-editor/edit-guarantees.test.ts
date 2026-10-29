import { spawn } from "child_process";
import { mkdir, rm } from "fs/promises";
import { buildVariants, settingsFrom } from "@/lib/ai-editor/plan";
import { renderVariant } from "@/lib/ai-editor/render";
import type { ReadResult, Shot, VariantPlan } from "@/lib/ai-editor/types";
import { checkOutput, planSegments, verifyPlans } from "@/lib/ai-editor/verify";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function shot(start: number, end: number, quality = 0.6): Shot {
  return { start, end, summary: `${start}-${end}`, quality, continuous: true };
}

function clip(duration: number, kind: ReadResult["kind"], shots: Shot[]): ReadResult {
  return { kind, summary: kind, shots, speech: kind === "talking", words: [], transcript: "", duration };
}

function span(plan: Pick<VariantPlan, "segments">) {
  return plan.segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
}

function sign(plan: Pick<VariantPlan, "segments">) {
  return plan.segments.map((segment) => `${segment.start.toFixed(1)}-${segment.end.toFixed(1)}`).join("|");
}

function wholePlan(duration: number): VariantPlan {
  return {
    title: "whole",
    why: "whole",
    segments: [{ start: 0, end: duration }],
    speed: 1,
    silence: false,
    zoom: false,
    zoomScale: 1.12,
    captions: false,
    captionStyle: "bold",
    captionPosition: "bottom",
    fontSize: 64,
    keepOriginal: true,
    musicVolume: 0.3,
    musicOffset: 0,
    duck: false,
    fade: false,
  };
}

function plansFor(read: ReadResult, count: number) {
  const drafted = buildVariants(read, settingsFrom({ variants: count, captions: false, keepOriginal: true }));
  return verifyPlans(drafted, read);
}

function expectRealEdits(read: ReadResult, count: number) {
  const verified = plansFor(read, count);
  const signs: string[] = [];
  verified.plans.forEach((plan, index) => {
    const check = verified.checks[index];
    const covered = span(plan);
    assert(check.ok, `${read.kind} ${index} not ok: ${check.issues.join("; ")} :: ${sign(plan)}`);
    assert(covered <= read.duration * 0.85 + 0.2, `${read.kind} ${index} covered ${covered} of ${read.duration}`);
    assert(covered < read.duration - 0.3, `${read.kind} ${index} is the whole clip`);
    assert(covered >= 7, `${read.kind} ${index} shorter than a reel (${covered})`);
    const signature = sign(plan);
    assert(!signs.includes(signature), `${read.kind} duplicate ${signature}`);
    signs.push(signature);
  });
  return verified;
}

async function partialBlack() {
  const file = "/tmp/phone-proof/partial-black.mp4";
  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2",
    "-f", "lavfi", "-i", "color=c=black:size=320x240:rate=30:duration=0.5",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p",
    "-an", file,
  ]);
  const check = await checkOutput(file, { audio: false, sourceDuration: 4.5, motion: true });
  assert(!check.ok, "partial black span was accepted");
  assert(check.issues.some((issue) => /black/i.test(issue)), `expected a black issue, got ${check.issues.join("; ")}`);
  assert(check.black.length > 0, "blackdetect returned no span");
  assert(check.black.some((item) => item.duration >= 0.12 && item.duration < 3), `span was not partial: ${JSON.stringify(check.black)}`);
}

async function renderPhone(file: string, duration: number, audio: boolean, count: number) {
  const read = clip(duration, "process", [shot(0, duration, 0.8)]);
  const verified = expectRealEdits(read, count);
  const outputs: string[] = [];
  for (let index = 0; index < verified.plans.length; index += 1) {
    const output = `/tmp/phone-proof/out-${file.split("/").pop()}-v${index}.mp4`;
    const rendered = await renderVariant({
      videoPath: file,
      outputPath: output,
      words: [],
      plan: { ...verified.plans[index], keepOriginal: audio },
      duration,
    });
    assert(rendered.ffmpeg.includes("-filter_complex"), "ffmpeg command was not recorded");
    assert(/setpts=PTS-STARTPTS,fps=30/.test(rendered.ffmpeg.join(" ")), "trim did not reset timestamps before fps");
    const check = await checkOutput(output, { audio, sourceDuration: duration, motion: true });
    if (!check.ok) {
      throw new Error(`${output} ${check.issues.join("; ")} black=${JSON.stringify(check.black)} freeze=${JSON.stringify(check.freeze)} dur=${check.duration}`);
    }
    assert(check.duration < duration * 0.9, `${output} duration ${check.duration} is too close to ${duration}`);
    assert(check.duration <= 30.4, `${output} longer than a reel (${check.duration})`);
    outputs.push(output);
  }
  return outputs;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").slice(-4).join(" ").slice(0, 400)));
    });
  });
}

async function main() {
  await mkdir("/tmp/phone-proof/frames", { recursive: true });
  const take = clip(24, "process", [shot(0, 24, 0.7)]);
  const repaired = verifyPlans([wholePlan(24), wholePlan(24), wholePlan(24)], take);
  repaired.checks.forEach((check, index) => {
    assert(check.ok, `repaired whole plan ${index}: ${check.issues.join("; ")}`);
    assert(span(repaired.plans[index]) <= 20.6, `repaired plan ${index} still too long`);
  });
  const repairedSigns = repaired.plans.map(sign);
  assert(new Set(repairedSigns).size === repairedSigns.length, `repaired variants match ${repairedSigns.join(" / ")}`);
  assert(repaired.plans[0].segments[repaired.plans[0].segments.length - 1].end >= 23.5, "first cut does not keep the ending");

  expectRealEdits(take, 10);
  expectRealEdits(clip(24, "process", [shot(0, 8, 0.5), shot(8, 16, 0.4), shot(16, 24, 0.9)]), 3).plans.forEach((plan) => {
    const last = plan.segments[plan.segments.length - 1];
    assert(last.end >= 23.5, `process variant dropped the reveal ${sign(plan)}`);
  });
  expectRealEdits(clip(24, "montage", [0, 4, 8, 12, 16, 20].map((start) => shot(start, start + 4, 0.6))), 3);
  expectRealEdits(clip(40, "process", [shot(0, 40, 0.6)]), 2).plans.forEach((plan) => {
    assert(span(plan) <= 30.2, `40s edit is ${span(plan)}`);
  });

  const short = verifyPlans([wholePlan(8)], clip(8, "process", [shot(0, 8)]));
  assert(short.checks[0].ok, short.checks[0].issues.join("; "));
  assert(span(short.plans[0]) > 7, "short source was cut down");

  const haircut = clip(10, "process", [shot(0, 3, 0.5), shot(3, 7, 0.4), shot(7, 10, 0.9)]);
  const sliced = verifyPlans([{ ...wholePlan(10), segments: [{ start: 4.2, end: 4.6 }] }], haircut);
  assert(sliced.checks[0].ok, sliced.checks[0].issues.join("; "));
  assert(sliced.plans[0].segments.every((segment) => segment.end - segment.start >= 1), "mid-action slice survived");
  assert(sliced.plans[0].segments.some((segment) => segment.end >= 9.5), "reveal was dropped");

  const windows = [0, 1, 2].map((index) => sign({ segments: planSegments(take, index) }));
  assert(new Set(windows).size === 3, `windows collapsed ${windows.join(" / ")}`);

  await partialBlack();
  console.log("partial black span rejected");
  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2",
    "-f", "lavfi", "-i", "color=c=0x2244aa:size=320x240:rate=30:duration=1.4",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p",
    "-an", "/tmp/phone-proof/freeze-eof.mp4",
  ]);
  const frozen = await checkOutput("/tmp/phone-proof/freeze-eof.mp4", { audio: false, sourceDuration: 3.4, motion: true });
  assert(!frozen.ok, "freeze running to the end of the file was accepted");
  assert(frozen.issues.some((issue) => /frozen/i.test(issue)), `expected a freeze, got ${frozen.issues.join("; ")} ${JSON.stringify(frozen.freeze)}`);
  assert(frozen.freeze.some((span) => span.duration >= 0.8), "freeze span was not measured");
  console.log("freeze to end of file rejected");

  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=60:duration=20",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=20",
    "-vf", "drawbox=x='80+40*t':y='200+50*t':w=220:h=160:color=white:t=fill",
    "-c:v", "libx265", "-preset", "ultrafast", "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "/tmp/phone-proof/motion.mov",
  ]);
  await run("ffmpeg", ["-y", "-i", "/tmp/phone-proof/motion.mov", "-an", "-c:v", "copy", "/tmp/phone-proof/motion-silent.mov"]);
  await run("ffmpeg", [
    "-y", "-i", "/tmp/phone-proof/motion.mov", "-an",
    "-vf", "setpts='PTS+0.004*(1+sin(N/9))/TB'",
    "-fps_mode", "vfr", "-c:v", "libx265", "-preset", "ultrafast", "-tag:v", "hvc1",
    "/tmp/phone-proof/motion-vfr.mov",
  ]);
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=60:duration=20",
    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=20",
    "-vf", "drawbox=x=860:y='80+40*t':w=200:h=140:color=white:t=fill",
    "-c:v", "libx265", "-preset", "ultrafast", "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "/tmp/phone-proof/motion-landscape.mov",
  ]);

  const motion = await renderPhone("/tmp/phone-proof/motion.mov", 20, true, 2);
  const silent = await renderPhone("/tmp/phone-proof/motion-silent.mov", 20, false, 1);
  const vfr = await renderPhone("/tmp/phone-proof/motion-vfr.mov", 20, false, 1);
  const portrait = await renderPhone("/tmp/phone-proof/motion-landscape.mov", 20, true, 1);
  const phoneRead = clip(24, "process", [shot(0, 24, 0.8)]);
  const phonePlans = expectRealEdits(phoneRead, 2);
  const phoneOut: string[] = [];
  for (let index = 0; index < phonePlans.plans.length; index += 1) {
    const output = `/tmp/phone-proof/out-phone.mov-v${index}.mp4`;
    await renderVariant({
      videoPath: "/tmp/phone-proof/phone.mov",
      outputPath: output,
      words: [],
      plan: { ...phonePlans.plans[index], keepOriginal: true },
      duration: 24,
    });
    const check = await checkOutput(output, { audio: true, sourceDuration: 24, motion: true });
    assert(check.black.length === 0, `phone v${index} black ${JSON.stringify(check.black)}`);
    assert(check.duration < 24 * 0.9, `phone v${index} duration ${check.duration}`);
    if (index === 0) {
      assert(!check.ok && check.issues.some((issue) => /frozen/i.test(issue)), `static tail was shipped: ${check.issues.join("; ")}`);
    } else {
      assert(check.ok, `phone v${index} ${check.issues.join("; ")} freeze=${JSON.stringify(check.freeze)}`);
      phoneOut.push(output);
    }
  }
  const outputs = [...motion, ...silent, ...vfr, ...portrait, ...phoneOut];
  await rm("/tmp/phone-proof/frames", { recursive: true, force: true });
  await mkdir("/tmp/phone-proof/frames", { recursive: true });
  for (let index = 0; index < outputs.length; index += 1) {
    const file = outputs[index];
    const probe = await probeDuration(file);
    const times = [0.4, Math.max(0.8, probe / 2), Math.max(1, probe - 0.4)];
    for (let timeIndex = 0; timeIndex < times.length; timeIndex += 1) {
      const frame = `/tmp/phone-proof/frames/v${index}-t${timeIndex}.png`;
      await run("ffmpeg", ["-y", "-ss", times[timeIndex].toFixed(2), "-i", file, "-frames:v", "1", frame]);
    }
  }
  console.log("rendered", outputs.join("\n"));
}

function probeDuration(file: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Number(stdout.trim()));
      else reject(new Error("ffprobe failed"));
    });
  });
}

const entry = process.argv[1] || "";
if (entry.endsWith("edit-guarantees.test.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
