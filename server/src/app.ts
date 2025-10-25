import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import routes from './routes';
import GenerationService from './services/generationService';
import OpenAIService from './services/openai';
import MemoryService from './services/memoryService';
import PlotService from './services/plotService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();
const openAIService = new OpenAIService();
const memoryService = new MemoryService({ openAIService });
const generationService = new GenerationService({ openAIService, memoryService });
const plotService = new PlotService(openAIService);

app.set('generationService', generationService);
app.set('memoryService', memoryService);
app.set('plotService', plotService);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN || '*').split(',').map((origin) => origin.trim()),
    credentials: true,
  })
);

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

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
    status: healthy ? 'ok' : 'unhealthy',
    mongo,
  });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app, generationService, memoryService };
