import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req: req as any });
  const userId = (session?.user as { id?: string })?.id || token?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.processingJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ jobs });
}
