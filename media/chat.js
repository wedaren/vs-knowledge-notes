//media/chat.js
(function() {
   const vscode = acquireVsCodeApi();
   const chatMessages = document.getElementById('chat-messages');
   const chatContainer = document.getElementById('chat-container');
   const chatInput = document.getElementById('chat-input');
   const sendButton = document.getElementById('send-button');
   const modelSelector = document.getElementById('model-selector');
   let currentChatModelId = null;

   function applyTheme(theme) {
      document.body.className = theme;
   }

   if (document.body.classList.contains('vscode-dark')) {
      applyTheme('vscode-dark');
   } else if (document.body.classList.contains('vscode-light')) {
      applyTheme('vscode-light');
   }

   sendButton.addEventListener('click', () => {
      const messageText = chatInput.value;
      if (messageText.trim() !== '') {
         vscode.postMessage({
            type: 'sendMessage',
            text: messageText
         });
         addMessageToUI(messageText, 'user');
         chatInput.value = '';
      }
   });

   chatInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
         event.preventDefault();
         sendButton.click();
      }
   });

   window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
         case 'newMessage':
            addMessageToUI(message.text, 'assistant');
            break;
         case 'newStreamMessage':
            addMessageToUI('', message.sender || 'assistant', new Date().toLocaleString(), message.messageId);
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
                  addMessageToUI(msg.text, msg.sender, msg.timestamp, null, msg.modelId);
               });
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

   function addMessageToUI(text, sender, timestamp, messageId, explicitModelId) {
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
      requestAnimationFrame(() => {
         if (chatContainer) {
            chatContainer.scrollTo({top: chatContainer.scrollHeight, behavior: 'smooth'});
         }
      });
   }

   function appendMessageText(textPart, messageId) {
      const messageElement = chatMessages.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
         const preElement = messageElement.querySelector('pre');
         if (preElement) {
            preElement.textContent += textPart;
            requestAnimationFrame(() => {
               if (chatContainer) {
                  chatContainer.scrollTo({top: chatContainer.scrollHeight, behavior: 'smooth'});
               }
            });
         }
      }
   }

   vscode.postMessage({ type: 'webviewReady' });
   const currentTheme = document.body.classList.contains('vscode-dark') ? 'vscode-dark' : 'vscode-light';
   vscode.postMessage({ type: 'getCurrentTheme', theme: currentTheme });

}());
