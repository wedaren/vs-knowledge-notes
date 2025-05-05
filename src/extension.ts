import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';
import { FileSystemProvider } from './fileSystemProvider';
import { TagExplorer } from './tagExplorer';
import { Watcher } from './watcher';
import { Search } from './search';
import { GitAutoSaveManager } from './gitAutoSaveManager';
import { FileCompletionProvider } from './fileCompletionProvider';
import { MarkdownLinkHandler } from './markdownLinkHandler';

export function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);
   const gitAutoSaveManager = GitAutoSaveManager.getInstance();

   // 注册文件补全提供者
   const fileCompletionProvider = new FileCompletionProvider();
   const completionProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      fileCompletionProvider,
      '>>' // 触发字符
   );

   // 注册命令以手动触发补全
   const triggerCompletionCommand = vscode.commands.registerCommand('vs-knowledge-notes.triggerFileCompletion', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
         vscode.commands.executeCommand('editor.action.triggerSuggest');
      }
   });

   // 注册检查并创建文件的命令
   const checkAndCreateFileCommand = vscode.commands.registerCommand('vs-knowledge-notes.checkAndCreateFile', async (filePath: string) => {
      console.log(`检查文件是否存在: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
         // 确保目录存在
         const dirPath = path.dirname(filePath);
         if (!fs.existsSync(dirPath)) {
            try {
               fs.mkdirSync(dirPath, { recursive: true });
               console.log(`创建目录成功: ${dirPath}`);
            } catch (error) {
               console.error(`创建目录失败: ${dirPath}`, error);
               vscode.window.showErrorMessage(`创建目录失败: ${dirPath}`);
               return;
            }
         }
         
         // 创建文件
         try {
            const fileName = path.basename(filePath, '.md');
            const content = `# ${fileName}\n\n`;
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`创建文件成功: ${filePath}`);
            vscode.window.showInformationMessage(`文件不存在，已创建: ${filePath}`);
            
            // 打开新创建的文件
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
         } catch (error) {
            console.error(`创建文件失败: ${filePath}`, error);
            vscode.window.showErrorMessage(`创建文件失败: ${filePath}`);
         }
      }
   });

   // 注册 Markdown 链接处理器
   const markdownLinkHandler = new MarkdownLinkHandler();

   context.subscriptions.push(
      watcher,
      Config.getInstance().setListener(),
      new NoteExplorer(fileSystemProvider),
      new StatusBar(),
      new TagExplorer(fileSystemProvider),
      new Search(),
      gitAutoSaveManager,
      completionProvider,
      triggerCompletionCommand,
      checkAndCreateFileCommand,
      markdownLinkHandler,
      ...registerCommands(fileSystemProvider)
   );
}

export function deactivate() { }
