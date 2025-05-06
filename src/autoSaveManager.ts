import * as vscode from 'vscode';
import { Config } from './config';

export class AutoSaveManager {
    private static instance: AutoSaveManager;
    private disposables: vscode.Disposable[] = [];
    private saveTimeout: NodeJS.Timeout | undefined;
    private config: Config;

    private constructor() {
        this.config = Config.getInstance();
        
        // 监听编辑器内容变化
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.shouldAutoSave(event.document)) {
                    this.triggerAutoSave(event.document);
                }
            })
        );

        // 监听配置变化
        this.disposables.push(
            this.config.onDidChangeConfig(configItems => {
                if (configItems?.includes(Config.ConfigItem.NotesDir)) {
                    // 当笔记目录改变时，重新检查所有打开的文档
                    vscode.workspace.textDocuments.forEach(document => {
                        if (this.shouldAutoSave(document)) {
                            this.triggerAutoSave(document);
                        }
                    });
                }
            })
        );
    }

    private shouldAutoSave(document: vscode.TextDocument): boolean {
        // 检查是否是 markdown 文件
        if (document.languageId !== 'markdown') {
            return false;
        }

        // 检查是否在笔记目录下
        const notesDir = this.config.notesDir;
        if (!notesDir) {
            return false;
        }

        const documentPath = document.uri.fsPath;
        const notesDirPath = notesDir.fsPath;
        
        return documentPath.startsWith(notesDirPath);
    }

    public static getInstance(): AutoSaveManager {
        if (!AutoSaveManager.instance) {
            AutoSaveManager.instance = new AutoSaveManager();
        }
        return AutoSaveManager.instance;
    }

    private triggerAutoSave(document: vscode.TextDocument): void {
        // 清除现有的定时器
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // 创建一个新的定时器，1秒后执行自动保存
        this.saveTimeout = setTimeout(() => {
            document.save();
        }, 1000);
    }

    public dispose(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.disposables.forEach(d => d.dispose());
    }
} 