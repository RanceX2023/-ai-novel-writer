import { Request, Response, NextFunction } from 'express';
import { appConfig } from '../config/appConfig';

export const getPublicConfig = (_req: Request, res: Response, _next: NextFunction): void => {
  res.json({
    models: appConfig.openai.allowedModels,
    defaultModel: appConfig.openai.defaultModel,
    allowRuntimeKeyOverride: appConfig.openai.allowRuntimeKeyOverride,
  });
};
