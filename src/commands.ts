import * as vscode from 'vscode';
import { Config } from './config';
import { extensionName } from './constants';
import { FileSystemProvider } from './fileSystemProvider';

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
async function focusOnFile(fileUri: vscode.Uri, options?: { viewColumn?: vscode.ViewColumn, selection?: vscode.Range }): Promise<void> {
   try {
      await vscode.workspace.fs.stat(fileUri);
      const document = await vscode.workspace.openTextDocument(fileUri);

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
   const config = Config.getInstance();
   if (config.isEmptyNotesDir) {
      vscode.window.showErrorMessage("Notes directory is not set.");
      return;
   }
   const FolderName = 'TodayOrder';
   const filename = vscode.Uri.file(`${config.notesDir?.path}/${FolderName}`);
   if (!fileSystemProvider.exists(filename)) {
      await fileSystemProvider.createDirectory(filename);
   }


   const noteFileName = new Date().toISOString().split('T')[0] + '.md';
   const noteFileUri = vscode.Uri.file(`${config.notesDir?.path}/${FolderName}/${noteFileName}`);
   if (!fileSystemProvider.exists(noteFileUri)) {
      await fileSystemProvider.writeFile(noteFileUri, new Uint8Array(), { create: true, overwrite: false });
   }
   focusOnFile(noteFileUri);
}
export function registerCommands(fileSystemProvider: FileSystemProvider): vscode.Disposable[] {
   return [
      vscode.commands.registerCommand(`${extensionName}.setNotesDir`, () => setNotesDir()),
      vscode.commands.registerCommand(`${extensionName}.toggleDisplayMode`, () => toggleDisplayMode()),
      vscode.commands.registerCommand(`${extensionName}.focusOnTodayOrderNote`, () => focusOnTodayOrderNote(fileSystemProvider))
   ];
}
