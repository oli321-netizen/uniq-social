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

interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

interface CaptionConfig {
  enabled: boolean;
  words: CaptionWord[];
  style: "bold-white" | "yellow-pop" | "minimal" | "shadow" | "outline";
  position: "bottom" | "center" | "top";
  fontSize: "small" | "medium" | "large";
  allCaps: boolean;
}

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
  thumbnailRandomise: boolean;
  hiddenEmoji: boolean;
  speedShift: boolean;
  cropOffset: boolean;
  hueShift: boolean;
  // New anti-detection features
  audioPitchShift: boolean;
  audioNoiseFloor: boolean;
  colourChannelShift: boolean;
  encodingProfileRandom: boolean;
  audioBitrateRandom: boolean;
  durationPad: boolean;
  borderPad: boolean;
  captions?: CaptionConfig;
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
        brand: "isom",
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
        brand: "isom",
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

// Generate ASS subtitle file from word-level timestamps
function generateASS(captions: CaptionConfig, videoWidth: number, videoHeight: number): string {
  const style = captions.style;
  const pos = captions.position;

  // Font size based on video height
  const sizeMap = { small: Math.round(videoHeight * 0.035), medium: Math.round(videoHeight * 0.05), large: Math.round(videoHeight * 0.065) };
  const fontSize = sizeMap[captions.fontSize] || sizeMap.medium;

  // Vertical position: ASS uses margin from bottom
  const marginV = pos === "bottom" ? Math.round(videoHeight * 0.08) : pos === "center" ? Math.round(videoHeight * 0.4) : Math.round(videoHeight * 0.85);

  // Style definitions for each caption look
  let primaryColour = "&H00FFFFFF"; // white
  let outlineColour = "&H00000000"; // black
  let outline = 3;
  let shadow = 0;
  let bold = 1;
  let fontName = "Arial";

  switch (style) {
    case "bold-white":
      primaryColour = "&H00FFFFFF";
      outlineColour = "&H00000000";
      outline = 4;
      shadow = 0;
      bold = 1;
      fontName = "Impact";
      break;
    case "yellow-pop":
      primaryColour = "&H0000FFFF"; // yellow in ASS BGR
      outlineColour = "&H00000000";
      outline = 4;
      shadow = 0;
      bold = 1;
      fontName = "Impact";
      break;
    case "minimal":
      primaryColour = "&H00FFFFFF";
      outlineColour = "&H00000000";
      outline = 2;
      shadow = 0;
      bold = 0;
      fontName = "Arial";
      break;
    case "shadow":
      primaryColour = "&H00FFFFFF";
      outlineColour = "&H00000000";
      outline = 0;
      shadow = 4;
      bold = 1;
      fontName = "Arial";
      break;
    case "outline":
      primaryColour = "&H00FFFFFF";
      outlineColour = "&H005A32C8"; // purple-ish
      outline = 5;
      shadow = 0;
      bold = 1;
      fontName = "Impact";
      break;
  }

  // ASS header
  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColour},&H000000FF,${outlineColour},&H80000000,${bold},0,0,0,100,100,0,0,1,${outline},${shadow},2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into chunks of ~3-5 words for readable caption blocks
  const words = captions.words;
  const chunks: { text: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < words.length) {
    const chunkSize = Math.min(3 + Math.floor(Math.random() * 2), words.length - i); // 3-4 words per chunk
    const chunk = words.slice(i, i + chunkSize);
    let text = chunk.map((w) => w.word).join(" ");
    if (captions.allCaps) text = text.toUpperCase();
    chunks.push({
      text,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
    i += chunkSize;
  }

  // Add dialogue lines
  for (const chunk of chunks) {
    const startH = Math.floor(chunk.start / 3600);
    const startM = Math.floor((chunk.start % 3600) / 60);
    const startS = chunk.start % 60;
    const endH = Math.floor(chunk.end / 3600);
    const endM = Math.floor((chunk.end % 3600) / 60);
    const endS = chunk.end % 60;

    const startTime = `${startH}:${String(startM).padStart(2, "0")}:${startS.toFixed(2).padStart(5, "0")}`;
    const endTime = `${endH}:${String(endM).padStart(2, "0")}:${endS.toFixed(2).padStart(5, "0")}`;

    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${chunk.text}\n`;
  }

  return ass;
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
          hiddenEmoji: true,
          speedShift: true,
          cropOffset: true,
          hueShift: true,
          audioPitchShift: true,
          audioNoiseFloor: true,
          colourChannelShift: true,
          encodingProfileRandom: true,
          audioBitrateRandom: true,
          durationPad: true,
          borderPad: true,
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

    // === Fingerprint-breaking: re-encode with different params ===
    // Re-encoding alone completely changes the video bitstream.
    // Tiny invisible tweaks to brightness/contrast/saturation shift the DCT hash.
    // NO speed changes, NO intro frames, NO pixel padding — just clean re-encode.
    // Anti-detection: speed shift — 0.5-1.5% tempo change breaks frame timing fingerprints
    const speedFactor = config.speedShift ? parseFloat(rand(0.985, 1.015).toFixed(4)) : 1.0;
    // Stronger colour shifts — enough to change perceptual hash but not visible
    const brightnessDelta = parseFloat(rand(-0.03, 0.03).toFixed(4));
    const contrastDelta = parseFloat(rand(0.97, 1.03).toFixed(4));
    const saturationDelta = parseFloat(rand(0.96, 1.04).toFixed(4));
    const crfValue = Math.floor(rand(18, 23));
    const gopSize = Math.floor(rand(24, 72));
    // Anti-detection: hue shift — ±3° colour rotation alters frame colour hashes
    const hueRotation = config.hueShift ? parseFloat(rand(-3, 3).toFixed(2)) : 0;
    const gammaShift = parseFloat(rand(0.98, 1.02).toFixed(3));
    // Anti-detection: crop offset — ±12px spatial shift changes position hash
    const cropOffsetX = config.cropOffset ? Math.floor(rand(-12, 12)) : 0;
    const cropOffsetY = config.cropOffset ? Math.floor(rand(-12, 12)) : 0;
    const introFadeDuration = 0;

    // Anti-detection: audio pitch shift — ±2% sample rate change (imperceptible, breaks audio fingerprint)
    const audioPitchFactor = config.audioPitchShift ? parseFloat(rand(0.98, 1.02).toFixed(4)) : 1.0;

    // Anti-detection: colour channel shift — independent R/G/B level adjustments via colorchannelmixer
    const ccmRR = config.colourChannelShift ? parseFloat(rand(0.97, 1.03).toFixed(4)) : 1.0;
    const ccmGG = config.colourChannelShift ? parseFloat(rand(0.97, 1.03).toFixed(4)) : 1.0;
    const ccmBB = config.colourChannelShift ? parseFloat(rand(0.97, 1.03).toFixed(4)) : 1.0;

    // Anti-detection: encoding profile randomisation — baseline/main/high
    const h264Profiles = ["baseline", "main", "high"];
    const h264Profile = config.encodingProfileRandom ? pickRandom(h264Profiles) : "high";
    const h264Levels = ["3.1", "4.0", "4.1", "4.2", "5.0", "5.1"];
    const h264Level = config.encodingProfileRandom ? pickRandom(h264Levels) : "4.1";

    // Anti-detection: audio bitrate randomisation — 96k to 192k
    const audioBitrates = [96, 112, 128, 144, 160, 192];
    const audioBitrate = config.audioBitrateRandom ? pickRandom(audioBitrates) : 128;

    // Anti-detection: audio EQ micro-adjustments — subtle high/low pass
    const audioHighpass = config.audioNoiseFloor ? Math.floor(rand(15, 35)) : 0;
    const audioLowpass = config.audioNoiseFloor ? Math.floor(rand(18000, 19500)) : 0;

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
      const msTrim = parseFloat(rand(0.01, 0.05).toFixed(3));
      const segEnd = parseFloat((cp - msTrim).toFixed(3));
      if (segEnd > prev + 0.1) {
        segments.push([prev, segEnd]);
      }
      prev = cp;
    }
    if (effectiveDuration - prev > 0.3) {
      const msTrim = parseFloat(rand(0.01, 0.05).toFixed(3));
      segments.push([prev, parseFloat((effectiveDuration - msTrim).toFixed(3))]);
    }

    // Zoom crop values
    const zoomFactor = 1 + zoomPct / 100;
    let cropW = Math.floor(origW / zoomFactor);
    let cropH = Math.floor(origH / zoomFactor);
    cropW = cropW - (cropW % 2);
    cropH = cropH - (cropH % 2);
    const cropX = Math.max(0, Math.min(origW - cropW, Math.floor((origW - cropW) / 2) + cropOffsetX));
    const cropY = Math.max(0, Math.min(origH - cropH, Math.floor((origH - cropH) / 2) + cropOffsetY));

    // Build filter chain
    let vf = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${origW}:${origH}`;
    if (config.mirror) vf += ",hflip";
    if (config.grain) vf += `,noise=alls=${config.grainIntensity}:allf=t`;
    if (config.sharpen) vf += `,unsharp=3:3:${config.sharpenAmount}:3:3:0.0`;
    vf += `,eq=brightness=${brightnessDelta}:contrast=${contrastDelta}:saturation=${saturationDelta}:gamma=${gammaShift}`;
    if (hueRotation !== 0) vf += `,hue=h=${hueRotation}`;
    // Anti-detection: independent RGB channel shifts — changes colour fingerprint without visible effect
    if (config.colourChannelShift) vf += `,colorchannelmixer=rr=${ccmRR}:gg=${ccmGG}:bb=${ccmBB}`;

    // === SPEED OPTIMISATION 1: Process segments in PARALLEL (3 at a time) ===
    const segFiles: string[] = new Array(segments.length);

    await processInBatches(
      segments,
      async ([segStart, segEnd], i) => {
        const segPath = path.join(tmpDir!, `seg_${i}.mp4`);
        const actualStart = startTrim + segStart;
        const segDur = segEnd - segStart;

        // === SPEED OPTIMISATION 2: Use ultrafast preset with randomised CRF/GOP ===
        const speedVf = speedFactor !== 1.0 ? `,setpts=${(1 / speedFactor).toFixed(6)}*PTS` : "";

        // Build audio filter chain
        const afFilters: string[] = [];
        if (speedFactor !== 1.0) afFilters.push(`atempo=${speedFactor.toFixed(4)}`);
        // Anti-detection: audio pitch shift — change sample rate then resample back (imperceptible ±2%)
        if (audioPitchFactor !== 1.0) {
          afFilters.push(`asetrate=44100*${audioPitchFactor.toFixed(4)}`);
          afFilters.push("aresample=44100");
        }
        // Anti-detection: subtle EQ shift — micro high/low pass alters audio frequency fingerprint
        if (audioHighpass > 0) afFilters.push(`highpass=f=${audioHighpass}`);
        if (audioLowpass > 0) afFilters.push(`lowpass=f=${audioLowpass}`);
        const afArg = afFilters.length > 0 ? `-af "${afFilters.join(",")}" ` : "";

        // Anti-detection: H.264 profile/level randomisation
        const profileArg = config.encodingProfileRandom ? `-profile:v ${h264Profile} -level ${h264Level} ` : "";

        await execAsync(
          `ffmpeg -y -ss ${actualStart} -i "${inputPath}" -t ${segDur} ` +
            `-vf "${vf}${speedVf}" ${afArg}-c:v libx264 -preset ultrafast -crf ${crfValue} -g ${gopSize} ` +
            `${profileArg}-c:a aac -b:a ${audioBitrate}k -pix_fmt yuv420p -threads 2 "${segPath}"`,
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
    const { args: metadataArgs } = getMetadataArgs(config.metadata);
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

    // Concat segments with stream copy + metadata
    // -f mp4 ensures proper MP4 container; isom brand + compatible_brands for iOS Camera Roll
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatPath}" ` +
        `-c copy -f mp4 -disposition:v default -disposition:a default ` +
        `${quotedMetadataArgs.join(" ")} -brand isom -movflags +faststart "${outputPath}"`,
      EXEC_OPTIONS
    );

    // === Anti-detection: Hidden overlay — invisible pixel marker beats hash matching ===
    let overlayPath = outputPath;
    if (config.hiddenEmoji) {
      const overlayOutput = path.join(tmpDir, "output_overlay.mp4");
      // Draw a 2x2 pixel semi-transparent block at a random position — invisible to eye, changes frame hash
      const ox = Math.floor(rand(10, origW - 20));
      const oy = Math.floor(rand(10, origH - 20));
      const r = Math.floor(rand(0, 255));
      const g = Math.floor(rand(0, 255));
      const b = Math.floor(rand(0, 255));
      await execAsync(
        `ffmpeg -y -i "${outputPath}" -vf "drawbox=x=${ox}:y=${oy}:w=2:h=2:color=0x${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}@0.03:t=fill" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -pix_fmt yuv420p -c:a copy ` +
          `-f mp4 -brand isom -movflags +faststart "${overlayOutput}"`,
        EXEC_OPTIONS
      );
      overlayPath = overlayOutput;
    }

    // === Anti-detection: Audio noise floor — imperceptible white noise mixed into audio ===
    let noisePath = overlayPath;
    if (config.audioNoiseFloor) {
      const noiseOutput = path.join(tmpDir, "output_noise.mp4");
      // Mix very quiet white noise (-60dB to -50dB) into the audio track — changes audio hash completely
      // Get duration of current output for noise generation
      const { stdout: durOut } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${overlayPath}"`,
        EXEC_OPTIONS
      );
      const noiseDur = parseFloat(durOut.trim()) || 10;
      await execAsync(
        `ffmpeg -y -i "${overlayPath}" -f lavfi -t ${noiseDur.toFixed(3)} -i "anoisesrc=d=${noiseDur.toFixed(3)}:c=white:a=0.001" ` +
          `-filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.003[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a ${audioBitrate}k ` +
          `-f mp4 -brand isom -movflags +faststart "${noiseOutput}"`,
        EXEC_OPTIONS
      );
      noisePath = noiseOutput;
    }

    // === Anti-detection: Border padding — add 1-2px border then crop back to original size ===
    let borderPath = noisePath;
    if (config.borderPad) {
      const borderOutput = path.join(tmpDir, "output_border.mp4");
      // Pad by 2px on each side with edge colour, then crop back — subtly shifts all pixel positions
      const padAmt = Math.floor(rand(1, 3)); // 1-2 pixels
      const padW = origW + padAmt * 2;
      const padH = origH + padAmt * 2;
      // Ensure even dimensions
      const evenPadW = padW - (padW % 2);
      const evenPadH = padH - (padH % 2);
      await execAsync(
        `ffmpeg -y -i "${noisePath}" -vf "pad=${evenPadW}:${evenPadH}:${padAmt}:${padAmt}:edge,crop=${origW}:${origH}:${padAmt}:${padAmt}" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -pix_fmt yuv420p -c:a copy ` +
          `-f mp4 -brand isom -movflags +faststart "${borderOutput}"`,
        EXEC_OPTIONS
      );
      borderPath = borderOutput;
    }

    // === Anti-detection: Duration micro-pad — add tiny black+silent padding at start/end ===
    let padPath = borderPath;
    if (config.durationPad) {
      const padOutput = path.join(tmpDir, "output_pad.mp4");
      // Add 10-80ms of black+silence at start and/or end — changes total duration fingerprint
      const startPadMs = Math.floor(rand(10, 80));
      const endPadMs = Math.floor(rand(10, 80));
      const startPadSec = (startPadMs / 1000).toFixed(3);
      const endPadSec = (endPadMs / 1000).toFixed(3);
      await execAsync(
        `ffmpeg -y -i "${borderPath}" -vf "tpad=start_duration=${startPadSec}:stop_duration=${endPadSec}:start_mode=clone:stop_mode=clone" ` +
          `-af "adelay=${startPadMs}|${startPadMs},apad=pad_dur=${endPadSec}" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -pix_fmt yuv420p -c:a aac -b:a ${audioBitrate}k ` +
          `-f mp4 -brand isom -movflags +faststart "${padOutput}"`,
        EXEC_OPTIONS
      );
      padPath = padOutput;
    }

    // === Optional captions burn-in ===
    let captionedPath = padPath;
    if (config.captions?.enabled && config.captions.words?.length > 0) {
      const assContent = generateASS(config.captions, origW, origH);
      const assPath = path.join(tmpDir, "captions.ass");
      await writeFile(assPath, assContent);

      const captionOutput = path.join(tmpDir, "output_captioned.mp4");
      // Burn subtitles using ASS filter — re-encode video with captions overlay
      await execAsync(
        `ffmpeg -y -i "${padPath}" -vf "ass=${assPath}" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -pix_fmt yuv420p -c:a copy ` +
          `-f mp4 -brand isom -movflags +faststart "${captionOutput}"`,
        EXEC_OPTIONS
      );
      captionedPath = captionOutput;
    }

    // === Optional thumbnail randomisation ===
    // Adds a very short (0.04s) unique colour flash at frame 1 then removes it,
    // forcing the platform to generate a different thumbnail hash
    let finalOutputPath = captionedPath;
    if (config.thumbnailRandomise) {
      const thumbPath = path.join(tmpDir, "output_thumb.mp4");
      // Shift hue of first 2 frames by a random amount, making the thumbnail unique
      const hueShift = Math.floor(rand(1, 360));
      await execAsync(
        `ffmpeg -y -i "${captionedPath}" -vf "select='if(lt(n\\,2),1,1)',hue=h='if(lt(t,0.08),${hueShift},0)'" ` +
          `-c:v libx264 -preset ultrafast -crf ${crfValue} -pix_fmt yuv420p -c:a copy ` +
          `-f mp4 -brand isom -movflags +faststart "${thumbPath}"`,
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
