import * as vscode from 'vscode';
import { Buffer } from 'buffer';

export class ChatViewProvider implements vscode.WebviewViewProvider {

   private _view?: vscode.WebviewView; //Webview 视图实例
   private currentChatlogFileUri?: vscode.Uri; //当前聊天记录文件的 URI
   private webviewReady: boolean = false; //Webview 是否准备就绪
   private selectedModelId?: string; //当前选中的语言模型 ID
   private currentMarkdownFileUri?: vscode.Uri; //当前 Markdown 文件的 URI
   private currentPromptFileUri?: vscode.Uri; //当前 Prompt 文件的 URI
   private static readonly MAX_CHAT_HISTORY_MESSAGES = 10; //定义聊天记录显示的最大数量

   constructor(private readonly _extensionUri: vscode.Uri) { }

   //解析聊天记录字符串
   private parseChatHistory(historyString: string): Array<{ text: string; sender: 'user' | 'assistant'; timestamp?: string; modelId?: string }> {
      const messages: Array<{ text: string; sender: 'user' | 'assistant'; timestamp?: string; modelId?: string }> = [];
      if (!historyString) {
         return messages;
      }

      //使用正则表达式分割聊天记录块
      const historyBlocks = historyString.split(/\n\n(?=\[.*?\] (?:User|Assistant(?:\(.*?\))?):)/);
      historyBlocks.forEach(block => {
         if (block.trim() !== '') {
            //匹配新的聊天记录格式 (带时间戳和模型ID)
            const newFormatMatch = block.match(/^\[(.*?)\] (User|Assistant)(?:\((.*?)\))?:\s*\n([\s\S]*)$/);
            if (newFormatMatch) {
               const timestamp = newFormatMatch[1]; //提取时间戳
               const sender = newFormatMatch[2].toLowerCase() as 'user' | 'assistant'; //提取发送者并转换为小写
               const modelId = newFormatMatch[3]; //提取模型 ID
               const text = newFormatMatch[4]; //提取消息内容
               messages.push({ text, sender, timestamp, modelId });
            } else {
               const userMatch = block.match(/^User:\s*([\s\S]*)/);
               const assistantMatch = block.match(/^Assistant:\s*([\s\S]*)/);
               if (userMatch && userMatch[1] !== undefined) {
                  messages.push({ text: userMatch[1].trim(), sender: 'user' });
               } else if (assistantMatch && assistantMatch[1] !== undefined) {
                  messages.push({ text: assistantMatch[1].trim(), sender: 'assistant' });
               } else {
                  console.warn('Could not parse chat history block in backend:', block);
                  if (block.trim()) {
                     messages.push({ text: block.trim(), sender: 'assistant' });
                  }
               }
            }
         }
      });
      //返回仅包含最后 MAX_CHAT_HISTORY_MESSAGES 条消息的记录
      return messages.slice(-ChatViewProvider.MAX_CHAT_HISTORY_MESSAGES);
   }

   private async updateChatHistory(): Promise<void> {
      if (this._view && this._view.visible && this.webviewReady) {
         if (this.currentChatlogFileUri) {
            try {
               const chatlogContentBytes = await vscode.workspace.fs.readFile(this.currentChatlogFileUri);
               const loadedHistoryString = Buffer.from(chatlogContentBytes).toString('utf-8');
               const parsedHistory = this.parseChatHistory(loadedHistoryString);
               this.sendMessageToWebview({ type: 'loadParsedHistory', history: parsedHistory });
            } catch (err: any) {
               console.warn(`Failed to read chatlog ${this.currentChatlogFileUri?.fsPath} in updateChatHistory:`, err);
               this.sendMessageToWebview({ type: 'loadParsedHistory', history: [] });
            }
         } else {
            this.sendMessageToWebview({ type: 'loadParsedHistory', history: [] });
         }
      }
   }

   public async resolveWebviewView( // Add async here
      webviewView: vscode.WebviewView,
      context: vscode.WebviewViewResolveContext,
      _token: vscode.CancellationToken,
   ) {
      this._view = webviewView;
      webviewView.webview.options = {
         enableScripts: true,
         localResourceRoots: [
            this._extensionUri,
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'media'), // 允许从 dist/media 加载
            vscode.Uri.joinPath(this._extensionUri, 'media') // 如果仍然直接引用 media 中的 css 等
         ],
      };

      webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview); // Add await here

      webviewView.onDidChangeVisibility(() => {
         if (webviewView.visible && this.webviewReady) {
            this.updateChatHistory();
         }
      });

      webviewView.webview.onDidReceiveMessage(async data => {
         switch (data.type) {
            case 'webviewReady':
               this.webviewReady = true;
               this.updateChatHistory();
               break;
            case 'setSelectedModel':
               this.selectedModelId = data.modelId;
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
                  let defalutModelSelector: vscode.LanguageModelChatSelector = { vendor: 'copilot', family: 'gpt-4o' };
                  if (this.selectedModelId) {
                     defalutModelSelector = { id: this.selectedModelId };
                  }

                  const models = await vscode.lm.selectChatModels(defalutModelSelector);
                  if (models && models.length > 0) {
                     const model = models[0];
                     const messages: vscode.LanguageModelChatMessage[] = [];

                     if (this.currentPromptFileUri) {
                        try {
                           const promptContentBytes = await vscode.workspace.fs.readFile(this.currentPromptFileUri);
                           const promptContent = Buffer.from(promptContentBytes).toString('utf-8');
                           if (promptContent.trim()) {
                              messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, promptContent));
                           }
                        } catch (err: any) {
                           console.error(`Failed to read prompt context from ${this.currentPromptFileUri.fsPath}:`, err);
                        }
                     }

                     messages.push(new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, data.text));

                     const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

                     const messageId = `msg-${Date.now()}`;
                     this.sendMessageToWebview({ type: 'newStreamMessage', text: '', messageId: messageId, sender: 'assistant' });

                     let fullAssistantResponse = ''; //新增: 用于累积助手的完整响应
                     for await (const textPart of chatResponse.text) {
                        this.sendMessageToWebview({ type: 'streamMessagePart', textPart: textPart, messageId: messageId });
                        fullAssistantResponse += textPart; //新增: 累积响应片段
                     }
                     this.sendMessageToWebview({ type: 'streamMessageEnd', messageId: messageId });

                     //--- 新增：保存聊天记录的逻辑 ---
                     if (this.currentChatlogFileUri) {
                        const userMessageContent = data.text; //用户发送的原始消息
                        const actualModelId = model.id; //实际使用的模型ID
                        const turnTimestamp = new Date().toLocaleString(); //当前交互的时间戳

                        const userEntry = `[${turnTimestamp}] User:\n${userMessageContent}`;
                        const assistantEntry = `[${turnTimestamp}] Assistant(${actualModelId}):\n${fullAssistantResponse}`;

                        try {
                           let existingContentBytes: Uint8Array;
                           try {
                              existingContentBytes = await vscode.workspace.fs.readFile(this.currentChatlogFileUri);
                           } catch (e) {
                              //如果文件不存在，则以空内容开始
                              existingContentBytes = new Uint8Array();
                           }
                           const existingContent = Buffer.from(existingContentBytes).toString('utf-8');

                           let contentToAppend = userEntry + '\n\n' + assistantEntry;
                           //如果已有内容，则在追加前添加换行符
                           if (existingContent.trim() !== '') {
                              contentToAppend = '\n\n' + contentToAppend;
                           }

                           const newFileContent = existingContent + contentToAppend;
                           await vscode.workspace.fs.writeFile(this.currentChatlogFileUri, Buffer.from(newFileContent, 'utf8'));

                        } catch (saveError: any) {
                           console.error(`Failed to save chat history to ${this.currentChatlogFileUri.fsPath}:`, saveError);
                           vscode.window.showErrorMessage('Failed to automatically save chat history.');
                        }
                     }
                     //--- 保存聊天记录的逻辑结束 ---

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
            case 'openAssociatedPromptFile':
               if (this.currentPromptFileUri) {
                  try {
                     const document = await vscode.workspace.openTextDocument(this.currentPromptFileUri);
                     await vscode.window.showTextDocument(document);
                  } catch (error: any) {
                     // 检查错误是否因为文件未找到
                     if (error.code === 'FileNotFound' || (error.message && error.message.includes('cannot open file'))) { // ENOENT or similar
                        try {
                           // 尝试创建文件
                           await vscode.workspace.fs.writeFile(this.currentPromptFileUri, new Uint8Array()); // 创建一个空文件
                           const document = await vscode.workspace.openTextDocument(this.currentPromptFileUri);
                           await vscode.window.showTextDocument(document);
                           vscode.window.showInformationMessage(`Created and opened new prompt file: ${this.currentPromptFileUri.fsPath}`);
                        } catch (creationError) {
                           console.error(`Failed to create and open prompt file ${this.currentPromptFileUri.fsPath}:`, creationError);
                           vscode.window.showErrorMessage(`Could not create or open prompt file: ${this.currentPromptFileUri.fsPath}`);
                        }
                     } else {
                        // 其他类型的错误
                        console.error(`Failed to open prompt file ${this.currentPromptFileUri.fsPath}:`, error);
                        vscode.window.showErrorMessage(`Could not open prompt file: ${this.currentPromptFileUri.fsPath}`);
                     }
                  }
               } else {
                  vscode.window.showInformationMessage('No associated prompt file is currently set.');
               }
               break;
         }
      });
   }

   public sendMessageToWebview(message: any) {
      if (this._view && this.webviewReady) {
         this._view.webview.postMessage(message);
      }
   }

   public async setReadlyPanel(editor: vscode.TextEditor): Promise<void> {
      vscode.commands.executeCommand('daily-order.chatView.focus');
      const filePath = editor.document.fileName;
      const fileUri = editor.document.uri;

      if (filePath.endsWith('.chatlog.md') || filePath.endsWith('.prompt.md')) {
         this.currentMarkdownFileUri = undefined;
         this.currentPromptFileUri = undefined;
         this.currentChatlogFileUri = undefined;
         this.updateChatHistory();
         return;
      }

      this.currentMarkdownFileUri = fileUri;

      const promptFilePath = filePath.replace(/\.md$/, '.prompt.md');
      try {
         this.currentPromptFileUri = vscode.Uri.file(promptFilePath);
      } catch (e) {
         console.error('Error creating prompt file URI: ', e);
         this.currentPromptFileUri = undefined;
      }

      const chatlogFilePath = filePath.replace(/\.md$/, '.chatlog.md');
      this.currentChatlogFileUri = vscode.Uri.file(chatlogFilePath);
      this.updateChatHistory();
   }

   private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
      const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'media', 'chat.js')); // 指向编译后的 JS 文件
      const stylesResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
      const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
      const chatStylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css'));
      const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js'));
      const nonce = getNonce();

      // 从 media/chat.html 读取 HTML 内容
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.html');
      const htmlContentBytes = await vscode.workspace.fs.readFile(htmlPath);
      let htmlContent = Buffer.from(htmlContentBytes).toString('utf-8');

      // 替换占位符
      htmlContent = htmlContent.replace('<!--CSP_SOURCE_PLACEHOLDER-->', `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource};">`);
      htmlContent = htmlContent.replace('<!--STYLES_PLACEHOLDER-->', `
        <link href="${stylesResetUri}" rel="stylesheet">
        <link href="${stylesMainUri}" rel="stylesheet">
        <link href="${chatStylesUri}" rel="stylesheet">
      `);
      htmlContent = htmlContent.replace('<!--SCRIPT_PLACEHOLDER-->', `
        <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script> 
      `);

      return htmlContent;
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
