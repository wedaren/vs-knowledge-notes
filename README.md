# Daily Order
VSCode extension for managing your daily order.

![Sample](./img/sample.png)

### Tested at **Windows** only.

# Feature
- Quick access to your daily order via activity bar.
- Open markdown as preview by one action when read-only mode.
- Add tags to your note and show tag tree view.
- Search in your notes via command pallette.
- Focus On Today Order Note.
### TBA
- Manage revision your note by git.

# Get Started
Execute `Daily Order: Set Notes Directory` or click `Set Notes Directory` button on side menu for set note saving directory.

# File Operations
![Demo](./img/file_operations.gif)
You can operate file in notes directory by GUI, commands and keyboard shortcuts.
## Commands
 - `Daily Order: New File`
 - `Daily Order: New Folder`
## Keyboard Shortcuts
| Operation        | Shortcut       |
| ---------------- | -------------- |
| findInFolder     | `shift+alt+f`  |
| cut              | `ctrl+x`       |
| copy             | `ctrl+c`       |
| paste            | `ctrl+v`       |
| copyPath         | `shift+alt+c`  |
| copyRelativePath | `ctrl+shift+c` |
| rename           | `f2`           |
| delete           | `delete`       |

Deleted files will be moved to the Trash.

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

# Search
![Demo](./img/search_demo.gif)
You can search in notes via `Daily Order: Search In Notes` command.
Use the button in the upper right for toggling match case, match whole word and use regex.
![SearchCommand](./img/search_command.png)

# Settings
| Name                               | Description                                                                     | type                                |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `daily-order.notesDir`      | Directory where notes are saved.                                                | string                              |
| `daily-order.confirmDelete` | Controls whether the explorer should ask for confirmation when deleting a file. | boolean                             |
| `daily-order.previewEngine` | Directory where notes are saved.                                                | 'default' \| 'enhanced' \| 'disuse' |
| `daily-order.tagDelimiter`  | A character to delimit tag.                                                     | string                              |
