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

export function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);
   const gitAutoSaveManager = GitAutoSaveManager.getInstance();

   context.subscriptions.push(
      watcher,
      Config.getInstance().setListener(),
      new NoteExplorer(fileSystemProvider),
      new StatusBar(),
      new TagExplorer(fileSystemProvider),
      new Search(),
      gitAutoSaveManager,
      ...registerCommands(fileSystemProvider)
   );
}

export function deactivate() { }
