import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemProvider, File } from './fileSystemProvider';
import { Config } from './config';
import { DisplayMode } from './types';
import { isChild } from './utils';
import dayjs = require('dayjs');

type Clipboard = { uris: vscode.Uri[], cut: boolean };

class TreeDataProvider implements vscode.TreeDataProvider<File> {

   private _onDidChangeTreeData: vscode.EventEmitter<File | undefined | void> = new vscode.EventEmitter<File | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<File | undefined | void> = this._onDidChangeTreeData.event;

   private config: Config = Config.getInstance();

   constructor(private readonly fileSystemProvider: FileSystemProvider) { }

   refresh(): void {
      this._onDidChangeTreeData.fire();
   }

   getTreeItem(element: File): vscode.TreeItem {
      return element;
   }
   async getParent(element: File): Promise<File | undefined> {
      if (!this.config.notesDir) return undefined;
      const parentUri = vscode.Uri.file(path.dirname(element.uri.fsPath));
      if (parentUri.fsPath === this.config.notesDir.fsPath) return undefined;
      const parentStat = await this.fileSystemProvider.stat(parentUri);
      if (!parentStat) return undefined;
      return new File(parentUri, parentStat.type);
   }

   /**
    * Checks if file or directory should be hidden
    */
   private shouldHide(name: string): boolean {
      //If showHiddenFiles is true, don't hide any files based on name
      if (this.config.showHiddenFiles) {
         return false;
      }
      //Hide files/directories starting with .
      return name.startsWith('.');
   }

   async getChildren(element?: File): Promise<File[]> {
      if (!this.config.notesDir) return [];
      if (!this.fileSystemProvider.exists(this.config.notesDir)) {
         vscode.window.showErrorMessage(`${this.config.notesDir.fsPath} is invalid path.`);
         this.config.notesDir = undefined;
         return [];
      }

      if (element) {
         const children = await this.fileSystemProvider.readDirectory(element.uri);
         children.sort((a, b) => {
            if (a[1] === b[1]) {
               return a[0].localeCompare(b[0]);
            }
            return a[1] === vscode.FileType.Directory ? -1 : 1;
         });

         //Filter out invisible files/directories and binary files
         const filteredChildren = children.filter(([name]) => {
            const basename = path.basename(name);
            if (this.shouldHide(basename)) return false;
            return true;
         });

         return filteredChildren.map(([name, type]) => new File(vscode.Uri.file(name), type));
      }

      const children = await this.fileSystemProvider.readDirectory(this.config.notesDir);
      children.sort((a, b) => {
         if (a[1] === b[1]) {
            return a[0].localeCompare(b[0]);
         }
         return a[1] === vscode.FileType.Directory ? -1 : 1;
      });

      this.config.isEmptyNotesDir = !children.length;

      //Filter out invisible files/directories and binary files
      const filteredChildren = children.filter(([name]) => {
         const basename = path.basename(name);
         if (this.shouldHide(basename)) return false;
         return true;
      });

      return filteredChildren.map(([name, type]) => new File(vscode.Uri.file(name), type));
   }

}

export class NoteExplorer {

   private static instance: NoteExplorer;
   private readonly treeDataProvider: TreeDataProvider;
   private readonly treeView: vscode.TreeView<File>;
   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];
   private readonly todayOrderDir: string = 'TodayOrder';
   private clipboard?: Clipboard;

   private constructor(private readonly fileSystemProvider: FileSystemProvider) {
      this.treeDataProvider = new TreeDataProvider(fileSystemProvider);
      this.treeView = vscode.window.createTreeView('daily-order.noteExplorer', { treeDataProvider: this.treeDataProvider, canSelectMany: true, showCollapseAll: true });

      this.disposables.push(
         this.treeView,
         this.config.onDidChangeConfig(e => {
            if (e && (e.indexOf(Config.ConfigItem.NotesDir) !== -1 || e.indexOf(Config.ConfigItem.ShowHiddenFiles) !== -1)) {
               this.treeDataProvider.refresh();
            }
         }),
         this.fileSystemProvider.onDidChangeFile(() => {
            this.treeDataProvider.refresh();
         }),
         ...this.registerCommands()
      );
   }

   public static getInstance(fileSystemProvider: FileSystemProvider): NoteExplorer {
      if (!NoteExplorer.instance) {
         NoteExplorer.instance = new NoteExplorer(fileSystemProvider);
      }
      return NoteExplorer.instance;
   }

   async focusOnTodayOrderNote() {
      const notesDir = Config.getInstance().notesDir;
      if (!notesDir) {
         vscode.window.showErrorMessage('Notes directory is not set.');
         return;
      }

      const folderUri = await this.ensureTodayOrderFolderExists(notesDir);
      if (!folderUri) {
         return;
      }

      const noteFileUri = this.getTodayNoteFileUri(folderUri);
      await this.ensureTodayNoteFileExists(noteFileUri);
      await this.openFile(noteFileUri);
   }

   public async ensureTodayOrderFolderExists(notesDir: vscode.Uri): Promise<vscode.Uri | undefined> {
      const folderUri = vscode.Uri.joinPath(notesDir, this.todayOrderDir);
      if (!this.fileSystemProvider.exists(folderUri)) {
         try {
            await this.fileSystemProvider.createDirectory(folderUri);
         } catch (error) {
            vscode.window.showErrorMessage(`Failed to create directory ${this.todayOrderDir}: ${error}`);
            return undefined;
         }
      }
      return folderUri;
   }

   public getTodayNoteFileUri(folderUri: vscode.Uri): vscode.Uri {
      const today = dayjs();
      const noteFileName = today.format('YYYY-MM-DD') + '.md';
      return vscode.Uri.joinPath(folderUri, noteFileName);
   }

   public async ensureTodayNoteFileExists(noteFileUri: vscode.Uri): Promise<void> {
      if (!this.fileSystemProvider.exists(noteFileUri)) {
         const today = dayjs(path.basename(noteFileUri.fsPath, '.md')); // Extract date from filename
         const template = `# ${today.format('YYYY-MM-DD')}\n\n`;
         try {
            await this.fileSystemProvider.writeFile(noteFileUri, Buffer.from(template), { create: true, overwrite: false });
         } catch (error) {
            vscode.window.showErrorMessage(`Failed to create note file ${noteFileUri.fsPath}: ${error}`);
         }
      }
   }

   dispose(): void {
      this.disposables.forEach(d => d.dispose());
   }

   //#region commands

   private registerCommands(): vscode.Disposable[] {
      return [
         vscode.commands.registerCommand('daily-order.noteExplorer.openFile', (uri?: vscode.Uri) => this.openFile(uri)),
         vscode.commands.registerCommand('daily-order.noteExplorer.refresh', () => this.refresh()),
         vscode.commands.registerCommand('daily-order.noteExplorer.newFile', (file?: File) => this.createNewFile(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.newPrompt', (file?: File) => this.createNewPromptOfFile(file)),
         //TODO:这个命令应该属于 FileSystemProvider
         vscode.commands.registerCommand('daily-order.noteExplorer.createFile', (uri?: vscode.Uri) => this.createNewFileByName(uri)),
         vscode.commands.registerCommand('daily-order.noteExplorer.newFolder', (file?: File) => this.createNewFolder(file)),
         //TODO:这个命令应该属于 FileSystemProvider
         vscode.commands.registerCommand('daily-order.noteExplorer.createFolder', (uri?: vscode.Uri) => this.createNewFolderByName(uri)),
         vscode.commands.registerCommand('daily-order.noteExplorer.openInIntegratedTerminal', (file?: File) => this.openInIntegratedTerminal(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.openInNewWindow', (file?: File) => this.openInNewWindow(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.findInFolder', (file?: File) => this.findInFolder(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.cut', (file?: File) => this.cut(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.copy', (file?: File) => this.copy(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.paste', (file?: File) => this.paste(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.copyPath', (file?: File) => this.copyPath(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.copyRelativePath', (file?: File) => this.copyRelativePath(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.rename', (file?: File) => this.rename(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.delete', (file?: File) => this.delete(file)),
         vscode.commands.registerCommand('daily-order.noteExplorer.reveal', async(uri: vscode.Uri) => this.revealFile(uri)),
         vscode.commands.registerCommand('daily-order.noteExplorer.focusOnTodayOrderNote', () => this.focusOnTodayOrderNote()),
      ];
   }
   async revealFile(uri?: vscode.Uri): Promise<void> {
      if (!uri) return;
      await this.reveal(uri);
      this.openFile(uri);
   }
   async reveal(uri?: vscode.Uri): Promise<void>{
      if (!uri) return;
      await this.treeView.reveal(new File(uri, vscode.FileType.File), { select: true, focus: true });
   }

   private async showFileNameInputBox(dirname?: vscode.Uri, initialValue?: string): Promise<string | undefined> {
      const input = await vscode.window.showInputBox({
         value: initialValue,
         prompt: 'Enter a name for the file.',
         validateInput: value => {
            if (value === '') return 'Please input any string.';
            if (/[/\\:?*"<>|]/.test(value)) return 'File name may not contain /\\:?*"<>|';
            if (dirname && this.fileSystemProvider.exists(vscode.Uri.joinPath(dirname, value))) return `${value} is already exists.`;
            return undefined;
         }
      });
      return (input && dirname ? path.join(dirname.fsPath, input) : input)?.trim();
   }

   private geSelectedFiles(rightClickedFile?: File): File[] | undefined {
      if (!this.config.notesDir) return undefined;
      if (!rightClickedFile) return this.treeView.selection.length ? [...this.treeView.selection] : [new File(this.config.notesDir, vscode.FileType.Directory)];
      if (!this.treeView.selection.length) return [rightClickedFile];
      if (this.treeView.selection.findIndex(selectedFile => selectedFile.uri.fsPath === rightClickedFile.uri.fsPath) === -1) return [rightClickedFile];
      else return [...this.treeView.selection];
   }

   private async openFile(uri?: vscode.Uri): Promise<void> {
      if (!uri) return;

      const isEditMode = this.config.displayMode === DisplayMode.Edit;

      if (isEditMode || this.config.previewEngine === Config.PreviewEngine.Disuse || path.extname(uri.fsPath) !== '.md') {
         await vscode.commands.executeCommand('vscode.open', uri);
         await vscode.commands.executeCommand('workbench.action.focusSideBar');
         return;
      }

      switch (this.config.previewEngine) {
         case 'enhanced':
            await vscode.commands.executeCommand('vscode.open', uri);
            await vscode.commands.executeCommand('markdown-preview-enhanced.openPreviewToTheSide', uri);
            if (this.config.singlePreview) this.config.singlePreview = false; //allow multiple preview
            break;
         case 'default':
         default:
            await vscode.commands.executeCommand('markdown.showPreview', uri);
            await vscode.commands.executeCommand('markdown.preview.toggleLock'); //allow multiple preview
            break;
      }
      await vscode.commands.executeCommand('workbench.action.focusSideBar');
   }

   private refresh(): void {
      this.treeDataProvider.refresh();
   }

   private async createNewFile(file?: File): Promise<void> {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;
      const filename = vscode.Uri.file(input);

      this.fileSystemProvider.writeFile(filename, new Uint8Array(), { create: true, overwrite: false });

      this.openFile(filename);
   }
   private async createNewPromptOfFile(file?: File): Promise<void> {
      if (!this.config.notesDir) return;
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);
      if(selectedFile.uri.fsPath.endsWith('.prompt.md')) return;
      if (selectedFile.uri.fsPath.endsWith('.chatlog.md')) return;
      const newFilePath = selectedFile.uri.fsPath.replace('.md', '.prompt.md');
      if (this.fileSystemProvider.exists(vscode.Uri.file(newFilePath)))return;
      const filename = vscode.Uri.file(newFilePath);
      this.fileSystemProvider.writeFile(filename, new Uint8Array(), { create: true, overwrite: false });

      this.openFile(filename);
   }

   private async createNewFolder(file?: File): Promise<void> {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;
      const filename = vscode.Uri.file(input);

      this.fileSystemProvider.createDirectory(filename);
   }
   private async createNewFolderByName(dirUri?: vscode.Uri): Promise<void> {
      if (!this.config.notesDir) return;
      if(!dirUri) return;
      this.fileSystemProvider.createDirectory(dirUri);
   }
   private async createNewFileByName(file?: vscode.Uri): Promise<void> {
      if (!this.config.notesDir) return;
      if(!file) return;

      //检查文件是否存在
      if (! this.fileSystemProvider.exists(file)) {
         //创建文件
         try {
            const dirUri = vscode.Uri.file(path.dirname(file.fsPath));
            if (! this.fileSystemProvider.exists(dirUri)) {
               await this.fileSystemProvider.createDirectory(dirUri);
            }
            const fileName = path.basename(file.fsPath, '.md');
            const content = `# ${fileName}\n\n`;
            await this.fileSystemProvider.writeFile(file, Buffer.from(content, 'utf8'), { create: true, overwrite: false });
         } catch (error) {
            console.error(`创建文件失败: ${file.fsPath}`, error);
            vscode.window.showErrorMessage(`创建文件失败: ${file.fsPath}`);
         }
      } else {
         //如果文件已存在，则直接打开
         this.openFile(file);
      }
   }

   private openInIntegratedTerminal(file?: File): void {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const terminal = vscode.window.createTerminal({ cwd: dirname });
      terminal.show();
   }

   private openInNewWindow(file?: File): void {
      if (!this.config.notesDir) return;
      vscode.commands.executeCommand('vscode.openFolder', this.config.notesDir, { forceNewWindow: true });
      //vscode.openFolder 没有参数打开新窗口并 reveal 指定的文件
   }

   private findInFolder(file?: File): void {
      if (!this.config.notesDir) return;
      const selectedFiles = this.geSelectedFiles(file);
      if (!selectedFiles) return;
      //@ts-ignore type inference of `this.config.notesDir` does not work.
      const dirnames: string[] = selectedFiles.map(selectedFile => path.resolve(this.config.notesDir.fsPath, selectedFile.type === vscode.FileType.Directory ? selectedFile.uri.fsPath : path.dirname(selectedFile.uri.fsPath)));
      vscode.commands.executeCommand('workbench.action.findInFiles', {
         query: '',
         replace: '',
         filesToInclude: dirnames.join(','),
         filesToExclude: ''
      });
   }

   private cut(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedUris: vscode.Uri[] = file ? [file.uri] : this.treeView.selection.map(file => file.uri);
      this.clipboard = { uris: selectedUris, cut: true };
   }

   private copy(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedUris: vscode.Uri[] = file ? [file.uri] : this.treeView.selection.map(file => file.uri);
      this.clipboard = { uris: selectedUris, cut: false };
   }

   private paste(file?: File): void {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);

      if (!this.clipboard) {
         vscode.window.showErrorMessage('Clipboard is empty.');
         return;
      }

      for (const uri of this.clipboard.uris) {
         const destParent = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri.fsPath : path.dirname(selectedFile.uri.fsPath);
         const destExt = path.extname(uri.fsPath);
         const destBase = path.basename(uri.fsPath, destExt);
         let count = 1;
         let filePath: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase}${destExt}`);
         while (this.fileSystemProvider.exists(filePath) && count <= 100) {
            if (count === 1) {
               filePath = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase} copy${destExt}`);
               count++;
            } else {
               filePath = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase} copy${count++}${destExt}`);
            }
         }

         if (count > 100) {
            vscode.window.showErrorMessage(`File named "${path.join(destParent), `${destBase} copy{n}${destExt}`}" has reached copying limit. Please delete these files.`);
            continue;
         }

         //check subdirectory
         if (isChild(uri.fsPath, filePath.fsPath)) {
            vscode.window.showErrorMessage(`Cannot ${this.clipboard.cut ? 'cut' : 'copy'} "${uri.fsPath}" to a subdirectory of itself, "${filePath.fsPath}".`);
            continue;
         }

         if (this.clipboard.cut) {
            this.fileSystemProvider.move(uri, filePath, { overwrite: false });
         } else {
            this.fileSystemProvider.copy(uri, filePath, { overwrite: false });
         }
      }

      if (this.clipboard.cut) this.clipboard = undefined;
   }

   private copyPath(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      vscode.env.clipboard.writeText(selectedFile.uri.fsPath);
   }

   private copyRelativePath(file?: File): void {
      if (!this.config.notesDir) return;
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      vscode.env.clipboard.writeText(path.relative(this.config.notesDir.fsPath, selectedFile.uri.fsPath));
   }

   private async rename(file?: File): Promise<void> {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];

      const dirname = vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));
      const input = await this.showFileNameInputBox(dirname, path.basename(selectedFile.uri.fsPath));
      if (!input) return;

      this.fileSystemProvider.rename(selectedFile.uri, vscode.Uri.file(input), { overwrite: false });
   }


   private async delete(file?: File): Promise<void> {
      if (!file && !this.treeView.selection.length) return;
      const selectedUris: vscode.Uri[] | undefined = this.geSelectedFiles(file)?.map(file => file.uri);
      if (!selectedUris) return;
      for (const uri of selectedUris) {
         if (this.config.confirmDelete) {
            const input = await vscode.window.showWarningMessage(`Are you sure you want to delete "${path.basename(uri.fsPath)}"?`, 'Delete', 'Cancel', 'Do not ask me again');
            if (input === 'Cancel') return;
            if (input === 'Do not ask me again') this.config.confirmDelete = false;
         }
         this.fileSystemProvider.delete(uri, { recursive: true });
      }
   }

   //#endregion

}
