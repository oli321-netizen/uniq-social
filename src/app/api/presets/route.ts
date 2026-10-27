import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { serializePreset } from "@/lib/serialize";

const CREATIVE_DIMENSIONS = ["hook text", "pacing", "crop and zoom", "color grade"] as const;

export const dynamic = "force-dynamic";

function configFrom(body: { dimensions?: unknown; variantsPerVideo?: unknown }) {
  const allowed = new Set<string>(CREATIVE_DIMENSIONS);
  const dimensions = Array.isArray(body.dimensions)
    ? body.dimensions.map(String).filter((item) => allowed.has(item))
    : [];
  const count = Math.min(12, Math.max(1, Number(body.variantsPerVideo) || 3));
  return { dimensions, variantsPerVideo: count };
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const presets = await prisma.preset.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ presets: presets.map(serializePreset) });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  if (name.length < 2) return NextResponse.json({ error: "Preset name must be at least 2 characters." }, { status: 400 });
  const creatorId = body?.creatorId ? String(body.creatorId) : null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }
  const config = configFrom(body || {});
  if (config.dimensions.length === 0) {
    return NextResponse.json({ error: "Pick at least one dimension the processor can test." }, { status: 400 });
  }
  const preset = await prisma.preset.create({
    data: {
      userId,
      creatorId,
      name: name.slice(0, 80),
      configJson: JSON.stringify(config),
    },
  });
  return NextResponse.json({ preset: serializePreset(preset) }, { status: 201 });
}
