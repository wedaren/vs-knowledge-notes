import * as vscode from 'vscode';

interface HeadingRange {
    line: number;
    character: number;
    text: string;
    level: number;
    end?: number;
    children: HeadingRange[];
}

export class OutlineProvider implements vscode.TreeDataProvider<HeadingRange>, vscode.TreeDragAndDropController<HeadingRange> {
    private _onDidChangeTreeData: vscode.EventEmitter<HeadingRange | undefined | null | void> = new vscode.EventEmitter<HeadingRange | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HeadingRange | undefined | null | void> = this._onDidChangeTreeData.event;

    // 拖放控制器实现
    public readonly dragMimeTypes = ['application/vnd.code.tree.daily-order.outlineExplorer'];
    public readonly dropMimeTypes = ['application/vnd.code.tree.daily-order.outlineExplorer'];

    private headings: HeadingRange[] = [];
    private editor?: vscode.TextEditor;
    private documentVersion: number = 0;
    private autoRefreshEnabled: boolean = true;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.registerCommands();
        this.setupEventListeners();
    }

    private registerCommands() {
        this.disposables.push(
            vscode.commands.registerCommand('daily-order.outlineExplorer.refresh', () => this.refresh()),
            vscode.commands.registerCommand('daily-order.outlineExplorer.collapseAll', () => this._onDidChangeTreeData.fire(undefined)),
            vscode.commands.registerCommand('daily-order.outlineExplorer.expandAll', () => this.expandAll()),
            vscode.commands.registerCommand('daily-order.outlineExplorer.addHeading', () => this.addNewHeading())
        );
    }

    private setupEventListeners() {
        // 监听活动编辑器变化
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document.languageId === 'markdown') {
                    this.editor = editor;
                    this.parse(editor.document);
                    this.refresh();
                    // 设置上下文变量
                    vscode.commands.executeCommand('setContext', 'activeEditorIsMarkdown', true);
                    vscode.commands.executeCommand('setContext', 'daily-order.outlineLoaded', true);
                } else {
                    vscode.commands.executeCommand('setContext', 'activeEditorIsMarkdown', false);
                }
            })
        );

        // 监听文档内容变化
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (this.editor && e.document === this.editor.document && this.autoRefreshEnabled) {
                    // 防抖处理，避免过于频繁的更新
                    if (e.document.version !== this.documentVersion) {
                        this.documentVersion = e.document.version;
                        setTimeout(() => {
                            if (this.editor && this.documentVersion === this.editor.document.version) {
                                this.parse(e.document);
                                this.refresh();
                            }
                        }, 500);
                    }
                }
            })
        );

        // 立即解析当前编辑器文档（如果是 Markdown）
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
            this.editor = vscode.window.activeTextEditor;
            this.parse(this.editor.document);
        }
    }

    // 解析 Markdown 文档中的标题
    private parse(document: vscode.TextDocument) {
        const text = document.getText();
        const regex = /^(#{1,6})\s+(.+?)(?:\s+#{1,})?\s*$/gm;
        let match;

        const headings: HeadingRange[] = [];
        let lastHeadingByLevel: { [key: number]: HeadingRange } = {};

        while ((match = regex.exec(text)) !== null) {
            const level = match[1].length;
            const title = match[2].trim();
            const line = document.positionAt(match.index).line;
            const character = document.positionAt(match.index).character;

            const heading: HeadingRange = {
                level,
                text: title,
                line,
                character,
                children: []
            };

            // 确定标题层级关系
            if (level === 1) {
                headings.push(heading);
            } else {
                // 寻找上一级标题作为父节点
                let parentLevel = level - 1;
                while (parentLevel > 0) {
                    const potentialParent = lastHeadingByLevel[parentLevel];
                    if (potentialParent) {
                        potentialParent.children.push(heading);
                        break;
                    }
                    parentLevel--;
                }

                // 如果没有找到父节点，则添加到根级别
                if (parentLevel === 0) {
                    headings.push(heading);
                }
            }

            lastHeadingByLevel[level] = heading;
        }

        this.headings = headings;
    }

    // 添加新标题
    private async addNewHeading() {
        if (!this.editor) {
            vscode.window.showErrorMessage('没有打开的 Markdown 文档');
            return;
        }

        const headingText = await vscode.window.showInputBox({
            prompt: '输入新标题内容',
            placeHolder: '标题文本'
        });

        if (!headingText) {
            return;
        }

        const headingLevel = await vscode.window.showQuickPick(
            ['# 一级标题', '## 二级标题', '### 三级标题', '#### 四级标题', '##### 五级标题', '###### 六级标题'],
            { placeHolder: '选择标题级别' }
        );

        if (!headingLevel) {
            return;
        }

        const level = headingLevel.split(' ')[0];
        const position = this.editor.selection.active;

        await this.editor.edit(editBuilder => {
            editBuilder.insert(position, `\n${level} ${headingText}\n\n`);
        });

        this.parse(this.editor.document);
        this.refresh();
    }

    // 刷新大纲视图
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // 展开所有节点
    private expandAll(): void {
        vscode.commands.executeCommand('workbench.actions.treeView.daily-order.outlineExplorer.expandAll');
    }

    // TreeDataProvider 接口实现
    getTreeItem(element: HeadingRange): vscode.TreeItem {
        const config = vscode.workspace.getConfiguration('daily-order.outline');
        const showNumbers = config.get<boolean>('showHeadingNumbers', true);

        let label = element.text;
        if (showNumbers) {
            label = `${element.level}. ${label}`;
        }

        const treeItem = new vscode.TreeItem(
            label,
            element.children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        // 设置拖放相关属性
        treeItem.description = `#${'#'.repeat(element.level - 1)}`;  // 显示标题级别

        treeItem.command = {
            command: 'vscode.open',
            title: 'Go to Heading',
            arguments: [
                this.editor?.document.uri,
                new vscode.Range(
                    new vscode.Position(element.line, element.character),
                    new vscode.Position(element.line, element.character + element.text.length)
                )
            ]
        };

        treeItem.tooltip = `${element.level}级标题: ${element.text}`;

        // 根据级别设置图标
        const icons = ['number-1', 'number-2', 'number-3', 'number-4', 'number-5', 'number-6'];
        if (element.level <= icons.length) {
            treeItem.iconPath = new vscode.ThemeIcon(icons[element.level - 1]);
        }

        // 支持拖拽
        treeItem.contextValue = `markdown-heading-level-${element.level}`;

        return treeItem;
    }

    getChildren(element?: HeadingRange): Thenable<HeadingRange[]> {
        if (element) {
            return Promise.resolve(element.children);
        }

        // 应用最大深度过滤
        const config = vscode.workspace.getConfiguration('daily-order.outline');
        const maxDepth = config.get<number>('maxDepth', 6);

        const filteredHeadings = this.filterByMaxDepth(this.headings, maxDepth);
        return Promise.resolve(filteredHeadings);
    }

    private filterByMaxDepth(headings: HeadingRange[], maxDepth: number): HeadingRange[] {
        return headings.map(h => {
            if (h.level <= maxDepth) {
                return {
                    ...h,
                    children: this.filterByMaxDepth(h.children, maxDepth)
                };
            }
            return null;
        }).filter((h): h is HeadingRange => h !== null);
    }

    public handleDrag(source: readonly HeadingRange[], dataTransfer: vscode.DataTransfer) {
        dataTransfer.set(this.dragMimeTypes[0], new vscode.DataTransferItem(source));
    }

    public async handleDrop(target: HeadingRange | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get(this.dragMimeTypes[0]);
        if (!transferItem || !this.editor) {
            console.log('拖放失败：没有传输项或没有活动编辑器');
            return;
        }

        const source = transferItem.value as HeadingRange[];
        if (source.length === 0) {
            console.log('拖放失败：源数组为空');
            return;
        }

        const sourceHeading = source[0];
        console.log(`拖放：从 ${sourceHeading.text} 到 ${target?.text || '根级别'}`);

        // 如果没有目标或目标是自身，则不执行操作
        if (!target || (sourceHeading.line === target.line && sourceHeading.character === target.character)) {
            console.log('拖放失败：目标无效或与源相同');
            return;
        }

        // 获取源标题及其内容
        const sourceRange = this.getHeadingContentRange(this.editor.document, sourceHeading);
        if (!sourceRange) {
            return;
        }

        const sourceContent = this.editor.document.getText(sourceRange);

        // 获取目标位置
        const targetPosition = new vscode.Position(target.line, 0);

        // 执行编辑操作
        await this.editor.edit(editBuilder => {
            // 先删除原内容
            editBuilder.delete(sourceRange);

            // 根据是否要改变层级来调整内容
            let modifiedContent = sourceContent;
            if (target.level !== sourceHeading.level) {
                // 调整标题级别
                const levelDiff = target.level - sourceHeading.level;
                modifiedContent = this.adjustHeadingLevel(sourceContent, levelDiff);
            }

            // 在目标位置前插入
            editBuilder.insert(targetPosition, modifiedContent + '\n');
        });

        // 刷新大纲
        this.parse(this.editor.document);
        this.refresh();
    }

    private getHeadingContentRange(document: vscode.TextDocument, heading: HeadingRange): vscode.Range | null {
        const text = document.getText();
        const lines = text.split('\n');

        // 找到标题所在行
        const startLine = heading.line;
        let endLine = document.lineCount - 1;

        // 查找下一个相同或更高级别的标题
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(#{1,6})\s+/);
            if (match && match[1].length <= heading.level) {
                endLine = i - 1;
                break;
            }
        }

        const startPos = new vscode.Position(startLine, 0);
        const endPos = new vscode.Position(endLine, lines[endLine].length);

        return new vscode.Range(startPos, endPos);
    }

    private adjustHeadingLevel(content: string, levelDiff: number): string {
        // 处理内容中的所有标题，调整级别
        return content.replace(/^(#{1,6})(\s+.+?)$/gm, (match, hashes, rest) => {
            let newLevel = hashes.length + levelDiff;
            // 确保新级别在有效范围内 (1-6)
            newLevel = Math.max(1, Math.min(6, newLevel));
            return '#'.repeat(newLevel) + rest;
        });
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

export function registerOutlineExplorer(context: vscode.ExtensionContext): vscode.Disposable {
    const outlineProvider = new OutlineProvider(context);

    // 注册 TreeView
    const treeView = vscode.window.createTreeView('daily-order.outlineExplorer', {
        treeDataProvider: outlineProvider,
        showCollapseAll: true,
        canSelectMany: false,
        dragAndDropController: outlineProvider
    });

    // 是否自动展开所有节点
    const config = vscode.workspace.getConfiguration('daily-order.outline');
    const autoExpandAll = config.get<boolean>('autoExpandAll', false);
    if (autoExpandAll) {
        setTimeout(() => {
            vscode.commands.executeCommand('workbench.actions.treeView.daily-order.outlineExplorer.expandAll');
        }, 1000);
    }

    context.subscriptions.push(treeView);

    return outlineProvider;
}
