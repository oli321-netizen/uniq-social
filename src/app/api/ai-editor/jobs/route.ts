import { NextRequest, NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { createJob, type EditorMode } from "@/lib/ai-editor/jobs";
import type { ManualToggles } from "@/lib/ai-editor/plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const limit = rateLimit(`ai-editor:${userId}`, 60000, 8);
  if (!limit.ok) return NextResponse.json({ error: "Too many AI editor requests. Wait a moment." }, { status: 429 });
  try {
    const form = await req.formData();
    const upload = form.get("video") || form.get("file");
    if (!upload || typeof upload === "string" || typeof upload.stream !== "function") {
      return NextResponse.json({ error: "Choose a video." }, { status: 400 });
    }
    const fileName = String(form.get("fileName") || ("name" in upload ? upload.name : "") || "video.mp4");
    const mode: EditorMode = form.get("mode") === "full" ? "full" : "prompt";
    const job = await createJob(userId, upload, fileName, togglesFrom(form), String(form.get("prompt") || ""), mode);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start that video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function togglesFrom(form: FormData): ManualToggles {
  const style = String(form.get("captionStyle") || "bold");
  const position = String(form.get("captionPosition") || "bottom");
  return {
    captions: form.get("captions") === "1",
    captionStyle: style === "karaoke" || style === "minimal" ? style : "bold",
    captionPosition: position === "top" || position === "middle" ? position : "bottom",
    fontSize: Number(form.get("fontSize") || 64),
    language: String(form.get("language") || "auto"),
    autoEdit: form.get("autoEdit") === "1",
    silence: form.get("silence") !== "0",
    zoom: form.get("zoom") === "1",
    vertical: form.get("vertical") === "1",
  };
}
