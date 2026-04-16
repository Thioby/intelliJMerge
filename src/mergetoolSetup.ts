import * as vscode from 'vscode';
import { GitService } from './gitService';
import { detectJetBrainsIde } from './jetbrainsDetector';

/**
 * Ensures a mergetool is configured. Checks in order:
 * 1. Existing git config
 * 2. User-configured path in settings
 * 3. Auto-detected JetBrains IDE
 */
export async function ensureMergetoolConfigured(gitService: GitService): Promise<boolean> {
  const existing = await gitService.getMergetoolConfig();
  if (existing) return true;

  const config = vscode.workspace.getConfiguration('intellijMerge');
  const userPath = config.get<string>('mergetoolPath', '');
  if (userPath) {
    await gitService.configureMergetool('custom', userPath);
    return true;
  }

  const detected = detectJetBrainsIde();
  if (detected) {
    const choice = await vscode.window.showInformationMessage(
      `Found ${detected.name}. Configure as merge tool?`,
      'Yes', 'No',
    );
    if (choice === 'Yes') {
      await gitService.configureMergetool(detected.binaryName, detected.binaryPath);
      return true;
    }
    return false;
  }

  const action = await vscode.window.showErrorMessage(
    'No merge tool configured and no JetBrains IDE found.',
    'Open Docs',
  );
  if (action === 'Open Docs') {
    vscode.env.openExternal(vscode.Uri.parse(
      'https://www.jetbrains.com/help/idea/command-line-merge-tool.html',
    ));
  }
  return false;
}
