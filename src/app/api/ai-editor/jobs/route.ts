import { NextRequest, NextResponse } from "next/server";
import { editorAccess } from "@/lib/ai-editor/access";
import { createJob } from "@/lib/ai-editor/jobs";
import type { CaptionLook, EditorSettings } from "@/lib/ai-editor/types";
import { rateLimit } from "@/lib/rate-limit";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await editorAccess(userId);
  if (!access.allowed) return NextResponse.json({ error: "AI Editor needs an active plan." }, { status: 403 });
  const limit = rateLimit(`ai-editor:${userId}`, 60000, 6);
  if (!limit.ok) return NextResponse.json({ error: "Too many edits at once. Wait a moment." }, { status: 429 });
  try {
    const form = await req.formData();
    const upload = form.get("video") || form.get("file");
    if (!upload || typeof upload === "string" || typeof upload.stream !== "function") {
      return NextResponse.json({ error: "Choose a video." }, { status: 400 });
    }
    const music = form.get("music");
    const musicFile = music && typeof music !== "string" && typeof music.stream === "function" && music.size > 0 ? music : undefined;
    const musicUrl = String(form.get("musicUrl") || "").trim();
    const fileName = String(form.get("fileName") || ("name" in upload ? upload.name : "") || "video.mp4");
    const job = await createJob(userId, upload, fileName, settingsFromForm(form), { file: musicFile, url: musicUrl });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start that video.";
    const status = /credit/i.test(message) ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function settingsFromForm(form: FormData): Partial<EditorSettings> {
  const style = String(form.get("captionStyle") || "bold");
  const look: CaptionLook = style === "karaoke" || style === "minimal" ? style : "bold";
  return {
    variants: Number(form.get("variants") || 3),
    captions: form.get("captions") === "1",
    captionStyle: look,
    mode: form.get("mode") === "describe" ? "describe" : "auto",
    prompt: String(form.get("prompt") || ""),
    keepOriginal: form.get("keepOriginal") !== "0",
    musicVolume: Number(form.get("musicVolume") || 0.35),
    duck: form.get("duck") !== "0",
    fade: form.get("fade") !== "0",
    beatSync: form.get("beatSync") === "1",
  };
}
