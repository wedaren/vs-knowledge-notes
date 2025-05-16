import * as vscode from 'vscode';
import { Buffer } from 'buffer'; //Ensure Buffer is imported

export class ChatViewProvider implements vscode.WebviewViewProvider {

   private _view?: vscode.WebviewView;
   private currentChatlogFileUri?: vscode.Uri; //Renamed from activeChatlogUri
   private webviewReady: boolean = false;
   private selectedModelId?: string;
   private currentMarkdownFileUri?: vscode.Uri; //Stores the URI of the currently active main Markdown file
   private currentPromptFileUri?: vscode.Uri; //Stores the URI of the .prompt.md file associated with the currentMarkdownFileUri

   constructor(private readonly _extensionUri: vscode.Uri) { }

   private async updateChatHistory(): Promise<void> {
      //Attempt to load from currentChatlogFileUri
      if (this.currentChatlogFileUri) {
         //Only attempt to load if the webview is ready and visible.
         if (this._view && this._view.visible && this.webviewReady) {
            try {
               const chatlogContentBytes = await vscode.workspace.fs.readFile(this.currentChatlogFileUri);
               const loadedHistory = Buffer.from(chatlogContentBytes).toString('utf-8');
               this.sendMessageToWebview({ type: 'loadHistory', history: loadedHistory });
            } catch (err: any) {
               console.warn(`Failed to read chatlog ${this.currentChatlogFileUri?.fsPath} in updateChatHistory:`, err);
               this.sendMessageToWebview({ type: 'loadHistory', history: '' }); //Load empty on error
            }
         }
         //If not ready/visible, do nothing here. The respective event handlers will call updateChatHistory().
      } else {
         //No currentChatlogFileUri. If webview is ready and visible, clear its history.
         if (this._view && this._view.visible && this.webviewReady) {
            this.sendMessageToWebview({ type: 'loadHistory', history: '' });
         }
      }
   }

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
            //If the view becomes visible and is ready, ensure chat history is up-to-date.
            this.updateChatHistory();
         }
      });

      webviewView.webview.onDidReceiveMessage(async data => {
         switch (data.type) {
            case 'webviewReady':
               this.webviewReady = true;
               //Webview is ready, try to load/update history.
               this.updateChatHistory();
               break;
            case 'setSelectedModel':
               this.selectedModelId = data.modelId;
               //Notify webview about the model change
               if (this.webviewReady && this._view) {
                  this.sendMessageToWebview({ type: 'updateSelectedModelInWebview', modelId: this.selectedModelId });
               }
               break;
            case 'sendMessage':
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
                     const messages: vscode.LanguageModelChatMessage[] = [];

                     //Add selected chat history from the webview
                     if (data.history) {
                        const historyBlocks = data.history.split('\n\n');
                        historyBlocks.forEach((block: string) => {
                           //Updated regex to handle multiline messages without the 's' flag
                           const newFormatMatch = block.match(/^\[(.*?)\] (User|Assistant)(?:\((.*?)\))?:\s*\n([\s\S]*)$/);
                           if (newFormatMatch) {
                              const sender = newFormatMatch[2].toLowerCase();
                              const text = newFormatMatch[4];
                              const role = sender === 'user' ? vscode.LanguageModelChatMessageRole.User : vscode.LanguageModelChatMessageRole.Assistant;
                              messages.push(new vscode.LanguageModelChatMessage(role, text));
                           }
                        });
                     }

                     //1. Add specific instruction from the .prompt.md file (if currentPromptFileUri is set)
                     if (this.currentPromptFileUri) {
                        try {
                           const promptContentBytes = await vscode.workspace.fs.readFile(this.currentPromptFileUri);
                           const promptContent = Buffer.from(promptContentBytes).toString('utf-8');
                           if (promptContent.trim()) {
                              messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, promptContent));
                           }
                        } catch (err: any) {
                           console.error(`Failed to read prompt context from ${this.currentPromptFileUri.fsPath}:`, err);
                           //Optionally, notify the user or handle silently
                        }
                     }

                     ////2. Add general "intelligent note-taking assistant" prompt.
                     //messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, '你是一个智能笔记助手，请根据用户提供的笔记内容和上下文，提供有条理、清晰的回答和建议。'));

                     ////3. Add content from the active Markdown note (if currentMarkdownFileUri is set)
                     //if (this.currentMarkdownFileUri) {
                     //try {
                     //const noteContentBytes = await vscode.workspace.fs.readFile(this.currentMarkdownFileUri);
                     //const noteContent = Buffer.from(noteContentBytes).toString('utf-8');
                     //if (noteContent.trim()) {
                     //messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, `这是当前打开的 Markdown 笔记的相关内容：\n${noteContent}`));
                     //}
                     //} catch (err: any) {
                     //console.error(`Failed to read note context from ${this.currentMarkdownFileUri.fsPath}:`, err);
                     ////Not adding a user-facing error message here to keep the chat flow clean,
                     ////but logging is important.
                     //}
                     //}

                     //4. Add user's current message (data.text).
                     messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, data.text));

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
               if (this.currentChatlogFileUri && data.history) {
                  try {
                     await vscode.workspace.fs.writeFile(this.currentChatlogFileUri, Buffer.from(data.history, 'utf8'));
                  } catch (error: any) {
                     console.error('Failed to save chat history:', error);
                     vscode.window.showErrorMessage('Failed to save chat history.');
                  }
               }
               break;
         }
      });
   }

   public sendMessageToWebview(message: any) {
      if (this._view && this.webviewReady) {
         this._view.webview.postMessage(message);
      }
      //Messages sent when webview is not ready are generally dropped.
      //updateChatHistory handles its own readiness checks for sending history.
      //Model availability is explicitly sent when webviewReady becomes true (handled in 'webviewReady' case).
   }

   public async setReadlyPanel(editor: vscode.TextEditor): Promise<void> {
      vscode.commands.executeCommand('daily-order.chatView.focus');
      const filePath = editor.document.fileName;
      const fileUri = editor.document.uri;

      //If a chatlog or prompt file is opened directly, clear all context and return.
      if (filePath.endsWith('.chatlog.md') || filePath.endsWith('.prompt.md')) {
         this.currentMarkdownFileUri = undefined;
         this.currentPromptFileUri = undefined;
         this.currentChatlogFileUri = undefined;
         this.updateChatHistory();
         return;
      }

      //This is a main .md file
      this.currentMarkdownFileUri = fileUri;

      //Set associated prompt file URI
      const promptFilePath = filePath.replace(/\.md$/, '.prompt.md');
      try {
         this.currentPromptFileUri = vscode.Uri.file(promptFilePath);
      } catch (e) {
         console.error('Error creating prompt file URI: ', e);
         this.currentPromptFileUri = undefined;
      }

      //Set and load associated chatlog file
      const chatlogFilePath = filePath.replace(/\.md$/, '.chatlog.md');
      this.currentChatlogFileUri = vscode.Uri.file(chatlogFilePath);
      this.updateChatHistory(); //Call updateChatHistory after currentChatlogFileUri is set
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
               <div class="history-selector-container">
                  <select id="history-count-selector" name="history-count-selector">
                     <option value="0">None</option>
                     <option value="1">Last 1</option>
                     <option value="2">Last 2</option>
                     <option value="3">Last 3</option>
                     <option value="4">Last 4</option>
                     <option value="5">Last 5</option>
                     <option value="6">Last 6</option>
                     <option value="7">Last 7</option>
                     <option value="8">Last 8</option>
                     <option value="9">Last 9</option>
                     <option value="10">Last 10</option>
                  </select>
               </div>
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
