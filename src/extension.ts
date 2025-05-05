import * as vscode from 'vscode';
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
      ...registerCommands(fileSystemProvider)
   );
}

export function deactivate() { }
