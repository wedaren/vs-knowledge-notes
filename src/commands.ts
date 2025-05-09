import * as vscode from 'vscode';
import { Config } from './config';
import { GitAutoSaveManager } from './gitAutoSaveManager';

const config = Config.getInstance();

async function setNotesDir(): Promise<void> {
   const selectedUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
   });
   if (!selectedUris) {
      return;
   }
   config.notesDir = selectedUris[0];
}

function toggleDisplayMode(): void {
   config.displayMode = !config.displayMode;
}

/**
 * 切换 Git 自动保存功能
 */
async function toggleGitAutoSave(): Promise<void> {
   config.gitAutoSave = !config.gitAutoSave;
   vscode.window.showInformationMessage(`Git 自动保存已${config.gitAutoSave ? '启用' : '禁用'}`);
}

/**
 * 立即执行 Git 保存
 */
async function saveToGitNow(): Promise<void> {
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
async function setGitAutoSaveInterval(): Promise<void> {
   const options = ['1分钟', '5分钟', '10分钟', '15分钟', '30分钟', '1小时', '2小时', '4小时', '12小时', '24小时'];
   const intervalValues = [1, 5, 10, 15, 30, 60, 120, 240, 720, 1440];

   const selected = await vscode.window.showQuickPick(options, {
      placeHolder: '请选择自动保存时间间隔',
      canPickMany: false
   });

   if (!selected) {
      return;
   }

   const index = options.indexOf(selected);
   if (index !== -1) {
      config.gitAutoSaveInterval = intervalValues[index];
      vscode.window.showInformationMessage(`Git 自动保存间隔已设置为: ${selected}`);
   }
}

export function registerCommands(): vscode.Disposable[] {
   return [
      vscode.commands.registerCommand('daily-order.setNotesDir', () => setNotesDir()),
      vscode.commands.registerCommand('daily-order.toggleDisplayMode', () => toggleDisplayMode()),
      vscode.commands.registerCommand('daily-order.toggleGitAutoSave', () => toggleGitAutoSave()),
      vscode.commands.registerCommand('daily-order.saveToGitNow', () => saveToGitNow()),
      vscode.commands.registerCommand('daily-order.setGitAutoSaveInterval', () => setGitAutoSaveInterval())
   ];
}
