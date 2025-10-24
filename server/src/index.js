const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 4000;

let chapters = [];

const sanitizeText = (value) =>
  typeof value === 'string' ? value.trim() : '';

const createMockSegments = ({
  title,
  memory,
  outline,
  tone,
  viewpoint,
  keywords,
  targetLength,
}) => {
  const safeTitle = title || '未命名章节';
  const memoryPoints = sanitizeText(memory)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const outlinePoints = sanitizeText(outline)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const keywordList = sanitizeText(keywords)
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const intro = `《${safeTitle}》以${tone || '细腻叙事'}的笔触，从${viewpoint || '第三人称'}展开，目标篇幅约 ${
    targetLength || 800
  } 字。`;

  const memorySentence = memoryPoints.length
    ? `记忆提示：${memoryPoints.join('；')}。`
    : '记忆提示：暂无特别强调的信息，人物与背景将根据本章节奏自然显现。';

  const keywordSentence = keywordList.length
    ? `关键词引导：${keywordList.join('、')}，它们将成为本章情绪与意象的核心。`
    : '本章关键词尚未设定，系统将根据大纲自动提炼。';

  const outlineParagraphs = outlinePoints.map((point, index) => {
    const cleaned = point.replace(/^[-•*\d\s.]+/, '').trim();
    return `情节节点 ${index + 1}：${cleaned || point}。作者视角提示：在这一段中保持 ${
      tone || '均衡'
    } 的节奏，让读者沉浸于细节之中。`;
  });

  const narrativeBase = outlinePoints.length
    ? '根据以上大纲，正文片段逐段成型：'
    : '正文片段将在生成过程中自主延展情节：';

  const narrativeParagraphs = outlinePoints.length
    ? outlinePoints.map((point, index) => {
        const cleaned = point.replace(/^[-•*\d\s.]+/, '').trim();
        return `第 ${index + 1} 段：${cleaned || point}。人物的动作、对话与内心将在此段展开，镜头语言保持 ${
          tone || '细腻'
        } 的质感。`;
      })
    : [
        '在没有明确大纲的情况下，系统会从角色动机与既有记忆中推演冲突，确保章节具备吸引力。',
        '场景推进过程中，将适当插入环境描写与人物心理描写，以保持叙事张力。',
      ];

  const closing = '以上为章节草稿示例，可在生成完成后继续润色与扩写。';

  return [
    intro,
    memorySentence,
    keywordSentence,
    ...outlineParagraphs,
    narrativeBase,
    ...narrativeParagraphs,
    closing,
  ];
};

const chunkText = (text, size = 40) => {
  const result = [];
  let index = 0;
  while (index < text.length) {
    result.push(text.slice(index, index + size));
    index += size;
  }
  return result;
};

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/chapters', (_req, res) => {
  res.json({ chapters });
});

app.post('/api/chapters', (req, res) => {
  const { title, content, memory, outline, parameters } = req.body || {};

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).send('章节内容不能为空');
  }

  const chapter = {
    id: nanoid(),
    title: sanitizeText(title) || `章节草稿 ${new Date().toLocaleString('zh-CN')}`,
    content: content,
    memory: sanitizeText(memory),
    outline: sanitizeText(outline),
    parameters: parameters && typeof parameters === 'object' ? parameters : {},
    createdAt: new Date().toISOString(),
  };

  chapters = [chapter, ...chapters];

  res.status(201).json({ chapter });
});

app.post('/api/chapters/generate', (req, res) => {
  const {
    title = '',
    memory = '',
    outline = '',
    tone = '沉浸式叙事',
    viewpoint = '第三人称全知视角',
    keywords = '',
    targetLength = 800,
  } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const segments = createMockSegments({
    title,
    memory,
    outline,
    tone,
    viewpoint,
    keywords,
    targetLength,
  });

  const tokens = segments
    .map((segment) => chunkText(segment, 36))
    .flat();

  let index = 0;

  const sendNext = () => {
    if (index >= tokens.length) {
      res.write('data: {"done": true}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      clearInterval(intervalId);
      return;
    }

    const payload = JSON.stringify({ token: tokens[index], done: false });
    res.write(`data: ${payload}\n\n`);
    index += 1;
  };

  const intervalId = setInterval(sendNext, 180);
  sendNext();

  req.on('close', () => {
    clearInterval(intervalId);
  });
});

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('服务器内部错误:', err);
  res.status(500).send('服务器内部错误');
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`AI 小说创作服务已启动，端口：${PORT}`);
});
