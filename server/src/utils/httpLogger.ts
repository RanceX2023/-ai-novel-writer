import { Request } from 'express';
import { Logger } from 'pino';
import logger from './logger';

export function getRequestLogger(req: Request): Logger {
  return (req as Request & { log?: Logger }).log ?? logger;
}
