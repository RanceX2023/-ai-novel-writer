import 'dotenv/config';
import http from 'http';
import { connectDatabase } from './config/database';
import { initialiseOpenAIKeys } from './config/bootstrap';
import runtimeConfig from './config/runtimeConfig';
import { appConfig } from './config/appConfig';
import logger from './utils/logger';
import { flushPendingMetrics, stopMetricsTimer } from './utils/metrics';

const { port } = appConfig.server;

async function bootstrapApplication() {
  await connectDatabase();
  await runtimeConfig.init();

  try {
    await initialiseOpenAIKeys();
  } catch (error) {
    logger.error({ err: error }, '[server] failed to initialise OpenAI keys from environment');
  }

  const { app } = await import('./app');

  const server = http.createServer(app);
  server.listen(port, () => {
    logger.info({ port }, '[server] listening');
  });

  const shutdown = () => {
    logger.info('[server] shutting down');
    stopMetricsTimer();
    flushPendingMetrics();
    server.close((error) => {
      if (error) {
        logger.error({ err: error }, '[server] error while closing server');
        process.exit(1);
        return;
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function start(): Promise<void> {
  try {
    await bootstrapApplication();
  } catch (error) {
    logger.error({ err: error }, '[server] failed to start');
    process.exit(1);
  }
}

void start();
