import request from 'supertest';
import { app } from '../../src/app';

describe('Application routes', () => {
  it('returns ok for GET /health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('rejects invalid chapter generation payloads', async () => {
    const response = await request(app)
      .post('/api/projects/507f1f77bcf86cd799439011/chapters/generate')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Request validation failed');
    expect(response.body.details).toBeDefined();
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'outlineNodeId' }),
      ])
    );
  });
});
