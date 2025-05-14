import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from './config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class FileCompletionProvider implements vscode.CompletionItemProvider {
    private config: Config;
    private fileCache: Map<string, string[]> = new Map(); //缓存文件列表

    constructor() {
       this.config = Config.getInstance();
       //监听配置变化，清除缓存
       this.config.onDidChangeConfig((items) => {
          if (items?.includes(Config.ConfigItem.NotesDir)) {
             this.fileCache.clear();
          }
       });
    }

    public static register(): vscode.Disposable {
       const provider = new FileCompletionProvider();
       return vscode.languages.registerCompletionItemProvider(
          { scheme: 'file', language: 'markdown' },
          provider,
          '>', //触发字符
          '》' //新增触发字符
       );
    }

    async provideCompletionItems(
       document: vscode.TextDocument,
       position: vscode.Position,
       token: vscode.CancellationToken,
       context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
       console.log('触发补全提供者');
       console.log('触发类型:', context.triggerKind);
       console.log('触发字符:', context.triggerCharacter);

       //获取当前行的文本
       const lineText = document.lineAt(position).text;
       const linePrefix = lineText.substr(0, position.character);
       console.log(`当前行文本: "${lineText}"`);
       console.log(`光标位置: ${position.line}:${position.character}`);
       console.log(`行前缀: "${linePrefix}"`);

       //检查是否包含 ">>" 并提取过滤关键字
       const match = this.extractFilterKeyword(linePrefix, position.line);
       if (!match) {
          console.log('未找到 ">>" 或无法提取关键字');
          return [];
       }

       const { keyword, prefix, startPosition, endPosition } = match;

       const notesDir = this.config.notesDir;
       if (!notesDir) {
          console.log('未设置 notesDir 配置');
          return [];
       }
       console.log(`notesDir: ${notesDir.fsPath}`);

       try {
          //使用find命令过滤文件
          console.log(`开始使用find命令搜索关键字: "${keyword}"`);
          const files = await this.filterFilesWithFind(notesDir.fsPath, keyword);
          if(files.length === 0){
             vscode.commands.executeCommand('editor.action.triggerSuggest');
          }
          //创建文件占位
          const file = path.join(notesDir.fsPath, `${keyword}.md`);
          const completionItems = [...(keyword?[file]:[]),...files].map((file,index) => {

             const relativePath = path.relative(notesDir.fsPath, file);
             const fileName = path.basename(file, '.md');

             const completionItem = new vscode.CompletionItem(relativePath);
             completionItem.kind = vscode.CompletionItemKind.File;
             completionItem.detail = '选择文件';
             completionItem.label = relativePath;

             //使用文件名作为排序依据，确保中文文件名正确排序
             completionItem.sortText = fileName;

             //添加文档，显示完整路径
             completionItem.documentation = new vscode.MarkdownString(`完整路径: ${file}`);

             //设置过滤文本，使其支持在任意位置匹配
             completionItem.filterText = `${prefix}${relativePath}`;

             //设置插入文本为Markdown链接格式
             const markdownLink = `[${fileName}](${relativePath})`;
             completionItem.insertText = markdownLink;

             //设置替换范围从">>"到关键字结束位置
             //使用更精确的范围控制，区分插入范围和替换范围
             const range = new vscode.Range(startPosition.line, startPosition.character, endPosition.line, endPosition.character);
             completionItem.range = range;

             //添加额外的调试信息
             console.log(`替换范围: ${startPosition.line}:${startPosition.character} -> ${endPosition.line}:${endPosition.character}`);
             console.log(`插入文本: ${markdownLink}`);

             //目录
             if(keyword){
                if(index === 0) {
                   const filePath = path.resolve(notesDir.fsPath, `${keyword}.md`);
                   completionItem.detail = '创建文件';
                   const folderUri = vscode.Uri.file(filePath);

                   completionItem.command = {
                      title: '创建文件',
                      command: 'daily-order.noteExplorer.createFile',
                      arguments: [folderUri]
                   };
                }
             }
             return completionItem;
          });
          console.log(`创建了 ${completionItems.length} 个补全项`);
          return completionItems;
       } catch (error) {
          console.error('Error providing completion items:', error);
          return [];
       }
    }

    //从文本中提取过滤关键字和起始位置
    private extractFilterKeyword(text: string, line: number): { keyword: string, prefix: string, startPosition: vscode.Position, endPosition: vscode.Position } | null {
       const lastIndex1 = text.lastIndexOf('>>');
       const lastIndex2 = text.lastIndexOf('》》');
       const lastIndex = Math.max(lastIndex1, lastIndex2);
       if (lastIndex !== -1) {
          //提取">>"后面的文本直到空格
          const prefix = lastIndex === lastIndex1 ? '>>' : '》》';
          const prefixLength = prefix.length;
          const afterArrow = text.substring(lastIndex + prefixLength);
          const spaceIndex = afterArrow.indexOf(' ');
          const keyword = spaceIndex === -1 ? afterArrow : afterArrow.substring(0, spaceIndex);

          //计算起始位置和结束位置
          const startPosition = new vscode.Position(line, lastIndex);
          const endPosition = new vscode.Position(line, lastIndex + prefixLength + keyword.length);

          return { keyword, startPosition, endPosition, prefix };
       }

       return null;
    }

    //使用find命令过滤文件
    private async filterFilesWithFind(dir: string, keyword: string): Promise<string[]> {
       try {
          console.log(`开始使用find命令搜索: ${dir}, 关键字: ${keyword}`);

          //构建find命令，搜索.md文件，不区分大小写
          const findCommand = `find "${dir}" -iname "*.md"`;
          console.log(`执行命令: ${findCommand}`);

          const { stdout, stderr } = await execAsync(findCommand);

          if (stderr) {
             console.error(`find命令错误: ${stderr}`);
          }

          //处理输出结果
          const files = stdout.split('\n').filter(line => line.trim() !== '');

          return files;
       } catch (error) {
          console.error('Error filtering files with find:', error);
          return [];
       }
    }

    //使用文件系统直接搜索文件
    private async searchFilesByKeyword(dir: string, keyword: string): Promise<string[]> {
       console.log(`开始使用文件系统搜索: ${dir}, 关键字: ${keyword}`);

       //获取所有文件
       const allFiles = await this.getAllFiles(dir);
       console.log(`文件系统找到 ${allFiles.length} 个文件`);

       //过滤包含关键字的文件
       const keywordLower = keyword.toLowerCase();
       const filteredFiles = allFiles.filter(file => {
          const fileName = path.basename(file, '.md').toLowerCase();
          return fileName.includes(keywordLower);
       });

       console.log(`过滤后有 ${filteredFiles.length} 个匹配文件`);
       return filteredFiles;
    }

    private async getAllFiles(dir: string): Promise<string[]> {
       //检查缓存
       if (this.fileCache.has(dir)) {
          return this.fileCache.get(dir)!;
       }

       const files: string[] = [];

       async function traverse(currentDir: string) {
          const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

          for (const entry of entries) {
             const fullPath = path.join(currentDir, entry.name);

             if (entry.isDirectory()) {
                await traverse(fullPath);
             } else if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(fullPath);
             }
          }
       }

       await traverse(dir);

       //缓存结果
       this.fileCache.set(dir, files);

       return files;
    }
}
