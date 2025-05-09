import * as vscode from 'vscode';
import { Config } from './config';
import { DisplayMode } from './types';

export class StatusBar {

   private viewModeSign: vscode.StatusBarItem;
   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];

   constructor() {
      this.viewModeSign = vscode.window.createStatusBarItem('daily-order.statusBar.viewModeSign', vscode.StatusBarAlignment.Left);
      this.viewModeSign.text = this.config.displayMode === DisplayMode.Edit ? '$(pencil) (Edit Mode)' : '$(book) (View Mode)';
      this.viewModeSign.command = 'daily-order.toggleDisplayMode';
      this.viewModeSign.name = 'View Mode';
      this.viewModeSign.show();

      this.disposables.push(
         this.viewModeSign,
         this.config.onDidChangeConfig(e => {
            if (e && e.indexOf(Config.ConfigItem.DisplayMode) !== -1) {
               this.update();
            }
         })
      );
   }

   dispose(): void {
      this.disposables.forEach(d => d.dispose());
   }

   private update(): void {
      this.viewModeSign.text = this.config.displayMode === DisplayMode.Edit ? '$(pencil) (Edit Mode)' : '$(book) (View Mode)';
   }

}
