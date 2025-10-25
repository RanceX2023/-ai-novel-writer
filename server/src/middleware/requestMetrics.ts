import { NextFunction, Request, Response } from 'express';
import { recordRequestMetric } from '../utils/metrics';

function resolveRouteKey(req: Request): string {
  if (req.route?.path) {
    const base = req.baseUrl === '/' || !req.baseUrl ? '' : req.baseUrl;
    return `${req.method} ${`${base}${req.route.path}`.replace(/\/$/, '') || '/'}`;
  }
  if (req.originalUrl) {
    return `${req.method} ${req.originalUrl.split('?')[0]}`;
  }
  return req.method;
}

export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  let finished = false;

  const finalize = () => {
    if (finished) {
      return;
    }
    finished = true;
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = durationNs / 1_000_000;
    const key = resolveRouteKey(req);
    const errored = res.statusCode >= 400;
    recordRequestMetric(key, durationMs, errored);
  };

  res.on('finish', finalize);
  res.on('close', finalize);
  res.on('error', finalize);

  next();
}
