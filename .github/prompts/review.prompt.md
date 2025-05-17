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
请根据上述变更内容，遵循 Conventional Commits 规范 (例如 feat:, fix:, docs:, style:, refactor:, test:, chore:)，为这些变更生成一个合适的 commit message。
格式为：`<type>(<scope>): <subject>`
例如: `feat(search): implement advanced filtering`

// 步骤 4: 提供 Commit 命令
最后，请提供 `git commit -m "生成的commit message"` 命令，并用 @terminal 执行。

