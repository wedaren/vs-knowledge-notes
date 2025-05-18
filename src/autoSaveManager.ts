import * as vscode from 'vscode';
import { Config } from './config';

export class AutoSaveManager {
   private static instance: AutoSaveManager;
   private disposables: vscode.Disposable[] = [];
   private saveTimeout: NodeJS.Timeout | undefined;
   private config: Config;
   private isAutoSavePaused: boolean = false; // Added state for pausing

   private constructor() {
      this.config = Config.getInstance();

      //监听编辑器内容变化
      this.disposables.push(
         vscode.workspace.onDidChangeTextDocument(event => {
            if (this.shouldAutoSave(event.document)) {
               this.triggerAutoSave(event.document);
            }
         })
      );

      //监听手动保存
      this.disposables.push(
         vscode.workspace.onDidSaveTextDocument(document => {
            if (this.shouldAutoSave(document)) {
               this.applyMarkdownlintFixAllIfEnabled();
            }
         })
      );

      //监听配置变化
      this.disposables.push(
         this.config.onDidChangeConfig(configItems => {
            if (configItems?.includes(Config.ConfigItem.NotesDir) ||
               configItems?.includes(Config.ConfigItem.MarkdownlintFixAllOnSave) ||
               configItems?.includes(Config.ConfigItem.AutoSaveDelay)) { // Listen for AutoSaveDelay changes

               if (configItems?.includes(Config.ConfigItem.AutoSaveDelay) && this.saveTimeout) {
                  clearTimeout(this.saveTimeout); // Clear pending save if delay changes
                  this.saveTimeout = undefined;
               }

               //当笔记目录改变时，重新检查所有打开的文档
               vscode.workspace.textDocuments.forEach(document => {
                  if (this.shouldAutoSave(document)) {
                     this.triggerAutoSave(document); // Re-trigger with new settings if applicable
                  }
               });
            }
         })
      );
   }

   private shouldAutoSave(document: vscode.TextDocument): boolean {
      //检查是否是 markdown 文件
      //⚠️ prompt.md  在 vscode 中是 prompt
      if (!['markdown', 'prompt'].includes(document.languageId)) {
         return false;
      }

      //检查是否在笔记目录下
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

   public toggleAutoSavePause(): void {
      this.isAutoSavePaused = !this.isAutoSavePaused;
      vscode.window.showInformationMessage(`Auto-save is now ${this.isAutoSavePaused ? 'paused' : 'active'}.`);
      if (!this.isAutoSavePaused && this.saveTimeout) {
         // If unpausing, and a save was pending, clear it.
         // New edits will trigger a new save timeout.
         clearTimeout(this.saveTimeout);
         this.saveTimeout = undefined;
      }
   }

   private triggerAutoSave(document: vscode.TextDocument): void {
      if (this.isAutoSavePaused) {
         return; // Do nothing if auto-save is paused
      }
      //清除现有的定时器
      if (this.saveTimeout) {
         clearTimeout(this.saveTimeout);
      }

      //创建一个新的定时器，使用配置的延迟时间后执行自动保存
      this.saveTimeout = setTimeout(() => {
         document.save().then(() => {
            this.applyMarkdownlintFixAllIfEnabled();
         });
      }, this.config.autoSaveDelay) as unknown as NodeJS.Timeout; // Use configurable delay and cast to NodeJS.Timeout
   }

   private applyMarkdownlintFixAllIfEnabled(): void {
      if (this.config.markdownlintFixAllOnSave) {
         vscode.commands.executeCommand('markdownlint.fixAll');
      }
   }

   public dispose(): void {
      if (this.saveTimeout) {
         clearTimeout(this.saveTimeout);
      }
      this.disposables.forEach(d => d.dispose());
   }
}
