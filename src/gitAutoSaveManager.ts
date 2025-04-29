import * as vscode from 'vscode';
import { Config } from './config';
import { GitService } from './gitService';

export class GitAutoSaveManager {
    private static instance: GitAutoSaveManager;
    private config: Config = Config.getInstance();
    private gitService: GitService = GitService.getInstance();
    private autoSaveTimer: NodeJS.Timer | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
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

       if (this.fileWatcher) {
          this.fileWatcher.dispose();
          this.fileWatcher = undefined;
       }

       //检查配置是否启用自动保存
       if (!this.config.gitAutoSave || !this.config.notesDir) {
          return;
       }

       //设置文件变更监听
       this.setupFileWatcher();

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
     * 设置文件变更监听
     */
    private setupFileWatcher(): void {
       if (!this.config.notesDir) return;

       //创建文件系统监听器，监听笔记目录中的所有文件变更
       this.fileWatcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(this.config.notesDir, '**/*')
       );

       //设置文件变更的延迟保存
       let saveTimeout: NodeJS.Timeout | undefined;
       const handleFileChange = () => {
          //清除现有的定时器
          if (saveTimeout) {
             clearTimeout(saveTimeout);
          }

          //创建一个新的定时器，1分钟后执行自动保存
          saveTimeout = setTimeout(() => {
             this.saveToGit('文件变更自动保存');
             saveTimeout = undefined;
          }, 1 * 60 * 1000); //1分钟延迟
       };

       //监听文件的创建、修改和删除事件
       this.fileWatcher.onDidCreate(handleFileChange);
       this.fileWatcher.onDidChange(handleFileChange);
       this.fileWatcher.onDidDelete(handleFileChange);
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

       if (this.fileWatcher) {
          this.fileWatcher.dispose();
       }

       this.disposables.forEach(d => d.dispose());
    }
}
