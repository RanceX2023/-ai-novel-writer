import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import ChapterModel, { Chapter } from '../models/Chapter';
import PlotArcModel, { PlotArc } from '../models/PlotArc';
import PlotPointModel, { PlotPoint } from '../models/PlotPoint';
import ProjectModel from '../models/Project';
import ApiError from '../utils/ApiError';
import OpenAIService from './openai';
import type { PlotSuggestionInput } from '../validators/plot';

export interface PlotSuggestionResult {
  id: string;
  title: string;
  description: string;
  tension: number;
  beatType?: string | null;
  arcId?: string | null;
  arcName?: string | null;
  chapterId?: string | null;
  chapterTitle?: string | null;
}

interface SerialisedArc extends PlotArc {
  _id: Types.ObjectId;
}

interface SerialisedPoint extends PlotPoint {
  _id: Types.ObjectId;
}

class PlotService {
  private openAI: OpenAIService;

  constructor(openAIService?: OpenAIService) {
    this.openAI = openAIService ?? new OpenAIService();
  }

  async generateSuggestions(projectId: string, input: PlotSuggestionInput): Promise<PlotSuggestionResult[]> {
    const project = await ProjectModel.findById(projectId).lean();
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const [arcs, points, chapters] = await Promise.all([
      PlotArcModel.find({ project: projectId }).sort({ order: 1, createdAt: 1 }).lean<SerialisedArc[]>(),
      PlotPointModel.find({ project: projectId }).sort({ order: 1, createdAt: 1 }).lean<SerialisedPoint[]>(),
      ChapterModel.find({ project: projectId })
        .sort({ order: 1, createdAt: 1 })
        .lean<Array<Chapter & { _id: Types.ObjectId }>>(),
    ]);

    if (arcs.length === 0) {
      throw new ApiError(400, 'No plot arcs defined for this project');
    }

    const focusArc = input.arcId
      ? arcs.find((arc) => arc._id.toString() === input.arcId)
      : arcs[0];
    const focusChapter = input.chapterId
      ? chapters.find((chapter) => chapter._id.toString() === input.chapterId)
      : null;

    const relevantPoints = points
      .filter((point) => {
        if (focusArc && point.arc.toString() !== focusArc._id.toString()) {
          return false;
        }
        if (focusChapter && point.chapter?.toString() !== focusChapter._id.toString()) {
          return false;
        }
        return true;
      })
      .slice(-8);

    const arcSummary = arcs
      .map((arc) => {
        const arcPoints = points.filter((point) => point.arc.toString() === arc._id.toString());
        const highlight = arcPoints
          .slice(0, 3)
          .map((point) => `- ${point.title}: ${point.description ?? '暂无描述'}`)
          .join('\n');
        return [
          `【${arc.title}】`,
          arc.summary ? `简介：${arc.summary}` : '简介：暂无',
          arc.goal ? `目标：${arc.goal}` : '目标：暂无',
          arc.themes?.length ? `主题：${arc.themes.join('、')}` : '主题：未设定',
          highlight ? `关键节点：\n${highlight}` : '关键节点：暂无',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    const chapterSummary = chapters
      .map((chapter) => {
        const orderLabel = chapter.order ? `第 ${chapter.order} 章` : '未排序';
        return `${orderLabel}《${chapter.title}》`;
      })
      .join('\n');

    const pointDigest = relevantPoints
      .map((point) => {
        const chapterId = point.chapter ? point.chapter.toString() : null;
        const belongingChapter = chapterId
          ? chapters.find((chapter) => chapter._id.toString() === chapterId)
          : null;
        const chapterLabel = belongingChapter ? `章节：${belongingChapter.title}` : '章节：待定';
        return [
          `• ${point.title}`,
          chapterLabel,
          `情感张力：${Math.round(point.tension ?? 5)}/10`,
          point.description ? `梗概：${point.description}` : null,
          point.beatType ? `节点类型：${point.beatType}` : null,
        ]
          .filter(Boolean)
          .join('，');
      })
      .join('\n');

    const count = input.count ?? 3;
    const tone = input.tone ? `目标语气：${input.tone}` : '语气：延续既有章节风格';
    const theme = input.theme ? `主题偏好：${input.theme}` : '主题偏好：保持与作品一致';
    const focusLine = focusArc ? `重点剧情线：${focusArc.title}` : '重点剧情线：自由发挥';
    const chapterFocusLine = focusChapter
      ? `聚焦章节：${focusChapter.order ? `第 ${focusChapter.order} 章` : '未排序章节'}《${focusChapter.title}》`
      : '聚焦章节：尚未指定';

    const userPrompt = [
      `项目名称：《${project.name}》`,
      project.synopsis ? `故事梗概：${project.synopsis}` : '故事梗概：暂无',
      '',
      focusLine,
      chapterFocusLine,
      tone,
      theme,
      '',
      '现有剧情线概览：',
      arcSummary || '暂无剧情线',
      '',
      '相关已设定剧情节点：',
      pointDigest || '暂无关键节点，请从章节简介中推断新的剧情进展。',
      '',
      '章节列表：',
      chapterSummary || '暂无章节',
      '',
      `请基于上述信息，输出 ${count} 条新的剧情节点建议，使用 JSON 对象格式：`,
      '{',
      '  "suggestions": [',
      '    {',
      '      "title": "一句短标题",',
      '      "description": "80-120字的剧情描述",',
      '      "arc": "建议归属的剧情线标题",',
      '      "chapter": "建议落在的章节标题，可为空",',
      '      "tension": 0-10之间的数字,',
      '      "beatType": "节点类型，如转折、高潮、伏笔等"',
      '    }',
      '  ]',
      '}',
      '',
      '约束：',
      '- 保持与作品现有基调一致；',
      '- 避免与现有节点重复；',
      '- 多样化情节（伏笔、冲突、转折、情感推进等）；',
      '- 尽量为指定剧情线或章节提供可落地的事件；',
      '- 关注情感张力的起伏，合理分布高低起伏。',
    ].join('\n');

    const completion = await this.openAI.completeChat({
      model: process.env.OPENAI_PLOT_MODEL,
      temperature: 0.6,
      responseFormat: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是一位擅长长篇小说结构设计的中文剧情编辑，需要根据现有章节与剧情线生成新的剧情节点建议。'
            + ' 输出必须是 JSON 对象，确保标题与描述凝练、具有推动剧情的价值。',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      metadata: {
        type: 'plot_suggestion',
        projectId,
        arcId: focusArc?._id.toString(),
        chapterId: focusChapter?._id.toString(),
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.content || '{}');
    } catch (error) {
      throw new ApiError(502, 'Failed to parse AI suggestion response');
    }

    const suggestionItems = Array.isArray((parsed as { suggestions?: unknown }).suggestions)
      ? ((parsed as { suggestions: unknown[] }).suggestions)
      : [];

    if (suggestionItems.length === 0) {
      throw new ApiError(502, 'AI plot suggestion response did not include suggestions');
    }

    const results = suggestionItems.slice(0, count).map((item) => this.normaliseSuggestion(item, arcs, chapters));

    return results;
  }

  private normaliseSuggestion(
    input: unknown,
    arcs: SerialisedArc[],
    chapters: Array<{ _id: Types.ObjectId; title: string; order?: number | null }>
  ): PlotSuggestionResult {
    const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    const rawTitle = typeof record.title === 'string' ? record.title : '未命名剧情节点';
    const rawDescription = typeof record.description === 'string' ? record.description : '请完善剧情描述。';
    const rawArc = typeof record.arc === 'string' ? record.arc : undefined;
    const rawChapter = typeof record.chapter === 'string' ? record.chapter : undefined;
    const rawBeatType = typeof record.beatType === 'string' ? record.beatType : undefined;
    const tensionValue = typeof record.tension === 'number' ? record.tension : Number(record.tension);
    const clampedTension = Number.isFinite(tensionValue)
      ? Math.min(Math.max(Number(tensionValue), 0), 10)
      : 5;

    const matchedArc = rawArc
      ? arcs.find((arc) => arc.title.localeCompare(rawArc, 'zh-CN', { sensitivity: 'base' }) === 0)
      : undefined;
    const matchedChapter = rawChapter
      ? chapters.find((chapter) => chapter.title.localeCompare(rawChapter, 'zh-CN', { sensitivity: 'base' }) === 0)
      : undefined;

    return {
      id: randomUUID(),
      title: rawTitle.trim() || '未命名剧情节点',
      description: rawDescription.trim() || '请完善剧情描述。',
      beatType: rawBeatType?.trim() || null,
      tension: clampedTension,
      arcId: matchedArc?._id.toString() ?? null,
      arcName: matchedArc?.title ?? rawArc ?? null,
      chapterId: matchedChapter?._id.toString() ?? null,
      chapterTitle: matchedChapter?.title ?? rawChapter ?? null,
    };
  }
}

export default PlotService;
