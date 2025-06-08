import * as vscode from 'vscode'; // Ensure vscode is imported
import * as path from 'path'; // Import path module
import { FileSystemProvider } from './fileSystemProvider'; // Ensure FileSystemProvider is imported
import { Config } from './config'; // Ensure Config is imported (used by constructor)
import dayjs from 'dayjs'; // Changed import for dayjs
import { MarkdownLinkHandler } from './markdownLinkHandler'; // Added import


// Ideally, this interface should be in a shared types.ts file
interface HeadingRange {
    level: number;
    text: string;
    line: number;
    character: number;
    children: HeadingRange[];
    // Added for internal tracking if needed
    parent?: HeadingRange;
    // Store the full range in the document for easier editing
    fullRange?: vscode.Range;
}

export class TodayOutlineProvider implements vscode.TreeDataProvider<HeadingRange>, vscode.TreeDragAndDropController<HeadingRange>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<HeadingRange | undefined | null | void> = new vscode.EventEmitter<HeadingRange | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HeadingRange | undefined | null | void> = this._onDidChangeTreeData.event;

    public readonly dragMimeTypes = ['application/vnd.code.tree.daily-order.todayExplorer'];
    public readonly dropMimeTypes = ['application/vnd.code.tree.daily-order.todayExplorer', 'text/uri-list'];

    private headings: HeadingRange[] = [];
    private todayNoteUri?: vscode.Uri;
    private fileSystemWatcher?: vscode.FileSystemWatcher;
    private disposables: vscode.Disposable[] = [];
    private treeView?: vscode.TreeView<HeadingRange>;
    private parentMap: Map<HeadingRange, HeadingRange | undefined> = new Map();
    private config: Config = Config.getInstance();
    private readonly todayOrderDirName: string = 'TodayOrder'; // As used in NoteExplorer

    // Added properties for active editor tracking
    private editor?: vscode.TextEditor;
    private documentVersion: number = 0;

    constructor(
        private context: vscode.ExtensionContext,
        private readonly fileSystemProvider: FileSystemProvider
    ) {
        this.registerCommands();
        this.setupConfigListener();
        this.initializeTodayNote(); // Existing initialization for today's note
        this.setupEventListeners(); // Added for general active editor listening
    }

    public static register(context: vscode.ExtensionContext, fileSystemProvider: FileSystemProvider): void {
        const todayOutlineProvider = new TodayOutlineProvider(context, fileSystemProvider);
        const todayTreeView = vscode.window.createTreeView('daily-order.todayExplorer', {
            treeDataProvider: todayOutlineProvider,
            showCollapseAll: true,
            canSelectMany: false,
            dragAndDropController: todayOutlineProvider // <--- 添加这一行
        });
        todayOutlineProvider.setTreeView(todayTreeView); // Pass the tree view to the provider
        context.subscriptions.push(todayTreeView);
        context.subscriptions.push(todayOutlineProvider); // todayOutlineProvider is Disposable
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        if (this.fileSystemWatcher) {
            this.fileSystemWatcher.dispose();
        }
        this._onDidChangeTreeData.dispose();
    }

    private async initializeTodayNote(): Promise<void> {
        await this.updateTodayNoteUriAndParse();
        this.setupFileWatcher();
    }

    private setupConfigListener(): void {
        this.disposables.push(
            this.config.onDidChangeConfig(e => {
                if (e && e.includes(Config.ConfigItem.NotesDir)) {
                    this.updateTodayNoteUriAndParse();
                }
            })
        );
    }

    private async getTodayNoteUri(): Promise<vscode.Uri | undefined> {
        const notesDir = this.config.notesDir;
        if (!notesDir) {
            // vscode.window.showInformationMessage('Notes directory is not set for Today Explorer.');
            return undefined;
        }

        const todayOrderFolderUri = vscode.Uri.joinPath(notesDir, this.todayOrderDirName);

        // Ensure TodayOrder folder exists (optional, NoteExplorer might handle this)
        // For robustness, TodayExplorer can also check/create.
        if (!await this.fileSystemProvider.exists(todayOrderFolderUri)) {
            try {
                await this.fileSystemProvider.createDirectory(todayOrderFolderUri);
            } catch (error) {
                console.error(`TodayExplorer: Failed to create directory ${todayOrderFolderUri.fsPath}: ${error}`);
                return undefined;
            }
        }

        const today = dayjs();
        const noteFileName = today.format('YYYY-MM-DD') + '.md';
        const noteFileUri = vscode.Uri.joinPath(todayOrderFolderUri, noteFileName);

        // Ensure today's note file exists (optional, NoteExplorer might handle this)
        if (!await this.fileSystemProvider.exists(noteFileUri)) {
            const template = `# ${today.format('YYYY-MM-DD')}\n\n`;
            try {
                await this.fileSystemProvider.writeFile(noteFileUri, Buffer.from(template), { create: true, overwrite: false });
            } catch (error) {
                console.error(`TodayExplorer: Failed to create note file ${noteFileUri.fsPath}: ${error}`);
                // Don't return undefined here, as the file might be created by another process shortly
            }
        }
        return noteFileUri;
    }


    private async updateTodayNoteUriAndParse(): Promise<void> {
        const oldUriFsPath = this.todayNoteUri?.fsPath;
        vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineLoaded', false);
        const newUri = await this.getTodayNoteUri();

        if (newUri) {
            if (!this.todayNoteUri || newUri.fsPath !== oldUriFsPath) {
                this.todayNoteUri = newUri;
                this.setupFileWatcher(); // Re-setup watcher for the new/correct file or if it's the first time
            }
        } else { // newUri is undefined
            if (this.todayNoteUri) { // If there was an old URI, clear it and its watcher
                this.todayNoteUri = undefined;
                if (this.fileSystemWatcher) {
                    this.fileSystemWatcher.dispose();
                    this.fileSystemWatcher = undefined;
                }
            }
            this.headings = [];
            this.parentMap.clear();
            vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineEmpty', true);
            this.refresh();
        }

        if (this.todayNoteUri) {
            await this.parseTodayNote();
        }
        // This should be set after attempting to parse, reflecting the loaded state.
        vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineLoaded', true);
    }

    private setupFileWatcher(): void {
        if (this.fileSystemWatcher) {
            this.fileSystemWatcher.dispose();
            this.fileSystemWatcher = undefined;
        }
        if (this.todayNoteUri) {
            const watcherPattern = new vscode.RelativePattern(
                vscode.Uri.file(path.dirname(this.todayNoteUri.fsPath)),
                path.basename(this.todayNoteUri.fsPath)
            );

            // ignoreCreateEvents = true (directory watcher handles initial creation, this is for an existing file)
            // ignoreChangeEvents = false (we want to know about changes)
            // ignoreDeleteEvents = false (we want to know if it's deleted)
            this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(watcherPattern, true, false, false);

            this.fileSystemWatcher.onDidChange(async (uri) => {
                if (this.todayNoteUri && uri.fsPath === this.todayNoteUri.fsPath) {
                    const currentExpectedUri = await this.getTodayNoteUri();
                    if (currentExpectedUri && this.todayNoteUri.fsPath === currentExpectedUri.fsPath) {
                        await this.parseTodayNote();
                    } else {
                        await this.updateTodayNoteUriAndParse(); // Date/config changed
                    }
                }
            });

            this.fileSystemWatcher.onDidDelete(async (uri) => {
                if (this.todayNoteUri && uri.fsPath === this.todayNoteUri.fsPath) {
                    await this.updateTodayNoteUriAndParse(); // File deleted, re-initialize
                }
            });
            this.disposables.push(this.fileSystemWatcher);
        }
    }

    private handleTodayNoteFileChange(uri: vscode.Uri): void {
        if (this.todayNoteUri && uri.fsPath === this.todayNoteUri.fsPath) {
            this.parseTodayNote();
        } else {
            // If a new YYYY-MM-DD.md is created that matches today, update.
            this.getTodayNoteUri().then(currentExpectedUri => {
                if (currentExpectedUri && uri.fsPath === currentExpectedUri.fsPath) {
                    this.todayNoteUri = currentExpectedUri;
                    this.setupFileWatcher();
                    this.parseTodayNote();
                }
            });
        }
    }

    private async parseTodayNote(): Promise<void> {
        vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineLoaded', false);
        if (!this.todayNoteUri || !await this.fileSystemProvider.exists(this.todayNoteUri)) {
            this.headings = [];
            this.parentMap.clear();
            vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineEmpty', true);
            vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineLoaded', true);
            this.refresh();
            return;
        }

        try {
            const fileContentBytes = await this.fileSystemProvider.readFile(this.todayNoteUri);
            const fileContent = Buffer.from(fileContentBytes).toString('utf8');

            // Create a temporary document for parsing logic (or adapt parsing)
            // This is a simplified way to reuse vscode.TextDocument logic if needed by parsers
            // Or, parse directly from string.
            const tempDocument = {
                getText: () => fileContent,
                positionAt: (offset: number) => {
                    const lines = fileContent.substring(0, offset).split('\n');
                    const line = lines.length - 1;
                    const character = lines[line].length;
                    return new vscode.Position(line, character);
                },
                offsetAt: (position: vscode.Position) => {
                    const lines = fileContent.split('\n');
                    let offset = 0;
                    for (let i = 0; i < position.line; i++) {
                        offset += lines[i].length + 1; // +1 for newline char
                    }
                    offset += position.character;
                    return offset;
                },
                lineCount: fileContent.split('\n').length,
                uri: this.todayNoteUri // For context
            } as unknown as vscode.TextDocument; // Cast carefully


            this.parse(tempDocument); // Use the existing parse logic
            vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineEmpty', this.headings.length === 0);
            this.refresh();
        } catch (error) {
            console.error(`TodayExplorer: Error reading or parsing today's note ${this.todayNoteUri.fsPath}:`, error);
            this.headings = [];
            this.parentMap.clear();
            vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineEmpty', true);
            this.refresh();
        }
        vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineLoaded', true);
    }

    // Adapted from OutlineProvider
    private parse(document: vscode.TextDocument) {
        const text = document.getText();
        // Regex to find markdown headings
        const regex = /^(#{1,6})\s+(.+?)(?:\s+#{1,})?\s*$/gm;
        let match;

        const headings: HeadingRange[] = [];
        let lastHeadingByLevel: { [key: number]: HeadingRange } = {};
        this.parentMap.clear();

        let currentLine = 0;
        let lineOffset = 0;

        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            // Reset regex lastIndex for each line if using exec in a loop over lines
            // For global regex on full text, this is fine.
            // We need to map match.index (offset in full text) to line number.
        }


        while ((match = regex.exec(text)) !== null) {
            const level = match[1].length;
            const title = match[2].trim();

            const matchStartOffset = match.index;
            const docPosition = document.positionAt(matchStartOffset);
            const line = docPosition.line;
            const character = docPosition.character;

            const heading: HeadingRange = {
                level,
                text: title,
                line,
                character,
                children: []
            };

            if (level === 1) {
                headings.push(heading);
                this.parentMap.set(heading, undefined);
            } else {
                let parentLevel = level - 1;
                let parentFound = false;
                while (parentLevel > 0) {
                    const potentialParent = lastHeadingByLevel[parentLevel];
                    if (potentialParent) {
                        potentialParent.children.push(heading);
                        this.parentMap.set(heading, potentialParent);
                        heading.parent = potentialParent;
                        parentFound = true;
                        break;
                    }
                    parentLevel--;
                }
                if (!parentFound) {
                    headings.push(heading);
                    this.parentMap.set(heading, undefined);
                }
            }
            lastHeadingByLevel[level] = heading;
        }
        this.headings = headings;
    }


    public setTreeView(treeView: vscode.TreeView<HeadingRange>): void {
        this.treeView = treeView;
    }

    private registerCommands() {
        this.disposables.push(
            vscode.commands.registerCommand('daily-order.todayExplorer.refresh', () => this.updateTodayNoteUriAndParse()),
            vscode.commands.registerCommand('daily-order.todayExplorer.collapseAll', () => this.collapseAll()),
            vscode.commands.registerCommand('daily-order.todayExplorer.expandAll', () => this.expandAll()),
            vscode.commands.registerCommand('daily-order.todayExplorer.goToHeading', (heading: HeadingRange) => this.goToHeading(heading))
        );
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private collapseAll(): void {
        if (this.treeView) {
            vscode.commands.executeCommand('workbench.actions.treeView.daily-order.todayExplorer.collapseAll');
        }
    }

    private async expandAll(): Promise<void> {
        if (!this.treeView) return;
        const expandNode = async (heading: HeadingRange): Promise<void> => {
            // Removed incomplete if statement
            if (heading.children && heading.children.length > 0) {
                for (const child of heading.children) {
                    if (this.treeView) { // Added null check for this.treeView
                        await this.treeView.reveal(child, { expand: true, focus: false, select: false });
                    }
                    await expandNode(child); // Recursively expand children
                }
            }
        };

        for (const heading of this.headings) {
            if (this.treeView) { // Added null check for this.treeView
                await this.treeView.reveal(heading, { expand: true, focus: false, select: false });
            }
            await expandNode(heading);
        }
    }

    private async goToHeading(heading: HeadingRange) {
        if (!this.todayNoteUri) {
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(this.todayNoteUri);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(heading.line, heading.character);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } catch (error) {
            console.error(`Error navigating to heading: ${error}`);
            vscode.window.showErrorMessage(`Could not navigate to heading: ${heading.text}`);
        }
    }

    getTreeItem(element: HeadingRange): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.text, element.children.length === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
        treeItem.command = {
            command: 'daily-order.todayExplorer.goToHeading',
            title: 'Go to Heading',
            arguments: [element]
        };
        return treeItem;
    }

    getChildren(element?: HeadingRange): vscode.ProviderResult<HeadingRange[]> {
        if (!this.headings) {
            return [];
        }
        if (element) {
            return element.children;
        } else {
            return this.headings;
        }
    }

    getParent(element: HeadingRange): vscode.ProviderResult<HeadingRange> {
        return this.parentMap.get(element);
    }

    private setupEventListeners() {

        // 监听文档内容变化
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.path === this.todayNoteUri?.path) {
                    // 防抖处理，避免过于频繁的更新
                    if (e.document.version !== this.documentVersion) {
                        this.documentVersion = e.document.version;
                        setTimeout(() => {
                            if (this.documentVersion === e.document.version) {
                                this.parse(e.document);
                                this.refresh();
                                vscode.commands.executeCommand('setContext', 'daily-order.todayOutlineEmpty', this.headings.length === 0);
                            }
                        }, 500);
                    }
                }
            })
        );

    }

    // --- Drag and Drop --- (Implementation for TreeDragAndDropController)
    public async handleDrag(source: readonly HeadingRange[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        if (token.isCancellationRequested) {
            return;
        }

        if (source.length > 0) {
            try {
                // Create a version of the source items that is safe for DataTransferItem.
                // This means removing circular references (parent) and complex VS Code objects (fullRange).
                const transferableSource = source.map(h => ({
                    level: h.level,
                    text: h.text,
                    line: h.line,
                    character: h.character,
                    children: [], // Keep structure similar to HeadingRange, parent and fullRange are omitted.
                }));

                dataTransfer.set(this.dragMimeTypes[0], new vscode.DataTransferItem(transferableSource));
            } catch (error) {
                console.error('handleDrag: Error setting DataTransferItem:', error);
            }
        } else {
            console.log('handleDrag: source is empty.');
        }
    }

    public async handleDrop(target: HeadingRange | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        if (token.isCancellationRequested) {
            return;
        }

        if (!this.todayNoteUri) {
            vscode.window.showErrorMessage("Cannot drop: Today's note is not available.");
            return;
        }

        const headingTransferItem = dataTransfer.get(this.dragMimeTypes[0]);
        // this.dropMimeTypes[1] should be 'text/uri-list' based on the class property definition
        const uriListTransferItem = dataTransfer.get(this.dropMimeTypes[1]);

        if (headingTransferItem) {
            const sourceHeadings = headingTransferItem.value as HeadingRange[];
            if (!sourceHeadings || sourceHeadings.length === 0) {
                vscode.window.showInformationMessage('No source heading data found in transfer item.');
                return;
            }
            const sourceHeading = sourceHeadings[0]; // Assuming single item drag

            if (!target) {
                // vscode.window.showInformationMessage('Cannot drop heading here: a target heading is required.');
                return;
            }

            if (target.line === sourceHeading.line && target.character === sourceHeading.character) {
                return;
            }

            try {
                const document = await vscode.workspace.openTextDocument(this.todayNoteUri);
                const edit = new vscode.WorkspaceEdit();

                const sourceContentRange = this.getHeadingContentRange(document, sourceHeading);
                if (!sourceContentRange) {
                    vscode.window.showErrorMessage('Could not determine the range of the dragged heading.');
                    return;
                }
                const originalSourceContent = document.getText(sourceContentRange);

                edit.delete(this.todayNoteUri, sourceContentRange);

                const targetContentRange = this.getHeadingContentRange(document, target);
                if (!targetContentRange) {
                    vscode.window.showErrorMessage('Could not determine the range of the target heading.');
                    return;
                }
                const insertLine = targetContentRange.end.line + 1;

                const levelDiff = target.level - sourceHeading.level + 1;
                const adjustedSourceContent = this.adjustHeadingLevelInText(originalSourceContent, levelDiff);
                const insertPosition = new vscode.Position(insertLine, 0);

                let prefix = '\n';
                if (insertLine === 0) {
                    prefix = '';
                } else {
                    // This logic for prefix assumes document state before modification.
                    // It might need adjustment if source and target are close and deletion affects line numbers.
                    // For now, retaining original logic.
                    const lineBefore = document.lineAt(insertLine - 1);
                    if (lineBefore.isEmptyOrWhitespace) {
                        prefix = '';
                    }
                }
                let contentToInsert = adjustedSourceContent;
                if (!contentToInsert.endsWith('\n')) {
                    contentToInsert += '\n';
                }

                edit.insert(this.todayNoteUri, insertPosition, prefix + contentToInsert);

                await vscode.workspace.applyEdit(edit);
                await this.parseTodayNote();

            } catch (error) {
                console.error('Error handling heading drop:', error);
                vscode.window.showErrorMessage('Failed to move heading. ' + (error instanceof Error ? error.message : String(error)));
            }

        } else if (uriListTransferItem) {
            try {
                const uriString = await uriListTransferItem.asString();
                const uris = uriString.split(/\\r?\n/).map(u => u.trim()).filter(u => u !== '');

                if (uris.length === 0) {
                    vscode.window.showInformationMessage('No valid URI found in the dropped item.');
                    return;
                }

                const document = await vscode.workspace.openTextDocument(this.todayNoteUri);
                const edit = new vscode.WorkspaceEdit();

                let cumulativeMarkdownLinks = '';
                for (let uri of uris) {

                    let title = 'link';
                    try {
                        uri = decodeURIComponent(uri);
                    } catch { }
                    try {
                        const parsedUrl = new URL(uri);
                        const basename = path.basename(decodeURIComponent(parsedUrl.pathname));
                        // Check if basename is meaningful (not just '/' or empty)
                        if (basename && basename !== '/' && basename !== '.') {
                            title = basename;
                        } else if (parsedUrl.hostname) { // For URLs like http://example.com/
                            title = parsedUrl.hostname;
                        } else { // Fallback if pathname is trivial and no clear hostname
                            title = uri; // Use full URI if nothing better
                        }
                    } catch (e) {
                        // If not a standard URL (e.g. local path like C:\\folder\\file.txt), URL constructor throws
                        title = path.basename(uri);
                    }
                    if (!title || title === '.' || title === '/') { // Final fallback if title ended up empty or trivial
                        title = "untitled link";
                    }
                    const linkPath = MarkdownLinkHandler.getInstance().generateLinkPathForNote(vscode.Uri.parse(uri));
                    cumulativeMarkdownLinks += `${'#'.repeat(target?.level ? target.level + 1 : 1)} [${title}](${linkPath})\n`;
                }

                let insertPosition: vscode.Position;
                let prefixForBlock = '';

                if (target) {
                    const targetContentRange = this.getHeadingContentRange(document, target);
                    if (!targetContentRange) {
                        vscode.window.showErrorMessage('Could not determine the range of the target heading for URI drop.');
                        return;
                    }
                    const insertLine = targetContentRange.end.line + 1;
                    insertPosition = new vscode.Position(insertLine, 0);

                    if (insertLine > 0) {
                        const lineBefore = document.lineAt(insertLine - 1);
                        if (!lineBefore.isEmptyOrWhitespace) {
                            prefixForBlock = '\n';
                        }
                    }
                } else {
                    // No target, append to the end of the document
                    const lastLineNumber = document.lineCount > 0 ? document.lineCount - 1 : 0;
                    insertPosition = new vscode.Position(document.lineCount, 0);

                    if (document.lineCount > 0) {
                        const lastLineText = document.lineAt(lastLineNumber).text;
                        if (lastLineText.trim() !== '') {
                            prefixForBlock = '\n';
                        }
                    }
                }

                edit.insert(this.todayNoteUri, insertPosition, prefixForBlock + cumulativeMarkdownLinks);
                await vscode.workspace.applyEdit(edit);
                await this.parseTodayNote();

            } catch (error) {
                console.error('Error handling URI drop:', error);
                vscode.window.showErrorMessage('Failed to insert URI link. ' + (error instanceof Error ? error.message : String(error)));
            }
        } else {
            // vscode.window.showInformationMessage('Unsupported data type dropped or no data found.');
        }
    }

    // Helper function to get the full range of a heading and its children
    private getHeadingContentRange(document: vscode.TextDocument, heading: HeadingRange): vscode.Range | undefined {
        const startPosition = new vscode.Position(heading.line, 0);
        let endLine = heading.line;
        const lines = document.getText().split('\n'); // Use document.lineCount for robustness

        // Iterate to find the start of the next heading at the same or lower level, or EOF
        for (let i = heading.line + 1; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = /^(#{1,6})\s+.*/.exec(lineText);
            if (match) {
                const currentLevel = match[1].length;
                if (currentLevel <= heading.level) {
                    endLine = i - 1; // The previous line was the last line
                    break;
                }
            }
            if (i === document.lineCount - 1) { // Reached end of document
                endLine = i;
            }
        }

        endLine = Math.max(heading.line, endLine); // Ensure endLine is at least the heading line
        const endOfLineText = document.lineAt(endLine).text;
        const endPosition = new vscode.Position(endLine, endOfLineText.length);

        return new vscode.Range(startPosition, endPosition);
    }

    // (getHeadingAndChildrenAsText can be removed if sourceContent is directly obtained via document.getText(sourceContentRange))

    private adjustHeadingLevelInText(textBlock: string, levelDiff: number): string {
        const lines = textBlock.split('\n');

        // Adjust all headings within the block relative to the levelDiff
        return lines.map(line => {
            const match = /^(#{1,6})(\s+.*)/.exec(line);
            if (match) {
                let currentLevel = match[1].length;
                let newLevel = Math.max(1, Math.min(6, currentLevel + levelDiff));
                return '#'.repeat(newLevel) + match[2];
            }
            return line;
        }).join('\n');
    }
}

