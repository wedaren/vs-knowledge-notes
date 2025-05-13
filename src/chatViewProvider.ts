import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {

   private _view?: vscode.WebviewView;
   private activeChatlogUri?: vscode.Uri;
   private webviewReady: boolean = false;
   private pendingHistory: string | null = null;
   private selectedModelId?: string; //Stores the current session's selected model ID

   constructor(private readonly _extensionUri: vscode.Uri) { }

   public resolveWebviewView(
      webviewView: vscode.WebviewView,
      context: vscode.WebviewViewResolveContext,
      _token: vscode.CancellationToken,
   ) {
      this._view = webviewView;

      webviewView.webview.options = {
         enableScripts: true,
         localResourceRoots: [this._extensionUri],
      };

      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      webviewView.onDidChangeVisibility(() => {
         if (webviewView.visible && this.webviewReady) {
            this.loadChatHistoryFromFile();
         }
      });

      webviewView.webview.onDidReceiveMessage(async data => {
         switch (data.type) {
            case 'webviewReady':
               this.webviewReady = true;
               if (this.pendingHistory !== null) {
                  this.updateChatHistory(this.pendingHistory);
               } else {
                  this.loadChatHistoryFromFile();
               }
               break;
            case 'setSelectedModel':
               this.selectedModelId = data.modelId;
               //Notify webview about the model change
               if (this.webviewReady && this._view) {
                  this.sendMessageToWebview({ type: 'updateSelectedModelInWebview', modelId: this.selectedModelId });
               }
               break;
            case 'sendMessage':
               vscode.window.showInformationMessage(`Message from webview: ${data.text}`);
               if (!vscode.lm) {
                  this.sendMessageToWebview({ type: 'newMessage', text: 'The Copilot language model features require a newer version of VS Code. Please update your VS Code to use this feature.' });
                  return;
               }

               try {
                  let modelFilter: vscode.LanguageModelChatSelector = { vendor: 'copilot', family: 'gpt-4o' };
                  if (this.selectedModelId) {
                     modelFilter = { id: this.selectedModelId };
                  }

                  const models = await vscode.lm.selectChatModels(modelFilter);
                  if (models && models.length > 0) {
                     const model = models[0];
                     const messages = [
                        new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, data.text)
                     ];
                     const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

                     const messageId = `msg-${Date.now()}`;
                     this.sendMessageToWebview({ type: 'newStreamMessage', text: '', messageId: messageId, sender: 'assistant' });

                     for await (const textPart of chatResponse.text) {
                        this.sendMessageToWebview({ type: 'streamMessagePart', textPart: textPart, messageId: messageId });
                     }
                     this.sendMessageToWebview({ type: 'streamMessageEnd', messageId: messageId });

                  } else {
                     this.sendMessageToWebview({ type: 'newMessage', text: 'Model selection was cancelled or no suitable model is available for the selection.' });
                  }
               } catch (err: any) {
                  console.error('Error calling Copilot LM API:', err);
                  let errorMessage = 'Sorry, an error occurred while trying to reach Copilot.';
                  if (vscode.LanguageModelError && err instanceof vscode.LanguageModelError) {
                     console.error(err.message, err.code, (err as any).cause);
                     if ((err as any).cause instanceof Error && (err as any).cause.message.includes('off_topic')) {
                        errorMessage = 'I am sorry, I can only assist with topics related to this application.';
                     } else if (err.message.includes('offline')) {
                        errorMessage = 'It seems you are offline. Please check your internet connection to use Copilot.';
                     } else if (err.message.includes('TOKEN_LIMIT_EXCEEDED')) {
                        errorMessage = 'The message is too long. Please try a shorter message.';
                     } else if (err.code === 'accessDenied') {
                        errorMessage = 'Access to the language model was denied. Please ensure you have the necessary permissions.';
                     }
                  }
                  this.sendMessageToWebview({ type: 'newMessage', text: errorMessage });
               }
               break;
            case 'saveChatHistory':
               if (this.activeChatlogUri && data.history) {
                  try {
                     await vscode.workspace.fs.writeFile(this.activeChatlogUri, Buffer.from(data.history, 'utf8'));
                  } catch (error) {
                     console.error('Failed to save chat history:', error);
                     vscode.window.showErrorMessage('Failed to save chat history.');
                  }
               }
               break;
         }
      });
   }

   public sendMessageToWebview(message: any) {
      if (this._view) {
         this._view.webview.postMessage(message);
      }
   }


   public updateChatHistory(history: string) {
      if (this._view) {
         if (this.webviewReady) {
            this.sendMessageToWebview({ type: 'loadHistory', history: history });
            this.pendingHistory = null;
         } else {
            this.pendingHistory = history;
         }
      } else {
         this.pendingHistory = history;
      }
   }

   public setActiveChatlogUri(uri?: vscode.Uri) {
      this.activeChatlogUri = uri;
      if (this._view && this._view.visible && this.webviewReady) {
         this.loadChatHistoryFromFile();
      } else if (!this.activeChatlogUri) {
         this.updateChatHistory('');
      }
   }

   private async loadChatHistoryFromFile() {
      if (!this._view) {
         return;
      }
      if (this.activeChatlogUri) {
         try {
            const chatlogContent = await vscode.workspace.fs.readFile(this.activeChatlogUri);
            this.updateChatHistory(Buffer.from(chatlogContent).toString('utf-8'));
         } catch {
            this.updateChatHistory('');
         }
      } else {
         this.updateChatHistory('');
      }
   }

   private _getHtmlForWebview(webview: vscode.Webview): string {
      const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js'));
      const stylesResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
      const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
      const chatStylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css'));
      const nonce = getNonce();

      return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesResetUri}" rel="stylesheet">
        <link href="${stylesMainUri}" rel="stylesheet">
        <link href="${chatStylesUri}" rel="stylesheet">
        <title>LLM Chat</title>
      </head>
      <body>
        <div id="chat-container" class="chat-container">
          <div id="chat-messages" class="chat-messages"></div>
        </div>
        <div class="chat-input-area">
          <div class="chat-input-controls">
            <textarea id="chat-input" class="chat-input" placeholder="Type your message..."></textarea>
            <div>
               <button id="send-button" class="send-button">Send</button>
               <div class="model-selector-container">
                  <select id="model-selector" name="model-selector">
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="o1">o1</option>
                  <option value="o1-mini">o1-mini</option>
                  <option value="claude-3.5-sonnet">claude-3.5-sonnet</option>
                  </select>
               </div>
            </div>
          </div>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
   }
}

function getNonce() {
   let text = '';
   const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
   }
   return text;
}
