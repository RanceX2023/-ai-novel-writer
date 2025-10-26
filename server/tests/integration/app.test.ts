import request from 'supertest';
import { app } from '../../src/app';

describe('Application routes', () => {
  it('returns service status from GET /health', async () => {
    const response = await request(app).get('/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('mongo');
    expect(response.body).toHaveProperty('model');
  });

  it('rejects invalid chapter generation payloads', async () => {
    const response = await request(app)
      .post('/api/projects/507f1f77bcf86cd799439011/chapters/generate')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.message).toBe('请求参数校验失败');
    expect(response.body.details).toBeDefined();
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'outlineNodeId' }),
      ])
    );
  });

  it('rejects chapter generation when model is not allowed', async () => {
    const response = await request(app)
      .post('/api/projects/507f1f77bcf86cd799439099/chapters/generate')
      .send({
        outlineNodeId: 'outline-1',
        model: 'gpt-nonexistent',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details).toBeDefined();
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'model' }),
      ])
    );
  });

  it('enforces rate limiting for chapter generation requests', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const url = '/api/projects/507f1f77bcf86cd799439011/chapters/generate';

    const first = await request(app).post(url).send({});
    expect(first.status).toBe(400);

    const second = await request(app).post(url).send({});
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('RATE_LIMITED');
    expect(second.body.message).toBe('请求过于频繁，请稍后重试。');
    expect(second.body.details).toBeDefined();
    expect(second.body.details.retryAfter).toBeGreaterThan(0);
    expect(second.headers['retry-after']).toBeDefined();
  });

  it('returns public configuration from GET /api/config', async () => {
    const response = await request(app).get('/api/config');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('port');
    expect(response.body).toHaveProperty('models');
    expect(response.body).toHaveProperty('defaultModel');
    expect(response.body).toHaveProperty('allowRuntimeKeyOverride');
    expect(Array.isArray(response.body.models)).toBe(true);
    expect(response.body.models).toContain(response.body.defaultModel);
    expect(typeof response.body.defaultModel).toBe('string');
    expect(typeof response.body.allowRuntimeKeyOverride).toBe('boolean');
    expect(typeof response.body.port).toBe('number');
  });

  it('tests OpenAI connectivity via GET /api/config/test-connection', async () => {
    const originalService = app.get('openAIService');
    const stubService = {
      testConnection: jest.fn().mockResolvedValue({ model: 'gpt-stub-test' }),
    };
    app.set('openAIService', stubService);

    const response = await request(app).get('/api/config/test-connection');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.modelUsed).toBe('gpt-stub-test');
    expect(typeof response.body.latencyMs).toBe('number');
    expect(response.body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(stubService.testConnection).toHaveBeenCalledWith({ runtimeApiKey: undefined });

    app.set('openAIService', originalService);
  });
});
