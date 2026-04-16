# IntelliJ Merge Tool for VS Code

Resolve git merge conflicts using JetBrains IDE merge tool, with a UI inspired by IntelliJ IDEA's "Resolve Conflicts" dialog.

## Features

- Context menu "Resolve Git Conflicts..." in Explorer (visible only during active merge/rebase/cherry-pick)
- Webview panel with conflict list — columns: Name, Yours, Theirs
- Accept Yours / Accept Theirs / Merge... buttons
- Group files by directory
- Auto-detects JetBrains IDEs (IntelliJ, WebStorm, PyCharm, GoLand, etc.)
- Correct ours/theirs handling during rebase
- Works with git worktrees and submodules

## Installation

### From VSIX (recommended)

1. Download the latest `.vsix` file from [Releases](https://github.com/Thioby/intelliJMerge/releases), or build it yourself (see below)
2. In VS Code, open Command Palette (`Cmd+Shift+P`) and run:
   ```
   Extensions: Install from VSIX...
   ```
3. Select the downloaded `.vsix` file
4. Restart VS Code

### Build from source

```bash
git clone git@github.com:Thioby/intelliJMerge.git
cd intelliJMerge
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
code --install-extension intellij-merge-tool-0.1.0.vsix
```

### Install directly from source (development mode)

```bash
git clone git@github.com:Thioby/intelliJMerge.git
cd intelliJMerge
npm install
npm run compile
```

Then open this folder in VS Code and press `F5` to launch Extension Development Host.

## Usage

1. Start a merge/rebase/cherry-pick that produces conflicts
2. Right-click any file in Explorer and select **"Resolve Git Conflicts..."**
3. Select a file in the conflict list
4. Click **Accept Yours**, **Accept Theirs**, or **Merge...** to resolve

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `intellijMerge.mergetoolPath` | `""` | Path to merge tool binary (auto-detected if empty) |
| `intellijMerge.autoRefreshInterval` | `2000` | Polling interval in ms for conflict list refresh |
| `intellijMerge.showNotificationOnAllResolved` | `true` | Show notification when all conflicts are resolved |
