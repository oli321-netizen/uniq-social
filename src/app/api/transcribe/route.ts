import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    let userId: string | undefined;
    const session = await getServerSession(authOptions);
    if (session?.user) userId = (session.user as { id?: string }).id;
    if (!userId) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod" });
      if (token?.id) userId = token.id as string;
    }
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const openai = getOpenAI();
    const formData = await req.formData();
    const file = formData.get("video") as File;
    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    // Whisper accepts audio files — we send the video directly, it extracts audio
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    // Return word-level and segment-level timestamps
    return NextResponse.json({
      text: transcription.text,
      words: (transcription as any).words || [],
      segments: (transcription as any).segments || [],
      language: (transcription as any).language || "en",
    });
  } catch (error: unknown) {
    console.error("Transcription error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Transcription failed", details: message }, { status: 500 });
  }
}
