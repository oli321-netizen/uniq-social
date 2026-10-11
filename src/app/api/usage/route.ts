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

  // Last 30 days usage grouped by day
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const jobs = await prisma.processingJob.findMany({
    where: { userId, createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "asc" },
  });

  // Group by date
  const dailyMap: Record<string, { videos: number; copies: number }> = {};
  jobs.forEach((j) => {
    const day = j.createdAt.toISOString().split("T")[0];
    if (!dailyMap[day]) dailyMap[day] = { videos: 0, copies: 0 };
    dailyMap[day].videos += 1;
    dailyMap[day].copies += j.copies;
  });

  // Fill in missing days
  const daily: { date: string; videos: number; copies: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    daily.push({ date: key, ...(dailyMap[key] || { videos: 0, copies: 0 }) });
  }

  const totalJobs = jobs.length;
  const totalCopies = jobs.reduce((s, j) => s + j.copies, 0);

  return NextResponse.json({ daily, totalJobs, totalCopies });
}
