import { Request, Response, NextFunction } from "express";

// Simple in-memory rate limiter (no Redis dependency required)
const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyFn } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : (req.ip || "unknown");
    const now = Date.now();
    const record = store.get(key);

    if (!record || record.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", max - 1);
      return next();
    }

    record.count++;
    const remaining = Math.max(0, max - record.count);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetAt / 1000));

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        },
      });
    }

    next();
  };
}

// Pre-configured limiters
const isDev = process.env.NODE_ENV !== "production";
export const defaultLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: isDev ? 500 : 200 });
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: isDev ? 200 : 50 });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: isDev ? 500 : 200 });
