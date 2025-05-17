//media/chat.js
(function () {
   const vscode = acquireVsCodeApi();
   const chatMessages = document.getElementById('chat-messages');
   const chatContainer = document.getElementById('chat-container');
   const chatInput = document.getElementById('chat-input');
   const sendButton = document.getElementById('send-button');
   const modelSelector = document.getElementById('model-selector');
   let currentChatModelId = null;
   let historyIndex = -1;
   let userSentHistory = [];
   let originalUserChatInput = ''; //Stores chatInput.value before starting history navigation

   function applyTheme(theme) {
      document.body.className = theme;
   }

   if (document.body.classList.contains('vscode-dark')) {
      applyTheme('vscode-dark');
   } else if (document.body.classList.contains('vscode-light')) {
      applyTheme('vscode-light');
   }

   sendButton.addEventListener('click', () => {
      const messageText = chatInput.value.trim();
      if (messageText !== '') {
         vscode.postMessage({
            type: 'sendMessage',
            text: messageText
         });
         addMessageToUI(messageText, 'user');
         //Add to history only if it's a new message and not a resend from history
         if (!userSentHistory.includes(messageText)) {
            userSentHistory.push(messageText);
         }
         chatInput.value = '';
         historyIndex = -1; //Reset history navigation state
         originalUserChatInput = ''; //Clear the saved input
      }
   });

   chatInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
         event.preventDefault();
         sendButton.click();
      }
   });

   chatInput.addEventListener('keydown', (event) => {
      const userMessages = [...userSentHistory]; //Use the consistently updated userSentHistory

      if (event.key === 'ArrowUp') {
         event.preventDefault();
         if (userMessages.length === 0) {
            return; //No history to navigate
         }

         if (historyIndex === -1) {
            //Starting history navigation or restarting after typing/sending
            originalUserChatInput = chatInput.value;
            historyIndex = userMessages.length - 1; //Start with the last message
         } else if (historyIndex > 0) {
            //Navigate to the previous (older) message
            historyIndex--;
         }
         //If historyIndex is 0, it stays at the oldest message on further ArrowUp presses
         chatInput.value = userMessages[historyIndex];

      } else if (event.key === 'ArrowDown') {
         event.preventDefault();
         if (userMessages.length === 0 || historyIndex === -1) {
            //No history to navigate, or not currently in history navigation mode
            return;
         }

         if (historyIndex < userMessages.length - 1) {
            //Navigate to the next (newer) message
            historyIndex++;
            chatInput.value = userMessages[historyIndex];
         } else if (historyIndex === userMessages.length - 1) {
            //Was at the newest historical message, restore the original input
            chatInput.value = originalUserChatInput;
            historyIndex = -1; //Exit history navigation mode
         }
      }
   });

   window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
         case 'newMessage':
            addMessageToUI(message.text, 'assistant');
            break;
         case 'newStreamMessage':
            //For new stream messages, add the UI element but don't scroll yet.
            //Scrolling will be handled by appendMessageText based on user's scroll position.
            //explicitModelId is the 5th param, shouldScroll is the 6th.
            addMessageToUI('', message.sender || 'assistant', new Date().toLocaleString(), message.messageId, undefined);
            break;
         case 'streamMessagePart':
            appendMessageText(message.textPart, message.messageId);
            break;
         case 'streamMessageEnd':
            break;
         case 'updateSelectedModelInWebview':
            currentChatModelId = message.modelId;
            if (modelSelector && message.modelId) {
               const optionExists = Array.from(modelSelector.options).some(opt => opt.value === message.modelId);
               if (optionExists) {
                  modelSelector.value = message.modelId;
               }
            } else if (modelSelector && !message.modelId) {
               //modelSelector.value = modelSelector.options[0].value;
            }
            break;
         case 'loadParsedHistory':
            chatMessages.innerHTML = '';
            if (message.history && Array.isArray(message.history)) {
               message.history.forEach(msg => {
                  //Pass false for shouldScroll when loading history
                  addMessageToUI(msg.text, msg.sender, msg.timestamp, null, msg.modelId);
               });
               userSentHistory = message.history.filter(msg => msg.sender === 'user').map(msg => msg.text);
               historyIndex = -1; //Reset history navigation state
               //After all messages are added, scroll to bottom instantly
               _instantScrollChatViewToBottom();

            }
            break;
         case 'themeChanged':
            applyTheme(message.theme);
            break;
         case 'availableModels':
            //populateModelSelector(message.models);
            break;
      }
   });

   if (modelSelector) {
      modelSelector.addEventListener('change', (event) => {
         const selectedValue = event.target.value;
         vscode.postMessage({
            type: 'setSelectedModel',
            modelId: selectedValue
         });
      });
   }

   function _instantScrollChatViewToBottom() {
      requestAnimationFrame(() => {
         if (chatContainer) {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
         }
      });
   }

   function addMessageToUI(text, sender, timestamp, messageId, explicitModelId, shouldScroll = true) {
      const messageElement = document.createElement('div');
      messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'assistant-message');
      if (messageId) {
         messageElement.dataset.messageId = messageId;
      }

      const ts = timestamp || new Date().toLocaleString();
      messageElement.dataset.timestamp = ts;

      if (sender === 'assistant') {
         const modelIdToStore = explicitModelId !== undefined ? explicitModelId : currentChatModelId;
         if (modelIdToStore) {
            messageElement.dataset.modelId = modelIdToStore;
         }
      }

      const preElement = document.createElement('pre');
      preElement.textContent = text;
      messageElement.appendChild(preElement);

      chatMessages.appendChild(messageElement);

      if (shouldScroll) {
         _smoothScrollChatViewToBottom();
      }
   }

   function _smoothScrollChatViewToBottom() {
      requestAnimationFrame(() => {
         if (chatContainer) {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
         }
      });
   }

   function _conditionallyScrollChatViewToBottom() {
      //Threshold in pixels from the bottom. If the user is scrolled up further than this, don't auto-scroll.
      const SCROLL_THRESHOLD = 40;
      const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < SCROLL_THRESHOLD;

      //Only scroll if user was already near the bottom before text was appended
      if (isNearBottom) {
         _smoothScrollChatViewToBottom();
      }
   }

   function appendMessageText(textPart, messageId) {
      const messageElement = chatMessages.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
         const preElement = messageElement.querySelector('pre');
         if (preElement) {
            preElement.textContent += textPart; //Append text
            _conditionallyScrollChatViewToBottom(); //Call the extracted helper function
         }
      }
   }

   vscode.postMessage({ type: 'webviewReady' });
   const currentTheme = document.body.classList.contains('vscode-dark') ? 'vscode-dark' : 'vscode-light';
   vscode.postMessage({ type: 'getCurrentTheme', theme: currentTheme });

}());
