//media/chat.js
(function() {
   const vscode = acquireVsCodeApi();
   const chatMessages = document.getElementById('chat-messages');
   const chatContainer = document.getElementById('chat-container');
   const chatInput = document.getElementById('chat-input');
   const sendButton = document.getElementById('send-button');
   const modelSelector = document.getElementById('model-selector');
   let currentChatModelId = null; //Stores the modelId for new assistant messages, set by extension

   //Handle dark/light theme
   function applyTheme(theme) {
      document.body.className = theme;
   }

   //Initial theme check
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
         //Add user message to UI immediately for responsiveness
         addMessageToUI(messageText, 'user'); //Timestamp will be generated
         chatInput.value = '';
      }
   });

   chatInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
         event.preventDefault(); //Prevent new line
         sendButton.click();
      }
   });

   window.addEventListener('message', event => {
      const message = event.data; //The JSON data our extension sent
      switch (message.type) {
         case 'newMessage':
            //New assistant messages will use currentChatModelId set by updateSelectedModelInWebview
            addMessageToUI(message.text, 'assistant');
            break;
         case 'newStreamMessage':
            //New assistant stream messages also use currentChatModelId
            addMessageToUI('', message.sender || 'assistant', new Date().toLocaleString(), message.messageId);
            break;
         case 'streamMessagePart': //Handle stream message part
            appendMessageText(message.textPart, message.messageId);
            break;
         case 'streamMessageEnd': //Handle stream message end
            sendChatHistoryToExtension(); //Save history when stream ends
            break;
         case 'updateSelectedModelInWebview': //Handle model update from extension
            currentChatModelId = message.modelId;
            if (modelSelector && message.modelId) {
               //Check if the option exists before setting to avoid errors if model list is dynamic
               const optionExists = Array.from(modelSelector.options).some(opt => opt.value === message.modelId);
               if (optionExists) {
                  modelSelector.value = message.modelId;
               }
            } else if (modelSelector && !message.modelId) {
               //If modelId is cleared (e.g., to a default state), optionally update selector
               //Example: modelSelector.value = modelSelector.options[0].value; //Reset to first option
            }
            break;
         case 'loadHistory':
            chatMessages.innerHTML = ''; //Clear existing messages
            if (message.history) {
               //Regex to split by newline but lookahead for pattern: [timestamp] User: or [timestamp] Assistant(model):
               const historyBlocks = message.history.split(/\n\n(?=\[.*?\] (?:User|Assistant(?:\(.*?\))?):)/);
               historyBlocks.forEach(block => {
                  if (block.trim() !== '') {
                     //Try to parse new format: [<timestamp>] Sender[(modelId)]:\nText
                     const newFormatMatch = block.match(/^\[(.*?)\] (User|Assistant)(?:\((.*?)\))?:\s*\n(.*)$/s);
                     if (newFormatMatch) {
                        const timestamp = newFormatMatch[1];
                        const sender = newFormatMatch[2].toLowerCase(); //'user' or 'assistant'
                        const modelIdInBlock = newFormatMatch[3]; //Captured modelId from block, undefined if not present
                        const text = newFormatMatch[4];
                        //Pass parsed modelId to be stored on the element
                        addMessageToUI(text, sender, timestamp, null, modelIdInBlock);
                     } else {
                        //Fallback to old format if new format parsing fails
                        const userMatch = block.match(/^User:\s*(.*)/s);
                        const assistantMatch = block.match(/^Assistant:\s*(.*)/s);
                        if (userMatch && userMatch[1] !== undefined) {
                           addMessageToUI(userMatch[1].trim(), 'user'); //No timestamp, no modelId
                        } else if (assistantMatch && assistantMatch[1] !== undefined) {
                           addMessageToUI(assistantMatch[1].trim(), 'assistant'); //No timestamp, no modelId
                        } else {
                           console.warn('Could not parse chat history block:', block);
                           if (block.trim()) {
                              addMessageToUI(block.trim(), 'assistant'); //Default to assistant
                           }
                        }
                     }
                  }
               });
            }
            break;
         case 'themeChanged': //Listen for theme changes from the extension
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

   //function populateModelSelector(models) {
   //if (!modelSelector) return;
   ////Store the current selected value if it exists and is not the default, to try and preserve selection
   //const currentSelectedValue = modelSelector.value !== 'default' ? modelSelector.value : null;
   //
   ////Clear existing options, but keep the first one (default)
   //while (modelSelector.options.length > 1) {
   //modelSelector.remove(1);
   //}
   //
   //models.forEach(model => {
   //const option = document.createElement('option');
   //option.value = model.id;
   //option.textContent = model.name;
   //modelSelector.appendChild(option);
   //});
   //
   ////If a previous selection existed and is still in the new list, re-select it
   //if (currentSelectedValue) {
   //const stillExists = Array.from(modelSelector.options).some(opt => opt.value === currentSelectedValue);
   //if (stillExists) {
   //modelSelector.value = currentSelectedValue;
   //}
   //}
   //}

   function addMessageToUI(text, sender, timestamp, messageId, explicitModelId) {
      const messageElement = document.createElement('div');
      messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'assistant-message');
      if (messageId) {
         messageElement.dataset.messageId = messageId;
      }

      const ts = timestamp || new Date().toLocaleString();
      messageElement.dataset.timestamp = ts;

      //For assistant messages, store the model ID
      if (sender === 'assistant') {
         //Use explicitModelId if provided (e.g., from loaded history)
         //Otherwise, use the currentChatModelId (for new messages, including streamed)
         const modelIdToStore = explicitModelId !== undefined ? explicitModelId : currentChatModelId;
         if (modelIdToStore) { //Only add data attribute if modelId is not null/undefined/empty
            messageElement.dataset.modelId = modelIdToStore;
         }
      }

      const preElement = document.createElement('pre');
      preElement.textContent = text; //Handles multi-line text correctly
      messageElement.appendChild(preElement);

      chatMessages.appendChild(messageElement);
      //Scroll to bottom using requestAnimationFrame for better timing
      requestAnimationFrame(() => {
         if (chatContainer) {
            chatContainer.scrollTo({top: chatContainer.scrollHeight, behavior: 'smooth'});
         }
      });
   }

   function appendMessageText(textPart, messageId) { //Function to append text to an existing message
      const messageElement = chatMessages.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
         const preElement = messageElement.querySelector('pre');
         if (preElement) {
            preElement.textContent += textPart;
            //Scroll to bottom using requestAnimationFrame for better timing
            requestAnimationFrame(() => {
               if (chatContainer) {
                  chatContainer.scrollTo({top: chatContainer.scrollHeight, behavior: 'smooth'});
               }
            });
         }
      }
   }

   function sendChatHistoryToExtension() {
      const messages = [];
      chatMessages.querySelectorAll('.message').forEach(messageElement => {
         const sender = messageElement.classList.contains('user-message') ? 'User' : 'Assistant';
         const text = messageElement.querySelector('pre').textContent;
         const timestamp = messageElement.dataset.timestamp;

         let header = `[${timestamp}] ${sender}`;
         if (sender === 'Assistant') {
            const modelId = messageElement.dataset.modelId; //Retrieve stored modelId
            if (modelId) { //Check if modelId exists and is not empty
               header += `(${modelId})`;
            }
         }
         messages.push(`${header}:\n${text}`); //Format with timestamp, sender (optional modelId), and newline for text
      });
      const historyText = messages.join('\n\n');
      vscode.postMessage({ type: 'saveChatHistory', history: historyText });
   }

   //Let the extension know the webview is ready and what the current theme is
   vscode.postMessage({ type: 'webviewReady' });
   const currentTheme = document.body.classList.contains('vscode-dark') ? 'vscode-dark' : 'vscode-light';
   vscode.postMessage({ type: 'getCurrentTheme', theme: currentTheme });

}());
