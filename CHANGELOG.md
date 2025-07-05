# Change Log

## [1.1.36] - 2025-07-05

- 重构：移除 AddNoteTool 和相关功能
- 修复：移除未使用的 markdownlint 扩展依赖
- 功能：仅识别 .md 结尾的链接
- 版本更新、性能优化、稳定性提升

## [1.1.35] - 2025-07-05

- 移除未使用的 markdownlint 扩展依赖
- 优化 Markdown 链接识别，仅识别 .md 结尾的链接
- 版本更新、性能优化、稳定性提升

## [1.1.34] - 2025-06-27

- 版本更新、性能优化、稳定性提升

## [1.1.33] - 2025-06-09

- implement today's note outline view with drag and drop support
- 添加打开关联 Prompt 文件的功能
- add document outline explorer with refresh, collapse, expand, and add heading functionalities
- update command to show staged changes with whitespace ignored
- 增强链接处理能力并更新提示模式

## [1.1.32] - 2025-05-28

- 简化 Git 操作逻辑并优化自动同步流程

## [1.1.31] - 2025-05-24

- 将 Git 操作迁移到 simple-git 库
- 打开今日笔记后聚焦编辑器而非侧边栏

## [1.1.30] - 2025-05-18

- 完善 review.prompt 对 commit message特殊字符处理的指导
- 使用 global.setTimeout 解决类型冲突
- 优化 GitService 错误处理和日志记录
- 考虑为 console.log 引入一个基于配置的调试开关

## [1.1.28] - 2025-05-18

- 使用 LitElement 和 TypeScript 重构聊天界面
- 调整格式化策略以优化 LLM 生成代码的集成
- 优化 review.prompt.md 中步骤4的措辞
- 实现聊天输入框历史记录导航功能
- 优化聊天视图滚动逻辑
- 优化 review.prompt.md 以生成更详细的 commit message
- 后端处理聊天记录保存与解析优化
- 更新 review prompt with detailed instructions
- 实现从选中文本创建笔记的核心功能
- 增强 MarkdownLinkHandler 和 NoteExplorer
- 添加 review prompt for code changes
- 将聊天记录解析逻辑迁移到后端

## [1.1.27] - 2025-05-17

- 添加 Thinker Chat Participant 功能
- 优化 Prompt

## [1.1.26] - 2025-05-16

- Revert "feat: 添加历史消息选择功能，增强聊天体验"
- chore: update release process and set v1.1.25 release date to 2025-05-16

## [1.1.25] - 2025-05-16

- feat: Add configurable auto-save delay and pause functionality
- feat: 添加历史消息选择功能，增强聊天体验
- feat: git 实现提交队列处理，优化笔记自动保存的体验
- fix: 优化 Git 合并冲突处理，自动尝试继续变基并提示冲突文件

## [1.1.24] - 2025-05-15

- 添加 markdownlint 自动修复选项，增强文档保存体验
- 更新"添加到今日笔记"工具的描述，增强用户理解

## [1.1.23] - 2025-05-15

- 添加“添加到今日笔记” LLM tool，支持向今日笔记文件追加文本
- 添加今日笔记文件和目录的创建逻辑，增强文件管理功能

## [1.1.22] - 2025-05-15

- 添加搜索功能，支持匹配大小写、整词匹配和正则表达式选项
- 添加新命令以在笔记资源管理器中创建对应的 .pompt.md 文件
- 修复 .prompt.md 和 .chatlog.md 文件不支持 LLM Chat 的问题
- 打开 markdown 笔记时，自动聚焦到对应的 LLM Chat
- 重构注释当前 Markdown 笔记作为 Prompt 上下文的逻辑
- LLM chat Panel 只在 markdown 笔记打开时才显示
- 重构更新文件打开逻辑，统一使用 openFile 命令替代 reveal

## [1.1.21] - 2025-05-14

- 移除不必要的命令注册，优化文件补全提供者和笔记浏览器功能
- 更新 shouldAutoSave 方法以支持 prompt.md 文件类型

## [1.1.20] - 2025-05-13

- feature: 在 panel 添加 LLM chat 辅助笔记编辑

## [1.1.19] - 2025-05-12

- 添加 Git 操作的错误处理，增强用户提示信息
- 将文件打开逻辑提取到单独的方法中以提高代码可读性

## [1.1.18] - 2025-05-10

- 重构相关命令以提高一致性和可读性
- 添加 prompt 补全功能和调试命令，支持自定义 prompts 目录

## [1.1.17] - 2025-05-08

- 新增：添加新的触发字符 '》》' 以支持文件补全功能
- 修复：打开 markdown 链接现在会自动显示文件位置
- 优化：如果是周六，则算作下一周的开始
- 其他：更新发布流程文档，增加版本号更新和 CHANGELOG 更新步骤

## [1.1.16] - 2025-05-06

- 新增：用 Markdown 补全支持添加时间戳辅助功能
- 新增：添加快捷键 ctrl+t 以聚焦今日备忘录

## [1.1.15] - 2025-05-05

- 新增：自动保存 markdown 文件功能
- 新增：Git 更改自动保存功能
- 新增：添加 MCP 配置用于顺序思维服务器
- 优化：添加 vscode-markdownlint 扩展依赖
- 优化：更新项目依赖项

## [1.1.14] - 2025-05-05

- chore: update GitHub Actions to use latest versions of actions and Node.js
- feat: implement GitHub Actions workflow for automated VS Code extension release

## [1.1.13] - 2025-05-05

- 新增功能：添加命令以在文件不存在时创建文件
- 性能优化
- 稳定性提升

## [1.1.12] - 2025-05-05

- 修复链接处理，使用配置的笔记目录
- 性能优化
- 稳定性提升

## [1.1.11] - 2025-05-05

- 版本更新
- 性能优化
- 稳定性提升
- 优化发布流程

## [1.1.10] - 2025-05-05

- 版本更新
- 性能优化
- 稳定性提升

## [1.1.9] - 2025-04-29

- 版本更新
- 性能优化
- 稳定性提升

## [1.1.8] - 2025-04-28

- 版本更新
- 性能优化
- 修复bug

## [1.1.7] - 2025-04-28

- 版本更新
- 修复小错误

## [1.1.6] - 2025-04-28

- 版本更新
- 修复小错误

## [1.1.5] - 2025-04-27

- Enhance 'Focus On Today Order Note' command to reveal the note in the treeview

## [1.1.4] - 2025-04-25

- Add 'Focus On Today Order Note' command

## [1.1.3] - 2025-04-27

- Update version compatibility
- Performance improvements
- Bug fixes for file operations
- Add configuration option to show hidden files in note explorer

## [1.1.2]

- Update docs
- Add "Open In Integrated Terminal" command
- Fix bug that user can input space on filename or dirname

## [1.1.1]

- Update docs
- Fix icon transparent

## [1.0.1]

- Change Extension Icon

## [1.0.0]

- Initial release
