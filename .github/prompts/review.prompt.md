// 目标：审查暂存区的代码变更，提供反馈，并生成符合规范的 commit message。

// 步骤 1: 显示暂存区变更
@terminal 执行 `git --no-pager diff --staged` 命令并直接使用其输出。

// 步骤 2: 代码审查与反馈
请基于以下几点，对暂存区的代码变更进行审查：
1.  **主要变更总结**：简述本次变更的核心内容。
2.  **潜在问题**：指出可能的bug、逻辑不严谨之处、或不符合最佳实践的地方。
3.  **改进建议**：提出可以使代码更好的建议（可选）。
4.  **代码规范**：检查是否符合项目编码规范。

// 步骤 3: 生成 Commit Message
请根据步骤 2 的审查结果和暂存区的代码变更，遵循 Conventional Commits 规范，为这些变更生成一个合适的 commit message。
Commit Message 结构应如下：

<type>(<scope>): <subject>

[可选的空行]

[详细描述本次变更的核心内容和目的。这部分内容可以基于步骤 2.1 的主要变更总结，但应更加充实和书面化，作为 commit message 主体的一部分。]

[可选的“主要变更包括：”列表，用点操作符（-）开始，详细列出具体的代码文件和修改点。]
- 例如: 在 `src/chatViewProvider.ts` 中新增 `parseChatHistory` 方法，负责解析从 .chatlog.md 文件读取的字符串历史记录。
- 例如: 修改 `media/chat.js` 以处理新的 `loadParsedHistory` 消息...

[可选的“这样做的好处是：”或“解决的问题：”部分，用点操作符（-）开始，说明本次变更带来的益处或修复的问题。]
- 例如: 简化了前端逻辑，使其更专注于 UI 渲染和用户交互。
- 例如: 提高了代码的可维护性和可扩展性。

请确保 commit message 清晰、简洁且信息完整。
例如 (这是一个完整的 commit message 示例):
'''
feat(chat): 将聊天记录解析逻辑迁移到后端

本次提交将聊天记录的解析和预处理逻辑从前端 (media/chat.js) 迁移到后端 (src/chatViewProvider.ts)。

主要变更包括：
- 在 `chatViewProvider.ts` 中新增 `parseChatHistory` 方法，负责解析从 .chatlog.md 文件读取的字符串历史记录。
- 修改 `chatViewProvider.ts` 中的 `updateChatHistory` 方法，使其调用新的解析方法，并通过 `loadParsedHistory` 事件将结构化消息数组发送给 Webview。
- 修改 `media/chat.js` 以处理新的 `loadParsedHistory` 消息类型，并直接使用后端解析后的消息对象渲染历史记录。
- 清理了相关文件中的行内注释。

这样做的好处是：
- 简化了前端逻辑，使其更专注于 UI 渲染和用户交互。
- 后端集中处理数据获取、解析和格式化，提高了代码的可维护性和可扩展性。
'''

// 步骤 4: 提供 Commit 命令
@terminal 执行 `git commit -m "生成的commit message"` 命令

