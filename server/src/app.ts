import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';
import { nanoid } from 'nanoid';
import routes from './routes';
import GenerationService from './services/generationService';
import OpenAIService from './services/openai';
import MemoryService from './services/memoryService';
import PlotService from './services/plotService';
import OutlineService from './services/outlineService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import baseLogger from './utils/logger';
import ApiError from './utils/ApiError';
import { initialiseMetrics } from './utils/metrics';
import { requestMetricsMiddleware } from './middleware/requestMetrics';

const appLogger = baseLogger.child({ module: 'app' });
const metricsLogger = baseLogger.child({ module: 'metrics' });

initialiseMetrics(metricsLogger);

const app = express();
app.disable('x-powered-by');

const requestLogger = pinoHttp({
  logger: appLogger,
  genReqId(req, res) {
    const headerId = (req.headers['x-request-id'] as string | undefined)?.trim();
    const requestId = headerId && headerId.length <= 128 ? headerId : nanoid(16);
    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
  customLogLevel(_req, res, err) {
    if (err) {
      return 'error';
    }
    if (res.statusCode >= 500) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
});

app.use(requestLogger);
app.use(requestMetricsMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins = (process.env.CLIENT_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new ApiError(403, 'Origin not allowed', { origin }, 'CORS_NOT_ALLOWED'));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const openAIService = new OpenAIService();
const memoryService = new MemoryService({ openAIService });
const generationService = new GenerationService({
  openAIService,
  memoryService,
  logger: baseLogger.child({ module: 'generation-service' }),
});
const plotService = new PlotService(openAIService);
const outlineService = new OutlineService({ openAIService, memoryService });

app.set('logger', baseLogger);
app.set('generationService', generationService);
app.set('memoryService', memoryService);
app.set('plotService', plotService);
app.set('outlineService', outlineService);

app.get('/health', (_req, res) => {
  const stateMap: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialised',
  };

  const connectionState = mongoose.connection.readyState;
  const mongo = stateMap[connectionState] ?? 'unknown';
  const healthy = connectionState === 1;

  res.status(healthy ? 200 : 503).json({
    code: healthy ? 'SERVICE_HEALTHY' : 'SERVICE_UNHEALTHY',
    status: healthy ? 'ok' : 'unhealthy',
    mongo,
  });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app, generationService, memoryService };
