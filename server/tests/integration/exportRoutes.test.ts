import request from 'supertest';
import JSZip from 'jszip';
import { app } from '../../src/app';
import ProjectModel from '../../src/models/Project';
import ChapterModel from '../../src/models/Chapter';
import { connect, disconnect, clearDatabase } from '../helpers/mongo';

function binaryParser(res: request.Response, callback: (err: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error) => callback(error));
}

describe('GET /api/projects/:id/export', () => {
  beforeAll(async () => {
    await connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnect();
  });

  test('returns markdown zip containing index and chapters', async () => {
    const project = await ProjectModel.create({
      name: '导出项目',
      synopsis: '导出接口集成测试',
      styleProfile: { language: 'zh-CN', authors: ['玖拾'] },
    });

    const chapterA = await ChapterModel.create({
      project: project._id,
      title: '开篇',
      content: '第一章内容。',
      order: 1,
    });

    await ChapterModel.create({
      project: project._id,
      title: '第二章',
      content: '第二章更多内容。',
      order: 2,
    });

    const response = await request(app)
      .get(`/api/projects/${project._id.toString()}/export`)
      .query({ format: 'md' })
      .buffer(true)
      .parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['x-export-format']).toBe('md');
    expect(response.headers['x-export-range']).toBe('all');
    expect(response.headers['x-export-chapter-count']).toBe('2');

    const zip = await JSZip.loadAsync(response.body as Buffer);
    expect(zip.file('index.md')).toBeDefined();
    expect(zip.file('meta.json')).toBeDefined();

    const meta = JSON.parse(await zip.file('meta.json')!.async('string')) as {
      range: string;
      chapters: Array<{ id: string; file: string }>;
    };
    expect(meta.range).toBe('all');
    expect(meta.chapters).toHaveLength(2);

    const chapterFiles = meta.chapters.map((item) => item.file);
    expect(chapterFiles[0]).toMatch(/^chapters\//);
    const firstChapter = await zip.file(chapterFiles[0])!.async('string');
    expect(firstChapter).toContain('title: "开篇"');
  });

  test('returns epub file for selected chapters', async () => {
    const project = await ProjectModel.create({
      name: 'EPUB 集成',
      synopsis: 'EPUB 导出测试',
      styleProfile: { language: '中文', authors: ['作者甲'] },
    });

    const chapter = await ChapterModel.create({
      project: project._id,
      title: '选定章节',
      content: '只导出这个章节。',
      order: 5,
    });

    await ChapterModel.create({
      project: project._id,
      title: '忽略章节',
      content: '不应出现在导出中。',
      order: 6,
    });

    const response = await request(app)
      .get(`/api/projects/${project._id.toString()}/export`)
      .query({ format: 'epub', range: 'selected', chapters: chapter._id.toString() })
      .buffer(true)
      .parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/epub+zip');
    expect(response.headers['x-export-format']).toBe('epub');
    expect(response.headers['x-export-range']).toBe('partial');
    expect(response.headers['x-export-chapter-count']).toBe('1');

    const zip = await JSZip.loadAsync(response.body as Buffer);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>EPUB 集成</dc:title>');

    const manifest = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(manifest).toContain('选定章节');
    expect(manifest).not.toContain('忽略章节');
  });
});
