import { stripHashtags, type VoiceProfile } from "@/lib/voice";

export type GeneratedHook = {
  text: string;
  score: number;
  sparkline: number[];
};

export type GenerationMode = "live" | "transcript" | "fallback";

export function hooksFromTranscript(transcript: string, count: number): GeneratedHook[] {
  const clean = stripHashtags(transcript).replace(/\s+/g, " ").trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
  const lines: string[] = [];
  const push = (value: string) => {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length < 8) return;
    const clipped = text.length > 180 ? `${text.slice(0, 177).trim()}…` : text;
    if (lines.some((line) => line.toLowerCase() === clipped.toLowerCase())) return;
    lines.push(clipped);
  };
  for (const sentence of sentences) push(sentence);
  if (lines.length < count) {
    for (const chunk of clean.split(/[,;—–]/)) push(chunk);
  }
  return lines.slice(0, Math.min(8, Math.max(1, count))).map((text, index) => ({
    text,
    score: Math.max(60, 88 - index * 3),
    sparkline: [],
  }));
}

function clampHooks(raw: unknown, count: number, transcript: string): GeneratedHook[] {
  if (!Array.isArray(raw)) return [];
  const source = transcript.toLowerCase();
  const hooks: GeneratedHook[] = [];
  for (const item of raw) {
    const text = stripHashtags(typeof item === "string" ? item : String((item as { text?: unknown })?.text || "")).trim();
    if (text.length < 8 || text.includes("#")) continue;
    const probe = text.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter((word) => word.length > 3);
    const overlap = probe.filter((word) => source.includes(word)).length;
    if (probe.length > 0 && overlap / probe.length < 0.4) continue;
    const scoreRaw = Number((item as { score?: unknown })?.score);
    const score = Number.isFinite(scoreRaw) ? Math.max(1, Math.min(99, Math.round(scoreRaw))) : 75;
    hooks.push({ text: text.slice(0, 220), score, sparkline: [] });
    if (hooks.length >= count) break;
  }
  return hooks;
}

export async function generateHooks(input: {
  transcript: string;
  count: number;
  voice?: VoiceProfile | null;
}): Promise<{ hooks: GeneratedHook[]; mode: GenerationMode; notice: string }> {
  const transcript = input.transcript.replace(/\s+/g, " ").trim();
  const count = Math.min(8, Math.max(1, input.count));
  if (transcript.length < 8) {
    return {
      hooks: [],
      mode: "transcript",
      notice: "Transcribe a video first. Hook Lab will not invent lines without the words that were said.",
    };
  }
  const quoted = hooksFromTranscript(transcript, count);
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      hooks: quoted,
      mode: "transcript",
      notice: quoted.length
        ? "No OPENAI_API_KEY, so these lines are shortened from the transcript. They are not a model, and nothing was invented."
        : "No OPENAI_API_KEY, and the transcript did not contain a line long enough to quote.",
    };
  }
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Write opening lines for a talking video. Return JSON {"hooks":[{"text":string,"score":number}]}. Every line must quote or tighten words, claims, or punchlines that are actually in the transcript. Do not add a new topic, story, or generic advice. One sentence. No hashtags. score is only an estimate from 60 to 96. You may drop words the creator asked to avoid. Do not add phrases that are not in the transcript.',
          },
          {
            role: "user",
            content: JSON.stringify({
              transcript: transcript.slice(0, 12000),
              count,
              avoid: input.voice?.avoidWords || [],
              tone: input.voice?.toneNotes || "",
            }),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as { hooks?: unknown };
    const hooks = clampHooks(parsed.hooks, count, transcript);
    if (hooks.length === 0) throw new Error("The model did not stay on the transcript");
    return { hooks, mode: "live", notice: "These lines are tightened from the transcript. Scores are estimates, not measured results." };
  } catch (error) {
    console.error("Hook generation used the transcript instead:", error);
    return {
      hooks: quoted,
      mode: "fallback",
      notice: "The model request failed, so these lines are shortened from the transcript. Nothing generic was added.",
    };
  }
}
