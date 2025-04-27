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
      // 2. 检查文件是否存在 (可选但推荐)
      // 使用 workspace.fs.stat 检查，如果文件不存在会抛出错误
      try {
         await vscode.workspace.fs.stat(fileUri);
      } catch (fsError) {
         // vscode.window.showErrorMessage(`文件不存在或无法访问: ${filePath:fileUri.}`);
         return; // 文件不存在，则不继续执行
      }

      // 3. 异步打开文本文档
      const document = await vscode.workspace.openTextDocument(fileUri);

      // 4. 在编辑器窗口中显示文档
      // 默认情况下 (preserveFocus: false)，这会使得打开的编辑器获得焦点
      const editor = await vscode.window.showTextDocument(document, {
         viewColumn: options?.viewColumn, // 可以指定在哪一列打开，例如 vscode.ViewColumn.One
         preview: false, // 设置为 false，使其不是预览模式 (标签页标题不是斜体)
         selection: options?.selection // 可以传入一个 Range 对象来设置打开后的光标位置或选中区域
         // 例如，聚焦到第10行: new vscode.Range(new vscode.Position(9, 0), new vscode.Position(9, 0))
      });

      // 5. (可选) 确保文件在资源管理器中也可见并高亮
      // 在文档显示后执行 reveal 命令
      // 通常 showTextDocument 之后编辑器已经是活动的，可以直接 reveal
      await vscode.commands.executeCommand('workbench.action.files.revealActiveFileInEditor');

      // (可选) 显示成功信息
      // vscode.window.showInformationMessage(`已成功聚焦文件: ${filePath}`);

   } catch (error) {
      // 处理可能发生的错误，例如权限问题或其他 API 调用错误
      vscode.window.showErrorMessage(`打开或聚焦文件时出错: ${fileUri}. 错误: ${error}`);
   }
}

async function focusOnTodayOrderNote(fileSystemProvider: FileSystemProvider) {
   const config = Config.getInstance();
   if (config.isEmptyNotesDir) {
      vscode.window.showErrorMessage("Notes directory is not set.");
      return;
   }
   const FolderName = 'TodayOrder';
   const filename = vscode.Uri.file(`${config.notesDir}/${FolderName}`);
   if (!fileSystemProvider.exists(filename)) {
      await fileSystemProvider.createDirectory(filename);
   }


   const noteFileName = new Date().toISOString().split('T')[0] + '.md';
   const noteFileUri = vscode.Uri.file(`${config.notesDir}/${FolderName}/${noteFileName}`);
   if (!fileSystemProvider.exists(noteFileUri)) {
      await fileSystemProvider.writeFile(noteFileUri, new Uint8Array(), { create: true, overwrite: false });
   }
   focusOnFile(noteFileUri)
}
export function registerCommands(fileSystemProvider: FileSystemProvider): vscode.Disposable[] {
   return [
      vscode.commands.registerCommand(`${extensionName}.setNotesDir`, () => setNotesDir()),
      vscode.commands.registerCommand(`${extensionName}.toggleDisplayMode`, () => toggleDisplayMode()),
      vscode.commands.registerCommand(`${extensionName}.focusOnTodayOrderNote`, () => focusOnTodayOrderNote(fileSystemProvider))
   ];
}
