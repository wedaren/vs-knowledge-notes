import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from './config';
import { ripGrep as rg, Options as rgOptions, RipGrepError, Match } from './ripgrep';
import { SearchResultsProvider, SearchResultItem } from './searchViewProvider';
import { SearchInputViewProvider } from './searchInputViewProvider';

export const MatchCaseId = 0 as const;
export const MatchWholeWordId = 1 as const;
export const UseRegularExpressionId = 2 as const;

export type SearchOptionId = typeof MatchCaseId | typeof MatchWholeWordId | typeof UseRegularExpressionId;

const SearchOptionKeysById: { [key in SearchOptionId]: string } = {
   [MatchCaseId]: 'matchCase',
   [MatchWholeWordId]: 'wholeWord',
   [UseRegularExpressionId]: 'useRegex'
};

export type UseSearchOptions = {
    [K in SearchOptionId]: boolean;
};

export class Search {

   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];
   private searchResultsProvider: SearchResultsProvider;
   private searchResultsView: vscode.TreeView<SearchResultItem>;
   private currentSearchKeyword: string = '';
   private searchInputViewProvider?: SearchInputViewProvider;

   private useSearchOptions: UseSearchOptions = {
      [MatchCaseId]: false,
      [MatchWholeWordId]: false,
      [UseRegularExpressionId]: false
   };

   constructor(private readonly extensionUri: vscode.Uri, useSearchOptions?: UseSearchOptions) {
      this.searchResultsProvider = new SearchResultsProvider();
      this.searchResultsView = vscode.window.createTreeView('daily-order.searchView', {
         treeDataProvider: this.searchResultsProvider,
         showCollapseAll: true
      });

      this.disposables.push(
         this.searchResultsView,
         ...this.registerCommands()
      );
      if (useSearchOptions) this.useSearchOptions = useSearchOptions;
      this.updateContextKeysForAllOptions();
      vscode.commands.executeCommand('setContext', 'dailyOrderSearch.hasResults', false);
      vscode.commands.executeCommand('setContext', 'dailyOrderSearch.noResults', false);
      this.searchResultsView.message = 'Enter search term in the input field above and press Enter or click Search.';
   }

   public setSearchInputViewProvider(provider: SearchInputViewProvider) {
      this.searchInputViewProvider = provider;
      this.searchInputViewProvider?.updateButtonStatesInWebview(this.useSearchOptions);
   }

   dispose() {
      this.disposables.forEach(d => d.dispose());
   }

   private async runRipGrep(keyword: string, matchCaseFlag: boolean, matchWholeWordFlag: boolean, useRegexFlag: boolean): Promise<Match[] | string> {
      if (!this.config.notesDir) {
         return 'Notes directory is not found';
      }

      let ripgrepOptions: rgOptions;

      if (useRegexFlag) {
         ripgrepOptions = { regex: keyword };
      } else {
         ripgrepOptions = { string: keyword };
      }

      //The rg wrapper in ripgrep/index.ts handles the logic:
      //- if options.matchCase is true, search is case-sensitive (no -i flag).
      //- if options.matchCase is false or undefined, search is case-insensitive (-i flag is added).
      //- if options.matchWholeWord is true, -w flag is added.
      ripgrepOptions.multiline = true; //Keep multiline enabled
      ripgrepOptions.matchCase = matchCaseFlag;
      ripgrepOptions.matchWholeWord = matchWholeWordFlag;

      try {
         const matches = await rg(this.config.notesDir.fsPath, ripgrepOptions);
         return matches;
      } catch (e) {
         if (e instanceof RipGrepError) {
            return e.stderr;
         }
         return e instanceof Error ? e.message : 'An unknown error occurred during search';
      }
   }

   private clearSearchLogic(): void {
      this.searchResultsProvider.clear();
      this.currentSearchKeyword = '';
      this.searchResultsView.message = 'Search cleared. Use the input field above to start a new search.';
      vscode.commands.executeCommand('setContext', 'dailyOrderSearch.hasResults', false);
      vscode.commands.executeCommand('setContext', 'dailyOrderSearch.noResults', false);
      this.searchInputViewProvider?.clearInputInWebview();
   }

   public clearSearchCommand(): void {
      this.clearSearchLogic();
   }

   public async performSearch(keyword: string): Promise<boolean> {
      this.currentSearchKeyword = keyword.trim();
      if (!this.currentSearchKeyword) {
         this.clearSearchLogic();
         return false;
      }

      this.searchResultsView.message = `Searching for "${this.currentSearchKeyword}"...`;
      //Set hasResults to false initially, and noResults to false
      vscode.commands.executeCommand('setContext', 'dailyOrderSearch.hasResults', false);
      vscode.commands.executeCommand('setContext', 'dailyOrderSearch.noResults', false);

      const matchesOrError = await this.runRipGrep(
         this.currentSearchKeyword,
         this.useSearchOptions[MatchCaseId],
         this.useSearchOptions[MatchWholeWordId],
         this.useSearchOptions[UseRegularExpressionId]
      );

      if (typeof matchesOrError === 'string') {
         vscode.window.showErrorMessage(`Search error: ${matchesOrError}`);
         this.searchResultsProvider.clear();
         this.searchResultsView.message = `Search error: ${matchesOrError}`;
         vscode.commands.executeCommand('setContext', 'dailyOrderSearch.hasResults', false);
         vscode.commands.executeCommand('setContext', 'dailyOrderSearch.noResults', true);
         return false;
      } else if (!matchesOrError.length) {
         this.searchResultsProvider.clear();
         this.searchResultsView.message = `No results found for "${this.currentSearchKeyword}".`;
         vscode.commands.executeCommand('setContext', 'dailyOrderSearch.hasResults', false);
         vscode.commands.executeCommand('setContext', 'dailyOrderSearch.noResults', true);
         return true;
      } else {
         this.searchResultsProvider.refresh(matchesOrError);
         this.searchResultsView.message = `Found ${matchesOrError.length} result(s) for "${this.currentSearchKeyword}".`;
         vscode.commands.executeCommand('setContext', 'dailyOrderSearch.noResults', false);
         vscode.commands.executeCommand('setContext', 'dailyOrderSearch.hasResults', true);
         const firstElement = this.searchResultsProvider.getFirstFileNode();
         if (firstElement) {
            this.searchResultsView.reveal(firstElement, { expand: true, focus: false, select: false });
         }
         return true;
      }
   }

   private async search(): Promise<void> {
      if (this.searchInputViewProvider) {
         this.searchInputViewProvider.focusInput();
      } else {
         //Fallback if webview isn't available
         const keywordInput = await vscode.window.showInputBox({
            placeHolder: 'Search in notes (e.g., keyword)',
            prompt: 'Enter search term. Toggle options using icons in the view title.',
            value: this.currentSearchKeyword
         });

         if (keywordInput === undefined) {
            return;
         }
         if (keywordInput.trim() === '') {
            this.clearSearchLogic();
            return;
         }
         this.performSearch(keywordInput.trim());
      }
   }

   private updateContextKey(optionId: SearchOptionId): void {
      const optionKey = SearchOptionKeysById[optionId];
      if (optionKey) {
         vscode.commands.executeCommand('setContext', `dailyOrderSearch.${optionKey}Active`, this.useSearchOptions[optionId]);
      }
   }

   private updateContextKeysForAllOptions(): void {
      this.updateContextKey(MatchCaseId);
      this.updateContextKey(MatchWholeWordId);
      this.updateContextKey(UseRegularExpressionId);
   }

   public toggleSearchOption(optionId: SearchOptionId): void {
      this.useSearchOptions[optionId] = !this.useSearchOptions[optionId];
      this.updateContextKey(optionId);
      this.searchInputViewProvider?.updateButtonStatesInWebview(this.useSearchOptions);
      if (this.currentSearchKeyword) { //Re-run search if a keyword exists
         this.performSearch(this.currentSearchKeyword);
      }
   }

   private registerCommands(): vscode.Disposable[] {
      return [
         vscode.commands.registerCommand('daily-order.searchInNotes', () => {
            this.search();
         }),
         vscode.commands.registerCommand('daily-order.openSearchResult', (fileUri: vscode.Uri, lineNumber: number) => {
            vscode.window.showTextDocument(fileUri, {
               selection: new vscode.Range(lineNumber, 0, lineNumber, 0),
               preserveFocus: false
            });
         }),
         vscode.commands.registerCommand('daily-order.search.toggleMatchCase', () => {
            this.toggleSearchOption(MatchCaseId);
         }),
         vscode.commands.registerCommand('daily-order.search.toggleWholeWord', () => {
            this.toggleSearchOption(MatchWholeWordId);
         }),
         vscode.commands.registerCommand('daily-order.search.toggleUseRegex', () => {
            this.toggleSearchOption(UseRegularExpressionId);
         }),
         vscode.commands.registerCommand('daily-order.clearSearch', () => {
            this.clearSearchCommand();
         })
      ];
   }
}
