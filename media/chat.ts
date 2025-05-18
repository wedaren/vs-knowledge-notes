//media/chat.js
import { LitElement, html, css } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import './model-selector.ts'; // 导入新的组件
import './history-selector.ts'; // 导入 history-selector 组件

// Define a type for messages for better type safety
interface ChatMessage {
  text: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  messageId: string;
  modelId?: string;
}

// @ts-ignore
const vscode = acquireVsCodeApi();

@customElement('chat-app')
export class ChatApp extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      padding: 5px;
      box-sizing: border-box;
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
    }

    .chat-container {
      flex-grow: 1;
      overflow-y: auto;
      padding-bottom: 10px; /* Space for the input container */
    }

    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .message {
      padding: 8px 12px;
      border-radius: 6px;
      max-width: 85%;
      word-wrap: break-word;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .user-message {
      background-color: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      align-self: flex-end;
      margin-left: auto; /* Push to the right */
    }

    .assistant-message {
      background-color: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      align-self: flex-start;
      margin-right: auto; /* Push to the left */
    }

    .message pre {
      margin: 0;
      font-family: inherit; /* Inherit font from body/vscode vars */
      font-size: inherit;
      white-space: pre-wrap; /* Ensure text wraps */
    }

    .chat-input-area {
      display: flex;
      flex-direction: column; /* Stack model selector and input controls vertically */
      gap: 8px; /* Space between model selector and text input row */
      padding: 8px;
      border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder));
      background-color: var(--vscode-editor-background);
    }

    .model-selector-container {
      display: flex;
      align-items: center; /* Vertically align label and select */
      gap: 8px; /* Space between label and select */
      justify-content: flex-end; /* 将子元素对齐到右侧 */
    }

    .model-selector-container label {
      white-space: nowrap; /* Prevent label from wrapping */
    }

    #model-selector {
      flex-grow: 0;
      width: auto; /* Adjust width as needed or use flex properties */
      min-width: 100px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 4px;
      border-radius: 4px;
    }

    .chat-input-controls {
      display: flex;
      align-items: flex-end; /* Align items to the bottom, useful if textarea resizes */
      gap: 8px; /* Space between textarea and button */
    }

    #chat-input {
      flex-grow: 1;
      resize: none; /* Prevent manual resizing */
      min-height: 20px; /* Min height for one line */
      max-height: 100px; /* Max height before scrolling */
      overflow-y: auto; /* Allow scrolling if content exceeds max-height */
      padding: 6px 8px;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      outline: none; /* Remove outline on focus */
      
    }

    #send-button {
      height: auto; /* Adjust to content */
      padding: 0 8px 0 10px;
      height: 24px;
      border: 1px solid var(--vscode-button-border, transparent);
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
    }
    #send-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    /* Scrollbar styling for webkit browsers */
    .chat-container::-webkit-scrollbar {
      width: 8px;
    }

    .chat-container::-webkit-scrollbar-track {
      background: transparent; /* Or var(--vscode-editor-background) */
    }

    .chat-container::-webkit-scrollbar-thumb {
      background-color: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
    }

    .chat-container::-webkit-scrollbar-thumb:hover {
      background-color: var(--vscode-scrollbarSlider-hoverBackground);
    }

    .chat-container::-webkit-scrollbar-thumb:active {
      background-color: var(--vscode-scrollbarSlider-activeBackground);
    }
  `;

  @property({ type: Array })
  messages: ChatMessage[] = [];

  @property({ type: String })
  currentChatModelId: string = 'gpt-4o'; // Default model

  @property({ type: String })
  currentHistoryValue: string = '0'; // Default history value

  @property({ type: Array })
  userSentHistory: string[] = [];

  @query('#chat-input')
  chatInputElement!: HTMLTextAreaElement;

  @query('.chat-container')
  chatContainerElement!: HTMLDivElement;

  private historyIndex: number = -1;
  private originalUserChatInput: string = '';

  constructor() {
    super();
    this.setupVSCodeListener();
    vscode.postMessage({ type: 'webviewReady' });
    const currentTheme = document.body.classList.contains('vscode-dark') ? 'vscode-dark' : 'vscode-light';
    vscode.postMessage({ type: 'getCurrentTheme', theme: currentTheme });
  }

  override connectedCallback() {
    super.connectedCallback();
    if (document.body.classList.contains('vscode-dark')) {
      this.applyTheme('vscode-dark');
    } else if (document.body.classList.contains('vscode-light')) {
      this.applyTheme('vscode-light');
    }
  }

  applyTheme(theme: string) {
    this.className = theme;
  }

  setupVSCodeListener() {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'newMessage':
          this.addMessage(message.text, 'assistant');
          break;
        case 'newStreamMessage':
          this.addMessage('', message.sender || 'assistant', new Date().toLocaleString(), message.messageId, undefined, false);
          break;
        case 'streamMessagePart':
          this.appendMessageText(message.textPart, message.messageId);
          break;
        case 'streamMessageEnd':
          break;
        case 'updateSelectedModelInWebview':
          this.currentChatModelId = message.modelId;
          break;
        case 'loadParsedHistory':
          this.messages = message.history || [];
          this.userSentHistory = message.history.filter((msg: ChatMessage) => msg.sender === 'user').map((msg: ChatMessage) => msg.text);
          this.historyIndex = -1;
          this.originalUserChatInput = '';
          this._instantScrollChatViewToBottom();
          break;
        case 'themeChanged':
          this.applyTheme(message.theme);
          break;
      }
    });
  }

  handleSendMessage() {
    const messageText = this.chatInputElement.value.trim();
    if (messageText !== '') {
      vscode.postMessage({
        type: 'sendMessage',
        text: messageText,
        modelId: this.currentChatModelId
      });
      this.addMessage(messageText, 'user');
      if (!this.userSentHistory.includes(messageText)) {
        this.userSentHistory = [...this.userSentHistory, messageText];
      }
      this.chatInputElement.value = '';
      this.historyIndex = -1;
      this.originalUserChatInput = '';
    }
  }

  handleModelChange(event: CustomEvent) {
    const newModelId = event.detail.modelId;
    this.currentChatModelId = newModelId;
    vscode.postMessage({
      type: 'setSelectedModel',
      modelId: this.currentChatModelId
    });
  }

  handleHistoryChange(event: CustomEvent) {
    const newHistoryValue = event.detail.historyValue;
    this.currentHistoryValue = newHistoryValue;
    console.log('History changed to:', this.currentHistoryValue);
  }

  handleChatInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSendMessage();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
    }
  }

  handleChatInputArrowKey(event: KeyboardEvent) {
    const userMessages = [...this.userSentHistory];
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (userMessages.length === 0) return;
      if (this.historyIndex === -1) {
        this.originalUserChatInput = this.chatInputElement.value;
        this.historyIndex = userMessages.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
      this.chatInputElement.value = userMessages[this.historyIndex];
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (userMessages.length === 0 || this.historyIndex === -1) return;
      if (this.historyIndex < userMessages.length - 1) {
        this.historyIndex++;
        this.chatInputElement.value = userMessages[this.historyIndex];
      } else {
        this.historyIndex = -1;
        this.chatInputElement.value = this.originalUserChatInput;
      }
    }
  }

  addMessage(text: string, sender: 'user' | 'assistant', timestamp?: string, messageId?: string, explicitModelId?: string, shouldScroll = true) {
    const newMessage: ChatMessage = {
      text,
      sender,
      timestamp: timestamp || new Date().toLocaleString(),
      messageId: messageId || `msg-${Date.now()}`,
      modelId: sender === 'assistant' ? (explicitModelId !== undefined ? explicitModelId : this.currentChatModelId) : undefined
    };
    this.messages = [...this.messages, newMessage];
    if (shouldScroll) {
      this._smoothScrollChatViewToBottom();
    }
  }

  appendMessageText(textPart: string, messageId: string) {
    this.messages = this.messages.map(msg => {
      if (msg.messageId === messageId) {
        return { ...msg, text: msg.text + textPart };
      }
      return msg;
    });
    this._conditionallyScrollChatViewToBottom();
  }

  _instantScrollChatViewToBottom() {
    requestAnimationFrame(() => {
      if (this.chatContainerElement) {
        this.chatContainerElement.scrollTo({ top: this.chatContainerElement.scrollHeight, behavior: 'auto' });
      }
    });
  }

  _smoothScrollChatViewToBottom() {
    requestAnimationFrame(() => {
      if (this.chatContainerElement) {
        this.chatContainerElement.scrollTo({ top: this.chatContainerElement.scrollHeight, behavior: 'smooth' });
      }
    });
  }

  _conditionallyScrollChatViewToBottom() {
    if (!this.chatContainerElement) return;
    const SCROLL_THRESHOLD = 40;
    const isNearBottom = this.chatContainerElement.scrollHeight - this.chatContainerElement.scrollTop - this.chatContainerElement.clientHeight < SCROLL_THRESHOLD;
    if (isNearBottom) {
      this._smoothScrollChatViewToBottom();
    }
  }

  override render() {
    return html`
      <div class="chat-container" @scroll=${() => this.requestUpdate()}>
        <div class="chat-messages">
          ${this.messages.map(msg => html`
            <div class="message ${msg.sender === 'user' ? 'user-message' : 'assistant-message'}" data-message-id=${msg.messageId} data-timestamp=${msg.timestamp} .dataset.modelId=${msg.modelId || ''}>
              <pre>${msg.text}</pre>
            </div>
          `)}
        </div>
      </div>
      <div class="chat-input-area">
        <div class="chat-input-controls">
          <textarea id="chat-input" class="chat-input" placeholder="Type your message..."
            @keydown=${this.handleChatInputKeydown}
            @input=${(e: Event) => {
        if (this.historyIndex !== -1) this.historyIndex = -1;
        const textarea = e.target as HTMLTextAreaElement;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      }}
            @keyup=${this.handleChatInputArrowKey}></textarea>
        </div>
        <div class="model-selector-container">
          <model-selector
            .currentModelId=${this.currentChatModelId}
            @model-change=${this.handleModelChange}
          ></model-selector>
          <history-selector
            .currentHistoryValue=${this.currentHistoryValue}
            @history-change=${this.handleHistoryChange}
          ></history-selector>
          <button id="send-button" @click=${this.handleSendMessage}>Send</button>
        </div>
      </div>
    `;
  }
}
