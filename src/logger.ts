import * as vscode from 'vscode';
import { Config } from './config';

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;
    private static config: Config | undefined;

    public static initialize(context: vscode.ExtensionContext, config: Config) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel("Daily Order Logs");
        context.subscriptions.push(this.outputChannel);
    }

    public static log(message: string, ...optionalParams: any[]): void {
        if (this.config?.enableDebugLogging) {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] ${message}`;
            if (this.outputChannel) {
                this.outputChannel.appendLine(logMessage);
                if (optionalParams.length > 0) {
                    optionalParams.forEach(param => {
                        this.outputChannel?.appendLine(JSON.stringify(param, null, 2));
                    });
                }
            } else {
                // Fallback to console if outputChannel is not ready (should not happen in normal flow)
                console.log(logMessage, ...optionalParams);
            }
        }
    }

    public static showOutputChannel(): void {
        this.outputChannel?.show();
    }
}
