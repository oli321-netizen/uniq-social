import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, readFile, mkdir, rm } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { deductCredits } from "@/lib/users";

const execAsync = promisify(exec);

// Increase exec buffer to 50MB for large video outputs
const EXEC_OPTIONS = { maxBuffer: 50 * 1024 * 1024 };

type MetadataProfile = "capcut" | "snapchat" | "iphone" | "random";

interface ProcessingConfig {
  trimMin: number;
  trimMax: number;
  zoomMin: number;
  zoomMax: number;
  grain: boolean;
  grainIntensity: number;
  sharpen: boolean;
  sharpenAmount: number;
  mirror: boolean;
  metadata: MetadataProfile | MetadataProfile[];
}

const METADATA_PROFILES: Record<string, { format: string[]; video: string[]; audio: string[] }> = {
  capcut: {
    format: ["-metadata", "encoder=CapCut", "-metadata", "comment=Made with CapCut"],
    video: ["-metadata:s:v", "handler_name=CapCut Video Handler", "-metadata:s:v", "encoder=CapCut Video"],
    audio: ["-metadata:s:a", "handler_name=CapCut Sound Handler", "-metadata:s:a", "encoder=CapCut Audio"],
  },
  snapchat: {
    format: ["-metadata", "encoder=Snapchat", "-metadata", "artist=Snapchat"],
    video: ["-metadata:s:v", "handler_name=Snap Video Media Handler", "-metadata:s:v", "encoder=Snap Video"],
    audio: ["-metadata:s:a", "handler_name=Snap Sound Media Handler", "-metadata:s:a", "encoder=Snap Audio"],
  },
  iphone: {
    format: ["-metadata", "encoder=Apple", "-metadata", "com.apple.quicktime.make=Apple", "-metadata", "com.apple.quicktime.model=iPhone 15 Pro"],
    video: ["-metadata:s:v", "handler_name=Core Media Video", "-metadata:s:v", "encoder=HEVC"],
    audio: ["-metadata:s:a", "handler_name=Core Media Audio", "-metadata:s:a", "encoder=AAC"],
  },
};

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function getMetadataArgs(profile: MetadataProfile | MetadataProfile[]): string[] {
  const profiles = Array.isArray(profile) ? profile : [profile];

  const allFormat: string[] = [];
  const allVideo: string[] = [];
  const allAudio: string[] = [];

  for (const p of profiles) {
    if (p === "random") {
      const keys = Object.keys(METADATA_PROFILES);
      const chosen = keys[Math.floor(Math.random() * keys.length)];
      const meta = METADATA_PROFILES[chosen];
      allFormat.push(...meta.format);
      allVideo.push(...meta.video);
      allAudio.push(...meta.audio);
    } else {
      const meta = METADATA_PROFILES[p];
      allFormat.push(...meta.format);
      allVideo.push(...meta.video);
      allAudio.push(...meta.audio);
    }
  }

  return [...allFormat, ...allVideo, ...allAudio];
}

// Process segments in parallel batches to avoid overwhelming the server
async function processInBatches<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map((item, batchIdx) => fn(item, i + batchIdx)));
  }
}

export async function POST(req: NextRequest) {
  let tmpDir: string | undefined;

  try {
    // Auth check — try session first, fall back to JWT
    let userId: string | undefined;

    const session = await getServerSession(authOptions);
    if (session?.user) {
      userId = (session.user as { id?: string }).id;
    }

    if (!userId) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod" });
      if (token?.id) userId = token.id as string;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Deduct 1 credit
    const charged = await deductCredits(userId, 1);
    if (!charged) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const formData = await req.formData();
    const file = formData.get("video") as File;
    const configStr = formData.get("config") as string;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const config: ProcessingConfig = configStr
      ? JSON.parse(configStr)
      : {
          trimMin: 0.3,
          trimMax: 0.7,
          zoomMin: 1,
          zoomMax: 7,
          grain: true,
          grainIntensity: 3,
          sharpen: true,
          sharpenAmount: 0.3,
          mirror: true,
          metadata: "random",
        };

    const jobId = randomUUID();
    tmpDir = path.join("/tmp", "uniq-processing", jobId);
    await mkdir(tmpDir, { recursive: true });

    // Save uploaded file
    const inputPath = path.join(tmpDir, `input${path.extname(file.name)}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);

    // Get video info
    const { stdout: probeOut } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`,
      EXEC_OPTIONS
    );
    const probeData = JSON.parse(probeOut);
    const duration = parseFloat(probeData.format.duration);
    let origW = 1080,
      origH = 1920;

    for (const stream of probeData.streams) {
      if (stream.codec_type === "video") {
        origW = parseInt(stream.width);
        origH = parseInt(stream.height);
        break;
      }
    }

    // Random parameters
    const startTrim = parseFloat(rand(config.trimMin, config.trimMax).toFixed(3));
    const zoomPct = parseFloat(rand(config.zoomMin, config.zoomMax).toFixed(2));
    const effectiveDuration = duration - startTrim;

    // Generate random cut points
    const numCuts = Math.floor(rand(3, 7));
    const cutPoints: number[] = [];
    for (let i = 0; i < numCuts; i++) {
      cutPoints.push(parseFloat(rand(0.5, effectiveDuration - 0.5).toFixed(3)));
    }
    const uniqueCuts = Array.from(new Set(cutPoints)).sort((a, b) => a - b);

    // Build segments
    const segments: [number, number][] = [];
    let prev = 0;
    for (const cp of uniqueCuts) {
      if (cp - prev < 0.3) continue;
      const msTrim = parseFloat(rand(0.02, 0.15).toFixed(3));
      const segEnd = parseFloat((cp - msTrim).toFixed(3));
      if (segEnd > prev + 0.1) {
        segments.push([prev, segEnd]);
      }
      prev = cp;
    }
    if (effectiveDuration - prev > 0.3) {
      const msTrim = parseFloat(rand(0.02, 0.15).toFixed(3));
      segments.push([prev, parseFloat((effectiveDuration - msTrim).toFixed(3))]);
    }

    // Zoom crop values
    const zoomFactor = 1 + zoomPct / 100;
    let cropW = Math.floor(origW / zoomFactor);
    let cropH = Math.floor(origH / zoomFactor);
    cropW = cropW - (cropW % 2);
    cropH = cropH - (cropH % 2);
    const cropX = Math.floor((origW - cropW) / 2);
    const cropY = Math.floor((origH - cropH) / 2);

    // Build filter chain
    let vf = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${origW}:${origH}`;
    if (config.mirror) vf += ",hflip";
    if (config.grain) vf += `,noise=alls=${config.grainIntensity}:allf=t`;
    if (config.sharpen) vf += `,unsharp=3:3:${config.sharpenAmount}:3:3:0.0`;

    // === SPEED OPTIMISATION 1: Process segments in PARALLEL (3 at a time) ===
    const segFiles: string[] = new Array(segments.length);

    await processInBatches(
      segments,
      async ([segStart, segEnd], i) => {
        const segPath = path.join(tmpDir!, `seg_${i}.mp4`);
        const actualStart = startTrim + segStart;
        const segDur = segEnd - segStart;

        // === SPEED OPTIMISATION 2: Use ultrafast preset instead of fast ===
        await execAsync(
          `ffmpeg -y -ss ${actualStart} -i "${inputPath}" -t ${segDur} ` +
            `-vf "${vf}" -c:v libx264 -preset ultrafast -crf 18 ` +
            `-c:a aac -b:a 128k -pix_fmt yuv420p -threads 2 "${segPath}"`,
          EXEC_OPTIONS
        );
        segFiles[i] = segPath;
      },
      3 // Process 3 segments concurrently
    );

    // Concat segments (stream copy — instant)
    const concatPath = path.join(tmpDir, "concat.txt");
    const concatContent = segFiles.map((f) => `file '${f}'`).join("\n");
    await writeFile(concatPath, concatContent);

    const outputPath = path.join(tmpDir, "output.mp4");

    // === SPEED OPTIMISATION 3: Apply metadata with stream copy, NOT re-encode ===
    // Previously this did a FULL re-encode just to add metadata tags — insane.
    // Now we concat + apply metadata in a single pass with -c copy.
    const metadataArgs = getMetadataArgs(config.metadata);
    const quotedMetadataArgs = metadataArgs.map((arg) => {
      if (arg.includes("=") && arg.includes(" ")) {
        const eqIndex = arg.indexOf("=");
        const key = arg.substring(0, eqIndex);
        const value = arg.substring(eqIndex + 1);
        return `${key}="${value}"`;
      }
      if (!arg.startsWith("-") && arg.includes(" ")) {
        return `"${arg}"`;
      }
      return arg;
    });

    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatPath}" ` +
        `-c copy ` +
        `${quotedMetadataArgs.join(" ")} -movflags +faststart "${outputPath}"`,
      EXEC_OPTIONS
    );

    // Read output and return
    const outputBuffer = await readFile(outputPath);

    // Cleanup entire tmp dir
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return new NextResponse(outputBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="uniq_${Date.now()}.mp4"`,
      },
    });
  } catch (error: unknown) {
    // Cleanup on error
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    console.error("Processing error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Processing failed", details: message },
      { status: 500 }
    );
  }
}
