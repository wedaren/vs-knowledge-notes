# VS Code 扩展发布流程

## 准备工作

1.  @terminal echo "正在更新版本号 (patch)..." && npm version patch --no-git-tag-version --commit-hooks false
    # 说明: 此命令会更新 package.json 和 package-lock.json 中的版本号，
    # --no-git-tag-version 防止自动打 Git 标签，
    # --commit-hooks false 防止自动创建 Git 提交。
2.  @terminal LATEST_VERSION=$(node -p "require('./package.json').version") && echo "当前最新版本是: $LATEST_VERSION"
3.  @terminal echo "正在获取最近的 Git 标签版本..." && git describe --tags --abbrev=0 | xargs -I {} sh -c 'echo "获取 {} 之后的所有提交:"; PREVIOUS_TAG={}; git log $PREVIOUS_TAG..HEAD --pretty=format:"- %s" --no-merges | tee commits_for_changelog.txt; echo "\nCommit messages saved to commits_for_changelog.txt"'

## 更新 CHANGELOG

1.  @vscode 请读取 `commits_for_changelog.txt` 的内容。
2.  @vscode 请根据 `commits_for_changelog.txt` 的内容和上一步获取的 `LATEST_VERSION` (如果未能获取，请从 `package.json` 重新读取)，按以下格式更新 `CHANGELOG.md`:
    - 在顶部添加新的部分，使用格式：`## [LATEST_VERSION] - YYYY-MM-DD`
    - 使用今天的日期 (格式 YYYY-MM-DD)。
    - 添加来自 `commits_for_changelog.txt` 的提交信息作为更新日志条目。
        - 格式化并分组相似的提交。
        - 必要时删除提交前缀，如 "fix:"、"feat:" 等。
        - 如果没有特定的提交信息可用，则使用标准点：版本更新、性能优化、稳定性提升。
3.  @terminal rm commits_for_changelog.txt

## 打包与发布

1.  @terminal LATEST_VERSION=$(node -p "require('./package.json').version") && echo "使用版本 $LATEST_VERSION 进行后续操作。"
2.  @terminal echo "正在打包扩展..." && npx vsce package --allow-star-activation
3.  @terminal echo "正在将更改添加到 Git..." && git add package.json package-lock.json CHANGELOG.md
4.  @terminal LATEST_VERSION=$(node -p "require('./package.json').version") && echo "正在创建提交..." && git commit -m "chore: release v$LATEST_VERSION - 版本更新"
5.  @terminal LATEST_VERSION=$(node -p "require('./package.json').version") && echo "正在创建标签 v$LATEST_VERSION..." && git tag v$LATEST_VERSION
6.  @terminal echo "正在推送提交和标签到远程仓库..." && git push && git push --tags
7.  @terminal echo "正在发布扩展到 VS Code 市场..." && npx vsce publish --allow-star-activation

