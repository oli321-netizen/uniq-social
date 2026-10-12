import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  let userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    const token = await getToken({ req });
    userId = token?.sub;
  }
  return userId || null;
}

// GET — list all API keys for the user
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId },
    select: { id: true, name: true, key: true, lastUsed: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // Mask keys — only show first 8 and last 4 chars
  const masked = keys.map((k) => ({
    ...k,
    key: k.key.slice(0, 8) + "..." + k.key.slice(-4),
  }));

  return NextResponse.json({ keys: masked });
}

// POST — create a new API key
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Key name is required" }, { status: 400 });
  }

  // Check limit — max 5 keys per user
  const count = await prisma.apiKey.count({ where: { userId } });
  if (count >= 5) {
    return NextResponse.json({ error: "Maximum 5 API keys allowed" }, { status: 400 });
  }

  // Generate a secure API key
  const key = "us_" + randomBytes(32).toString("hex");

  const apiKey = await prisma.apiKey.create({
    data: { name: name.trim(), key, userId },
  });

  // Return the full key only on creation — this is the only time they see it
  return NextResponse.json({
    id: apiKey.id,
    name: apiKey.name,
    key: apiKey.key,
    createdAt: apiKey.createdAt,
  });
}

// DELETE — revoke an API key
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Key ID is required" }, { status: 400 });
  }

  // Make sure the key belongs to this user
  const key = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await prisma.apiKey.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
