@vscode Help me update the version in package.json, auto add patch version
@vscode check git commit update Changelog.md
@terminal Check if vsce is installed globally, then package the current VS Code extension project in the workspace root with --allow-star-activation flag.
@terminal Add changes to git with "git add package.json CHANGELOG.md"
@terminal Create a commit with message that includes the new version, e.g.: "git commit -m 'chore: release vX.Y.Z'"
@terminal Create a git tag for the new version, e.g.: "git tag vX.Y.Z"
@terminal Push the commit and tag to remote repository, e.g.: "git push && git push --tags"
@terminal Publish the current VS Code extension as a new patch version using vsce with --allow-star-activation flag. Assume I am already logged in with vsce login.

