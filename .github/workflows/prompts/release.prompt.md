@vscode Help me update the version in package.json, auto add patch version

@terminal git describe --tags --abbrev=0 | xargs -I {} sh -c 'echo "Getting commits since {}"; git log {}..HEAD --pretty=format:"- %s" --no-merges'

@vscode Update CHANGELOG.md with the following:
1. Add a new section at the top using format: ## [x.y.z] - YYYY-MM-DD
2. Use today's date in YYYY-MM-DD format
3. Add commit messages from above as changelog entries
   (Format and group similar commits, remove commit prefixes like "fix:", "feat:" if needed)
   (If no specific commits are available, use standard points: 版本更新, 性能优化, 稳定性提升)

@terminal Check if vsce is installed globally, then package the current VS Code extension project in the workspace root with --allow-star-activation flag.

@terminal Add changes to git with "git add package.json package-lock.json CHANGELOG.md"

@terminal Create a commit with message using format: "git commit -m 'chore: release vX.Y.Z - CHANGELOG内容概述'"

@terminal Create a git tag for the new version, e.g.: "git tag vX.Y.Z"

@terminal Push the commit and tag to remote repository, e.g.: "git push && git push --tags"

@terminal Publish the current VS Code extension as a new patch version using vsce with --allow-star-activation flag. Assume I am already logged in with vsce login.

