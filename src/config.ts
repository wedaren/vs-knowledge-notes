import * as vscode from 'vscode';
import { extensionName } from './constants';
import { DisplayMode } from './types';

export class Config {

   private _onDidChangeConfig: vscode.EventEmitter<Config.ConfigItems | undefined | void> = new vscode.EventEmitter<Config.ConfigItems | undefined | void>();
   readonly onDidChangeConfig: vscode.Event<Config.ConfigItems | undefined | void> = this._onDidChangeConfig.event;

   private static instance: Config = new Config();
   private workspaceConfig!: vscode.WorkspaceConfiguration;
   private hasSetListener: boolean = false;

   private constructor() {
      this.loadWorkspaceConfig();
   }

   static getInstance(): Config {
      return Config.instance;
   }

   setListener(): vscode.Disposable {
      if (this.hasSetListener) return { dispose: () => { } };
      this.hasSetListener = true;
      return vscode.workspace.onDidChangeConfiguration(() => {
         this.loadWorkspaceConfig();
         this._onDidChangeConfig.fire(Config.AllConfigItems);
      });
   }

   loadWorkspaceConfig(): void {
      this.workspaceConfig = vscode.workspace.getConfiguration(extensionName);
   }

   //#region workspaceConfig

   get notesDir(): vscode.Uri | undefined {
      const notesDir = this.workspaceConfig.get<string>('notesDir');
      return notesDir ? vscode.Uri.file(notesDir) : undefined;
   }

   set notesDir(uri: vscode.Uri | undefined) {
      this.workspaceConfig.update('notesDir', uri?.fsPath, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.NotesDir]);
   }

   get confirmDelete(): boolean {
      return this.workspaceConfig.get('confirmDelete') ?? false;
   }

   set confirmDelete(confirm: boolean) {
      this.workspaceConfig.update('confirmDelete', confirm, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.ConfirmDelete]);
   }

   get previewEngine(): Config.PreviewEngine {
      return this.workspaceConfig.get('previewEngine') ?? 'default';
   }

   set previewEngine(engine: Config.PreviewEngine) {
      this.workspaceConfig.update('previewEngine', engine, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.PreviewEngine]);
   }

   get tagDelimiter(): string {
      return this.workspaceConfig.get('tagDelimiter') ?? '/';
   }

   set tagDelimiter(delimiter: string) {
      this.workspaceConfig.update('tagDelimiter', delimiter, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.TagDelimiter]);
   }

   get singlePreview(): boolean {
      return vscode.workspace.getConfiguration('markdown-preview-enhanced').get('singlePreview') ?? true;
   }

   set singlePreview(singlePreview: boolean) {
      vscode.workspace.getConfiguration('markdown-preview-enhanced').update('singlePreview', singlePreview, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.SinglePreview]);
   }

   get showHiddenFiles(): boolean {
      return this.workspaceConfig.get('showHiddenFiles') ?? false;
   }

   set showHiddenFiles(show: boolean) {
      this.workspaceConfig.update('showHiddenFiles', show, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.ShowHiddenFiles]);
   }

   get gitAutoSave(): boolean {
      return this.workspaceConfig.get('gitAutoSave') ?? false;
   }

   set gitAutoSave(enable: boolean) {
      this.workspaceConfig.update('gitAutoSave', enable, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.GitAutoSave]);
   }

   get gitAutoSaveInterval(): number {
      return this.workspaceConfig.get('gitAutoSaveInterval') ?? 30;
   }

   set gitAutoSaveInterval(minutes: number) {
      this.workspaceConfig.update('gitAutoSaveInterval', minutes, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.GitAutoSaveInterval]);
   }

   get promptsDir(): string | undefined {
      return this.workspaceConfig.get<string>('promptsDir') || undefined;
   }

   set promptsDir(path: string | undefined) {
      this.workspaceConfig.update('promptsDir', path, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.PromptsDir]);
   }

   get markdownlintFixAllOnSave(): boolean {
      return this.workspaceConfig.get('markdownlintFixAllOnSave') ?? true; // Default to true
   }

   set markdownlintFixAllOnSave(enable: boolean) {
      this.workspaceConfig.update('markdownlintFixAllOnSave', enable, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.MarkdownlintFixAllOnSave]);
   }

   get autoSaveDelay(): number {
      return this.workspaceConfig.get('autoSaveDelay') ?? 6666; // Default to 6666ms
   }

   set autoSaveDelay(delay: number) {
      this.workspaceConfig.update('autoSaveDelay', delay, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.AutoSaveDelay]);
   }

   get enableDebugLogging(): boolean {
      return this.workspaceConfig.get('enableDebugLogging') ?? false;
   }

   set enableDebugLogging(enable: boolean) {
      this.workspaceConfig.update('enableDebugLogging', enable, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.EnableDebugLogging]);
   }

   //#endregion

   private _displayMode: DisplayMode = DisplayMode.Edit;
   private _isNothingTag: boolean = true;
   private _isEmptyNotesDir: boolean = true;

   get displayMode(): DisplayMode {
      return this._displayMode;
   }

   set displayMode(mode: DisplayMode) {
      this._displayMode = mode;
      this._onDidChangeConfig.fire([Config.ConfigItem.DisplayMode]);
   }

   get isNothingTag(): boolean {
      return this._isNothingTag;
   }

   set isNothingTag(isNothing: boolean) {
      this._isNothingTag = isNothing;
      vscode.commands.executeCommand('setContext', 'daily-order.isNothingTag', isNothing);
      this._onDidChangeConfig.fire([Config.ConfigItem.IsNothingTag]);
   }

   get isEmptyNotesDir(): boolean {
      return this._isEmptyNotesDir;
   }

   set isEmptyNotesDir(isEmpty: boolean) {
      this._isEmptyNotesDir = isEmpty;
      vscode.commands.executeCommand('setContext', 'daily-order.isEmptyNotesDir', isEmpty);
      this._onDidChangeConfig.fire([Config.ConfigItem.IsEmptyNotesDir]);
   }

}

export namespace Config {

   export const ConfigItem = {
      NotesDir: 'notesDir',
      ConfirmDelete: 'confirmDelete',
      PreviewEngine: 'previewEngine',
      SinglePreview: 'singlePreview',
      TagDelimiter: 'tagDelimiter',
      DisplayMode: 'displayMode',
      IsNothingTag: 'isNothingTag',
      IsEmptyNotesDir: 'isEmptyNotesDir',
      ShowHiddenFiles: 'showHiddenFiles',
      GitAutoSave: 'gitAutoSave',
      GitAutoSaveInterval: 'gitAutoSaveInterval',
      PromptsDir: 'promptsDir',
      MarkdownlintFixAllOnSave: 'markdownlintFixAllOnSave',
      AutoSaveDelay: 'autoSaveDelay',
      EnableDebugLogging: 'enableDebugLogging'
   } as const;
   export const PreviewEngine = {
      Default: 'default',
      Enhanced: 'enhanced',
      Disuse: 'disuse'
   } as const;
   export type ConfigItem = typeof ConfigItem[keyof typeof ConfigItem];
   export type ConfigItems = ConfigItem[];
   export type PreviewEngine = typeof PreviewEngine[keyof typeof PreviewEngine];
   export const AllConfigItems = Object.values(ConfigItem) as ConfigItems;

}
