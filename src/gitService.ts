import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from './config';
import * as dayjs from 'dayjs';

interface CommitRequest {
    directoryPath: string;
    message?: string;
    resolve: () => void;
    reject: (error: Error) => void;
}

export class GitService {
    private static instance: GitService;
    private config: Config = Config.getInstance();
    private _onDidCommit: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidCommit: vscode.Event<void> = this._onDidCommit.event;

    //提交队列
    private commitQueue: CommitRequest[] = [];
    private isProcessingQueue: boolean = false;

    private constructor() { }

    static getInstance(): GitService {
       if (!GitService.instance) {
          GitService.instance = new GitService();
       }
       return GitService.instance;
    }

    /**
     * 检查指定目录是否是一个 Git 仓库
     * @param directoryPath 要检查的目录路径
     */
    async isGitRepository(directoryPath: string): Promise<boolean> {
       try {
          const result = await vscode.window.withProgress({
             location: vscode.ProgressLocation.Notification,
             title: '检查 Git 仓库...',
             cancellable: false
          }, async () => {
             const { stdout } = await this.executeCommand('git rev-parse --is-inside-work-tree', directoryPath);
             return stdout.trim() === 'true';
          });
          return result;
       } catch (error) {
          return false;
       }
    }

    /**
     * 自动提交并推送更改到远程仓库
     * @param directoryPath Git 仓库路径
     * @param message 提交信息
     */
    async commitAndPush(directoryPath: string, message?: string): Promise<void> {
       if (!await this.isGitRepository(directoryPath)) {
          vscode.window.showErrorMessage('指定的目录不是有效的 Git 仓库');
          return;
       }

       //将请求添加到队列，并返回一个 Promise
       return new Promise<void>((resolve, reject) => {
          this.commitQueue.push({
             directoryPath,
             message,
             resolve,
             reject
          });

          //如果队列没有在处理中，开始处理队列
          if (!this.isProcessingQueue) {
             this.processCommitQueue();
          }
       });
    }

    /**
     * 处理提交队列
     */
    private async processCommitQueue(): Promise<void> {
       if (this.commitQueue.length === 0 || this.isProcessingQueue) {
          return;
       }

       this.isProcessingQueue = true;

       //获取队列中的第一个请求
       const request = this.commitQueue.shift();
       if (!request) {
          this.isProcessingQueue = false;
          return;
       }

       const { directoryPath, message, resolve, reject } = request;

       console.log('开始提交和推送到 Git 仓库...');
       try {
          await vscode.window.withProgress({
             location: vscode.ProgressLocation.Notification,
             title: '正在保存到 Git...',
             cancellable: false
          }, async (progress) => {
             try {
                await this.executeCommand('git pull --rebase', directoryPath);
             } catch (rebaseError: any) {
                if (rebaseError.message && rebaseError.message.includes('CONFLICT')) {
                   const conflictFiles = await this.executeCommand('git diff --name-only --diff-filter=U', directoryPath);
                   vscode.window.showWarningMessage(
                      `拉取远程更改时发生合并冲突，以下文件存在冲突：\n${conflictFiles.stdout.trim()}\n已自动尝试继续变基。请检查提交历史确保合并正确。`
                   );
                   await this.executeCommand('git rebase --continue', directoryPath);
                } else if (rebaseError.stderr && rebaseError.stderr.includes('could not lock config file')) {
                   vscode.window.showErrorMessage('无法锁定配置文件，请检查是否有其他进程正在使用该文件。');
                   reject(new Error('无法锁定配置文件'));
                   this.processNextRequest();
                   return; //阻止后续的 push 操作
                } else {
                   vscode.window.showErrorMessage(`从远程仓库拉取更改失败: ${rebaseError.message}`);
                   reject(rebaseError);
                   this.processNextRequest();
                   return; //阻止后续的 push 操作
                }
             }

             const commitMsg = message || `自动保存: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;

             progress.report({ message: '添加更改...' });
             await this.executeCommand('git add .', directoryPath);

             progress.report({ message: '检查状态...' });
             const { stdout: statusOutput } = await this.executeCommand('git status --porcelain', directoryPath);

             //只有当有更改时才提交
             if (statusOutput.trim().length > 0) {
                progress.report({ message: '提交更改...' });
                await this.executeCommand(`git commit -m "${commitMsg}"`, directoryPath);
             } else {
                progress.report({ message: '没有需要提交的更改' });
             }


             try {
                await this.executeCommand('git push', directoryPath);
             } catch (pushError: any) {
                if (pushError.stderr && pushError.stderr.includes('could not read Username')) {
                   vscode.window.showErrorMessage('推送失败：无法读取用户名，请检查您的 Git 配置。');
                   reject(new Error('推送失败：无法读取用户名'));
                }
                else {
                   vscode.window.showErrorMessage(`推送到远程仓库失败: ${pushError.message}`);
                   reject(pushError);
                }
                this.processNextRequest();
                return; //阻止显示成功消息
             }

             this._onDidCommit.fire();
             resolve();
             this.processNextRequest();
          });
       } catch (error) {
          let errorMessage = '保存到 Git 仓库失败';
          if (error instanceof Error) {
             errorMessage += `: ${error.message}`;
          }
          vscode.window.showErrorMessage(errorMessage);
          reject(error instanceof Error ? error : new Error(errorMessage));
          this.processNextRequest();
       }
    }

    /**
     * 处理队列中的下一个请求
     */
    private processNextRequest(): void {
       this.isProcessingQueue = false;
       if (this.commitQueue.length > 0) {
          //继续处理队列中的下一个请求
          setTimeout(() => this.processCommitQueue(), 100);
       }
    }

    /**
     * 在指定目录执行命令
     * @param command 要执行的命令
     * @param cwd 工作目录
     */
    private async executeCommand(command: string, cwd: string): Promise<{ stdout: string, stderr: string }> {
       return new Promise((resolve, reject) => {
          const exec = require('child_process').exec;
          exec(command, { cwd }, (error: Error | null, stdout: string, stderr: string) => {
             if (error) {
                reject(error);
                return;
             }
             resolve({ stdout, stderr });
          });
       });
    }
}

/**
 * 注册 Git 相关命令
 */
export function registerGitCommands(): vscode.Disposable[] {
   const gitService = GitService.getInstance();

   return [
      vscode.commands.registerCommand('daily-order.gitAutoSave', async () => {
         const notesDir = Config.getInstance().notesDir;
         if (!notesDir) {
            vscode.window.showErrorMessage('笔记目录未设置');
            return;
         }

         await gitService.commitAndPush(notesDir.fsPath);
      })
   ];
}
