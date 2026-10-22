import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
          let matchCount = 0;
          const totalChecks = 9;

          // Check each parameter
          if (a.mirror === b.mirror) {
            similar.push("Same mirror");
            matchCount++;
          }
          if (Math.abs(a.speedFactor - b.speedFactor) < 0.004) {
            similar.push("Similar speed");
            matchCount++;
          }
          if (Math.abs(a.brightnessDelta - b.brightnessDelta) < 0.008) {
            similar.push("Similar brightness");
            matchCount++;
          }
          if (Math.abs(a.contrastDelta - b.contrastDelta) < 0.008) {
            similar.push("Similar contrast");
            matchCount++;
          }
          if (Math.abs(a.saturationDelta - b.saturationDelta) < 0.015) {
            similar.push("Similar saturation");
            matchCount++;
          }
          if (Math.abs(a.hueRotation - b.hueRotation) < 1.5) {
            similar.push("Similar hue");
            matchCount++;
          }
          if (Math.abs(a.cropOffsetX - b.cropOffsetX) < 6) {
            similar.push("Similar crop X");
            matchCount++;
          }
          if (Math.abs(a.cropOffsetY - b.cropOffsetY) < 6) {
            similar.push("Similar crop Y");
            matchCount++;
          }
          if (Math.abs(a.startTrim - b.startTrim) < 0.03) {
            similar.push("Similar trim");
            matchCount++;
          }

          const similarity = matchCount / totalChecks;

          // Flag pairs with >65% similarity as potential duplicates
          if (similarity > 0.65) {
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
