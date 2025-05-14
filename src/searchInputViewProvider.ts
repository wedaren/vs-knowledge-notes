import * as vscode from 'vscode';
import { Search, UseSearchOptions, SearchOptionId, MatchWholeWordId, UseRegularExpressionId, MatchCaseId } from './search';

//Helper function to generate a nonce
function getNonce() {
   let text = '';
   const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
   }
   return text;
}

export class SearchInputViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'daily-order.searchInputView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private _searchInstance: Search
    ) {}

    public resolveWebviewView(
       webviewView: vscode.WebviewView,
       context: vscode.WebviewViewResolveContext,
       _token: vscode.CancellationToken,
    ) {
       this._view = webviewView;

       webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [
             vscode.Uri.joinPath(this._extensionUri, 'media'),
             vscode.Uri.joinPath(this._extensionUri, 'resources')
          ]
       };

       webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

       webviewView.webview.onDidReceiveMessage(data => {
          switch (data.type) {
             case 'search':
                if (this._searchInstance) {
                   this._searchInstance.performSearch(data.value);
                }
                break;
             case 'clear':
                if (this._searchInstance) {
                   this._searchInstance.clearSearchCommand();
                }
                break;
             case 'toggleMatchCase':
                if (this._searchInstance) {
                   this._searchInstance.toggleSearchOption(MatchCaseId);
                }
                break;
             case 'toggleWholeWord':
                if (this._searchInstance) {
                   this._searchInstance.toggleSearchOption(MatchWholeWordId);
                }
                break;
             case 'toggleUseRegex':
                if (this._searchInstance) {
                   this._searchInstance.toggleSearchOption(UseRegularExpressionId);
                }
                break;
          }
       });
    }

    public focusInput() {
       if (this._view) {
          this._view.show(true); //Ensure the view is visible
          this._view.webview.postMessage({ type: 'focusInput' });
       }
    }

    public clearInputInWebview() {
       if (this._view) {
          this._view.webview.postMessage({ type: 'clearInput' });
       }
    }

    public updateButtonStatesInWebview(states: UseSearchOptions) {
       if (this._view) {
          this._view.webview.postMessage({ type: 'updateButtonStates', states });
       }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
       const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'searchInput.js'));
       const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'searchInput.css'));
       const nonce = getNonce();

       const caseSensitiveIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'light', 'case-sensitive.svg'));
       const wholeWordIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'light', 'whole-word.svg'));
       const regexIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'light', 'regex.svg'));

       return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
                <link href="${stylesUri}" rel="stylesheet">
                <title>Search Notes</title>
            </head>
            <body>
                <div class="search-controls-container">
                    <div class="input-container">
                        <input type="text" id="searchInput" placeholder="Search notes..." />
                    </div>
                </div>
                <div class="action-buttons-container">
                    <button id="matchCaseButton" class="toggle-button" title="Match Case (Alt+C)">
                        <img src="${caseSensitiveIconUri}" alt="Match Case" />
                    </button>
                    <button id="wholeWordButton" class="toggle-button" title="Match Whole Word (Alt+W)">
                        <img src="${wholeWordIconUri}" alt="Match Whole Word" />
                    </button>
                    <button id="useRegexButton" class="toggle-button" title="Use Regular Expression (Alt+R)">
                        <img src="${regexIconUri}" alt="Use Regular Expression" />
                    </button>
                    <button id="searchButton" title="Search">Search</button>
                    <button id="clearButton" title="Clear search term and results">Clear</button>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
