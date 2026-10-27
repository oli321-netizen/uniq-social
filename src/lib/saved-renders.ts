import { prisma } from "@/lib/prisma";

export function historyKey(historyId: string) {
  return `history:${historyId}`;
}

export async function listSavedRenders(userId: string) {
  const history = await prisma.processingHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const keys = history.map((row) => historyKey(row.id));
  const existing = keys.length
    ? await prisma.creativeVariant.findMany({
        where: { userId, batchKey: { in: keys }, deletedAt: null },
      })
    : [];
  const byKey = new Map(existing.map((row) => [row.batchKey, row]));
  for (const row of history) {
    const key = historyKey(row.id);
    if (byKey.has(key)) continue;
    const created = await prisma.creativeVariant.create({
      data: {
        userId,
        name: (row.fileName || "Render").slice(0, 80),
        testsDimension: "saved render",
        status: "logged",
        batchKey: key,
        paramsJson: JSON.stringify({
          historyId: row.id,
          startTrim: row.startTrim,
          zoomPct: row.zoomPct,
        }),
      },
    });
    byKey.set(key, created);
  }
  const fromHistory = history.map((row) => {
    const variant = byKey.get(historyKey(row.id))!;
    return {
      id: variant.id,
      historyId: row.id,
      name: variant.name,
      testsDimension: variant.testsDimension,
      status: variant.storageKey ? "ready" : "logged",
      hasFile: Boolean(variant.storageKey),
      hookText: variant.hookText,
      startTrim: row.startTrim,
      zoomPct: row.zoomPct,
      createdAt: row.createdAt.toISOString(),
    };
  });
  const exports = await prisma.creativeVariant.findMany({
    where: { userId, deletedAt: null, batchKey: { startsWith: "export:" } },
    orderBy: { createdAt: "desc" },
  });
  const extra = exports
    .filter((variant) => !fromHistory.some((card) => card.id === variant.id))
    .map((variant) => ({
      id: variant.id,
      historyId: "",
      name: variant.name,
      testsDimension: variant.testsDimension,
      status: variant.storageKey ? "ready" : "logged",
      hasFile: Boolean(variant.storageKey),
      hookText: variant.hookText,
      startTrim: 0,
      zoomPct: 0,
      createdAt: variant.createdAt.toISOString(),
    }));
  return [...fromHistory, ...extra];
}
