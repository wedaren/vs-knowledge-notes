import * as vscode from 'vscode';
import * as path from 'path';
import { Match } from './ripgrep'; //Match type from ripgrep

export class FileNode extends vscode.TreeItem {
   constructor(
        public readonly uri: vscode.Uri,
        public readonly matches: MatchNode[]
   ) {
      super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.Expanded);
      this.description = path.dirname(uri.fsPath);
      this.resourceUri = uri;
      this.iconPath = vscode.ThemeIcon.File;
   }
}

export class MatchNode extends vscode.TreeItem {
   constructor(
        public readonly fileUri: vscode.Uri,
        public readonly lineNumber: number, //0-based for vscode.Range
        public readonly matchedTerm: string,
        public readonly fullMatchLine: string
   ) {
      const trimmedLine = fullMatchLine.trim();
      let label: string | vscode.TreeItemLabel = trimmedLine;
      const highlights: [number, number][] = [];

      if (matchedTerm) {
         let startIndex = -1;
         let currentIndex = 0;
         const lowerTrimmedLine = trimmedLine.toLowerCase();
         const lowerMatchedTerm = matchedTerm.toLowerCase();
         while ((startIndex = lowerTrimmedLine.indexOf(lowerMatchedTerm, currentIndex)) !== -1) {
            highlights.push([startIndex, startIndex + matchedTerm.length]);
            currentIndex = startIndex + matchedTerm.length;
         }
      }

      if (highlights.length > 0) {
         label = { label: trimmedLine, highlights };
      } else {
         label = trimmedLine;
      }

      super(label, vscode.TreeItemCollapsibleState.None);
      this.description = `L:${lineNumber + 1}`; //Display line number as 1-based
      this.tooltip = `${fileUri.fsPath}\n${fullMatchLine}`;
      this.command = {
         command: 'daily-order.openSearchResult',
         title: 'Open Search Result',
         arguments: [fileUri, lineNumber]
      };
      this.iconPath = new vscode.ThemeIcon('search-result');
   }
}

export type SearchResultItem = FileNode | MatchNode;

export class SearchResultsProvider implements vscode.TreeDataProvider<SearchResultItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SearchResultItem | undefined | null | void> = new vscode.EventEmitter<SearchResultItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SearchResultItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private results: Match[] = [];
    private fileNodes: FileNode[] = []; //Store generated FileNodes

    constructor() {}

    refresh(newResults: Match[]): void {
       this.results = newResults;
       this.generateFileNodes();
       this._onDidChangeTreeData.fire();
    }

    clear(): void {
       this.results = [];
       this.fileNodes = [];
       this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SearchResultItem): vscode.TreeItem {
       return element;
    }

    private generateFileNodes(): void {
       const groupedByFile = new Map<string, MatchNode[]>();
       this.results.forEach(match => {
          const filePath = match.path.text;
          if (!groupedByFile.has(filePath)) {
             groupedByFile.set(filePath, []);
          }

          const actualMatchedTerm = match.submatches && match.submatches.length > 0 ? match.submatches[0].match.text : '';

          const matchNode = new MatchNode(
             vscode.Uri.file(filePath),
             match.line_number - 1, //ripgrep line_number is 1-based
             actualMatchedTerm,
             match.lines.text //Full line text
          );
            groupedByFile.get(filePath)!.push(matchNode);
       });

       this.fileNodes = [];
       groupedByFile.forEach((matches, filePath) => {
          this.fileNodes.push(new FileNode(vscode.Uri.file(filePath), matches));
       });
       this.fileNodes.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));
    }

    getFirstFileNode(): FileNode | undefined {
       return this.fileNodes.length > 0 ? this.fileNodes[0] : undefined;
    }

    getChildren(element?: SearchResultItem): Thenable<SearchResultItem[]> {
       if (!element) { //Root level, return FileNodes
          return Promise.resolve(this.fileNodes);
       }

       if (element instanceof FileNode) {
          return Promise.resolve(element.matches);
       }

       return Promise.resolve([]); //MatchNodes have no children
    }
}
