import { PassThrough } from 'stream';
import { Types } from 'mongoose';
import JSZip from 'jszip';
import ExportService from '../../src/services/exportService';
import ProjectModel from '../../src/models/Project';
import ChapterModel from '../../src/models/Chapter';
import { connect, disconnect, clearDatabase } from '../helpers/mongo';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('ExportService', () => {
  const service = new ExportService();

  beforeAll(async () => {
    await connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnect();
  });

  test('creates markdown archive with frontmatter and metadata', async () => {
    const project = await ProjectModel.create({
      name: '测试项目',
      synopsis: '这是一个导出测试。',
      styleProfile: { language: '中文', authors: ['雨果'] },
    });

    await ChapterModel.create({
      project: project._id,
      title: '第一章 测试',
      content: '这是第一章的内容。',
      order: 1,
    });

    await ChapterModel.create({
      project: project._id,
      title: '第二章',
      content: '第二章内容。',
      order: 2,
    });

    const prepared = await service.prepareData(new Types.ObjectId(project._id), undefined);
    const { archive } = service.createMarkdownArchive(prepared);

    const stream = new PassThrough();
    const zipPromise = streamToBuffer(stream);
    archive.pipe(stream);
    await archive.finalize();
    const zipBuffer = await zipPromise;

    const zip = await JSZip.loadAsync(zipBuffer);
    const indexContent = await zip.file('index.md')!.async('string');
    expect(indexContent).toContain('title: "测试项目"');
    expect(indexContent).toContain('chapterCount: 2');
    expect(indexContent).toContain('## 目录');
    expect(indexContent).toMatch(/\[第一章 测试\]\(chapters\//);

    const metaContent = await zip.file('meta.json')!.async('string');
    const meta = JSON.parse(metaContent) as {
      project: { name: string; authors: string[] };
      chapters: Array<{ title: string; file: string }>;
    };
    expect(meta.project.name).toBe('测试项目');
    expect(meta.project.authors).toContain('雨果');
    expect(meta.chapters).toHaveLength(2);

    const chapterFiles = Object.keys(zip.files).filter((fileName) => fileName.startsWith('chapters/') && fileName.endsWith('.md'));
    expect(chapterFiles).toHaveLength(2);
    const chapterContent = await zip.file(chapterFiles[0])!.async('string');
    expect(chapterContent.startsWith('---')).toBe(true);
    expect(chapterContent).toContain('tags: []');
  });

  test('creates epub stream with metadata and chapters', async () => {
    const project = await ProjectModel.create({
      name: 'EPUB 项目',
      synopsis: '导出 EPUB 测试',
      styleProfile: { language: 'zh-CN', authors: ['无名氏'] },
    });

    await ChapterModel.create({
      project: project._id,
      title: '序章',
      content: '序章内容。\n换行测试。',
      order: 1,
    });

    const prepared = await service.prepareData(new Types.ObjectId(project._id), undefined);
    const { stream, promise } = service.createEpubStream(prepared);

    const epubBufferPromise = streamToBuffer(stream);
    await promise;
    const epubBuffer = await epubBufferPromise;

    const zip = await JSZip.loadAsync(epubBuffer);
    const mimeType = await zip.file('mimetype')!.async('string');
    expect(mimeType).toBe('application/epub+zip');

    const contentOpf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(contentOpf).toContain('<dc:title>EPUB 项目</dc:title>');
    expect(contentOpf).toContain('<dc:language>zh-CN</dc:language>');

    const chapterEntry = Object.keys(zip.files).find((fileName) => fileName.startsWith('OEBPS') && fileName.endsWith('.xhtml') && fileName.includes('chapter-1'));
    expect(chapterEntry).toBeDefined();
    const chapterXhtml = await zip.file(chapterEntry!)!.async('string');
    expect(chapterXhtml).toContain('序章内容。');
    expect(chapterXhtml).toContain('<br />');
  });
});
