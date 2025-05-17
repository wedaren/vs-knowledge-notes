import * as vscode from 'vscode';
import * as path from 'path';
import { NoteExplorer } from './noteExplorer';
import { DateTimeTitleStrategy, MarkdownLinkHandler } from './markdownLinkHandler';

export async function createNoteFromSelection(noteExplorer: NoteExplorer) {
   const editor = vscode.window.activeTextEditor;
   if (!editor) {
      return;
   }

   const selection = editor.selection;
   if (selection.isEmpty) {
      vscode.window.showErrorMessage('请选择文本以创建笔记。');
      return;
   }
   const selectedText = editor.document.getText(selection);

   const markdownLinkHandler = MarkdownLinkHandler.getInstance();
   const titleForLink = await markdownLinkHandler.generateLinkTextForNote(selectedText);

   const newNoteContent = `# ${titleForLink}\n\n${selectedText}\n`;

   const titleHint = await new DateTimeTitleStrategy().generateTitle();
   const newNoteUri = await noteExplorer.createNewNote({
      titleHint,
      initialContent: newNoteContent
   });

   if (!newNoteUri) {
      return;
   }

   const relativeNotePath = markdownLinkHandler.generateLinkPathForNote(newNoteUri);
   const markdownLink = `[${titleForLink}](${relativeNotePath})`;

   editor.edit(editBuilder => {
      editBuilder.replace(selection, markdownLink);
   });

   vscode.window.showTextDocument(newNoteUri, { preview: false });
}
