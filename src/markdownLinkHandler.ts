import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from './config';
import dayjs = require('dayjs'); //新增导入 dayjs

//Strategy Pattern for Title Generation
interface TitleGenerationStrategy {
   /**
    * Generates a title.
    * @param text The primary text content to base the title on.
    * @param noteUri Optional URI of the note, primarily for filename-based strategy.
    * @returns A promise that resolves to the generated title string or null if generation fails.
    */
   generateTitle(text: string, noteUri?: vscode.Uri): Promise<string | null>;
}

//新增 InvalidLinkInfo 接口
interface InvalidLinkInfo {
   linkText: string;
   linkPath: string;
   linkPathRange: vscode.Range; //Range for linkPath
   linkTextRange: vscode.Range; //Range for linkText
   reason: 'startsWithSlash' | 'containsDotDotSlash';
}

class LlmTitleStrategy implements TitleGenerationStrategy {
   private static readonly LLM_TIMEOUT = 3000; //3 seconds timeout

   public async generateTitle(text: string): Promise<string | null> {
      //TODO
      return null;
      //if (!text) return null;
      //console.log('LlmTitleStrategy: Attempting to generate title with LLM...');
      //try {
      ////Simulate LLM call with timeout
      //const llmPromise = LlmTitleStrategy._generateTitleWithLLMInternal(text);
      //const timeoutPromise = new Promise<null>((resolve) => {
      //setTimeout(() => {
      //console.log('LlmTitleStrategy: LLM title generation timed out.');
      //resolve(null);
      //}, LlmTitleStrategy.LLM_TIMEOUT);
      //});

      //const result = await Promise.race([llmPromise, timeoutPromise]);

      //if (result && typeof result === 'string' && result.trim()) {
      //const finalTitle = result.trim();
      //console.log(`LlmTitleStrategy: LLM successfully generated title: "${finalTitle}"`);
      //return finalTitle;
      //}
      //console.log('LlmTitleStrategy: LLM did not return a valid title.');
      //return null;
      //} catch (error) {
      //console.error('LlmTitleStrategy: Error during LLM title generation:', error);
      //return null;
      //}
   }

   private static async _generateTitleWithLLMInternal(text: string): Promise<string | null> {
      //This is the placeholder for the actual LLM call
      //Simulate processing delay
      const processingTime = 1000 + Math.random() * 2000; //1-3 seconds
      await new Promise(resolve => setTimeout(resolve, processingTime));

      if (text.toLowerCase().includes('重要')) {
         return '重要笔记 (LLM)';
      }
      //Simulate LLM not finding a specific title
      return null;
   }
}

class FilenameTitleStrategy implements TitleGenerationStrategy {
   public async generateTitle(text: string, noteUri?: vscode.Uri): Promise<string | null> {
      if (noteUri) {
         const filename = path.basename(noteUri.fsPath);
         //Remove extension to get the title
         const title = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
         if (title) {
            console.log(`FilenameTitleStrategy: Generated title from filename: "${title}"`);
            return title;
         }
      }
      console.warn('FilenameTitleStrategy: noteUri not provided or filename is empty, cannot generate title.');
      return null;
   }
}

class FirstCharsTitleStrategy implements TitleGenerationStrategy {
   private readonly charCount: number;

   constructor(charCount: number = 10) {
      this.charCount = charCount;
   }

   public async generateTitle(text: string): Promise<string | null> {
      if (!text) {
         return null;
      }

      const lines = text.split('\n');
      let title = '';

      if (lines.length > 0 && lines[0].trim()) {
         //如果第一行有内容，用第一行的前 charCount 字符
         title = lines[0].substring(0, this.charCount).trim();
      } else {
         //如果第一行没有内容，删除开头的换行符，然后取前 charCount 字符
         const textWithoutLeadingNewlines = text.replace(/^\n+/, '');
         title = textWithoutLeadingNewlines.substring(0, this.charCount).trim();
      }

      if (title) {
         return title;
      }
      return null;
   }
}

//新增 DateTimeTitleStrategy
export class DateTimeTitleStrategy implements TitleGenerationStrategy {
   public async generateTitle(): Promise<string> {
      const title = dayjs().format('YYYYMMDD-HHmmss');
      return title;
   }
}

export class MarkdownLinkHandler {
   private static instance: MarkdownLinkHandler; //添加静态实例变量
   private config: Config;
   private disposables: vscode.Disposable[] = [];

   private constructor() { //构造函数设为私有
      this.config = Config.getInstance();
      this._initialize(); //调用私有初始化方法
   }

   public static getInstance(): MarkdownLinkHandler { //添加静态 getInstance 方法
      if (!MarkdownLinkHandler.instance) {
         MarkdownLinkHandler.instance = new MarkdownLinkHandler();
      }
      return MarkdownLinkHandler.instance;
   }

   private _initialize() { //将 initialize 重命名并设为私有
      //注册 Markdown 预览的链接点击处理器
      this.disposables.push(
         vscode.workspace.registerTextDocumentContentProvider('markdown', {
            provideTextDocumentContent: (uri: vscode.Uri) => {
               return this.handleLinkClick(uri);
            }
         })
      );

      //注册命令来处理链接点击
      this.disposables.push(
         vscode.commands.registerCommand('daily-order.openMarkdownLink', (link: string) => {
            this.openLink(link);
         })
      );

      //注册 Markdown 链接点击处理器
      this.disposables.push(
         vscode.languages.registerDocumentLinkProvider(
            { language: 'markdown' },
            {
               provideDocumentLinks: (document: vscode.TextDocument) => {
                  return this.findLinks(document);
               },
               resolveDocumentLink: (link: vscode.DocumentLink) => {
                  return this.resolveLink(link);
               }
            }
         )
      );
   }

   private findLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
      const links: vscode.DocumentLink[] = [];
      const text = document.getText();
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;

      while ((match = linkRegex.exec(text)) !== null) {
         const linkText = match[1];
         const linkPath = match[2];
         const startPos = document.positionAt(match.index + match[0].indexOf('(') + 1);
         const endPos = document.positionAt(match.index + match[0].indexOf(')'));

         //跳过网络链接和锚点链接
         if (
            linkPath.startsWith('http://') ||
            linkPath.startsWith('https://') ||
            linkPath.startsWith('mailto:') ||
            linkPath.startsWith('vscode://') ||
            linkPath.startsWith('#') ||
            !linkPath.endsWith('md')
         ) { continue; }

         const link = new vscode.DocumentLink(
            new vscode.Range(startPos, endPos),
            vscode.Uri.parse(`command:daily-order.openMarkdownLink?${encodeURIComponent(JSON.stringify(linkPath))}`)
         );
         links.push(link);
      }

      return links;
   }

   private resolveLink(link: vscode.DocumentLink): vscode.DocumentLink {
      return link;
   }

   private async handleLinkClick(uri: vscode.Uri): Promise<string> {
      //这里可以添加自定义的 Markdown 渲染逻辑
      return '';
   }

   private async openLink(link: string) {
      if (!this.config.notesDir) {
         vscode.window.showErrorMessage('请先设置笔记目录');
         return;
      }

      const targetPath = path.resolve(this.config.notesDir.path, link);
      const targetUri = vscode.Uri.file(targetPath);
      await vscode.commands.executeCommand('daily-order.noteExplorer.openFile', targetUri);
   }

   /**
    * Generates display text for a Markdown link based on the input text using a strategy-based approach.
    * Current fallback sequence: LLM -> First 10 Chars -> DateTime -> Default Title.
    * The Filename strategy is defined but not used in this specific sequence for new notes from selection,
    * as the new note's URI is not yet available.
    * @param text The source text (e.g., selected text) to generate a title from.
    * @returns A promise that resolves to the link text (not sanitized here).
    */
   public async generateLinkTextForNote(text: string): Promise<string> {
      const defaultTitle = '无标题笔记';
      let title: string | null = null;

      const strategies: TitleGenerationStrategy[] = [
         new LlmTitleStrategy(),
         new FirstCharsTitleStrategy(10),
         new DateTimeTitleStrategy(), //添加 DateTimeTitleStrategy
      ];

      for (const strategy of strategies) {
         try {
            title = await strategy.generateTitle(text);
            if (title) {
               console.log(`generateLinkTextForNote: Successfully generated title "${title}" using ${strategy.constructor.name}`);
               break; //成功获取标题，跳出循环
            }
         } catch (error) {
            console.error(`generateLinkTextForNote: Error with strategy ${strategy.constructor.name}:`, error);
         }
      }

      return title || defaultTitle;
   }

   /**
    * Generates a relative Markdown link path from the notes directory to a target note.
    * @param targetNoteUri The URI of the target note.
    * @returns A relative path string suitable for Markdown links, relative to the notes directory.
    *          Returns an empty string if notesDir is not configured.
    */
   public generateLinkPathForNote(targetNoteUri: vscode.Uri): string {
      if (!this.config.notesDir) {
         vscode.window.showErrorMessage('笔记目录未配置，无法生成链接路径。');
         return ''; //Or handle error as appropriate
      }
      const notesDir = this.config.notesDir.fsPath;
      const relativePath = path.relative(notesDir, targetNoteUri.fsPath);
      return relativePath.split(path.sep).join('/'); //Ensure forward slashes
   }

   /**
    * Finds all invalid Markdown links in a document.
    * An invalid link is one that starts with '/' or contains '../'.
    * Excludes web links (http, https, mailto) and anchor links (#).
    * @param document The TextDocument to search for invalid links.
    * @returns An array of InvalidLinkInfo objects representing the invalid links found.
    */
   public findInvalidLinks(document: vscode.TextDocument): InvalidLinkInfo[] {
      const invalidLinks: InvalidLinkInfo[] = [];
      const text = document.getText();
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g; //Matches [text](path)
      let match;

      while ((match = linkRegex.exec(text)) !== null) {
         const linkText = match[1];
         const linkPath = match[2];

         //Skip web links and anchor links
         if (linkPath.startsWith('http://') ||
            linkPath.startsWith('https://') ||
            linkPath.startsWith('mailto:') ||
            linkPath.startsWith('#')) {
            continue;
         }

         if (!linkPath.endsWith('.md')) {
            continue;
         }

         const linkPathStartPos = document.positionAt(match.index + match[0].indexOf('(') + 1);
         const linkPathEndPos = document.positionAt(match.index + match[0].indexOf(')'));
         const linkPathRangeValue = new vscode.Range(linkPathStartPos, linkPathEndPos);

         const linkTextStartPos = document.positionAt(match.index + match[0].indexOf('[') + 1);
         const linkTextEndPos = document.positionAt(match.index + match[0].indexOf(']'));
         const linkTextRangeValue = new vscode.Range(linkTextStartPos, linkTextEndPos);

         let reason: 'startsWithSlash' | 'containsDotDotSlash' | null = null;

         if (linkPath.startsWith('/')) {
            reason = 'startsWithSlash';
         } else if (linkPath.includes('../')) {
            reason = 'containsDotDotSlash';
         }

         if (reason) {
            invalidLinks.push({
               linkText,
               linkPath,
               linkPathRange: linkPathRangeValue,
               linkTextRange: linkTextRangeValue,
               reason,
            });
         }
      }
      return invalidLinks;
   }

   dispose() {
      this.disposables.forEach(d => d.dispose());
   }
}
