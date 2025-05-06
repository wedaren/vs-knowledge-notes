import * as vscode from 'vscode';
import { Config } from './config';
import { extensionName } from './constants';
import { FileSystemProvider } from './fileSystemProvider';
import dayjs = require('dayjs');
import { GitService } from './gitService';
import { GitAutoSaveManager } from './gitAutoSaveManager';

const config = Config.getInstance();

async function setNotesDir() {
   const selectedUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
   });
   if (!selectedUris) return;
   config.notesDir = selectedUris[0];
}

function toggleDisplayMode() {
   config.displayMode = !config.displayMode;
}


/**
 * 打开并聚焦到指定的文件路径
 * @param filePath 目标文件的绝对路径
 * @param options 可选参数，用于控制打开行为，例如指定在哪一列打开，是否预览，以及初始光标位置
 */
export async function focusOnFile(fileUri: vscode.Uri, options?: { viewColumn?: vscode.ViewColumn, selection?: vscode.Range }): Promise<void> {
   try {
      await vscode.workspace.fs.stat(fileUri);
      const document = await vscode.workspace.openTextDocument(fileUri);
      await vscode.commands.executeCommand('daily-order.noteExplorer.reveal', fileUri);
      await vscode.window.showTextDocument(document, {
         viewColumn: options?.viewColumn,
         preview: false,
         selection: options?.selection
      });

   } catch (error) {
      vscode.window.showErrorMessage(`打开或聚焦文件时出错: ${fileUri.path}. 错误: ${error}`);
   }
}

async function focusOnTodayOrderNote(fileSystemProvider: FileSystemProvider) {
   const notesDir = Config.getInstance().notesDir;
   if (!notesDir) {
      vscode.window.showErrorMessage('Notes directory is not set.');
      return;
   }
   const FolderName = 'TodayOrder';
   const filename = vscode.Uri.file(`${notesDir?.path}/${FolderName}`);
   if (!fileSystemProvider.exists(filename)) {
      await fileSystemProvider.createDirectory(filename);
   }


   const noteFileName = dayjs().format('YYYY-MM-DD') + '.md';
   const noteFileUri = vscode.Uri.file(`${notesDir?.path}/${FolderName}/${noteFileName}`);
   if (!fileSystemProvider.exists(noteFileUri)) {
      await fileSystemProvider.writeFile(noteFileUri, new Uint8Array(), { create: true, overwrite: false });
   }
   focusOnFile(noteFileUri);
}

/**
 * 切换 Git 自动保存功能
 */
async function toggleGitAutoSave() {
   config.gitAutoSave = !config.gitAutoSave;
   vscode.window.showInformationMessage(`Git 自动保存已${config.gitAutoSave ? '启用' : '禁用'}`);
}

/**
 * 立即执行 Git 保存
 */
async function saveToGitNow() {
   const notesDir = config.notesDir;
   if (!notesDir) {
      vscode.window.showErrorMessage('笔记目录未设置');
      return;
   }

   await GitAutoSaveManager.getInstance().saveNow();
}

/**
 * 设置 Git 自动保存间隔
 */
async function setGitAutoSaveInterval() {
   const options = ['1分钟', '5分钟', '10分钟', '15分钟', '30分钟', '1小时', '2小时', '4小时', '12小时', '24小时'];
   const intervalValues = [1, 5, 10, 15, 30, 60, 120, 240, 720, 1440];

   const selected = await vscode.window.showQuickPick(options, {
      placeHolder: '请选择自动保存时间间隔',
      canPickMany: false
   });

   if (!selected) return;

   const index = options.indexOf(selected);
   if (index !== -1) {
      config.gitAutoSaveInterval = intervalValues[index];
      vscode.window.showInformationMessage(`Git 自动保存间隔已设置为: ${selected}`);
   }
}

export function registerCommands(fileSystemProvider: FileSystemProvider): vscode.Disposable[] {
   return [
      vscode.commands.registerCommand(`${extensionName}.setNotesDir`, () => setNotesDir()),
      vscode.commands.registerCommand(`${extensionName}.toggleDisplayMode`, () => toggleDisplayMode()),
      vscode.commands.registerCommand(`${extensionName}.focusOnTodayOrderNote`, () => focusOnTodayOrderNote(fileSystemProvider)),
      vscode.commands.registerCommand(`${extensionName}.toggleGitAutoSave`, () => toggleGitAutoSave()),
      vscode.commands.registerCommand(`${extensionName}.saveToGitNow`, () => saveToGitNow()),
      vscode.commands.registerCommand(`${extensionName}.setGitAutoSaveInterval`, () => setGitAutoSaveInterval())
   ];
}
