// media/main.js
// @ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  let selectedFile = null;
  let groupByDirectory = false;
  let conflicts = [];
  let mergeState = null;
  let merging = false;

  const previousState = vscode.getState();
  if (previousState) {
    selectedFile = previousState.selectedFile;
    groupByDirectory = previousState.groupByDirectory;
  }

  /** @param {string} file */
  function selectFile(file) {
    selectedFile = file === selectedFile ? null : file;
    saveState();
    render();
  }

  /** @param {string} file */
  function onDoubleClick(file) {
    vscode.postMessage({ type: 'merge', file });
  }

  function saveState() {
    vscode.setState({ selectedFile, groupByDirectory });
  }

  function render() {
    const tableBody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const mainArea = document.getElementById('main-area');
    const groupCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('group-checkbox'));
    const countEl = document.getElementById('conflict-count');
    const mergingOverlay = document.getElementById('merging-overlay');

    const subtitleEl = document.getElementById('subtitle');
    if (mergeState) {
      if (mergeState.operation === 'merge') {
        subtitleEl.innerHTML = `Merging branch <span class="branch">${esc(mergeState.sourceBranch)}</span> into <span class="branch">${esc(mergeState.targetBranch)}</span>`;
      } else if (mergeState.operation === 'rebase') {
        subtitleEl.innerHTML = `Rebasing <span class="branch">${esc(mergeState.targetBranch)}</span> onto <span class="branch">${esc(mergeState.sourceBranch)}</span>`;
      } else {
        subtitleEl.innerHTML = `Cherry-picking commit <span class="branch">${esc(mergeState.sourceBranch)}</span> onto <span class="branch">${esc(mergeState.targetBranch)}</span>`;
      }
    } else {
      subtitleEl.textContent = '';
    }

    mergingOverlay.style.display = merging ? 'flex' : 'none';

    const btns = document.querySelectorAll('.actions button');
    btns.forEach(b => {
      /** @type {HTMLButtonElement} */ (b).disabled = !selectedFile || merging;
    });

    groupCheckbox.checked = groupByDirectory;

    countEl.textContent = `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} remaining`;

    if (conflicts.length === 0) {
      mainArea.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    mainArea.style.display = 'flex';
    emptyState.style.display = 'none';

    let html = '';

    if (groupByDirectory) {
      const groups = groupFiles(conflicts);
      for (const [dir, files] of groups) {
        html += `<tr class="group-header"><td colspan="3"><span>▾</span> ${esc(dir)}</td></tr>`;
        for (const f of files) {
          html += fileRow(f, true);
        }
      }
    } else {
      for (const f of conflicts) {
        html += fileRow(f, false);
      }
    }

    tableBody.innerHTML = html;

    tableBody.querySelectorAll('tr.file-row').forEach(row => {
      const file = row.getAttribute('data-file');
      row.addEventListener('click', () => selectFile(file));
      row.addEventListener('dblclick', () => onDoubleClick(file));
    });
  }

  /** @param {import('../src/types').ConflictFile} f */
  function fileRow(f, grouped) {
    const sel = f.path === selectedFile ? ' selected' : '';
    const nameClass = grouped ? 'file-name grouped' : 'file-name';
    const displayName = grouped ? f.path.split('/').pop() : f.path;
    return `<tr class="file-row${sel}" data-file="${esc(f.path)}">
      <td class="${nameClass}">${esc(displayName)}</td>
      <td class="status ${statusClass(f.oursStatus)}">${esc(f.oursStatus)}</td>
      <td class="status ${statusClass(f.theirsStatus)}">${esc(f.theirsStatus)}</td>
    </tr>`;
  }

  /** @param {import('../src/types').ConflictFile[]} files */
  function groupFiles(files) {
    /** @type {Map<string, import('../src/types').ConflictFile[]>} */
    const map = new Map();
    for (const f of files) {
      const parts = f.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : './';
      if (!map.has(dir)) map.set(dir, []);
      map.get(dir).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  /** @param {string} status */
  function statusClass(status) {
    return 'status-' + status.toLowerCase();
  }

  /** @param {string} s */
  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  document.getElementById('btn-accept-ours').addEventListener('click', () => {
    if (selectedFile) vscode.postMessage({ type: 'acceptOurs', file: selectedFile });
  });
  document.getElementById('btn-accept-theirs').addEventListener('click', () => {
    if (selectedFile) vscode.postMessage({ type: 'acceptTheirs', file: selectedFile });
  });
  document.getElementById('btn-merge').addEventListener('click', () => {
    if (selectedFile) vscode.postMessage({ type: 'merge', file: selectedFile });
  });

  document.getElementById('group-checkbox').addEventListener('change', (e) => {
    groupByDirectory = /** @type {HTMLInputElement} */ (e.target).checked;
    saveState();
    render();
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      conflicts = msg.conflicts;
      mergeState = msg.mergeState;
      merging = msg.merging;
      if (selectedFile && !conflicts.find(c => c.path === selectedFile)) {
        selectedFile = null;
        saveState();
      }
      render();
    }
  });

  render();
  vscode.postMessage({ type: 'refresh' });
})();
