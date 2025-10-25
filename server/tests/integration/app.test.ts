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
    expect(response.body.message).toBe('请求参数校验失败');
    expect(response.body.details).toBeDefined();
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'outlineNodeId' }),
      ])
    );
  });
});
