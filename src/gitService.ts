import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from './config';
import * as dayjs from 'dayjs';

export class GitService {
    private static instance: GitService;
    private config: Config = Config.getInstance();
    private _onDidCommit: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidCommit: vscode.Event<void> = this._onDidCommit.event;

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
          await vscode.window.withProgress({
             location: vscode.ProgressLocation.Notification,
             title: '正在保存到 Git...',
             cancellable: false
          }, async (progress) => {
             const commitMsg = message || `自动保存: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;

             //progress.report({ message: '添加更改...' });
             await this.executeCommand('git add .', directoryPath);

             //progress.report({ message: '提交更改...' });
             const { stdout: statusOutput } = await this.executeCommand('git status --porcelain', directoryPath);

             if (!statusOutput.trim()) {
                //TODO: 左下角提示变更
                //vscode.window.showInformationMessage('没有变更需要提交');
                return;
             }

             await this.executeCommand(`git commit -m "${commitMsg}"`, directoryPath);

             progress.report({ message: '推送到远程仓库...' });
             await this.executeCommand('git push', directoryPath);

             this._onDidCommit.fire();
             vscode.window.showInformationMessage('已成功保存到 Git 仓库');
          });
       } catch (error) {
          let errorMessage = '保存到 Git 仓库失败';
          if (error instanceof Error) {
             errorMessage += `: ${error.message}`;
          }
          vscode.window.showErrorMessage(errorMessage);
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
