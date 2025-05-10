import * as vscode from 'vscode';
import { Config } from './config';
import { GitService } from './gitService';

export class GitAutoSaveManager {
    private static instance: GitAutoSaveManager;
    private config: Config = Config.getInstance();
    private gitService: GitService = GitService.getInstance();
    private autoSaveTimer: NodeJS.Timer | undefined;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
       //监听配置变化
       this.disposables.push(
          this.config.onDidChangeConfig(configItems => {
             if (!configItems) return;
             if (configItems.includes(Config.ConfigItem.GitAutoSave) ||
                    configItems.includes(Config.ConfigItem.GitAutoSaveInterval) ||
                    configItems.includes(Config.ConfigItem.NotesDir)) {
                this.updateAutoSaveTimer();
             }
          })
       );

       //初始化自动保存
       this.updateAutoSaveTimer();
    }

    static getInstance(): GitAutoSaveManager {
       if (!GitAutoSaveManager.instance) {
          GitAutoSaveManager.instance = new GitAutoSaveManager();
       }
       return GitAutoSaveManager.instance;
    }

    /**
     * 更新自动保存定时器
     */
    private updateAutoSaveTimer(): void {
       //清除旧的定时器和监听器
       if (this.autoSaveTimer) {
          clearInterval(this.autoSaveTimer);
          this.autoSaveTimer = undefined;
       }

       //检查配置是否启用自动保存
       if (!this.config.gitAutoSave || !this.config.notesDir) {
          return;
       }

       //设置定时器，定期提交
       const intervalMinutes = this.config.gitAutoSaveInterval;
       if (intervalMinutes > 0) {
          const intervalMs = intervalMinutes * 60 * 1000; //转换为毫秒
          this.autoSaveTimer = setInterval(() => {
             this.saveToGit('定时自动保存');
          }, intervalMs);
       }
    }

    /**
     * 执行保存到Git的操作
     * @param message 提交信息
     */
    private async saveToGit(message: string): Promise<void> {
       if (!this.config.notesDir) return;

       try {
          await this.gitService.commitAndPush(this.config.notesDir.fsPath, message);
       } catch (error) {
          console.error('Git 自动保存失败:', error);
       }
    }

    /**
     * 手动触发立即保存到Git
     */
    async saveNow(): Promise<void> {
       await this.saveToGit('手动触发保存');
    }

    dispose(): void {
       if (this.autoSaveTimer) {
          clearInterval(this.autoSaveTimer);
       }

       this.disposables.forEach(d => d.dispose());
    }
}
