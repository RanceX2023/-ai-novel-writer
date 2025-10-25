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
    expect(secondSync.conflicts).toBe(1);

    const updated = await MemoryModel.findOne({ project: projectId, key: '角色·林雪', type: 'world' });
    expect(updated).toBeTruthy();
    expect(updated!.content).toContain('晋升');
    expect(updated!.weight).toBeGreaterThanOrEqual(initialWeight);
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt!.getTime());
    expect(updated!.refs?.length).toBeGreaterThan(0);
    expect(updated!.conflict).toBe(true);
    expect(updated!.conflictNotes?.length).toBeGreaterThanOrEqual(1);
    expect(updated!.conflictNotes?.[0]?.content).toContain('初次抵达');

    const conflicts = await service.getProjectConflicts(projectId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictNotes?.[0]?.content).toContain('初次抵达');
  });

  test('normalises similar keys and merges without duplication', async () => {
    const service = new MemoryService();
    const projectId = new Types.ObjectId();

    await service.syncMemory({
      projectId,
      items: [
        {
          key: '世界·魔法规则',
          type: 'world',
          content: '魔法需要消耗灵力才能释放。',
          weight: 0.5,
          refs: [{ label: '第一章' }],
        },
      ],
      source: 'unit-test',
    });

    const second = await service.syncMemory({
      projectId,
      items: [
        {
          key: '世界 魔法规则',
          type: 'world',
          content: '魔法需要消耗灵力才能释放。',
          weight: 0.9,
          refs: [{ label: '第二章' }],
        },
      ],
      source: 'unit-test',
    });

    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.conflicts).toBe(0);

    const docs = await MemoryModel.find({ project: projectId });
    expect(docs).toHaveLength(1);
    expect(docs[0].conflict).toBe(false);
    expect(docs[0].weight).toBeGreaterThan(0.5);
    expect(docs[0].canonicalKey).toBeTruthy();
  });

  test('captures character state change and character ids', async () => {
    const service = new MemoryService();
    const projectId = new Types.ObjectId();
    const chapterId = new Types.ObjectId();
    const characterId = new Types.ObjectId();

    await service.syncMemory({
      projectId,
      chapterId,
      chapterLabel: '第三章',
      items: [
        {
          key: '角色·林雪·状态',
          type: 'world',
          content: '林雪被任命为先锋队长，士气显著提升。',
          characterIds: [characterId.toString()],
          characterStateChange: '升任先锋队长，士气提升',
          weight: 0.7,
          refs: [{ chapterId: chapterId.toString(), label: '第三章' }],
        },
      ],
      source: 'unit-test',
    });

    const stored = await MemoryModel.findOne({ project: projectId, key: '角色·林雪·状态' });
    expect(stored).toBeTruthy();
    expect(stored!.characterIds.map((id) => id.toString())).toContain(characterId.toString());
    expect(stored!.characterStateChange).toContain('升任先锋队长');
    expect(stored!.conflict).toBe(false);
  });
});
