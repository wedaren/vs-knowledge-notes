import * as vscode from 'vscode';
import * as path from 'path';
import dayjs = require('dayjs');
import { FileSystemProvider } from './fileSystemProvider';
import { Config } from './config';
import { NoteExplorer } from './noteExplorer'; // Added import

interface IAddNoteParams {
    textToAppend: string;
}

export class AddNoteTool implements vscode.LanguageModelTool<IAddNoteParams> {
    readonly name = 'daily_order_add_note';
    readonly displayName = "Add to Today's Note";
    readonly description = "Adds the provided text to today's note file.";
    readonly modelDescription = "Use this tool to append text to the daily note file. The note file is named with the current date in YYYY-MM-DD.md format and located in the 'TodayOrder' subdirectory of the notes directory.";
    readonly userDescription = "Appends text to today's note.";
    readonly icon = new vscode.ThemeIcon('notebook-write');
    readonly inputSchema = {
        type: 'object',
        properties: {
            textToAppend: {
                type: 'string',
                description: "The text content to append to today's note file."
            }
        },
        required: ['textToAppend']
    };

    private readonly noteExplorer: NoteExplorer;

    constructor(private readonly fileSystemProvider: FileSystemProvider) {
        this.noteExplorer = NoteExplorer.getInstance(fileSystemProvider); // Use singleton instance
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IAddNoteParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        const confirmationMessages = {
            title: "Add to Today's Note",
            message: new vscode.MarkdownString(
                `Append the following text to today's note?\n\n\`\`\`\n${options.input.textToAppend}\n\`\`\``
            ),
        };

        return {
            invocationMessage: "Appending text to today's note...",
            confirmationMessages,
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IAddNoteParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const notesDir = Config.getInstance().notesDir;
        if (!notesDir) {
            throw new Error('Notes directory is not set.');
        }

        const folderUri = await this.noteExplorer.ensureTodayOrderFolderExists(notesDir);
        if (!folderUri) {
            throw new Error('Failed to ensure today order folder exists.');
        }

        const noteFileUri = this.noteExplorer.getTodayNoteFileUri(folderUri);
        await this.noteExplorer.ensureTodayNoteFileExists(noteFileUri);

        let contentToAdd = options.input.textToAppend;

        const existingContent = await this.fileSystemProvider.readFile(noteFileUri);
        const existingContentString = Buffer.from(existingContent).toString('utf8');
        
        const today = dayjs();
        const template = `# ${today.format('YYYY-MM-DD')}\n\n`;
        if (existingContentString === template && !options.input.textToAppend.startsWith(template)) {
            contentToAdd = existingContentString + options.input.textToAppend;
        } else if (!existingContentString.endsWith('\n\n')) {
            contentToAdd = existingContentString.trimEnd() + '\n\n' + options.input.textToAppend;
        } else {
            contentToAdd = existingContentString + options.input.textToAppend;
        }

        try {
            await this.fileSystemProvider.writeFile(noteFileUri, Buffer.from(contentToAdd, 'utf8'), { create: true, overwrite: true });
            return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Appended text to ${noteFileUri.fsPath}`)]);
        } catch (error) {
            throw new Error(`Failed to write to note file ${noteFileUri.fsPath}: ${error}`);
        }
    }
}
