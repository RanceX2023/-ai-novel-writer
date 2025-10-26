import 'dotenv/config';
import http from 'http';
import { app } from './app';
import { connectDatabase } from './config/database';
import { initialiseOpenAIKeys } from './config/bootstrap';
import logger from './utils/logger';
import { flushPendingMetrics, stopMetricsTimer } from './utils/metrics';
import { appConfig } from './config/appConfig';

const { port } = appConfig.server;

async function start(): Promise<void> {
  try {
    await connectDatabase();

    try {
      await initialiseOpenAIKeys();
    } catch (error) {
      logger.error({ err: error }, '[server] failed to initialise OpenAI keys from environment');
    }

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
  } catch (error) {
    logger.error({ err: error }, '[server] failed to start');
    process.exit(1);
  }
}

void start();
