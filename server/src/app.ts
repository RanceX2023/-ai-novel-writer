import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import GenerationService from './services/generationService';
import OpenAIService from './services/openai';
import MemoryService from './services/memoryService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();
const openAIService = new OpenAIService();
const memoryService = new MemoryService({ openAIService });
const generationService = new GenerationService({ openAIService, memoryService });

app.set('generationService', generationService);
app.set('memoryService', memoryService);

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
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app, generationService, memoryService };
