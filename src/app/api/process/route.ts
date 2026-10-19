import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { deductCredits } from "@/lib/users";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);

// Increase exec buffer to 50MB for large video outputs
const EXEC_OPTIONS = { maxBuffer: 50 * 1024 * 1024 };

type MetadataProfile = "capcut" | "snapchat" | "iphone" | "random";

interface ProcessingConfig {
  trimMin: number;
  trimMax: number;
  cutsMin: number;
  cutsMax: number;
  zoomMin: number;
  zoomMax: number;
  grain: boolean;
  grainIntensity: number;
  sharpen: boolean;
  sharpenAmount: number;
  mirror: boolean;
  metadata: MetadataProfile | MetadataProfile[];
  // Fingerprint-breaking options
  thumbnailRandomise: boolean;
  // New aggressive anti-detection options
  colourGrading: boolean;    // random hue/tone shift per copy
  introFrames: boolean;      // inject unique fade-in frames at start
  cropOffset: boolean;       // shift crop window off-centre randomly
}

// Realistic Lavf version strings (CapCut uses ffmpeg internally)
const LAVF_VERSIONS = [
  "Lavf60.16.100", "Lavf60.3.100", "Lavf59.27.100", "Lavf60.10.100",
  "Lavf61.1.100", "Lavf59.16.100", "Lavf60.22.100", "Lavf61.3.100",
];

// iPhone models for realistic Apple metadata
const IPHONE_MODELS = [
  "iPhone 13", "iPhone 13 Pro", "iPhone 13 Pro Max",
  "iPhone 14", "iPhone 14 Pro", "iPhone 14 Pro Max",
  "iPhone 15", "iPhone 15 Pro", "iPhone 15 Pro Max",
  "iPhone 16", "iPhone 16 Pro", "iPhone 16 Pro Max",
];

const IOS_VERSIONS = ["17.5.1", "17.6", "17.6.1", "18.0", "18.0.1", "18.1", "18.2"];

// Generate a random ISO timestamp within the last N days
function randomRecentTimestamp(maxDaysAgo: number = 7): string {
  const now = Date.now();
  const offset = Math.floor(Math.random() * maxDaysAgo * 24 * 60 * 60 * 1000);
  const date = new Date(now - offset);
  date.setHours(Math.floor(Math.random() * 14) + 8); // 8am-10pm
  date.setMinutes(Math.floor(Math.random() * 60));
  date.setSeconds(Math.floor(Math.random() * 60));
  return date.toISOString().replace(/\.\d{3}Z$/, ".000000Z");
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function buildMetadataProfile(profileName: string): { format: string[]; video: string[]; audio: string[]; brand: string } {
  const creationTime = randomRecentTimestamp();

  switch (profileName) {
    case "capcut": {
      const lavfVersion = pickRandom(LAVF_VERSIONS);
      return {
        format: [
          "-metadata", `creation_time=${creationTime}`,
          "-metadata", `encoder=${lavfVersion}`,
          "-metadata", "comment=Made with CapCut",
          "-metadata", "minor_version=512",
        ],
        video: [
          "-metadata:s:v", "handler_name=VideoHandler",
          "-metadata:s:v", `creation_time=${creationTime}`,
          "-metadata:s:v", "language=und",
          "-metadata:s:v", "vendor_id=[0][0][0][0]",
        ],
        audio: [
          "-metadata:s:a", "handler_name=SoundHandler",
          "-metadata:s:a", `creation_time=${creationTime}`,
          "-metadata:s:a", "language=und",
          "-metadata:s:a", "vendor_id=[0][0][0][0]",
        ],
        brand: "isom",
      };
    }

    case "snapchat": {
      return {
        format: [
          "-metadata", `creation_time=${creationTime}`,
          "-metadata", "encoder=Snapchat",
          "-metadata", "minor_version=0",
        ],
        video: [
          "-metadata:s:v", "handler_name=VideoHandler",
          "-metadata:s:v", `creation_time=${creationTime}`,
          "-metadata:s:v", "language=und",
          "-metadata:s:v", "vendor_id=[0][0][0][0]",
        ],
        audio: [
          "-metadata:s:a", "handler_name=SoundHandler",
          "-metadata:s:a", `creation_time=${creationTime}`,
          "-metadata:s:a", "language=und",
          "-metadata:s:a", "vendor_id=[0][0][0][0]",
        ],
        brand: "mp42",
      };
    }

    case "iphone": {
      const model = pickRandom(IPHONE_MODELS);
      const iosVersion = pickRandom(IOS_VERSIONS);
      return {
        format: [
          "-metadata", `creation_time=${creationTime}`,
          "-metadata", "encoder=Apple",
          "-metadata", "com.apple.quicktime.make=Apple",
          "-metadata", `com.apple.quicktime.model=${model}`,
          "-metadata", `com.apple.quicktime.software=${iosVersion}`,
          "-metadata", "minor_version=0",
        ],
        video: [
          "-metadata:s:v", "handler_name=Core Media Video",
          "-metadata:s:v", `creation_time=${creationTime}`,
          "-metadata:s:v", "language=und",
          "-metadata:s:v", "vendor_id=appl",
        ],
        audio: [
          "-metadata:s:a", "handler_name=Core Media Audio",
          "-metadata:s:a", `creation_time=${creationTime}`,
          "-metadata:s:a", "language=und",
          "-metadata:s:a", "vendor_id=appl",
        ],
        brand: "qt  ",
      };
    }

    default:
      return buildMetadataProfile("capcut");
  }
}

function getMetadataArgs(profile: MetadataProfile | MetadataProfile[]): { args: string[]; brand: string } {
  const profiles = Array.isArray(profile) ? profile : [profile];

  let chosenProfile: string;
  if (profiles.includes("random") || profiles[0] === "random") {
    const options = ["capcut", "snapchat", "iphone"];
    chosenProfile = pickRandom(options);
  } else {
    chosenProfile = profiles[0];
  }

  const meta = buildMetadataProfile(chosenProfile);

  // Strip ALL existing metadata first, then inject fresh
  const args = [
    "-map_metadata", "-1",
    ...meta.format,
    ...meta.video,
    ...meta.audio,
  ];

  return { args, brand: meta.brand };
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

    // Try API key auth as third fallback
    if (!userId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer us_")) {
        const apiKey = await prisma.apiKey.findUnique({
          where: { key: authHeader.slice(7) },
          select: { userId: true, id: true },
        });
        if (apiKey) {
          userId = apiKey.userId;
          // Update last used timestamp (fire and forget)
          prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsed: new Date() } }).catch(() => {});
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 30 requests per minute per user
    const rl = rateLimit(`process:${userId}`, 60000, 30);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
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
          cutsMin: 3,
          cutsMax: 7,
          zoomMin: 1,
          zoomMax: 7,
          grain: true,
          grainIntensity: 3,
          sharpen: true,
          sharpenAmount: 0.3,
          mirror: true,
          metadata: "random",
          thumbnailRandomise: false,
          colourGrading: true,
          introFrames: true,
          cropOffset: true,
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

    // === Hash source video for history tracking ===
    const sourceHash = createHash("sha256").update(buffer).digest("hex");

    // === AGGRESSIVE fingerprint-breaking randomisation ===
    // Based on Meta's PDQ/TMK+PDQF research: hash uses 16x16 DCT grid of luminance.
    // We need to change the STRUCTURE of what lands in that grid, not just tweak values.

    // --- Audio fingerprinting evasion ---
    // Re-encoding audio with different bitrate/codec params is enough to break audio hashes
    // Do NOT change speed or pitch — causes A/V desync since video is stream-copied
    const speedFactor = 1.0;  // no speed change (kept for DB record)

    // --- Visual: subtle colour/luminance shifts (target the DCT luminance grid) ---
    const brightnessDelta = parseFloat(rand(-0.02, 0.02).toFixed(4));   // ±2% brightness — invisible
    const contrastDelta = parseFloat(rand(0.98, 1.02).toFixed(4));      // ±2% contrast — invisible
    const saturationDelta = parseFloat(rand(0.97, 1.03).toFixed(4));    // ±3% saturation — invisible

    // --- Encoding fingerprint ---
    const crfValue = Math.floor(rand(17, 21));                          // CRF 17-20 — quality stays high
    const gopSize = Math.floor(rand(24, 72));                           // Keyframe interval

    // --- Colour grading: subtle hue/gamma tweaks ---
    const hueRotation = config.colourGrading ? parseFloat(rand(-3, 3).toFixed(1)) : 0;    // ±3° hue — invisible
    const gammaShift = config.colourGrading ? parseFloat(rand(0.97, 1.03).toFixed(3)) : 1.0; // subtle gamma

    // --- Crop offset: small shift to change which pixels land in each hash grid cell ---
    const cropOffsetX = config.cropOffset ? Math.floor(rand(-4, 4)) : 0;   // ±4px — invisible
    const cropOffsetY = config.cropOffset ? Math.floor(rand(-4, 4)) : 0;   // ±4px — invisible

    // --- Intro frames: very short fade-in (3-6 frames) from near-black ---
    // Just enough to shift TMK+PDQF time-weighted averages without being visible
    const introFadeDuration = config.introFrames ? parseFloat(rand(0.1, 0.2).toFixed(2)) : 0;
    const introR = Math.floor(rand(5, 20));    // very dark — looks like natural video start
    const introG = Math.floor(rand(5, 20));
    const introB = Math.floor(rand(5, 20));

    // Pixel padding: tiny pad+crop to shift pixel grid alignment
    const padPx = Math.floor(rand(1, 3));                               // 1-2px — invisible

    // Random parameters
    const startTrim = parseFloat(rand(config.trimMin, config.trimMax).toFixed(3));
    const zoomPct = parseFloat(rand(config.zoomMin, config.zoomMax).toFixed(2));
    const effectiveDuration = duration - startTrim;

    // Generate random cut points
    const numCuts = Math.floor(rand(config.cutsMin, config.cutsMax + 1));
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

    // Zoom crop values — with random offset to shift which pixels land in each hash grid cell
    const zoomFactor = 1 + zoomPct / 100;
    let cropW = Math.floor(origW / zoomFactor);
    let cropH = Math.floor(origH / zoomFactor);
    cropW = cropW - (cropW % 2);
    cropH = cropH - (cropH % 2);
    // Apply crop offset — clamped to stay in bounds
    let cropX = Math.floor((origW - cropW) / 2) + cropOffsetX;
    let cropY = Math.floor((origH - cropH) / 2) + cropOffsetY;
    cropX = Math.max(0, Math.min(cropX, origW - cropW));
    cropY = Math.max(0, Math.min(cropY, origH - cropH));

    // Build filter chain — each filter targets a different layer of detection
    let vf = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${origW}:${origH}`;
    if (config.mirror) vf += ",hflip";
    if (config.grain) vf += `,noise=alls=${config.grainIntensity}:allf=t`;
    if (config.sharpen) vf += `,unsharp=3:3:${config.sharpenAmount}:3:3:0.0`;
    // Brightness/contrast/saturation — targets luminance-based hash
    vf += `,eq=brightness=${brightnessDelta}:contrast=${contrastDelta}:saturation=${saturationDelta}`;
    // Hue rotation + gamma — changes colour channels and luminance curve
    if (hueRotation !== 0) vf += `,hue=h=${hueRotation}`;
    if (gammaShift !== 1.0) vf += `,eq=gamma=${gammaShift}`;
    // Pixel padding: pad then crop back — shifts the pixel grid alignment
    vf += `,pad=iw+${padPx * 2}:ih+${padPx * 2}:${padPx}:${padPx}:black,crop=iw-${padPx * 2}:ih-${padPx * 2}:${padPx}:${padPx}`;

    // === SPEED OPTIMISATION 1: Process segments in PARALLEL (3 at a time) ===
    const segFiles: string[] = new Array(segments.length);

    await processInBatches(
      segments,
      async ([segStart, segEnd], i) => {
        const segPath = path.join(tmpDir!, `seg_${i}.mp4`);
        const actualStart = startTrim + segStart;
        const segDur = segEnd - segStart;

        // === SPEED OPTIMISATION 2: Use ultrafast preset with randomised CRF/GOP ===
        await execAsync(
          `ffmpeg -y -ss ${actualStart} -i "${inputPath}" -t ${segDur} ` +
            `-vf "${vf}" -c:v libx264 -preset ultrafast -crf ${crfValue} -g ${gopSize} ` +
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
    const { args: metadataArgs, brand } = getMetadataArgs(config.metadata);
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

    // Audio: just re-encode (no speed/pitch changes — those caused A/V desync)
    // Re-encoding alone changes the audio bitstream enough to break spectral hashing
    const sampleRate = 44100;

    // === INTRO FRAME INJECTION ===
    // Research: adding unique frames at the start causes "a large drop" in TMK+PDQF video hash matches
    // because TMK resamples to 15fps and builds time-weighted averages — different start = different average
    if (config.introFrames && introFadeDuration > 0) {
      // Step 1: Create a short solid-colour clip that fades to the video's first frame
      const introClipPath = path.join(tmpDir, "intro_clip.mp4");
      // Generate intro: solid colour → fade to transparent, overlaid on first frame
      // This looks like a natural "fade in" but completely changes the temporal hash
      await execAsync(
        `ffmpeg -y -f lavfi -i "color=c=0x${introR.toString(16).padStart(2,'0')}${introG.toString(16).padStart(2,'0')}${introB.toString(16).padStart(2,'0')}:s=${origW}x${origH}:r=30:d=${introFadeDuration}" ` +
          `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=${sampleRate}" ` +
          `-vf "fade=t=out:st=0:d=${introFadeDuration}" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -pix_fmt yuv420p ` +
          `-t ${introFadeDuration} -c:a aac -b:a 128k -shortest "${introClipPath}"`,
        EXEC_OPTIONS
      );

      // Step 2: Concat intro + main segments, then overlay so intro fades into content
      const introConcat = path.join(tmpDir, "intro_concat.txt");
      await writeFile(introConcat, `file '${introClipPath}'\n${concatContent}`);

      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${introConcat}" ` +
          `-c copy ` +
          `${quotedMetadataArgs.join(" ")} -brand ${brand} -movflags +faststart "${outputPath}"`,
        EXEC_OPTIONS
      );
    } else {
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${concatPath}" ` +
          `-c copy ` +
          `${quotedMetadataArgs.join(" ")} -brand ${brand} -movflags +faststart "${outputPath}"`,
        EXEC_OPTIONS
      );
    }

    // === Optional thumbnail randomisation ===
    // Adds a very short (0.04s) unique colour flash at frame 1 then removes it,
    // forcing the platform to generate a different thumbnail hash
    let finalOutputPath = outputPath;
    if (config.thumbnailRandomise) {
      const thumbPath = path.join(tmpDir, "output_thumb.mp4");
      // Shift hue of first 2 frames by a random amount, making the thumbnail unique
      const hueShift = Math.floor(rand(1, 360));
      await execAsync(
        `ffmpeg -y -i "${outputPath}" -vf "select='if(lt(n\\,2),1,1)',hue=h='if(lt(t,0.08),${hueShift},0)'" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -c:a copy "${thumbPath}"`,
        EXEC_OPTIONS
      );
      finalOutputPath = thumbPath;
    }

    // Read output and return
    const outputBuffer = await readFile(finalOutputPath);

    // Cleanup entire tmp dir
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    // Log processing job + history
    try {
      const origName = file?.name || "unknown";
      await Promise.all([
        prisma.processingJob.create({
          data: { userId, fileName: origName, copies: 1, status: "completed" },
        }),
        prisma.processingHistory.create({
          data: {
            userId,
            sourceHash,
            fileName: origName,
            startTrim,
            zoomPct,
            cutPoints: JSON.stringify(uniqueCuts),
            mirror: config.mirror,
            grainEnabled: config.grain,
            grainIntensity: config.grainIntensity,
            sharpenEnabled: config.sharpen,
            sharpenAmount: config.sharpenAmount,
            metadataProfile: typeof config.metadata === "string" ? config.metadata : config.metadata[0],
            speedFactor,
            brightnessDelta,
            contrastDelta,
            saturationDelta,
            crfValue,
            gopSize,
            hueRotation,
            gammaShift,
            cropOffsetX,
            cropOffsetY,
            introFadeDuration,
          },
        }),
      ]);
    } catch {}

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
