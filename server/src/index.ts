import 'dotenv/config';
import http from 'http';
import { app } from './app';
import { connectDatabase } from './config/database';

const PORT = Number(process.env.PORT || 4000);

async function start(): Promise<void> {
  try {
    await connectDatabase();
    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`[server] listening on port ${PORT}`);
    });

    const shutdown = () => {
      console.log('[server] shutting down');
      server.close(() => process.exit(0));
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('[server] failed to start', error);
    process.exit(1);
  }
}

void start();
