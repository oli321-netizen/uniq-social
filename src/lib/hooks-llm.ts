import { applyVoice, stripHashtags, type VoiceProfile } from "@/lib/voice";

export type GeneratedHook = {
  text: string;
  score: number;
  sparkline: number[];
};

export type GenerationMode = "live" | "mock" | "fallback";

const TEMPLATES: ((topic: string) => string)[] = [
  (t) => `The harsh truth about ${t} no one talks about.`,
  (t) => `I wish I knew this about ${t} sooner.`,
  (t) => `This changed my mind about ${t}.`,
  (t) => `Stop doing this. It is stalling your ${t}.`,
  (t) => `Most people get ${t} wrong.`,
  (t) => `Three mistakes I made with ${t}.`,
  (t) => `Nobody tells you this part of ${t}.`,
  (t) => `If I started ${t} again, I would do this first.`,
  (t) => `The ${t} advice I ignored for too long.`,
  (t) => `Watch this before you film about ${t}.`,
  (t) => `Here is what actually worked for ${t}.`,
  (t) => `I tested ${t} so you can skip the dead ends.`,
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sparkline(seed: number, score: number): number[] {
  const points: number[] = [];
  let value = 28 + (seed % 18);
  for (let i = 0; i < 16; i++) {
    const wobble = ((seed >> (i % 8)) & 7) - 3;
    value = Math.max(8, Math.min(96, value + (score - 60) / 20 + wobble));
    points.push(Math.round(value));
  }
  return points;
}

function phraseFrom(topic: string, transcript: string): string {
  const raw = (topic || transcript || "this").replace(/\s+/g, " ").trim();
  const first = raw.split(/[.!?\n]/)[0]?.trim() || "this";
  const words = first.split(" ").slice(0, 6).join(" ");
  const clean = words.replace(/[^\w\s'-]/g, "").trim();
  return clean || "this";
}

function varyLike(like: string, phrase: string, seed: number): string {
  const base = like.replace(/\s+/g, " ").trim();
  const options = [
    base,
    `${base.replace(/\.$/, "")} — the part people skip.`,
    `Say it plainer: ${base}`,
    `The cut that held: ${base}`,
    `${base.replace(/\.$/, "")} That is the ${phrase} version.`,
    `Open on this: ${base}`,
  ];
  const chosen = options[seed % options.length] || base;
  return chosen.length > 180 ? `${chosen.slice(0, 177).trim()}…` : chosen;
}

export function mockHooks(input: {
  topic: string;
  transcript: string;
  count: number;
  likeText?: string;
  voice?: VoiceProfile | null;
}): GeneratedHook[] {
  const phrase = phraseFrom(input.topic, input.transcript);
  const seed = hash(`${phrase}|${input.likeText || ""}|${input.count}|${input.voice?.slangPhrases.join(",") || ""}`);
  const count = Math.min(8, Math.max(1, input.count));
  const hooks: GeneratedHook[] = [];
  for (let i = 0; i < count; i++) {
    const raw = input.likeText
      ? varyLike(input.likeText, phrase, seed + i * 5)
      : TEMPLATES[(seed + i) % TEMPLATES.length](phrase);
    const text = applyVoice(raw, input.voice);
    const score = 68 + ((seed + i * 17) % 27);
    hooks.push({ text, score, sparkline: sparkline(seed + i * 13, score) });
  }
  hooks.sort((a, b) => b.score - a.score);
  return hooks;
}

function clampHooks(raw: unknown, count: number): GeneratedHook[] {
  if (!Array.isArray(raw)) return [];
  const hooks: GeneratedHook[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const text = stripHashtags(String((item as { text?: unknown }).text || "")).trim();
    if (!text || text.includes("#")) continue;
    const scoreRaw = Number((item as { score?: unknown }).score);
    const score = Number.isFinite(scoreRaw) ? Math.max(1, Math.min(99, Math.round(scoreRaw))) : 70;
    const sparkRaw = (item as { sparkline?: unknown }).sparkline;
    const sparkline = Array.isArray(sparkRaw)
      ? sparkRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n)).slice(0, 24)
      : [];
    hooks.push({
      text: text.slice(0, 220),
      score,
      sparkline: sparkline.length >= 4 ? sparkline : mockHooks({ topic: text, transcript: "", count: 1 })[0].sparkline,
    });
    if (hooks.length >= count) break;
  }
  return hooks;
}

export async function generateHooks(input: {
  topic: string;
  transcript: string;
  count: number;
  likeText?: string;
  toneNotes?: string;
  voice?: VoiceProfile | null;
}): Promise<{ hooks: GeneratedHook[]; mode: GenerationMode; notice: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      hooks: mockHooks(input),
      mode: "mock",
      notice:
        "Demo mode. No OPENAI_API_KEY is set, so these lines and scores are template estimates, not a live model and not measured results.",
    };
  }

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write spoken hook lines for short-form video. Return JSON {\"hooks\":[{\"text\":string,\"score\":number,\"sparkline\":number[]}]}. score is an estimated attention score from 60 to 96 and must be treated as an estimate. sparkline is 16 integers. One sentence each. No hashtags, no quotation marks around the line, no talk of evading platform detection or metadata. Match the creator tone notes when they are provided.",
          },
          {
            role: "user",
            content: JSON.stringify({
              topic: input.topic,
              transcript: input.transcript.slice(0, 4000),
              count: input.count,
              likeText: input.likeText || "",
              toneNotes: input.toneNotes || "",
              voice: input.voice || null,
            }),
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as { hooks?: unknown };
    const hooks = clampHooks(parsed.hooks, input.count);
    if (hooks.length === 0) throw new Error("Empty model response");
    return {
      hooks,
      mode: "live",
      notice: "Scores are model estimates, not measured audience results.",
    };
  } catch (error) {
    console.error("Hook generation fell back to templates:", error);
    return {
      hooks: mockHooks(input),
      mode: "fallback",
      notice: "The model request failed, so these lines are template estimates.",
    };
  }
}
