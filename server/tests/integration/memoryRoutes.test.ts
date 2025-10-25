import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../../src/app';
import MemoryService from '../../src/services/memoryService';

describe('Memory routes', () => {
  let originalService: MemoryService;

  beforeAll(() => {
    originalService = app.get('memoryService') as MemoryService;
  });

  afterEach(() => {
    app.set('memoryService', originalService);
  });

  test('returns conflict entries from GET /api/projects/:id/memory/conflicts', async () => {
    const conflictId = new Types.ObjectId();
    const chapterId = new Types.ObjectId();
    const previousChapterId = new Types.ObjectId();
    const characterId = new Types.ObjectId();

    const stubService = {
      getProjectConflicts: jest.fn().mockResolvedValue([
        {
          _id: conflictId,
          project: new Types.ObjectId(),
          key: '角色·林雪',
          canonicalKey: '角色林雪',
          type: 'world',
          content: '林雪成功晋升为边境指挥官。',
          weight: 0.76,
          category: 'character_update',
          metadata: { source: 'ai_extraction' },
          refs: [
            {
              chapterId,
              label: '第二章',
              addedAt: new Date('2024-05-02T09:30:00Z'),
            },
          ],
          conflict: true,
          conflictNotes: [
            {
              content: '林雪初次抵达北境要塞。',
              source: 'history',
              chapterId: previousChapterId,
              chapterLabel: '第一章',
              recordedAt: new Date('2024-05-02T09:31:00Z'),
            },
          ],
          characterIds: [characterId],
          characterStateChange: '升任边境指挥官',
          worldRuleChange: null,
          createdAt: new Date('2024-05-02T09:00:00Z'),
          updatedAt: new Date('2024-05-02T09:35:00Z'),
        },
      ]),
    } as unknown as MemoryService;

    app.set('memoryService', stubService);

    const response = await request(app).get('/api/projects/507f1f77bcf86cd799439011/memory/conflicts');

    expect(response.status).toBe(200);
    expect(response.body.conflicts).toHaveLength(1);
    const conflict = response.body.conflicts[0];
    expect(conflict.id).toBe(conflictId.toString());
    expect(conflict.key).toBe('角色·林雪');
    expect(conflict.conflictNotes[0].content).toContain('初次抵达');
    expect(conflict.characterIds).toContain(characterId.toString());
    expect(conflict.characterStateChange).toContain('边境指挥官');

    expect(stubService.getProjectConflicts).toHaveBeenCalledTimes(1);
    const calledWith = (stubService.getProjectConflicts as jest.Mock).mock.calls[0][0];
    expect(calledWith.toString()).toBe('507f1f77bcf86cd799439011');
  });
});
