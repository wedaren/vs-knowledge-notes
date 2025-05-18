import * as vscode from 'vscode';
import { Config } from './config';
import dayjs from 'dayjs';
import { Logger } from './logger'; // 导入 Logger

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
      try {
         //将请求添加到队列，并返回一个 Promise
         new Promise<void>((resolve, reject) => {
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
      } catch { }
   }

   /**
    * 处理提交队列
    */
   private async processCommitQueue(): Promise<void> {
      if (this.commitQueue.length === 0 || this.isProcessingQueue) {
         return;
      }

      this.isProcessingQueue = true;
      const request = this.commitQueue.shift();

      if (!request) {
         // Should not happen if the initial check is correct, but as a safeguard:
         this.isProcessingQueue = false;
         this.processNextRequest(); // Attempt to process next if any items were added concurrently
         return;
      }

      const { directoryPath, message, resolve, reject } = request;

      try {
         Logger.log('[GitService] 开始提交和推送到 Git 仓库...', { directoryPath, message });
         await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在保存到 Git...',
            cancellable: false
         }, async (progress) => {
            // TODO：没有网络时不执行
            try {
               progress.report({ message: '正在拉取最新更改...' });
               await this.executeCommand('git pull --rebase', directoryPath);
               Logger.log('[GitService] 拉取最新更改成功。');
            } catch (rebaseError: any) {
               if (rebaseError.message && rebaseError.message.includes('CONFLICT')) {
                  const conflictFiles = await this.executeCommand('git diff --name-only --diff-filter=U', directoryPath);
                  vscode.window.showWarningMessage(
                     `拉取远程更改时发生合并冲突，以下文件存在冲突：\n${conflictFiles.stdout.trim()}\n已自动尝试继续变基。请检查提交历史确保合并正确。`
                  );
                  await this.executeCommand('git rebase --continue', directoryPath); // If this fails, it throws
               } else if (rebaseError.stderr && rebaseError.stderr.includes('could not lock config file')) {
                  vscode.window.showErrorMessage('无法锁定配置文件，请检查是否有其他进程正在使用该文件。');
                  throw new Error('无法锁定配置文件'); // Propagate error
               } else {
                  const errorMessage = rebaseError.message || String(rebaseError);
                  vscode.window.showErrorMessage(`从远程仓库拉取更改失败: ${errorMessage}`);
                  throw rebaseError instanceof Error ? rebaseError : new Error(errorMessage);
               }
            }

            const commitMsg = message || `自动保存: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;

            progress.report({ message: '添加更改...' });
            await this.executeCommand('git add .', directoryPath);
            Logger.log('[GitService] 添加所有更改成功。');

            progress.report({ message: '检查状态...' });
            const { stdout: statusOutput } = await this.executeCommand('git status --porcelain', directoryPath);

            if (statusOutput.trim().length > 0) {
               progress.report({ message: '提交更改...' });
               await this.executeCommand(`git commit -m "${commitMsg}"`, directoryPath);
               Logger.log('[GitService] 提交更改成功。', { commitMsg });
            } else {
               progress.report({ message: '没有需要提交的更改' });
               Logger.log('[GitService] 没有更改需要提交或仓库已是最新。');
            }

            // GIT PUSH
            try {
               progress.report({ message: '正在推送到远程仓库...' });
               await this.executeCommand('git push', directoryPath);
               Logger.log('[GitService] 推送到远程仓库成功。');
            } catch (pushError: any) {
               if (pushError.stderr && pushError.stderr.includes('could not read Username')) {
                  vscode.window.showErrorMessage('推送失败：无法读取用户名，请检查您的 Git 配置。');
                  throw new Error('推送失败：无法读取用户名'); // Propagate error
               } else {
                  const errorMessage = pushError.message || String(pushError);
                  vscode.window.showErrorMessage(`推送到远程仓库失败: ${errorMessage}`);
                  throw pushError instanceof Error ? pushError : new Error(errorMessage);
               }
            }

            // If all operations above were successful
            this._onDidCommit.fire();
            resolve(); // Resolve the promise for the current commitAndPush request
         });
         // If vscode.window.withProgress completes without throwing (i.e., its callback called resolve()),
         // then we are done with the success path for this request.
      } catch (error) {
         // This catch block handles errors from `await vscode.window.withProgress(...)`
         // (i.e., errors thrown from within its async callback, or if withProgress itself fails).
         // Specific error messages should have been shown closer to the source.
         // We just need to ensure the request's promise is rejected with an Error object.
         const errorToReject = error instanceof Error ? error : new Error(String(error || 'Git 操作过程中发生未知错误'));

         Logger.log('[GitService] Git 操作失败:', errorToReject.message);
         reject(errorToReject); // Reject the promise for the current commitAndPush request
      } finally {
         this.isProcessingQueue = false; // Reset the flag
         this.processNextRequest();    // Attempt to process the next item in the queue
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
      Logger.log(`[GitService] Executing command: ${command} in ${cwd}`);
      return new Promise((resolve, reject) => {
         const exec = require('child_process').exec;
         exec(command, { cwd }, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
               Logger.log(`[GitService] Error executing command: ${command}`, { error, stdout, stderr });
               reject(error);
               return;
            }
            Logger.log(`[GitService] Command executed successfully: ${command}`, { stdout, stderr });
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
