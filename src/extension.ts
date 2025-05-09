import * as vscode from 'vscode';
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
import { AutoSaveManager } from './autoSaveManager';
import { TimestampAssistant } from './assistants/timestampAssistant';
import { PromptCompletionProvider } from './promptCompletionProvider';

export function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);
   const gitAutoSaveManager = GitAutoSaveManager.getInstance();
   const autoSaveManager = AutoSaveManager.getInstance();
   //注册 prompt 补全功能
   const promptCompletionProvider = new PromptCompletionProvider();
   const promptProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      promptCompletionProvider,
      ']]'
   );

   //注册命令以手动触发 prompt 补全
   const triggerPromptCompletionCommand = vscode.commands.registerCommand('daily-order.triggerPromptCompletion', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
         vscode.commands.executeCommand('editor.action.triggerSuggest');
      }
   });

   //注册调试相关命令
   const toggleDebugCommand = vscode.commands.registerCommand('daily-order.toggleDebugMode', async () => {
      const config = vscode.workspace.getConfiguration('daily-order');
      const currentValue = config.get('enableDebug', false);

      //反转当前值
      await config.update('enableDebug', !currentValue, vscode.ConfigurationTarget.Global);

      //更新 promptCompletionProvider 的调试状态
      promptCompletionProvider.toggleDebug(!currentValue);

      //通知用户
      vscode.window.showInformationMessage(
         `调试模式已${!currentValue ? '启用' : '禁用'}`
      );

      //如果启用了调试，自动显示输出面板
      if (!currentValue) {
         promptCompletionProvider.showDebugPanel();
      }
   });

   const showDebugPanelCommand = vscode.commands.registerCommand('daily-order.showDebugPanel', () => {
      promptCompletionProvider.showDebugPanel();
   });

   //注册文件补全提供者
   const fileCompletionProvider = new FileCompletionProvider();
   const completionProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      fileCompletionProvider,
      '>', //触发字符
      '》' //新增触发字符
   );

   //注册时间戳辅助功能
   const timestampAssistant = new TimestampAssistant();
   const timestampProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      timestampAssistant,
      't' //触发字符
   );
   //注册命令以手动触发补全
   const triggerCompletionCommand = vscode.commands.registerCommand('vs-knowledge-notes.triggerFileCompletion', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
         vscode.commands.executeCommand('editor.action.triggerSuggest');
      }
   });

   //注册检查并创建文件的命令
   const checkAndCreateFileCommand = vscode.commands.registerCommand('vs-knowledge-notes.checkAndCreateFile', async (filePath: string) => {
      console.log(`检查文件是否存在: ${filePath}`);
      const fileUri = vscode.Uri.file(filePath);

      if (!await fileSystemProvider.exists(fileUri)) {
         //确保目录存在
         const dirUri = vscode.Uri.file(path.dirname(filePath));
         if (!await fileSystemProvider.exists(dirUri)) {
            try {
               await fileSystemProvider.createDirectory(dirUri);
               console.log(`创建目录成功: ${dirUri.fsPath}`);
            } catch (error) {
               console.error(`创建目录失败: ${dirUri.fsPath}`, error);
               vscode.window.showErrorMessage(`创建目录失败: ${dirUri.fsPath}`);
               return;
            }
         }

         //创建文件
         try {
            const fileName = path.basename(filePath, '.md');
            const content = `# ${fileName}\n\n`;
            await fileSystemProvider.writeFile(fileUri, Buffer.from(content, 'utf8'), { create: true, overwrite: false });
            console.log(`创建文件成功: ${filePath}`);
            vscode.window.showInformationMessage(`文件不存在，已创建: ${filePath}`);

            //打开新创建的文件
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
         } catch (error) {
            console.error(`创建文件失败: ${filePath}`, error);
            vscode.window.showErrorMessage(`创建文件失败: ${filePath}`);
         }
      }
   });

   //注册 Markdown 链接处理器
   const markdownLinkHandler = new MarkdownLinkHandler();
   const noteExplorer = new NoteExplorer(fileSystemProvider);

   context.subscriptions.push(
      watcher,
      Config.getInstance().setListener(),
      noteExplorer,
      new StatusBar(),
      new TagExplorer(fileSystemProvider),
      new Search(),
      gitAutoSaveManager,
      autoSaveManager,
      completionProvider,
      timestampProvider,
      promptProvider,
      triggerCompletionCommand,
      triggerPromptCompletionCommand,
      toggleDebugCommand,
      showDebugPanelCommand,
      checkAndCreateFileCommand,
      markdownLinkHandler,
      ...registerCommands()
   );
}

export function deactivate() {
   //清理资源
   AutoSaveManager.getInstance().dispose();
}
