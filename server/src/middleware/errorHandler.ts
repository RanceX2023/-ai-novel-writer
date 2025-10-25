import { NextFunction, Request, Response } from 'express';
import ApiError from '../utils/ApiError';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'Route not found'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  const payload: Record<string, unknown> = {
    message: isApiError ? err.message : 'Internal Server Error',
  };

  if (isApiError && err.details) {
    payload.details = err.details;
  }

  if (!isApiError && err instanceof Error && process.env.NODE_ENV !== 'production') {
    payload.message = err.message;
    payload.stack = err.stack;
  }

  if (isApiError && process.env.NODE_ENV !== 'production') {
    payload.stack = (err as ApiError).stack;
  }

  res.status(statusCode).json(payload);
}
