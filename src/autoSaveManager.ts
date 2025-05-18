import * as vscode from 'vscode';
import { Config } from './config';
import { Logger } from './logger'; // 导入 Logger

/**
 * AutoSaveManager 策略说明:
 *
 * 1. 插件自身的自动保存 (由 `daily-order.autoSaveDelay` 控制):
 *    - 当检测到受监视文件 (笔记目录下的 markdown/prompt 文件) 内容变化后，会启动一个定时器。
 *    - 在 `config.autoSaveDelay` 毫秒后，如果未有新的变化重置定时器，则插件会自动保存文件。
 *    - 保存成功后，如果 `config.markdownlintFixAllOnSave` 为 `true`，则会立即执行 markdownlint 修复。
 *
 * 2. 用户手动保存 (Cmd/Ctrl + S):
 *    - 当用户手动保存一个受监视的文件时。
 *    - 如果 `config.markdownlintFixAllOnSave` 为 `true`，则会立即执行 markdownlint 修复。
 *
 * 3. VS Code 内置的 `files.autoSave` (例如设置为 `afterDelay`):
 *    - 当 VS Code 根据其自身的 `files.autoSave` 和 `files.autoSaveDelay` 设置自动保存一个受监视的文件时。
 *    - 文件保存后，如果 `config.markdownlintFixAllOnSave` 为 `true`，插件会启动另一个定时器。
 *    - 这个定时器的延迟时间也使用 `config.autoSaveDelay` 的值。
 *    - 延迟结束后，如果 `config.markdownlintFixAllOnSave` 仍然为 `true`，则执行 markdownlint 修复。
 *    - 这样做是为了避免在 VS Code 频繁自动保存时过于频繁地触发 linting，同时仍然提供保存后的 linting 功能。
 *
 * 4. 配置项:
 *    - `daily-order.autoSaveDelay`: 控制插件自身自动保存的延迟，以及 VS Code `files.autoSave` 后 linting 的延迟。
 *    - `daily-order.markdownlintFixAllOnSave`: 总开关，控制在上述所有保存场景发生后是否执行 markdownlint 修复。
 *
 * 5. 暂停功能 (`toggleAutoSavePause`):
 *    - 可以暂停插件自身的自动保存功能 (`triggerAutoSave`)。
 *    - 不会影响手动保存或 VS Code `files.autoSave` 后的 linting 逻辑。
 *
 * 目标: 提供灵活的自动保存和 linting 体验，同时尝试与 VS Code 内置的自动保存机制和谐共存。
 */
export class AutoSaveManager {
   private static instance: AutoSaveManager;
   private disposables: vscode.Disposable[] = [];
   private saveTimeout: NodeJS.Timeout | undefined; // For this extension's auto-save
   private lintAfterVSCodeSaveTimeout: NodeJS.Timeout | undefined; // For linting after VS Code's files.autoSave
   private config: Config;
   private isAutoSavePaused: boolean = false;
   private _saveReasonForNextDidSave: { manual: boolean, vscodeAuto: boolean } | undefined;
   private _isExtensionSaving: boolean = false; // Flag to identify if the extension is currently saving

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

      // 监听文档即将保存的事件，以区分保存原因
      this.disposables.push(
         vscode.workspace.onWillSaveTextDocument(event => {
            if (!this.shouldAutoSave(event.document)) {
               this._saveReasonForNextDidSave = undefined; // 不是我们关心的文档
               return;
            }
            if (event.reason === vscode.TextDocumentSaveReason.Manual) {
               this._saveReasonForNextDidSave = { manual: true, vscodeAuto: false };
               Logger.log('[AutoSaveManager] onWillSaveTextDocument: Manual save intent.');
            } else if (event.reason === vscode.TextDocumentSaveReason.AfterDelay || event.reason === vscode.TextDocumentSaveReason.FocusOut) {
               this._saveReasonForNextDidSave = { manual: false, vscodeAuto: true };
               Logger.log('[AutoSaveManager] onWillSaveTextDocument: VS Code auto-save intent.');
            } else {
               // 其他未知原因，或没有特定原因（理论上不应进入此分支处理已知类型）
               this._saveReasonForNextDidSave = { manual: false, vscodeAuto: false };
               Logger.log('[AutoSaveManager] onWillSaveTextDocument: Unknown save intent.');
            }
         })
      );

      //监听文档已保存的事件
      this.disposables.push(
         vscode.workspace.onDidSaveTextDocument(document => {
            if (this.shouldAutoSave(document)) {
               const reasonContext = this._saveReasonForNextDidSave;
               this._saveReasonForNextDidSave = undefined; // Consume/reset reason

               if (!this.config.markdownlintFixAllOnSave) { // Changed from autoLint to markdownlintFixAllOnSave
                  Logger.log('[AutoSaveManager] onDidSaveTextDocument: markdownlintFixAllOnSave is disabled, skipping lint.');
                  return;
               }

               if (this._isExtensionSaving) {
                  Logger.log('[AutoSaveManager] onDidSaveTextDocument: Save was by extension, linting handled by triggerAutoSave. Skipping here.');
                  // Linting for extension's save is handled in triggerAutoSave().then()
                  return;
               }

               if (reasonContext?.manual) {
                  Logger.log('[AutoSaveManager] onDidSaveTextDocument: User manual save detected. Linting immediately.');
                  this.applyMarkdownlintFixAllIfEnabled();
               } else if (reasonContext?.vscodeAuto) {
                  Logger.log('[AutoSaveManager] onDidSaveTextDocument: VS Code files.autoSave detected. Scheduling lint.');
                  if (this.lintAfterVSCodeSaveTimeout) {
                     clearTimeout(this.lintAfterVSCodeSaveTimeout);
                  }
                  this.lintAfterVSCodeSaveTimeout = setTimeout(() => {
                     if (this.config.markdownlintFixAllOnSave) { // Changed from autoLint to markdownlintFixAllOnSave
                        Logger.log('[AutoSaveManager] Linting after VS Code auto-save delay.');
                        this.applyMarkdownlintFixAllIfEnabled();
                     }
                  }, this.config.autoSaveDelay); // Use autoSaveDelay for this lint delay
               } else {
                  // This case might occur if onWillSaveTextDocument didn't fire or classify properly
                  // or if the save was programmatic but not by this extension and not caught by other reasons.
                  Logger.log('[AutoSaveManager] onDidSaveTextDocument: Save reason unknown or unhandled by specific logic. Linting as a fallback if markdownlintFixAllOnSave is on.');
                  this.applyMarkdownlintFixAllIfEnabled();
               }
            }
         })
      );

      //监听配置变化
      this.disposables.push(
         this.config.onDidChangeConfig(configItems => {
            if (configItems?.includes(Config.ConfigItem.NotesDir) ||
               configItems?.includes(Config.ConfigItem.MarkdownlintFixAllOnSave) || // MarkdownlintFixAllOnSave now also acts as the lint toggle
               configItems?.includes(Config.ConfigItem.AutoSaveDelay)) { // Removed AutoLint from condition

               if ((configItems?.includes(Config.ConfigItem.AutoSaveDelay) || configItems?.includes(Config.ConfigItem.MarkdownlintFixAllOnSave)) && this.lintAfterVSCodeSaveTimeout) {
                  clearTimeout(this.lintAfterVSCodeSaveTimeout);
                  this.lintAfterVSCodeSaveTimeout = undefined;
                  Logger.log('[AutoSaveManager] Cleared lintAfterVSCodeSaveTimeout due to config change (autoSaveDelay or markdownlintFixAllOnSave).');
               }

               if (configItems?.includes(Config.ConfigItem.AutoSaveDelay) && this.saveTimeout) {
                  clearTimeout(this.saveTimeout);
                  this.saveTimeout = undefined;
                  Logger.log('[AutoSaveManager] Cleared saveTimeout (extension auto-save) due to config change.');
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
      Logger.log(`[AutoSaveManager] triggerAutoSave called for ${document.uri.fsPath}`);
      this.saveTimeout = setTimeout(async () => {
         this._isExtensionSaving = true;
         Logger.log(`[AutoSaveManager] triggerAutoSave: Extension is about to save ${document.uri.fsPath}`);
         try {
            await document.save();
            Logger.log(`[AutoSaveManager] triggerAutoSave: Extension has saved ${document.uri.fsPath}`);
            // Linting is now solely controlled by markdownlintFixAllOnSave
            if (this.config.markdownlintFixAllOnSave) {
               Logger.log(`[AutoSaveManager] triggerAutoSave: Linting after extension save for ${document.uri.fsPath}`);
               this.applyMarkdownlintFixAllIfEnabled();
            }
         } catch (error) {
            Logger.log(`[AutoSaveManager] Error during extension auto-save for ${document.uri.fsPath}:`, error);
         } finally {
            this._isExtensionSaving = false;
            Logger.log(`[AutoSaveManager] triggerAutoSave: Extension save process finished for ${document.uri.fsPath}`);
         }
      }, this.config.autoSaveDelay);
   }

   private applyMarkdownlintFixAllIfEnabled(): void {
      // The primary check for whether to lint at all is now at the call sites (onDidSaveTextDocument, triggerAutoSave)
      // or implicitly by this.config.markdownlintFixAllOnSave itself.
      if (this.config.markdownlintFixAllOnSave) {
         Logger.log('[AutoSaveManager] Executing markdownlint.fixAll command.');
         vscode.commands.executeCommand('markdownlint.fixAll');
      } else {
         // This log might be redundant if checks are solid at call sites, but good for sanity.
         Logger.log('[AutoSaveManager] applyMarkdownlintFixAllIfEnabled: markdownlintFixAllOnSave is false, not running fixAll.');
      }
   }

   public dispose(): void {
      if (this.saveTimeout) {
         clearTimeout(this.saveTimeout);
      }
      if (this.lintAfterVSCodeSaveTimeout) { // Clear new lint timeout on dispose
         clearTimeout(this.lintAfterVSCodeSaveTimeout);
      }
      this.disposables.forEach(d => d.dispose());
   }
}
