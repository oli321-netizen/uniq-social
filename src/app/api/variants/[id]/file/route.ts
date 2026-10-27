import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { fileResponse } from "@/lib/file-response";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const variant = await prisma.creativeVariant.findFirst({ where: { id: params.id, userId, deletedAt: null } });
  if (!variant?.storageKey) {
    return NextResponse.json(
      { error: "This render was logged, but the processor does not keep the file. Attach the downloaded mp4 to preview it." },
      { status: 404 }
    );
  }
  try {
    await access(variant.storageKey);
  } catch {
    return NextResponse.json({ error: "The saved file is missing." }, { status: 404 });
  }
  const download = req.nextUrl.searchParams.get("download") ? `${variant.name}.mp4` : undefined;
  return fileResponse(variant.storageKey, req, "video/mp4", download);
}
