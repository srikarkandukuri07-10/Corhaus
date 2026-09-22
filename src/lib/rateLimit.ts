// Reusable server-side in-memory rate limiting mechanism for Next.js
// NOTE (serverless limitation): this Map is per-instance. On Vercel/edge
// deployments each lambda has isolated state and it resets on cold start.
// For distributed abuse protection, replace with Redis/Upstash backed store
// (same `rateLimit(ip, route, limit, windowMs)` signature).

type RateLimitRecord = {
  count: number;
  resetTime: number;
};

// Global in-memory map to store rate limit records
const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up expired records periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 60000); // every minute
}

/**
 * Extract the real client IP, handling proxies correctly.
 * Takes the first entry of x-forwarded-for (client), not the last (proxy).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

/**
 * Checks if a request exceeds the limit for a given key (e.g. IP + route).
 * Returns { success, retryAfter } where success is false if rate-limited.
 */
export async function rateLimit(
  ip: string,
  route: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; retryAfter: number }> {
  const key = `${ip}:${route}`;
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { success: true, retryAfter: 0 };
  }

  if (now > record.resetTime) {
    // Reset window
    record.count = 1;
    record.resetTime = now + windowMs;
    return { success: true, retryAfter: 0 };
  }

  if (record.count >= limit) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { success: false, retryAfter };
  }

  record.count += 1;
  return { success: true, retryAfter: 0 };
}
