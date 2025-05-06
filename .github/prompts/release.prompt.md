# VS Code 扩展发布流程

## 准备工作

@vscode 请帮助我在 package.json 中更新版本号，自动增加补丁版本号 (patch version)

@terminal echo "正在获取最近的 Git 标签版本..." && git describe --tags --abbrev=0 | xargs -I {} sh -c 'echo "获取 {} 之后的所有提交:"; git log {}..HEAD --pretty=format:"- %s" --no-merges | cat'

## 更新 CHANGELOG

@vscode 请按以下格式更新 CHANGELOG.md：

1. 在顶部添加新的部分，使用格式：## [x.y.z] - YYYY-MM-DD
2. 使用今天的日期，格式为 YYYY-MM-DD
3. 添加来自上面获取的提交信息作为更新日志条目
   - 格式化并分组相似的提交
   - 必要时删除提交前缀，如 "fix:"、"feat:" 等
   - 如果没有特定的提交信息可用，则使用标准点：版本更新、性能优化、稳定性提升

## 打包与发布

@terminal echo "正在打包扩展..." && npx vsce package --allow-star-activation

@terminal echo "正在将更改添加到 Git..." && git add package.json package-lock.json CHANGELOG.md

@terminal LATEST_VERSION=$(node -p "require('./package.json').version") && echo "正在创建提交..." && git commit -m "chore: release v$LATEST_VERSION - 版本更新"

@terminal LATEST_VERSION=$(node -p "require('./package.json').version") && echo "正在创建标签 v$LATEST_VERSION..." && git tag v$LATEST_VERSION

@terminal echo "正在推送提交和标签到远程仓库..." && git push && git push --tags

@terminal echo "正在发布扩展到 VS Code 市场..." && npx vsce publish --allow-star-activation

