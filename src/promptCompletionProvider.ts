import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './config';

/**
 * 提供预制的 prompt 补全
 * 从 config.notesDir 目录下的 prompts 目录加载 prompt 模板
 * 仅支持 XXX.prompt.md 格式的文件
 */
export class PromptCompletionProvider implements vscode.CompletionItemProvider {
    //用于缓存已加载的 prompt 模板
    private promptCache: Map<string, {content: string, displayName: string}> = new Map();
    //缓存上次更新时间
    private lastCacheUpdate: number = 0;
    //缓存更新间隔 (毫秒)
    private readonly CACHE_UPDATE_INTERVAL = 5000;
    //prompt 文件后缀
    private readonly PROMPT_SUFFIX = '.prompt.md';
    //调试输出通道
    private outputChannel: vscode.OutputChannel;
    //是否启用调试
    private isDebugEnabled: boolean = true;

    constructor() {
       this.outputChannel = vscode.window.createOutputChannel('Daily Order Prompts');
       //检查环境变量或配置以确定是否启用调试
       this.isDebugEnabled = vscode.workspace.getConfiguration('daily-order').get('enableDebug', true);
       this.debug('PromptCompletionProvider 初始化');
    }

    /**
     * 输出调试信息
     */
    private debug(message: string, data?: any): void {
       if (!this.isDebugEnabled) {
          return;
       }
       const timestamp = new Date().toISOString();
       let logMessage = `[${timestamp}] ${message}`;
       if (data) {
          if (typeof data === 'object') {
             logMessage += `\n${JSON.stringify(data, null, 2)}`;
          } else {
             logMessage += `\n${data}`;
          }
       }
       this.outputChannel.appendLine(logMessage);
    }

    /**
     * 提供自动完成项
     */
    async provideCompletionItems(
       document: vscode.TextDocument,
       position: vscode.Position,
       token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[]> {
       this.debug('触发 prompt 补全', {
          documentUri: document.uri.toString(),
          position: `${position.line}:${position.character}`,
          languageId: document.languageId
       });

       //如果不是 Markdown 文件，不提供补全
       if (document.languageId !== 'markdown') {
          this.debug('非 Markdown 文件，跳过补全');
          return [];
       }

       //获取 notesDir 配置
       const config = Config.getInstance();
       const notesDir = config.notesDir;
       if (!notesDir) {
          this.debug('未设置笔记目录，跳过补全');
          return [];
       }

       //确定 prompts 目录路径
       let promptsDir: string;

       //首先检查是否有自定义的 prompts 目录
       if (config.promptsDir) {
          promptsDir = config.promptsDir;
          this.debug(`使用自定义 prompts 目录: ${promptsDir}`);

          //如果自定义目录不存在，创建它并添加示例提示词
          if (!fs.existsSync(promptsDir)) {
             try {
                this.debug(`自定义 prompts 目录不存在，创建目录: ${promptsDir}`);
                fs.mkdirSync(promptsDir, { recursive: true });
                this.createExamplePrompts(promptsDir);
             } catch (error) {
                this.debug('创建自定义 prompts 目录失败', error);
                //自定义目录创建失败，回退到默认目录
                promptsDir = path.join(notesDir.fsPath, 'prompts');
                this.debug(`回退到默认 prompts 目录: ${promptsDir}`);
             }
          }
       } else {
          //使用默认的 prompts 目录
          promptsDir = path.join(notesDir.fsPath, 'prompts');
          this.debug(`使用默认 prompts 目录: ${promptsDir}`);
       }

       //如果默认 prompts 目录不存在，创建它
       if (!fs.existsSync(promptsDir)) {
          try {
             this.debug(`prompts 目录不存在，创建目录: ${promptsDir}`);
             fs.mkdirSync(promptsDir, { recursive: true });
             //添加示例提示词文件
             this.createExamplePrompts(promptsDir);
          } catch (error) {
             this.debug('创建 prompts 目录失败', error);
             return [];
          }
       }

       //加载 prompts
       await this.loadPromptsIfNeeded(promptsDir);

       //创建补全项列表
       const completionItems: vscode.CompletionItem[] = [];

       //从缓存中获取 prompts 并转换为补全项
       this.promptCache.forEach((promptData, filePath) => {
          const completionItem = new vscode.CompletionItem(promptData.displayName, vscode.CompletionItemKind.Snippet);
          completionItem.detail = `Prompt: ${promptData.displayName}`;
          completionItem.documentation = new vscode.MarkdownString(promptData.content);
          completionItem.insertText = promptData.content;

          //设置高优先级
          completionItem.sortText = '0' + promptData.displayName;
          completionItems.push(completionItem);
       });

       this.debug(`提供 ${completionItems.length} 个 prompt 补全项`);
       return completionItems;
    }

    /**
     * 如果需要，加载 prompts
     */
    private async loadPromptsIfNeeded(promptsDir: string): Promise<void> {
       const now = Date.now();

       //如果距离上次更新缓存时间不足 CACHE_UPDATE_INTERVAL，且缓存不为空，则直接返回
       if (now - this.lastCacheUpdate < this.CACHE_UPDATE_INTERVAL && this.promptCache.size > 0) {
          this.debug('使用缓存的 prompt 数据，跳过重新加载');
          return;
       }

       this.debug(`加载 prompts 目录: ${promptsDir}`);

       //清空缓存
       this.promptCache.clear();

       try {
          //递归读取 prompts 目录下的所有文件
          await this.loadPromptsRecursively(promptsDir, '');
          //更新缓存时间
          this.lastCacheUpdate = now;
          this.debug(`成功加载 ${this.promptCache.size} 个 prompt 文件`);
       } catch (error) {
          this.debug('读取 prompts 目录失败', error);
       }
    }

    /**
     * 递归加载 prompts 目录下的所有符合条件的文件
     */
    private async loadPromptsRecursively(dir: string, relativePath: string): Promise<void> {
       try {
          this.debug(`扫描目录: ${dir} (相对路径: ${relativePath || '根目录'})`);
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
             const fullPath = path.join(dir, entry.name);
             const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

             if (entry.isDirectory()) {
                //递归处理子目录
                this.debug(`发现子目录: ${entry.name}`);
                await this.loadPromptsRecursively(fullPath, relPath);
             } else if (entry.isFile() && entry.name.endsWith(this.PROMPT_SUFFIX)) {
                //只处理 .prompt.md 后缀的文件
                this.debug(`发现 prompt 文件: ${entry.name}`);
                const content = fs.readFileSync(fullPath, 'utf8');

                //获取不带后缀的文件名，作为显示名称
                const baseName = path.basename(entry.name, this.PROMPT_SUFFIX);

                //如果有层级结构，将其添加到显示名称中
                const displayName = relativePath
                   ? `${relativePath.replace(/\\/g, '/')}/${baseName}`
                   : baseName;

                this.promptCache.set(fullPath, {
                   content,
                   displayName
                });
                this.debug(`加载 prompt: ${displayName}，路径: ${fullPath}`);
             } else {
                this.debug(`忽略不匹配的文件: ${entry.name}`);
             }
          }
       } catch (error) {
          this.debug(`读取目录失败: ${dir}`, error);
       }
    }

    /**
     * 创建示例 prompts
     */
    private createExamplePrompts(promptsDir: string): void {
       this.debug(`创建示例 prompt 文件于: ${promptsDir}`);

       //创建子目录示例
       const subDirs = ['基础', '工作', '编程'];
       for (const dir of subDirs) {
          const dirPath = path.join(promptsDir, dir);
          if (!fs.existsSync(dirPath)) {
             this.debug(`创建示例子目录: ${dir}`);
             fs.mkdirSync(dirPath, { recursive: true });
          }
       }

       const examples = [
          {
             name: '优化表达.prompt.md',
             dir: '',
             content: '请帮我优化以下文本表达，使其更清晰、专业：\n\n'
          },
          {
             name: '简化解释.prompt.md',
             dir: '',
             content: '请将以下复杂概念用简单语言解释：\n\n'
          },
          {
             name: '总结要点.prompt.md',
             dir: '基础',
             content: '请帮我总结以下内容的关键要点：\n\n'
          },
          {
             name: '翻译中英互译.prompt.md',
             dir: '基础',
             content: '请将以下文本翻译成[目标语言]：\n\n'
          },
          {
             name: '会议纪要.prompt.md',
             dir: '工作',
             content: '请根据以下会议讨论内容，生成一份结构化的会议纪要，包括主要决策、行动项和负责人：\n\n'
          },
          {
             name: '代码优化.prompt.md',
             dir: '编程',
             content: '请分析以下代码并提供优化建议，重点关注性能、可读性和最佳实践：\n\n```\n// 在此粘贴代码\n```\n'
          }
       ];

       for (const example of examples) {
          try {
             const filePath = path.join(promptsDir, example.dir, example.name);
             this.debug(`创建示例 prompt 文件: ${filePath}`);
             fs.writeFileSync(filePath, example.content);
          } catch (error) {
             this.debug(`创建示例 prompt 失败: ${example.name}`, error);
          }
       }
    }

    /**
     * 显示调试面板
     */
    public showDebugPanel(): void {
       this.outputChannel.show();
    }

    /**
     * 启用或禁用调试
     */
    public toggleDebug(enabled: boolean): void {
       this.isDebugEnabled = enabled;
       this.debug(`调试模式 ${enabled ? '已启用' : '已禁用'}`);

       if (enabled) {
          //显示当前状态
          this.debug('当前 Prompt 提供者状态', {
             cacheSize: this.promptCache.size,
             lastUpdate: new Date(this.lastCacheUpdate).toISOString(),
             cachedPrompts: Array.from(this.promptCache.keys())
          });
       }
    }
}
