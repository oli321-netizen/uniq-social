import { applyVoice, stripHashtags, type VoiceProfile } from "@/lib/voice";

export type GeneratedCaption = { text: string };
export type GenerationMode = "live" | "mock" | "fallback";

const TEMPLATES: ((topic: string, name: string) => string)[] = [
  (topic, name) => `${name ? `${name}: ` : ""}I kept this short because ${topic} does not need a speech.`,
  (topic) => `The part I would reshoot is the first line about ${topic}.`,
  (topic) => `If you only watch one cut, make it the one about ${topic}.`,
  (topic) => `Wrote this the way I talk about ${topic} off camera.`,
  (topic) => `No extra noise. Just the point about ${topic}.`,
  (topic) => `This is the version of ${topic} I would actually post.`,
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function phrase(topic: string) {
  const clean = topic.replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
  return clean.split(" ").slice(0, 8).join(" ") || "this";
}

export function mockCaptions(topic: string, count: number, voice?: VoiceProfile | null): GeneratedCaption[] {
  const subject = phrase(topic);
  const seed = hash(`${subject}|${voice?.name || ""}|${voice?.slangPhrases.join(",") || ""}`);
  const total = Math.min(6, Math.max(1, count));
  const rows: GeneratedCaption[] = [];
  for (let i = 0; i < total; i++) {
    const template = TEMPLATES[(seed + i) % TEMPLATES.length];
    rows.push({ text: applyVoice(template(subject, voice?.name || ""), voice) });
  }
  return rows;
}

function clamp(raw: unknown, count: number, voice?: VoiceProfile | null): GeneratedCaption[] {
  if (!Array.isArray(raw)) return [];
  const rows: GeneratedCaption[] = [];
  for (const item of raw) {
    const text = applyVoice(typeof item === "string" ? item : String((item as { text?: unknown })?.text || ""), voice);
    if (text.length < 8 || text.includes("#")) continue;
    rows.push({ text: text.slice(0, 400) });
    if (rows.length >= count) break;
  }
  return rows;
}

export async function generateCaptions(input: {
  topic: string;
  count: number;
  voice?: VoiceProfile | null;
}): Promise<{ captions: GeneratedCaption[]; mode: GenerationMode; notice: string }> {
  const count = Math.min(6, Math.max(1, input.count));
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      captions: mockCaptions(input.topic, count, input.voice),
      mode: "mock",
      notice: "Demo mode. No OPENAI_API_KEY is set, so these captions are templates in the saved voice. No hashtags.",
    };
  }
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Write on-screen caption options for a short video. Return JSON {"captions":[{"text":string}]}. One or two sentences. Match the voice profile. Never include hashtags, metadata talk, or platform-evasion advice.',
          },
          {
            role: "user",
            content: JSON.stringify({
              topic: input.topic.slice(0, 500),
              count,
              voice: input.voice || null,
            }),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as { captions?: unknown };
    const captions = clamp(parsed.captions, count, input.voice).map((row) => ({ text: stripHashtags(row.text) }));
    if (captions.length === 0) throw new Error("Empty caption response");
    return { captions, mode: "live", notice: "Captions follow the saved voice. Hashtags are stripped." };
  } catch (error) {
    console.error("Caption generation fell back to templates:", error);
    return {
      captions: mockCaptions(input.topic, count, input.voice),
      mode: "fallback",
      notice: "The model request failed, so these captions are templates. No hashtags.",
    };
  }
}
