import { NextFunction, Request, Response } from 'express';
import ApiError from '../utils/ApiError';
import { getRequestLogger } from '../utils/httpLogger';

function resolveErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORISED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMITED';
    case 499:
      return 'CLIENT_CLOSED_REQUEST';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    case 504:
      return 'GATEWAY_TIMEOUT';
    default:
      return statusCode >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR';
  }
}

function wantsEventStream(req: Request, res: Response): boolean {
  const contentType = res.getHeader('Content-Type');
  if (contentType && contentType.toString().includes('text/event-stream')) {
    return true;
  }
  const acceptHeader = req.headers.accept;
  return Boolean(acceptHeader && acceptHeader.includes('text/event-stream') && req.path.startsWith('/stream'));
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'Route not found', undefined, 'NOT_FOUND'));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError
    ? err.statusCode
    : (err as { status?: number; statusCode?: number } | undefined)?.status
      ?? (err as { status?: number; statusCode?: number } | undefined)?.statusCode
      ?? 500;

  const code = isApiError && err.code ? err.code : resolveErrorCode(statusCode);

  const payload: Record<string, unknown> = {
    code,
    message: isApiError ? err.message : 'Internal Server Error',
  };

  if (isApiError && err.details !== undefined) {
    payload.details = err.details;
  }

  if (!isApiError && err instanceof Error && process.env.NODE_ENV !== 'production') {
    payload.details = {
      message: err.message,
      stack: err.stack,
    };
  }

  const requestLogger = getRequestLogger(req);
  const requestId = (req as Request & { id?: string }).id;
  if (err instanceof Error) {
    requestLogger.error({ err, requestId, code, statusCode }, err.message);
  } else {
    requestLogger.error({ requestId, code, statusCode, err }, 'Unhandled error');
  }

  if (res.headersSent) {
    return;
  }

  if (wantsEventStream(req, res)) {
    if (!res.headersSent) {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
    const serialised = JSON.stringify(payload);
    res.write(`event: error\ndata: ${serialised}\n\n`);
    res.write(`event: done\ndata: ${JSON.stringify({ status: 'failed', code })}\n\n`);
    res.end();
    return;
  }

  res.status(statusCode).json(payload);
}
