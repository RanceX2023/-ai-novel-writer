import { Request, Response, NextFunction } from 'express';
import { appConfig } from '../config/appConfig';
import OpenAIService from '../services/openai';
import ApiError from '../utils/ApiError';
import { getRequestLogger } from '../utils/httpLogger';

function getOpenAIService(req: Request): OpenAIService {
  const service = req.app.get('openAIService') as OpenAIService | undefined;
  if (!service) {
    throw new ApiError(500, 'OpenAI service not available');
  }
  return service;
}

function maskSensitive(value?: string): string {
  if (!value) {
    return '';
  }
  return value.replace(/sk-[a-zA-Z0-9]{8,}/g, 'sk-****');
}

function mapTestConnectionError(error: ApiError): { status: number; message: string; code: string } {
  const statusCode = error.statusCode;

  switch (statusCode) {
    case 400:
      return {
        status: 400,
        message: '请求参数有误，请检查模型与密钥配置。',
        code: 'OPENAI_TEST_INVALID_REQUEST',
      };
    case 401:
      return {
        status: 401,
        message: '鉴权失败，请检查密钥是否正确或仍然有效。',
        code: 'OPENAI_TEST_UNAUTHORISED',
      };
    case 403:
      return {
        status: 403,
        message: '访问被拒绝，请确认账户权限是否允许使用该模型。',
        code: 'OPENAI_TEST_FORBIDDEN',
      };
    case 404:
      return {
        status: 404,
        message: '未找到对应的模型或资源，请确认配置。',
        code: 'OPENAI_TEST_NOT_FOUND',
      };
    case 429:
      return {
        status: 429,
        message: '请求过于频繁，请稍后再试。',
        code: 'OPENAI_TEST_RATE_LIMITED',
      };
    case 499:
      return {
        status: 499,
        message: '请求已被取消，请重试。',
        code: 'OPENAI_TEST_CANCELLED',
      };
    case 500:
    case 502:
    case 503:
    case 504:
      return {
        status: statusCode,
        message: 'OpenAI 服务暂时不可用，请稍后重试。',
        code: 'OPENAI_TEST_UPSTREAM_ERROR',
      };
    default:
      if (statusCode >= 400 && statusCode < 500) {
        return {
          status: statusCode,
          message: '请求失败，请检查配置后重试。',
          code: 'OPENAI_TEST_CLIENT_ERROR',
        };
      }
      return {
        status: 502,
        message: '连接测试失败，请稍后再试。',
        code: 'OPENAI_TEST_FAILED',
      };
  }
}

export const getPublicConfig = (_req: Request, res: Response, _next: NextFunction): void => {
  res.json({
    port: appConfig.server.port,
    models: appConfig.openai.allowedModels,
    defaultModel: appConfig.openai.defaultModel,
    allowRuntimeKeyOverride: appConfig.openai.allowRuntimeKeyOverride,
  });
};

export const testConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const openAIService = getOpenAIService(req);

    const runtimeKeyHeader = req.header('x-openai-key');
    const trimmedRuntimeKey = typeof runtimeKeyHeader === 'string' ? runtimeKeyHeader.trim() : undefined;
    const runtimeApiKey = trimmedRuntimeKey && trimmedRuntimeKey.length ? trimmedRuntimeKey : undefined;

    const start = process.hrtime();
    const result = await openAIService.testConnection({ runtimeApiKey });
    const [seconds, nanoseconds] = process.hrtime(start);
    const latencyMs = Math.max(0, Math.round(seconds * 1000 + nanoseconds / 1_000_000));

    res.json({
      ok: true,
      modelUsed: result.model,
      latencyMs,
    });
    return;
  } catch (error) {
    const logger = getRequestLogger(req);

    if (error instanceof ApiError) {
      const { status, message, code } = mapTestConnectionError(error);
      logger.warn(
        {
          status,
          code,
          reason: maskSensitive(error.message),
        },
        'OpenAI connection test failed'
      );
      next(new ApiError(status, message, undefined, code));
      return;
    }

    if (error instanceof Error) {
      logger.error(
        {
          err: {
            name: error.name,
            message: maskSensitive(error.message),
          },
        },
        'OpenAI connection test failed'
      );
    } else {
      logger.error({ err: error }, 'OpenAI connection test failed');
    }

    next(new ApiError(502, '连接测试失败，请稍后再试。', undefined, 'OPENAI_TEST_FAILED'));
  }
};
