import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

const WINDOW_MS = Number(process.env.GENERATION_RATE_LIMIT_WINDOW_MS ?? 5 * 60 * 1000);
const MAX_REQUESTS = Number(process.env.GENERATION_RATE_LIMIT_MAX ?? 60);

function getRetryAfterSeconds(req: Request): number {
  const rateLimitState = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
  if (rateLimitState?.resetTime instanceof Date) {
    const diffMs = rateLimitState.resetTime.getTime() - Date.now();
    if (diffMs > 0) {
      return Math.ceil(diffMs / 1000);
    }
  }
  return Math.ceil(WINDOW_MS / 1000);
}

function rateLimitHandler(routeName: string) {
  return (req: Request, res: Response): void => {
    const retryAfter = getRetryAfterSeconds(req);
    res.setHeader('Retry-After', retryAfter.toString());
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后重试。',
      details: {
        retryAfter,
        limit: MAX_REQUESTS,
        windowSeconds: Math.ceil(WINDOW_MS / 1000),
        route: routeName,
      },
    });
  };
}

function createGenerationLimiter(routeName: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS,
    legacyHeaders: false,
    standardHeaders: true,
    handler: rateLimitHandler(routeName),
    keyGenerator: (req) => req.ip,
  });
}

export const chapterGenerationLimiter = createGenerationLimiter('chapter_generation');
export const chapterContinuationLimiter = createGenerationLimiter('chapter_continuation');
