import pino, { Bindings, Logger } from 'pino';

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

const logger = pino({
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'message',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-openai-key',
      'req.headers["x-openai-key"]',
    ],
    remove: true,
  },
});

export function getLogger(bindings: Bindings = {}): Logger {
  return Object.keys(bindings).length ? logger.child(bindings) : logger;
}

export default logger;
