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
import { ChatViewProvider } from './chatViewProvider';
import { SearchInputViewProvider } from './searchInputViewProvider';
import { AddNoteTool } from './languageModelTools'; //Added import

export async function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);
   const gitAutoSaveManager = GitAutoSaveManager.getInstance();
   const autoSaveManager = AutoSaveManager.getInstance(); // Ensure instance is created

   //注册 prompt 补全功能
   const promptCompletionProvider = new PromptCompletionProvider();
   const promptProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      promptCompletionProvider,
      ']]'
   );

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

   //注册时间戳辅助功能
   const timestampAssistant = new TimestampAssistant();
   const timestampProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      timestampAssistant,
   );

   //注册 Markdown 链接处理器
   const markdownLinkHandler = new MarkdownLinkHandler();
   const noteExplorer = NoteExplorer.getInstance(fileSystemProvider); //Use singleton instance

   const chatViewProvider = new ChatViewProvider(context.extensionUri);
   context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
         'daily-order.chatView',
         chatViewProvider
      )
   );

   const searchInstance = new Search(context.extensionUri);
   context.subscriptions.push(searchInstance);

   const searchInputProvider = new SearchInputViewProvider(context.extensionUri, searchInstance);
   searchInstance.setSearchInputViewProvider(searchInputProvider);

   context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
         SearchInputViewProvider.viewType,
         searchInputProvider
      )
   );

   function checkIfFileInNotesDir(uri: vscode.Uri): boolean {
      const notesDir = Config.getInstance().notesDir;
      if (!notesDir) return false;

      //Normalize paths to avoid issues with different OS path separators
      const normalizedFilePath = path.normalize(uri.fsPath);
      const normalizedNotesDir = path.normalize(notesDir.fsPath);

      //Check if the file path starts with the notes directory path
      return normalizedFilePath.startsWith(normalizedNotesDir);
   }

   function checkIfSupportedLLMChat(uri: vscode.Uri): boolean {
      if(!checkIfFileInNotesDir(uri)) return false;
      if (uri.fsPath.endsWith('.prompt.md')) return false;
      if (uri.fsPath.endsWith('.chatlog.md')) return false;
      //Check if the file is a markdown file
      const fileExtension = path.extname(uri.fsPath).toLowerCase();
      return fileExtension === '.md' || fileExtension === '.markdown';
   }

   async function processNotesEditor(editor: vscode.TextEditor) {
      if(checkIfSupportedLLMChat(editor.document.uri)) {
         vscode.commands.executeCommand('setContext', 'supportedLLMChat', true);
         await chatViewProvider.setReadlyPanel(editor);
      } else {
         vscode.commands.executeCommand('setContext', 'supportedLLMChat', false);
      }

      checkIfFileInNotesDir(editor.document.uri) && noteExplorer.reveal(editor.document.uri);

   }

   //Listen for active text editor changes
   vscode.window.onDidChangeActiveTextEditor(async editor => {
      if(!editor) return;
      processNotesEditor(editor);
   });

   //Handle the initially active editor
   if (vscode.window.activeTextEditor) processNotesEditor(vscode.window.activeTextEditor);

   const addNoteTool = new AddNoteTool(fileSystemProvider); //Register the AddNoteTool
   const disposable = vscode.lm.registerTool('daily_order_add_note', addNoteTool);
   context.subscriptions.push(disposable);

   // Register the command to toggle auto-save pause
   context.subscriptions.push(
      vscode.commands.registerCommand('daily-order.toggleAutoSavePause', () => { 
         autoSaveManager.toggleAutoSavePause();
      })
   );

   context.subscriptions.push(
      vscode.commands.registerCommand('daily-order.focusOnTodayOrderNote', () => {
         noteExplorer.focusOnTodayOrderNote();
      }),
      watcher,
      Config.getInstance().setListener(),
      noteExplorer,
      new StatusBar(),
      new TagExplorer(fileSystemProvider),
      searchInstance,
      gitAutoSaveManager,
      AutoSaveManager.getInstance(),
      FileCompletionProvider.register(),
      timestampProvider,
      promptProvider,
      toggleDebugCommand,
      showDebugPanelCommand,
      markdownLinkHandler,
      ...registerCommands()
   );
}

export function deactivate() {
   //清理资源
   AutoSaveManager.getInstance().dispose();
}
