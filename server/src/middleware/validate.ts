import { RequestHandler } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import ApiError from '../utils/ApiError';

const FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

export function validateBody<T extends AnyZodObject>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseValidationError(parseResult.error);
      next(new ApiError(400, 'Request validation failed', formatted));
      return;
    }
    req.body = parseResult.data;
    next();
  };
}

function parseValidationError(error: ZodError) {
  return {
    timestamp: new Intl.DateTimeFormat('zh-CN', FORMAT_OPTIONS).format(new Date()),
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
      code: issue.code,
    })),
  };
}
