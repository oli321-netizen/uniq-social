import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        credits: true,
        plan: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users, total: users.length });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
