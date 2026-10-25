import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Same similarity function used in the process route — keeps detection consistent
function paramSimilarity(
  a: { mirror: boolean; speedFactor: number; brightnessDelta: number; contrastDelta: number; saturationDelta: number; hueRotation: number; cropOffsetX: number; cropOffsetY: number; startTrim: number; zoomPct: number; crfValue: number },
  b: { mirror: boolean; speedFactor: number; brightnessDelta: number; contrastDelta: number; saturationDelta: number; hueRotation: number; cropOffsetX: number; cropOffsetY: number; startTrim: number; zoomPct: number; crfValue: number }
): number {
  let matchCount = 0;
  const totalChecks = 11;

  if (a.mirror === b.mirror) matchCount++;
  if (Math.abs(a.startTrim - b.startTrim) < 0.04) matchCount++;
  if (Math.abs(a.zoomPct - b.zoomPct) < 0.6) matchCount++;
  if (Math.abs(a.speedFactor - b.speedFactor) < 0.004) matchCount++;
  if (Math.abs(a.brightnessDelta - b.brightnessDelta) < 0.006) matchCount++;
  if (Math.abs(a.contrastDelta - b.contrastDelta) < 0.006) matchCount++;
  if (Math.abs(a.saturationDelta - b.saturationDelta) < 0.012) matchCount++;
  if (Math.abs(a.hueRotation - b.hueRotation) < 1.5) matchCount++;
  if (Math.abs(a.cropOffsetX - b.cropOffsetX) < 4) matchCount++;
  if (Math.abs(a.cropOffsetY - b.cropOffsetY) < 4) matchCount++;
  if (Math.abs(a.crfValue - b.crfValue) < 2) matchCount++;

  return matchCount / totalChecks;
}

export async function GET(req: NextRequest) {
  try {
    // Auth check
    let userId: string | undefined;
    const session = await getServerSession(authOptions);
    if (session?.user) {
      userId = (session.user as { id?: string }).id;
    }
    if (!userId) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod" });
      if (token?.id) userId = token.id as string;
    }
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all processing history for this user, grouped by source hash
    const history = await prisma.processingHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceHash: true,
        fileName: true,
        mirror: true,
        speedFactor: true,
        brightnessDelta: true,
        contrastDelta: true,
        saturationDelta: true,
        hueRotation: true,
        cropOffsetX: true,
        cropOffsetY: true,
        startTrim: true,
        zoomPct: true,
        grainEnabled: true,
        grainIntensity: true,
        sharpenEnabled: true,
        sharpenAmount: true,
        crfValue: true,
        gopSize: true,
        createdAt: true,
      },
    });

    // Group by sourceHash
    const groups: Record<string, typeof history> = {};
    for (const h of history) {
      if (!groups[h.sourceHash]) groups[h.sourceHash] = [];
      groups[h.sourceHash].push(h);
    }

    // Calculate similarity between pairs within each group
    type DuplicateGroup = {
      sourceHash: string;
      fileName: string;
      copies: number;
      duplicates: { id1: string; id2: string; date1: string; date2: string; similarity: number; details: string[] }[];
    };

    const results: DuplicateGroup[] = [];

    for (const [hash, copies] of Object.entries(groups)) {
      if (copies.length < 2) continue;

      const duplicates: DuplicateGroup["duplicates"] = [];

      for (let i = 0; i < copies.length; i++) {
        for (let j = i + 1; j < copies.length; j++) {
          const a = copies[i];
          const b = copies[j];

          const similar: string[] = [];

          // Check each parameter for human-readable detail
          if (a.mirror === b.mirror) similar.push("Same mirror");
          if (Math.abs(a.speedFactor - b.speedFactor) < 0.004) similar.push("Similar speed");
          if (Math.abs(a.brightnessDelta - b.brightnessDelta) < 0.006) similar.push("Similar brightness");
          if (Math.abs(a.contrastDelta - b.contrastDelta) < 0.006) similar.push("Similar contrast");
          if (Math.abs(a.saturationDelta - b.saturationDelta) < 0.012) similar.push("Similar saturation");
          if (Math.abs(a.hueRotation - b.hueRotation) < 1.5) similar.push("Similar hue");
          if (Math.abs(a.cropOffsetX - b.cropOffsetX) < 4) similar.push("Similar crop X");
          if (Math.abs(a.cropOffsetY - b.cropOffsetY) < 4) similar.push("Similar crop Y");
          if (Math.abs(a.startTrim - b.startTrim) < 0.04) similar.push("Similar trim");
          if (Math.abs(a.zoomPct - b.zoomPct) < 0.6) similar.push("Similar zoom");
          if (Math.abs(a.crfValue - b.crfValue) < 2) similar.push("Similar quality");

          const similarity = paramSimilarity(a, b);

          // Flag pairs with >45% similarity (matches process route threshold)
          if (similarity > 0.45) {
            duplicates.push({
              id1: a.id,
              id2: b.id,
              date1: a.createdAt.toISOString(),
              date2: b.createdAt.toISOString(),
              similarity: Math.round(similarity * 100),
              details: similar,
            });
          }
        }
      }

      if (duplicates.length > 0) {
        results.push({
          sourceHash: hash.slice(0, 12) + "...",
          fileName: copies[0].fileName,
          copies: copies.length,
          duplicates,
        });
      }
    }

    // Sort by most duplicates first
    results.sort((a, b) => b.duplicates.length - a.duplicates.length);

    return NextResponse.json({
      totalVideos: history.length,
      uniqueSources: Object.keys(groups).length,
      duplicateGroups: results.length,
      groups: results,
    });
  } catch (error) {
    console.error("Duplicate check error:", error);
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500 });
  }
}
