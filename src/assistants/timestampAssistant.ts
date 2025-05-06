import * as vscode from 'vscode';
import dayjs = require('dayjs');
import weekOfYear = require('dayjs/plugin/weekOfYear');

dayjs.extend(weekOfYear);

export class TimestampAssistant implements vscode.CompletionItemProvider {
   provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken,
      context: vscode.CompletionContext
   ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
      const linePrefix = document.lineAt(position).text.substring(0, position.character);

      if (linePrefix.endsWith('tt')) {
         const now = dayjs();
         let weekNumber = now.week();
         const isSaturday = now.day() === 6;
         //如果是周六，则算作下一周的开始
         if (isSaturday) {
            weekNumber += 1;
         }
         const timestamp = `${now.format('YYYY年MM月DD日')}（W${weekNumber}）${now.format('HH:mm')}`;

         const completionItem = new vscode.CompletionItem('tt', vscode.CompletionItemKind.Snippet);
         completionItem.insertText = timestamp;
         completionItem.documentation = '插入当前时间戳';
         completionItem.detail = timestamp;

         return [completionItem];
      }

      return [];
   }
}
