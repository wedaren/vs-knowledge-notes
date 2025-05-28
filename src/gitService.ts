import * as vscode from 'vscode';
import { Config } from './config';
import dayjs from 'dayjs';
import { Logger } from './logger'; // 导入 Logger
import simpleGit, { SimpleGit } from 'simple-git';

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
    * 自动提交并推送更改到远程仓库
    * @param directoryPath Git 仓库路径
    * @param message 提交信息
    */
   async commitAndPush(directoryPath: string, message?: string): Promise<void> {
      if (!await simpleGit(directoryPath).checkIsRepo()) {
         vscode.window.showErrorMessage('指定的目录不是有效的 Git 仓库');
         return;
      }
      try {
         new Promise<void>((resolve, reject) => {
            this.commitQueue.push({
               directoryPath,
               message,
               resolve,
               reject
            });

            if (!this.isProcessingQueue) {
               this.processCommitQueue();
            }
         });
      } catch (error: any) {
         Logger.log('[ERROR] [GitService] commitAndPush: Error enqueuing request.', { error: error?.message || String(error) });
      }
   }

   /**
    * 尝试执行 git pull --rebase 并处理常见的冲突和错误。
    * 如果遇到“未暂存更改”错误，则会抛出该错误，由调用方处理。
    */
   private async tryPullRebase(directoryPath: string): Promise<void> {
      const git: SimpleGit = simpleGit(directoryPath);
      try {
         const pullResult = await git.pull(['--rebase']);
         if (pullResult.summary.changes > 0 || pullResult.summary.insertions > 0 || pullResult.summary.deletions > 0) {
            Logger.log('[GitService] tryPullRebase: git pull --rebase 成功并有更新。', { summary: pullResult.summary });
         } else if (pullResult.files.length > 0 && pullResult.summary.changes === 0 && pullResult.summary.insertions === 0 && pullResult.summary.deletions === 0) {
            Logger.log('[GitService] tryPullRebase: git pull --rebase 成功，文件列表非空但无变更摘要，可能为特殊情况。', { files: pullResult.files });
         } else {
            Logger.log('[GitService] tryPullRebase: git pull --rebase 成功或已是最新。');
         }
      } catch (pullRebaseError: any) {
         const errorMessage = pullRebaseError.message || String(pullRebaseError);

         Logger.log('[WARN] [GitService] tryPullRebase: git pull --rebase 发生冲突，尝试自动合并...', { error: errorMessage });
         try {
            await git.add('.');
            Logger.log('[GitService] tryPullRebase: 自动合并冲突：git add . 成功。');
            await git.commit('自动合并冲突');
            Logger.log('[GitService] tryPullRebase: 自动合并冲突：git commit 成功。');
            await git.rebase(['--continue']);
            Logger.log('[GitService] tryPullRebase: 自动合并冲突后 git rebase --continue 成功。');
            vscode.window.showInformationMessage('笔记同步完成。检测到并已自动合并文件冲突，请检查包含冲突标记的文件。');
         } catch (continueRebaseError: any) {
            Logger.log('[ERROR] [GitService] tryPullRebase: 自动合并冲突后 git rebase --continue 失败。尝试中止 rebase。', { error: continueRebaseError?.message || String(continueRebaseError) });
            try {
               await git.rebase(['--abort']);
               Logger.log('[GitService] tryPullRebase: git rebase --abort 执行成功，已回滚变基操作。');
               vscode.window.showErrorMessage(`自动合并冲突失败，操作已中止。请手动检查 Git 状态。错误: ${continueRebaseError.message || String(continueRebaseError)}`);
            } catch (abortError: any) {
               Logger.log('[ERROR] [GitService] tryPullRebase: git rebase --abort 失败。仓库可能处于不稳定状态。', { error: abortError?.message || String(abortError) });
               vscode.window.showErrorMessage(`自动合并冲突失败且中止操作也失败。仓库可能处于不稳定状态。请手动检查。错误: ${abortError.message || String(abortError)}`);
            }
            const rebaseContinueErrorMessage = `拉取远程更改并尝试自动合并冲突失败: ${continueRebaseError.message || String(continueRebaseError)}.`;
            throw new Error(rebaseContinueErrorMessage);
         }
      }
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
         this.isProcessingQueue = false;
         this.processNextRequest();
         return;
      }

      const { directoryPath, message, resolve, reject } = request;

      try {
         Logger.log('[GitService] processCommitQueue: 开始处理请求...', { directoryPath, message });
         await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在同步到 Git...',
            cancellable: false
         }, async (progress) => {
            // TODO：没有网络时不执行 (可以考虑在 executeCommand 中添加网络错误检测)
            const git: SimpleGit = simpleGit(directoryPath);

            try {
               await git.add('.');
               const statusResultBeforeCommit = await git.status();
               if (statusResultBeforeCommit.files.length > 0) {
                  const commitMsg = message || `自动保存: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;
                  await git.commit(commitMsg);
                  Logger.log('[GitService] processCommitQueue: 自动提交本地未暂存更改成功。');
                  vscode.window.showInformationMessage('已自动提交本地未暂存的更改。正在重试同步...');
               } else {
                  Logger.log('[GitService] processCommitQueue: 没有需要自动提交的本地更改。');
               }
               Logger.log('[GitService] processCommitQueue: 重新尝试 git pull --rebase 操作...');
               await this.tryPullRebase(directoryPath);
            } catch (autoCommitOrRetryPullError: any) {
               const errorMsg = autoCommitOrRetryPullError.message || String(autoCommitOrRetryPullError);
               Logger.log('[ERROR] [GitService] processCommitQueue: 自动处理本地更改并重试同步时发生错误。', { error: errorMsg, details: autoCommitOrRetryPullError });
               if (!(errorMsg.includes('拉取失败') || errorMsg.includes('自动合并冲突失败'))) {
                  vscode.window.showErrorMessage(`自动处理本地更改并重试同步失败: ${errorMsg}`);
               }
               throw autoCommitOrRetryPullError;
            }


            progress.report({ message: '正在推送到远程仓库...' });
            await git.push();
            Logger.log('[GitService] processCommitQueue: 推送到远程仓库成功。');

            this._onDidCommit.fire();
            resolve();
         });
      } catch (error: any) {
         const errorToReject = error instanceof Error ? error : new Error(String(error || 'Git 操作过程中发生未知错误'));
         Logger.log('[ERROR] [GitService] processCommitQueue: Git 操作失败。', { error: errorToReject.message, stack: errorToReject.stack });
         reject(errorToReject);
      } finally {
         this.isProcessingQueue = false;
         this.processNextRequest();
      }
   }

   /**
    * 处理队列中的下一个请求
    */
   private processNextRequest(): void {
      this.isProcessingQueue = false;
      if (this.commitQueue.length > 0) {
         setTimeout(() => this.processCommitQueue(), 100);
      }
   }

   /**
    * 在指定目录执行命令
    * @param command 要执行的命令
    * @param cwd 工作目录
    */
   private async executeCommand(command: string, cwd: string): Promise<{ stdout: string, stderr: string }> {
      Logger.log(`[GitService] executeCommand: 此方法已弃用，请改用 simple-git: ${command} 在 ${cwd}`);
      // 实际项目中，这里应该抛出错误或移除此方法，强制使用 simple-git
      // 为了演示，暂时保留旧的实现，但标记为弃用
      return new Promise((resolve, reject) => {
         const exec = require('child_process').exec;
         exec(command, { cwd }, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
               Logger.log(`[ERROR] [GitService] executeCommand: 执行命令失败: ${command}`, { code: (error as any)?.code, message: error.message, stdout, stderr });
               reject(Object.assign(error, { stdout, stderr }));
               return;
            }
            Logger.log(`[GitService] executeCommand: 命令执行成功: ${command}`, { stdout, stderr });
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
         gitService.commitAndPush(notesDir.fsPath);
      })
   ];
}
