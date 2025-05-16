# Daily Order
VSCode extension for managing your daily order.

![Sample](./img/sample.png)

### Tested at **Windows** only.

# Feature
- Quick access to your daily order via activity bar.
- Open markdown as preview by one action when read-only mode.
- Add tags to your note and show tag tree view.
- Search in your notes via command palette, with support for case sensitivity, whole word matching, and regex.
- Focus On Today Order Note (Shortcut: `ctrl+t` on macOS).
- Thinker Chat Participant: Engage in a more thoughtful chat experience.
- LLM Chat Panel: Assists in editing notes, displayed when a Markdown note is open.
- Configurable Auto-Save:
    - Automatic saving of Markdown files.
    - Git auto-save with configurable intervals and manual save options.
    - Configurable auto-save delay and pause functionality.
    - Automatic `markdownlint` fixes on save.
- File and Prompt Management:
    - Create new files or `.prompt.md` files via commands.
    - File completion triggered by `>>` or `》》`.
    - Prompt completion with support for custom prompt directories.
    - "Add to Today's Note" LLM tool for appending text.
    - Today's note uses date as filename and supports templates.
- Markdown Enhancements:
    - Command to open links within Markdown files.
    - Timestamp insertion via Markdown completion.
- Git Integration:
    - Improved handling of Git merge conflicts.
    - Git commit queue for smoother auto-save.
- Open notes directory in a new window.

### TBA
- Manage revision your note by git.

# Get Started
Execute `Daily Order: Set Notes Directory` or click `Set Notes Directory` button on side menu for set note saving directory.

# File Operations
![Demo](./img/file_operations.gif)
You can operate file in notes directory by GUI, commands and keyboard shortcuts.

# Display Mode
![Demo](./img/display_mode.gif)
Daily Order has two display mode. You can toggle display mode via statusbar or `Daily Order: Toggle Display Mode` command.
## Edit Mode
Edit mode is the same mode as normal vscode, so you can edit file
as you like.
## View Mode
File is added read-only attribute and markdown file is opened as preview.

To preview markdown, you can use vscode standard or [Markdown Preview Enhanced](https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced). See [Settings](#Settings).

# Tags
![Tag Explorer](./img/tag_explorer.png)

You can set tags for your notes. The tags you set will be displayed in the side menu.

You can set the tag as follows.

```
---
tags: [software/algorithm, math]
---
```
Tags can be hierarchized by delimiting them with a `/`. The delimiter can be changed freely. See [Settings](#Settings).


# Settings
| Name                               | Description                                                                     | type                                |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `daily-order.notesDir`      | Directory where notes are saved.                                                | string                              |
| `daily-order.confirmDelete` | Controls whether the explorer should ask for confirmation when deleting a file. | boolean                             |
| `daily-order.previewEngine` | Directory where notes are saved.                                                | 'default' \| 'enhanced' \| 'disuse' |
| `daily-order.tagDelimiter`  | A character to delimit tag.                                                     | string                              |
