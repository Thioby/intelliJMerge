import * as vscode from 'vscode';
import { GitService } from './gitService';
import { ConflictsPanel } from './conflictsPanel';
import { ensureMergetoolConfigured } from './mergetoolSetup';

let gitService: GitService | undefined;
let gitDirWatcher: vscode.FileSystemWatcher | undefined;
let statusCheckInterval: ReturnType<typeof setInterval> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  gitService = new GitService(workspaceRoot);

  context.subscriptions.push(
    vscode.commands.registerCommand('intellijMerge.resolveConflicts', () => {
      if (!gitService) return;
      ConflictsPanel.create(context.extensionUri, gitService);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('intellijMerge.mergeCurrentFile', async () => {
      if (!gitService) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file to merge.');
        return;
      }

      const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
      const conflicts = await gitService.getConflicts();
      if (!conflicts.find(c => c.path === filePath)) {
        vscode.window.showWarningMessage('Current file has no merge conflict.');
        return;
      }

      const hasTool = await ensureMergetoolConfigured(gitService);
      if (!hasTool) return;

      try {
        await gitService.runMergetool(filePath);
        vscode.window.showInformationMessage(`Merge completed for ${filePath}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Merge tool failed: ${e.message}`);
      }
    }),
  );

  // Set up git dir watcher + initial context key (non-blocking)
  try {
    const gitDir = await gitService.getGitDir();
    const gitDirUri = vscode.Uri.file(gitDir);
    const pattern = new vscode.RelativePattern(gitDirUri, '*');
    gitDirWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    const onGitChange = () => updateMergeContext(gitService!);
    gitDirWatcher.onDidCreate(onGitChange);
    gitDirWatcher.onDidChange(onGitChange);
    gitDirWatcher.onDidDelete(onGitChange);
    context.subscriptions.push(gitDirWatcher);
  } catch {
    statusCheckInterval = setInterval(() => updateMergeContext(gitService!), 3000);
  }

  updateMergeContext(gitService);
}

async function updateMergeContext(git: GitService): Promise<void> {
  const inProgress = await git.isMergeInProgress();
  vscode.commands.executeCommand('setContext', 'intellijMerge.mergeInProgress', inProgress);
}

export function deactivate(): void {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
}
