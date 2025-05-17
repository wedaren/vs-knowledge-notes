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
import { AddNoteTool } from './languageModelTools';
import { thinkerHandler } from './thinkerChatParticipant';
import { createNoteFromSelection } from './createNoteFromSelection';

export async function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);
   const gitAutoSaveManager = GitAutoSaveManager.getInstance();
   const autoSaveManager = AutoSaveManager.getInstance();

   const promptCompletionProvider = new PromptCompletionProvider();
   const promptProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      promptCompletionProvider,
      ']]'
   );

   const toggleDebugCommand = vscode.commands.registerCommand('daily-order.toggleDebugMode', async () => {
      const config = vscode.workspace.getConfiguration('daily-order');
      const currentValue = config.get('enableDebug', false);

      await config.update('enableDebug', !currentValue, vscode.ConfigurationTarget.Global);

      promptCompletionProvider.toggleDebug(!currentValue);

      vscode.window.showInformationMessage(
         `调试模式已${!currentValue ? '启用' : '禁用'}`
      );

      if (!currentValue) {
         promptCompletionProvider.showDebugPanel();
      }
   });

   const showDebugPanelCommand = vscode.commands.registerCommand('daily-order.showDebugPanel', () => {
      promptCompletionProvider.showDebugPanel();
   });

   const timestampAssistant = new TimestampAssistant();
   const timestampProvider = vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'markdown' },
      timestampAssistant,
   );

   const markdownLinkHandler = MarkdownLinkHandler.getInstance();
   context.subscriptions.push(markdownLinkHandler);

   const noteExplorer = NoteExplorer.getInstance(fileSystemProvider);

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

      const normalizedFilePath = path.normalize(uri.fsPath);
      const normalizedNotesDir = path.normalize(notesDir.fsPath);

      return normalizedFilePath.startsWith(normalizedNotesDir);
   }

   function checkIfSupportedLLMChat(uri: vscode.Uri): boolean {
      if (!checkIfFileInNotesDir(uri)) return false;
      if (uri.fsPath.endsWith('.prompt.md')) return false;
      if (uri.fsPath.endsWith('.chatlog.md')) return false;
      const fileExtension = path.extname(uri.fsPath).toLowerCase();
      return fileExtension === '.md' || fileExtension === '.markdown';
   }

   async function processNotesEditor(editor: vscode.TextEditor) {
      if (checkIfSupportedLLMChat(editor.document.uri)) {
         vscode.commands.executeCommand('setContext', 'supportedLLMChat', true);
         await chatViewProvider.setReadlyPanel(editor);
      } else {
         vscode.commands.executeCommand('setContext', 'supportedLLMChat', false);
      }

      checkIfFileInNotesDir(editor.document.uri) && noteExplorer.reveal(editor.document.uri);
   }

   vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (!editor) return;
      processNotesEditor(editor);
   });

   if (vscode.window.activeTextEditor) processNotesEditor(vscode.window.activeTextEditor);

   const addNoteTool = new AddNoteTool(fileSystemProvider);
   const disposable = vscode.lm.registerTool('daily_order_add_note', addNoteTool);
   context.subscriptions.push(disposable);

   const thinker = vscode.chat.createChatParticipant('daily-order.thinker', thinkerHandler);

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
      vscode.commands.registerCommand('daily-order.createNoteFromSelection', () => createNoteFromSelection(noteExplorer)),
      ...registerCommands()
   );
}

export function deactivate() {
   AutoSaveManager.getInstance().dispose();
}
