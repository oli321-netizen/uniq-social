// Simple in-memory rate limiter
const hits = new Map<string, number[]>();

export function rateLimit(key: string, windowMs: number, maxHits: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  let timestamps = hits.get(key) || [];
  timestamps = timestamps.filter((t) => t > windowStart);
  
  if (timestamps.length >= maxHits) {
    hits.set(key, timestamps);
    return { ok: false, remaining: 0 };
  }
  
  timestamps.push(now);
  hits.set(key, timestamps);
  
  // Cleanup old keys periodically
  if (Math.random() < 0.01) {
    for (const [k, v] of Array.from(hits.entries())) {
      const filtered = v.filter((t) => t > windowStart);
      if (filtered.length === 0) hits.delete(k);
      else hits.set(k, filtered);
    }
  }
  
  return { ok: true, remaining: maxHits - timestamps.length };
}
