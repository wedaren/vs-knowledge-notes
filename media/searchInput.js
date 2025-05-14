//media/searchInput.js
(function() {
   const vscode = acquireVsCodeApi();
   const searchInput = document.getElementById('searchInput');
   const searchButton = document.getElementById('searchButton');
   const clearButton = document.getElementById('clearButton');
   const matchCaseButton = document.getElementById('matchCaseButton');
   const wholeWordButton = document.getElementById('wholeWordButton');
   const useRegexButton = document.getElementById('useRegexButton');

   searchButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'search', value: searchInput.value });
   });

   searchInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
         vscode.postMessage({ type: 'search', value: searchInput.value });
      }
   });

   clearButton.addEventListener('click', () => {
      searchInput.value = '';
      vscode.postMessage({ type: 'clear' }); //Inform the extension to clear results
      searchInput.focus();
   });

   matchCaseButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleMatchCase' });
   });

   wholeWordButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleWholeWord' });
   });

   useRegexButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleUseRegex' });
   });

   window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
         case 'focusInput':
            searchInput.focus();
            break;
         case 'clearInput':
            searchInput.value = '';
            //searchInput.focus(); // Optionally refocus after programmatic clear
            break;
         case 'updateButtonStates':
            updateButtonStates(message.states);
            break;
      }
   });

   function updateButtonStates(states) {
      if (states[0]) { //MatchCaseId is 0
         matchCaseButton.classList.add('active');
      } else {
         matchCaseButton.classList.remove('active');
      }
      if (states[1]) { //MatchWholeWordId is 1
         wholeWordButton.classList.add('active');
      } else {
         wholeWordButton.classList.remove('active');
      }
      if (states[2]) { //UseRegularExpressionId is 2
         useRegexButton.classList.add('active');
      } else {
         useRegexButton.classList.remove('active');
      }
   }
}());
