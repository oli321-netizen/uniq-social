export type VoiceProfile = {
  name: string;
  niche: string;
  toneNotes: string;
  handle: string;
  toneChips: string[];
  slangPhrases: string[];
  avoidWords: string[];
  examplePosts: string[];
  voiceStrength: number;
};

export function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function stripHashtags(text: string): string {
  return text
    .replace(/#[A-Za-z0-9_]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function coerceList(value: unknown, maxItems: number, maxLen: number): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const text = stripHashtags(String(item)).slice(0, maxLen);
    if (!text) continue;
    if (out.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function coercePosts(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n{2,}/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const text = stripHashtags(String(item).replace(/\s+/g, " ")).slice(0, 600);
    if (text.length < 8) continue;
    out.push(text);
    if (out.length >= 3) break;
  }
  return out;
}

export function voiceFromParts(input: {
  name?: string;
  niche?: string;
  toneNotes?: string;
  handle?: string;
  toneChips?: string;
  slangPhrases?: string;
  avoidWords?: string;
  examplePosts?: string;
  voiceStrength?: number;
}): VoiceProfile {
  const strength = Number(input.voiceStrength);
  return {
    name: input.name || "",
    niche: input.niche || "",
    toneNotes: input.toneNotes || "",
    handle: input.handle || "",
    toneChips: parseJsonList(input.toneChips),
    slangPhrases: parseJsonList(input.slangPhrases),
    avoidWords: parseJsonList(input.avoidWords),
    examplePosts: parseJsonList(input.examplePosts),
    voiceStrength: Number.isFinite(strength) ? Math.max(0, Math.min(100, Math.round(strength))) : 60,
  };
}

export function voiceColumns(body: Record<string, unknown> | null) {
  if (!body) return {};
  const data: {
    handle?: string;
    toneChips?: string;
    slangPhrases?: string;
    avoidWords?: string;
    examplePosts?: string;
    voiceStrength?: number;
  } = {};
  if (body.handle !== undefined) data.handle = String(body.handle).replace(/^@/, "").trim().slice(0, 40);
  if (body.toneChips !== undefined) data.toneChips = JSON.stringify(coerceList(body.toneChips, 12, 40));
  if (body.slangPhrases !== undefined) data.slangPhrases = JSON.stringify(coerceList(body.slangPhrases, 20, 80));
  if (body.avoidWords !== undefined) data.avoidWords = JSON.stringify(coerceList(body.avoidWords, 30, 40));
  if (body.examplePosts !== undefined) data.examplePosts = JSON.stringify(coercePosts(body.examplePosts));
  if (body.voiceStrength !== undefined) {
    const strength = Number(body.voiceStrength);
    data.voiceStrength = Number.isFinite(strength) ? Math.max(0, Math.min(100, Math.round(strength))) : 60;
  }
  return data;
}

export function voicePrompt(voice: VoiceProfile): string {
  const parts = [
    voice.name ? `Creator: ${voice.name}` : "",
    voice.handle ? `Handle: ${voice.handle}` : "",
    voice.niche ? `Niche: ${voice.niche}` : "",
    voice.toneNotes ? `Tone notes: ${voice.toneNotes}` : "",
    voice.toneChips.length ? `Tone chips: ${voice.toneChips.join(", ")}` : "",
    voice.slangPhrases.length ? `Use phrases: ${voice.slangPhrases.join("; ")}` : "",
    voice.avoidWords.length ? `Avoid: ${voice.avoidWords.join(", ")}` : "",
    voice.examplePosts.length ? `Example posts:\n${voice.examplePosts.map((post, i) => `${i + 1}. ${post}`).join("\n")}` : "",
    `Voice strength ${voice.voiceStrength}/100. Higher means stay closer to the phrases and examples.`,
    "Never use hashtags.",
  ];
  return parts.filter(Boolean).join("\n");
}

export function applyVoice(text: string, voice?: VoiceProfile | null): string {
  let next = stripHashtags(text);
  if (!voice) return next;
  for (const word of voice.avoidWords) {
    if (word.length < 2) continue;
    next = next.replace(new RegExp(`\\b${escapeReg(word)}\\b`, "gi"), "");
  }
  next = next.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  const slang = voice.slangPhrases[0];
  if (slang && voice.voiceStrength >= 40 && !next.toLowerCase().includes(slang.toLowerCase())) {
    const withSlang = `${next.replace(/[. ]*$/, "")} — ${slang}.`;
    if (withSlang.length <= 220) next = withSlang;
  }
  return next.trim();
}
