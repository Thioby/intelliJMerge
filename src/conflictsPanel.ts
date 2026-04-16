import * as vscode from 'vscode';
import { GitService } from './gitService';
import { ensureMergetoolConfigured } from './mergetoolSetup';
import type { ExtensionMessage, WebviewMessage } from './types';

export class ConflictsPanel {
  public static readonly viewType = 'intellijMerge.conflictsPanel';
  private static instance: ConflictsPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly gitService: GitService;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private pollingInterval: ReturnType<typeof setInterval> | undefined;
  private merging = false;
  private isDisposed = false;
  private notifiedAllResolved = false;
  private refreshDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, gitService: GitService) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.gitService = gitService;

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.startWatching();
  }

  static create(extensionUri: vscode.Uri, gitService: GitService): ConflictsPanel {
    if (ConflictsPanel.instance) {
      ConflictsPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return ConflictsPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      ConflictsPanel.viewType,
      'Conflicts',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      },
    );

    ConflictsPanel.instance = new ConflictsPanel(panel, extensionUri, gitService);
    return ConflictsPanel.instance;
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'acceptOurs':
      case 'acceptTheirs': {
        const mergeState = await this.gitService.getMergeState();
        const operation = mergeState?.operation ?? 'merge';
        try {
          if (msg.type === 'acceptOurs') {
            await this.gitService.acceptOurs(msg.file, operation);
          } else {
            await this.gitService.acceptTheirs(msg.file, operation);
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to ${msg.type === 'acceptOurs' ? 'accept yours' : 'accept theirs'}: ${e.message}`);
        }
        await this.refresh();
        break;
      }

      case 'merge':
        this.merging = true;
        await this.refresh();
        try {
          const hasTool = await ensureMergetoolConfigured(this.gitService);
          if (!hasTool) {
            this.merging = false;
            await this.refresh();
            return;
          }
          await this.gitService.runMergetool(msg.file);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Merge tool failed: ${e.message}`);
        }
        this.merging = false;
        await this.refresh();
        break;

      case 'refresh':
        await this.refresh();
        break;
    }
  }

  private async refresh(): Promise<void> {
    if (this.isDisposed) return;

    const [mergeState, conflicts] = await Promise.all([
      this.gitService.getMergeState(),
      this.gitService.getConflicts(),
    ]);

    if (this.isDisposed) return;

    // During rebase, git swaps ours/theirs — swap display labels for the user
    const displayConflicts = mergeState?.operation === 'rebase'
      ? conflicts.map(c => ({ ...c, oursStatus: c.theirsStatus, theirsStatus: c.oursStatus }))
      : conflicts;

    const msg: ExtensionMessage = {
      type: 'update',
      conflicts: displayConflicts,
      mergeState,
      merging: this.merging,
    };

    this.panel.webview.postMessage(msg);

    if (conflicts.length === 0 && !this.merging && !this.notifiedAllResolved) {
      this.notifiedAllResolved = true;
      const config = vscode.workspace.getConfiguration('intellijMerge');
      if (config.get<boolean>('showNotificationOnAllResolved', true)) {
        vscode.window.showInformationMessage('All conflicts resolved.');
      }
    } else if (conflicts.length > 0) {
      this.notifiedAllResolved = false;
    }
  }

  private debouncedRefresh(): void {
    if (this.refreshDebounceTimer) clearTimeout(this.refreshDebounceTimer);
    this.refreshDebounceTimer = setTimeout(() => {
      if (!this.merging) this.refresh();
    }, 500);
  }

  private startWatching(): void {
    const config = vscode.workspace.getConfiguration('intellijMerge');
    const interval = config.get<number>('autoRefreshInterval', 2000);
    this.pollingInterval = setInterval(() => {
      if (!this.merging) this.refresh();
    }, interval);

    this.setupGitDirWatcher();
  }

  private async setupGitDirWatcher(): Promise<void> {
    try {
      const gitDir = await this.gitService.getGitDir();
      const gitDirUri = vscode.Uri.file(gitDir);
      const pattern = new vscode.RelativePattern(gitDirUri, '*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate(() => this.debouncedRefresh());
      watcher.onDidChange(() => this.debouncedRefresh());
      watcher.onDidDelete(() => this.debouncedRefresh());
      this.disposables.push(watcher);
    } catch {
      // polling will handle it
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${stylesUri}" rel="stylesheet">
  <title>Conflicts</title>
</head>
<body>
  <div class="header">
    <h1>Conflicts</h1>
    <div id="subtitle" class="subtitle"></div>
  </div>

  <div id="empty-state" class="empty-state" style="display:none;">
    No conflicts found.
  </div>

  <div id="main-area" class="main" style="position:relative;">
    <div id="merging-overlay" class="merging-overlay" style="display:none;">
      Waiting for merge tool to close...
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th class="status">Yours</th>
            <th class="status">Theirs</th>
          </tr>
        </thead>
        <tbody id="table-body"></tbody>
      </table>
    </div>
    <div class="actions">
      <button id="btn-accept-ours" disabled>Accept Yours</button>
      <button id="btn-accept-theirs" disabled>Accept Theirs</button>
      <button id="btn-merge" class="primary" disabled>Merge...</button>
    </div>
  </div>

  <div class="footer">
    <label>
      <input type="checkbox" id="group-checkbox"> Group files by directory
    </label>
    <span id="conflict-count" class="count"></span>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    this.isDisposed = true;
    ConflictsPanel.instance = undefined;
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (this.refreshDebounceTimer) clearTimeout(this.refreshDebounceTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
