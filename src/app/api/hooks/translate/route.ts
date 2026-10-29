import { NextRequest, NextResponse } from "next/server";
import { requirePaidUserId } from "@/lib/session";
import { parseCues, type CaptionCue } from "@/lib/caption-cues";

export const dynamic = "force-dynamic";

const LANGUAGES = new Set(["en", "es", "fr", "de", "pt", "it", "nl", "pl", "ja", "ko", "zh", "ar", "hi"]);

export async function POST(req: NextRequest) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const body = await req.json().catch(() => null);
  const language = String(body?.language || "");
  const cues = parseCues(body?.cues);
  if (!LANGUAGES.has(language)) return NextResponse.json({ error: "Choose a language." }, { status: 400 });
  if (cues.length === 0) return NextResponse.json({ error: "There are no captions to translate." }, { status: 400 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Editor Lab will not invent a translation." },
      { status: 400 }
    );
  }
  const lines = cues.map((cue) => cue.words.map((word) => word.text).join(" "));
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Translate each caption into ${language}. Return JSON {"lines": string[]} with exactly ${lines.length} strings, same order. No hashtags.`,
        },
        { role: "user", content: JSON.stringify({ lines }) },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `OpenAI ${res.status}: ${detail.slice(0, 240)}` }, { status: 400 });
  }
  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let translated: string[] = [];
  try {
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}") as { lines?: unknown };
    translated = Array.isArray(parsed.lines) ? parsed.lines.map((line) => String(line || "").trim()) : [];
  } catch {
    translated = [];
  }
  if (translated.length !== cues.length || translated.some((line) => !line)) {
    return NextResponse.json({ error: "Translation did not line up with the captions." }, { status: 400 });
  }
  const next = cues.map((cue, index) => applyLine(cue, translated[index]));
  return NextResponse.json({ cues: next });
}

function applyLine(cue: CaptionCue, line: string): CaptionCue {
  const parts = line.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === cue.words.length) {
    const words = cue.words.map((word, index) => ({ ...word, text: parts[index] }));
    return { ...cue, words };
  }
  const words = cue.words.map((word, index) => ({ ...word, text: parts[index] || word.text }));
  if (parts.length > cue.words.length && words.length) {
    words[words.length - 1] = { ...words[words.length - 1], text: parts.slice(words.length - 1).join(" ") };
  }
  return { ...cue, words };
}
