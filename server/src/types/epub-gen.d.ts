declare module 'epub-gen' {
  import { Writable } from 'stream';

  export interface EpubContent {
    title: string;
    data: string;
    author?: string;
    filename?: string;
    beforeToc?: boolean;
    excludeFromToc?: boolean;
  }

  export interface EpubOptions {
    title: string;
    author?: string | string[];
    publisher?: string;
    description?: string;
    cover?: string;
    lang?: string;
    tocTitle?: string;
    appendChapterTitles?: boolean;
    content: EpubContent[];
    css?: string;
    customHtmlTemplatePath?: string;
    customOpfTemplatePath?: string;
  }

  export default class Epub {
    constructor(options: EpubOptions, output?: string | Writable);
    promise: Promise<void>;
  }
}
