// Reusable server-side in-memory rate limiting mechanism for Next.js

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
