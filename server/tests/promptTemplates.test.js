const { buildChapterPrompt, buildChapterMetaPrompt } = require('../src/utils/promptTemplates');
const { chapterMetaSchema } = require('../src/validators/chapterMeta');

describe('prompt templates', () => {
  const sampleMeta = {
    outline: {
      title: '裂隙中的火光',
      summary: '反抗者潜入外环，寻找通向城内的密道并确认内应。',
      beats: [
        {
          order: 1,
          title: '夜幕潜行',
          summary: '借助停电潜入城市外墙并观察守卫巡逻路线。',
          focus: '潜行',
          mustInclude: ['记录巡逻间隔'],
        },
        {
          order: 2,
          title: '暗巷失手',
          summary: '小队暴露，必须脱身并保护关键情报。',
          avoid: ['不要彻底解决守卫的威胁'],
        },
        {
          order: 3,
          title: '密室约定',
          summary: '与内应完成接头，约定下一步的暗号与计划。',
          mustInclude: ['内应递交伪装通行证'],
        },
      ],
      tabooNotes: ['绝不暴露叛军总部所在地'],
      thematicHooks: ['信任与背叛'],
    },
    scenes: [
      { order: 1, title: '外墙暗影', objective: '侦查巡逻节奏并绘制草图', beatRef: 1 },
      { order: 2, title: '巷道冲突', objective: '脱身并掩护同伴撤离', conflict: '守卫封锁', beatRef: 2 },
      { order: 3, title: '地窖密会', objective: '从内应处获得通行证并确认行动窗口', beatRef: 3 },
    ],
    closingStrategy: '给出阶段性成果并留下更大威胁的暗示，为下一章埋下悬念。',
    tonalShift: '从压抑逐渐转向振奋',
    continuityChecklist: ['保持上一章留下的密信伏笔', '不得解决最终反攻计划'],
    targetLength: { unit: 'characters', ideal: 1800, min: 1400, max: 2200 },
  };

  const sampleOptions = {
    projectTitle: '星火纪事',
    synopsis: '在封锁的空港城中，反抗者策划推翻殖民政府。',
    outlineNode: {
      id: 'node-1',
      title: '渗透外环',
      summary: '主角小队潜入外环准备打开城门。',
      beats: [
        { order: 1, title: '潜行', summary: '利用暴雨做掩护潜入外环。' },
        { order: 2, title: '脱身', summary: '冲破突然出现的巡逻。' },
        { order: 3, title: '接头', summary: '与内应会合。' },
      ],
    },
    additionalOutline: [
      {
        id: 'node-2',
        title: '城内回声',
        summary: '城内反抗者正等待信号。',
        beats: [{ order: 1, title: '信号', summary: '等待外环消息。' }],
      },
    ],
    memoryFragments: [
      { label: '旧协议', content: '白鹭即暗号必须保密。', type: 'fact' },
      { label: '禁忌', content: '禁止提及叛军总部具体位置。', type: 'taboo' },
    ],
    characters: [
      {
        id: 'c1',
        name: '陆归',
        role: '前空军导航员',
        background: '曾在帝国空军服役，熟悉城防体系。',
        goals: '解放城内家人',
        conflicts: '对指挥官信任动摇',
      },
    ],
    styleProfile: {
      tone: '肃穆紧张',
      pacing: 'slow burn',
      diction: '凝练而富有画面感',
      authors: ['刘慈欣'],
      styleStrength: 0.9,
    },
    chapterMeta: sampleMeta,
  };

  test('buildChapterPrompt structures sections and tunes parameters', () => {
    const payload = buildChapterPrompt({
      ...sampleOptions,
      targetLength: { unit: 'characters', value: 2000 },
    });

    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages[1].content).toContain('【角色定位】');
    expect(payload.messages[1].content).toContain('【风格控制】');
    expect(payload.messages[1].content).toContain('【输出要求】');
    expect(payload.messages[1].content.indexOf('【角色定位】')).toBeLessThan(payload.messages[1].content.indexOf('【风格控制】'));
    expect(payload.temperature).toBeCloseTo(0.48, 2);
    expect(payload.topP).toBeCloseTo(0.78, 2);
    expect(payload.presencePenalty).toBeCloseTo(0.12, 2);
  });

  test('buildChapterPrompt injects continuation safeguards', () => {
    const payload = buildChapterPrompt({
      ...sampleOptions,
      continuation: true,
      previousSummary: '上一章，反抗者刚刚偷得守卫密码。',
      targetLength: { unit: 'paragraphs', value: 8 },
    });

    expect(payload.messages[1].content).toContain('不得自相矛盾');
    expect(payload.messages[1].content).toContain('不得跳回');
  });

  test('buildChapterMetaPrompt provides fallback instructions', () => {
    const metaPrompt = buildChapterMetaPrompt({
      projectTitle: '星火纪事',
      synopsis: '反抗者计划攻入空港城。',
      fallbackLevel: 2,
    });

    const userContent = metaPrompt.messages[1].content;
    expect(userContent).toContain('回退模式');
    expect(userContent).toContain('深度回退');
  });

  test('chapterMetaSchema validates structured meta output', () => {
    expect(() => chapterMetaSchema.parse(sampleMeta)).not.toThrow();

    const invalidMeta = {
      outline: {
        title: '缺少节拍',
        summary: '没有提供有效节拍列表',
        beats: [],
      },
      scenes: [],
      closingStrategy: '随意收尾',
    };

    expect(() => chapterMetaSchema.parse(invalidMeta)).toThrow();
  });
});
