import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const { text, count = 3 } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const variantCount = Math.min(Math.max(count, 1), 6);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You generate caption variants for short-form video content. Given the original transcript, create ${variantCount} unique caption variants. Each variant should convey the same core message but with different wording, phrasing, and style. Mix styles: some shorter/punchier, some with hooks, some conversational, some with emphasis words capitalised. Keep them natural — the way real people write captions. Return ONLY a JSON array of strings, no other text.`,
        },
        {
          role: "user",
          content: `Original transcript: "${text}"\n\nGenerate ${variantCount} unique caption variants as a JSON array.`,
        },
      ],
      temperature: 0.9,
    });

    const content = response.choices[0]?.message?.content || "[]";
    // Parse the JSON array from the response
    let variants: string[];
    try {
      // Handle if GPT wraps it in markdown code blocks
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      variants = JSON.parse(cleaned);
    } catch {
      // If parsing fails, split by newlines as fallback
      variants = content.split("\n").filter((l) => l.trim()).map((l) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^["']|["']$/g, ""));
    }

    return NextResponse.json({ variants });
  } catch (error: unknown) {
    console.error("Caption variants error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to generate variants", details: message }, { status: 500 });
  }
}
