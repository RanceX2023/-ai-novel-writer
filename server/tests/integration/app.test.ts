import request from 'supertest';
import { app } from '../../src/app';

describe('Application routes', () => {
  it('returns service status from GET /health', async () => {
    const response = await request(app).get('/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('mongo');
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
});
