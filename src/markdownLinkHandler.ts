import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from './config';
import { extensionName } from './constants';
import { focusOnFile } from './commands';

export class MarkdownLinkHandler {
    private config: Config;
    private disposables: vscode.Disposable[] = [];

    constructor() {
       this.config = Config.getInstance();
       this.initialize();
    }

    private initialize() {
       //注册 Markdown 预览的链接点击处理器
       this.disposables.push(
          vscode.workspace.registerTextDocumentContentProvider('markdown', {
             provideTextDocumentContent: (uri: vscode.Uri) => {
                return this.handleLinkClick(uri);
             }
          })
       );

       //注册命令来处理链接点击
       this.disposables.push(
          vscode.commands.registerCommand(`${extensionName}.openMarkdownLink`, (link: string) => {
             this.openLink(link);
          })
       );

       //注册 Markdown 链接点击处理器
       this.disposables.push(
          vscode.languages.registerDocumentLinkProvider(
             { language: 'markdown' },
             {
                provideDocumentLinks: (document: vscode.TextDocument) => {
                   return this.findLinks(document);
                },
                resolveDocumentLink: (link: vscode.DocumentLink) => {
                   return this.resolveLink(link);
                }
             }
          )
       );
    }

    private findLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
       const links: vscode.DocumentLink[] = [];
       const text = document.getText();
       const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
       let match;

       while ((match = linkRegex.exec(text)) !== null) {
          const linkText = match[1];
          const linkPath = match[2];
          const startPos = document.positionAt(match.index + match[0].indexOf('(') + 1);
          const endPos = document.positionAt(match.index + match[0].indexOf(')'));

          //跳过网络链接和锚点链接
          if (linkPath.startsWith('http://') ||
                linkPath.startsWith('https://') ||
                linkPath.startsWith('mailto:') ||
                linkPath.startsWith('#')) {
             continue;
          }

          const link = new vscode.DocumentLink(
             new vscode.Range(startPos, endPos),
             vscode.Uri.parse(`command:${extensionName}.openMarkdownLink?${encodeURIComponent(JSON.stringify(linkPath))}`)
          );
          links.push(link);
       }

       return links;
    }

    private resolveLink(link: vscode.DocumentLink): vscode.DocumentLink {
       return link;
    }

    private async handleLinkClick(uri: vscode.Uri): Promise<string> {
       //这里可以添加自定义的 Markdown 渲染逻辑
       return '';
    }

    private async openLink(link: string) {
       if (!this.config.notesDir) {
          vscode.window.showErrorMessage('请先设置笔记目录');
          return;
       }

       const targetPath = path.resolve(this.config.notesDir.path, link);
       const targetUri = vscode.Uri.file(targetPath);

       await focusOnFile(targetUri);
    }

    dispose() {
       this.disposables.forEach(d => d.dispose());
    }
}
