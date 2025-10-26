import { Types } from 'mongoose';
import OutlineService from '../../src/services/outlineService';
import ProjectModel from '../../src/models/Project';
import OutlineNodeModel from '../../src/models/OutlineNode';
import type { ChatCompletionOptions, ChatCompletionResultData } from '../../src/services/openai';

const mongo = require('../helpers/mongo');

class StubOpenAIService {
  public calls: ChatCompletionOptions[] = [];

  private readonly response: string;

  constructor(response: string) {
    this.response = response;
  }

  async completeChat(options: ChatCompletionOptions): Promise<ChatCompletionResultData> {
    this.calls.push(options);
    return {
      content: this.response,
      usage: undefined,
      model: options.model ?? 'gpt-4o-mini',
      keyDocId: new Types.ObjectId(),
      requestId: 'req-outline-test',
    };
  }
}

describe('OutlineService', () => {
  beforeAll(async () => {
    await mongo.connect();
  });

  afterEach(async () => {
    await mongo.clearDatabase();
  });

  afterAll(async () => {
    await mongo.disconnect();
  });

  it('生成大纲时会写入树形节点并覆盖旧数据', async () => {
    const project = await ProjectModel.create({
      name: '测试大纲项目',
      synopsis: '这是项目简介。',
      styleProfile: {
        tone: '紧张',
        language: '中文',
      },
    });

    await OutlineNodeModel.create({
      project: project._id,
      nodeId: 'legacy-node',
      parentId: null,
      order: 0,
      title: '旧节点',
      summary: '需要被覆盖的旧节点',
    });

    const aiResponse = {
      outlineTitle: '星火之城',
      structure: 'three_act',
      acts: [
        {
          id: 'act-1',
          title: '第一幕：黑夜将临',
          summary: '描述危机的萌芽与主要角色。',
          status: 'draft',
          tags: ['开端'],
          chapters: [
            {
              id: 'chapter-1',
              title: '第一章：暗影降临',
              summary: '主角感知到异常与威胁。',
              status: 'draft',
              targetLength: 1500,
              tags: ['主线'],
              beats: [
                {
                  id: 'beat-1',
                  title: '异象乍现',
                  summary: '天空裂开赤焰，城市陷入恐慌。',
                  focus: '悬念',
                },
                {
                  id: 'beat-2',
                  title: '踏上征途',
                  summary: '主角决定追查异象的源头。',
                  outcome: '旅程正式开启',
                },
              ],
            },
          ],
        },
      ],
      notes: ['确保世界观细节贯穿章节。'],
    };

    const stub = new StubOpenAIService(JSON.stringify(aiResponse));
    const service = new OutlineService({ openAIService: stub as unknown as any });

    const outline = await service.generateOutline(project._id.toString(), {
      actStructure: 'three_act',
      chapterCount: 6,
      targetChapterLength: 1800,
      styleStrength: 0.75,
    });

    expect(outline).toHaveLength(1);
    expect(outline[0].title).toBe('第一幕：黑夜将临');
    expect(outline[0].children).toHaveLength(1);
    const chapterNode = outline[0].children[0];
    expect(chapterNode.title).toBe('第一章：暗影降临');
    expect(chapterNode.beats).toHaveLength(2);
    const chapterMeta = chapterNode.meta as { targetLength?: number | null } | null;
    expect(chapterMeta?.targetLength).toBe(1500);

    const storedNodes = await OutlineNodeModel.find({ project: project._id }).sort({ order: 1 }).lean();
    expect(storedNodes).toHaveLength(2);
    expect(storedNodes.map((node) => node.nodeId)).not.toContain('legacy-node');

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].responseFormat).toEqual({ type: 'json_object' });
  });

  it('可以修复轻微的 JSON 语法错误', async () => {
    const project = await ProjectModel.create({ name: 'JSON 修复项目' });

    const brokenResponse = `
    {
      "structure": "three_act",
      "acts": [
        {
          "title": "第一幕：风暴前夜",
          "summary": "冲突酝酿，角色逐渐登场。",
          "chapters": [
            {
              "title": "第一章：征兆",
              "summary": "主角察觉到世界的异常。",
              "beats": [
                {
                  "summary": "天空中出现不自然的闪电",
                }
              ]
            }
          ]
        }
      ]
    }
    `;

    const stub = new StubOpenAIService(brokenResponse);
    const service = new OutlineService({ openAIService: stub as unknown as any });

    const outline = await service.generateOutline(project._id.toString(), {
      actStructure: 'three_act',
      chapterCount: 3,
      targetChapterLength: 1200,
    });

    expect(outline).toHaveLength(1);
    expect(outline[0].children).toHaveLength(1);
    expect(outline[0].children[0].beats).toHaveLength(1);
  });

  it('在 AI 输出结构不符合预期时抛出业务错误', async () => {
    const project = await ProjectModel.create({ name: '异常输出项目' });

    const stub = new StubOpenAIService('{"outlineTitle":"无效大纲"}');
    const service = new OutlineService({ openAIService: stub as unknown as any });

    await expect(
      service.generateOutline(project._id.toString(), {
        actStructure: 'three_act',
        chapterCount: 3,
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      message: 'AI 返回内容结构不符合预期',
    });

    const count = await OutlineNodeModel.countDocuments({ project: project._id });
    expect(count).toBe(0);
  });
});
