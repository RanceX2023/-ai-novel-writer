const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const GenerationService = require('./services/generationService');
const ApiError = require('./utils/ApiError');

const app = express();
const generationService = new GenerationService();

app.set('generationService', generationService);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cors());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use('/api', routes);

app.use((req, res, next) => {
  next(new ApiError(404, 'Route not found'));
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const payload = {
    message: err.message || 'Internal Server Error',
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (statusCode === 500 && process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
});

module.exports = {
  app,
  generationService,
};
