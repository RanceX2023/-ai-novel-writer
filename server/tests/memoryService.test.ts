import { Types } from 'mongoose';
import MemoryService from '../src/services/memoryService';
import MemoryModel from '../src/models/Memory';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { connect, disconnect, clearDatabase } = require('./helpers/mongo');

describe('MemoryService', () => {
  beforeAll(async () => {
    await connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnect();
  });

  test('upserts duplicate memory keys by updating weight and timestamp', async () => {
    const service = new MemoryService();
    const projectId = new Types.ObjectId();
    const chapterId = new Types.ObjectId();

    const firstSync = await service.syncMemory({
      projectId,
      chapterId,
      chapterLabel: '第一章',
      items: [
        {
          key: '角色·林雪',
          type: 'world',
          content: '林雪初次抵达北境要塞。',
          weight: 0.5,
        },
      ],
      source: 'unit-test',
    });

    expect(firstSync.created).toBe(1);
    expect(firstSync.updated).toBe(0);

    const existing = await MemoryModel.findOne({ project: projectId, key: '角色·林雪', type: 'world' });
    expect(existing).toBeTruthy();
    const initialWeight = existing!.weight;
    const initialUpdatedAt = existing!.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondSync = await service.syncMemory({
      projectId,
      chapterId,
      chapterLabel: '第二章',
      items: [
        {
          key: '角色·林雪',
          type: 'world',
          content: '林雪成功晋升为边境指挥官。',
          weight: 0.8,
        },
      ],
      source: 'unit-test',
    });

    expect(secondSync.created).toBe(0);
    expect(secondSync.updated).toBe(1);

    const updated = await MemoryModel.findOne({ project: projectId, key: '角色·林雪', type: 'world' });
    expect(updated).toBeTruthy();
    expect(updated!.content).toContain('晋升');
    expect(updated!.weight).toBeGreaterThanOrEqual(initialWeight);
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt!.getTime());
    expect(updated!.refs?.length).toBeGreaterThan(0);
  });
});
