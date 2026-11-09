// Codexter (Codex Panel) for VS Code: entry point. Wires the session, the webview view, commands and the workspace glue.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { BranchChats } from './branchChats';
import { generateCommitMessage } from './commitMessage';
import { DEFAULT_QUICK_MODEL, mcpServerNames, readCodexConfig, runCodexExec } from './core/commitMessage';
import { locate } from './core/locator';
import { DiffProvider } from './diff';
import { DROP_VIEW_IDS, DropTarget } from './dropTarget';
import { MentionSearch } from './mentions';
import { supportsSecondarySidebar } from './core/vscodeVersion';
import { CodexViewProvider, NO_SECONDARY_KEY, Prefs, VIEW_ID, VIEW_ID_SECONDARY } from './panel';
import { processProxyEnv, proxyConfig } from './proxy';
import { CodexSession, SessionHost } from './session';
import { fsPathOf, WorkspaceBridge } from './workspace';

let session: CodexSession | undefined;
/** workspaceState key: id of the chat that was open in this project. */
const LAST_THREAD_KEY = 'codexPanel.lastThread';

/**
 * Directory holding the managed Codex copy (<base>/codex/...): %LOCALAPPDATA%\CodexPanel, the same folder the Eclipse plugin uses,
 * because Codex is ~500 MB and both IDEs must not break each other. Falls back to the extension's global storage.
 */
function codexBase(ctx: vscode.ExtensionContext): string {
  const local = process.env.LOCALAPPDATA;
  if (local && local.trim()) {
    const shared = path.join(local, 'CodexPanel');
    try {
      fs.mkdirSync(shared, { recursive: true });
      return shared;
    } catch { /* fall back below */ }
  }
  fs.mkdirSync(ctx.globalStorageUri.fsPath, { recursive: true });
  return ctx.globalStorageUri.fsPath;
}

export function activate(ctx: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel('Codexter', { log: true });
  const log = (line: string) => {
    if (line.startsWith('[warn] ')) out.warn(line.substring(7));
    else if (line.startsWith('[error] ')) out.error(line.substring(8));
    else out.info(line);
  };
  const cfg = () => vscode.workspace.getConfiguration('codexPanel');
  const prefs = new Prefs(ctx.globalState);
  const ws = new WorkspaceBridge();
  // The chat that was open in this project (workspaceState is per folder / workspace), reopened once when the window starts.
  // Any chat change before that (New chat, a first message) wins over the remembered one.
  // 0.5.6: the chat of the checked-out git branch comes first (see branchChats.ts).
  let lastThreadTaken = false;
  let chatChanged = false;
  let branches: BranchChats | undefined;
  const takeLastThread = async (cwd: string): Promise<string | null> => {
    if (lastThreadTaken) return null;
    lastThreadTaken = true;
    if (!vscode.workspace.workspaceFolders?.length) return null;
    const byBranch = branches ? await branches.threadAtStartup(cwd) : null;
    if (chatChanged) return null; // the user opened or started a chat while git was loading
    return byBranch ?? ctx.workspaceState.get<string>(LAST_THREAD_KEY) ?? null;
  };

  const host: SessionHost = {
    codexBase: codexBase(ctx),
    version: String(ctx.extension.packageJSON.version ?? '0.0.0'),
    codexPath: () => cfg().get<string>('codexPath', '').trim(),
    managedEnabled: () => cfg().get<string>('codexSource', 'managed') !== 'own',
    updateDays: () => cfg().get<number>('updateIntervalDays', 7),
    permissionsPref: () => prefs.permissions(),
    imageDir: () => path.join(ctx.globalStorageUri.fsPath, 'images'),
    proxy: proxyConfig,
    processEnv: processProxyEnv,
    workspaceDir: () => ws.workspaceDir(),
    projectName: (d) => ws.projectName(d),
    openExternal: (url) => { void vscode.env.openExternal(vscode.Uri.parse(url, true)); },
    refreshHook: () => { /* VS Code watches the file system itself */ },
    log,
    checked: (when) => { void ctx.globalState.update('codexPanel.lastUpdateCheck', when.toISOString()); },
    threadChanged: (id) => {
      lastThreadTaken = true;
      chatChanged = true;
      void ctx.workspaceState.update(LAST_THREAD_KEY, id ?? undefined);
    },
    chatUsed: (threadId, cwd) => branches?.used(threadId, cwd),
    // AI search of the History panel: same fast model / effort as the commit messages, run outside any project (no AGENTS.md)
    ask: (prompt) => runCodexExec({ command: quick.locateCodex().command(), cwd: os.tmpdir(), env: quick.env(), prompt,
      model: quick.model(), effort: quick.effort(), mcpOff: quick.mcpOff(), timeoutMs: 120_000, log, tag: 'search' }),
  };
  // Settings and Codex of the quick one-off runs (commit message, AI search)
  const quick = {
    locateCodex: () => {
      try {
        return locate(host.codexPath(), host.codexBase, host.managedEnabled());
      } catch {
        throw new Error('Codex is not installed yet: open the Codexter chat once so it can download Codex.');
      }
    },
    env: (): NodeJS.ProcessEnv => ({ ...process.env, ...host.processEnv() }),
    // '' = the Codex default (config.toml); the setting's default is the fast GPT-6-Luna
    model: () => cfg().get<string>('commitMessageModel', DEFAULT_QUICK_MODEL).trim(),
    effort: () => cfg().get<string>('commitMessageEffort', 'low').trim(),
    mcpOff: () => mcpServerNames(readCodexConfig({ ...process.env, ...host.processEnv() })),
    log,
  };
  session = new CodexSession(host);
  const s = session;
  branches = new BranchChats(ctx.workspaceState, {
    openThread: () => s.threadId,
    isRunning: () => s.isRunning,
    open: (id) => s.resume(id, 'switch'),
    log,
  });
  void branches.start();
  ctx.subscriptions.push(branches);
  const mentions = new MentionSearch(ws, log);
  const diffs = new DiffProvider(log);

  // The view has two homes with the same logic: the secondary side bar (VS Code 1.106+, next to the other chats) and, before that, the
  // activity bar. package.json shows exactly one of them, switched by the context key below.
  const secondary = supportsSecondarySidebar(vscode.version);
  void vscode.commands.executeCommand('setContext', NO_SECONDARY_KEY, !secondary);
  const providers = [VIEW_ID, VIEW_ID_SECONDARY].map((id) => new CodexViewProvider(id, ctx, s, ws, mentions, diffs, prefs, log));
  let lastActive = providers[secondary ? 1 : 0];
  // "MCP servers > Add by name": the quick model with live web search finds the official setup (the user confirms it before it is written)
  const mcpFind = (prompt: string) => runCodexExec({ command: quick.locateCodex().command(), cwd: os.tmpdir(), env: quick.env(), prompt,
    model: quick.model(), effort: quick.effort(), mcpOff: quick.mcpOff(), timeoutMs: 240_000, log, tag: 'mcp', extraConfig: ['web_search="live"'] });
  providers.forEach((p) => { p.onActive = (x) => { lastActive = x; }; p.takeLastThread = takeLastThread; p.mcpFind = mcpFind; });
  /** The view in use: the visible one, else the one that was open last, else the home of this VS Code version. */
  const current = (): CodexViewProvider => providers.find((p) => p.isVisible) ?? (lastActive.isOpen ? lastActive : undefined) ?? providers.find((p) => p.isOpen) ?? providers[secondary ? 1 : 0];

  // remember editors from the start (feeds "recent files first" in the "@" popup)
  ws.rememberEditor(vscode.window.activeTextEditor);

  const showView = async (): Promise<CodexViewProvider> => {
    await providers[secondary ? 1 : 0].reveal();
    return current();
  };

  // Native drop target: workbench drags (editor tabs, VS Code Explorer) never reach the webview, but they reach a tree view.
  const drop = new DropTarget((found) => { void showView().then((p) => p.handleDrop(found)); }, log);

  ctx.subscriptions.push(
    out,
    drop,
    ...DROP_VIEW_IDS.map((id) => drop.createView(id)),
    mentions,
    diffs,
    ...providers,
    { dispose: () => s.dispose() },
    ...providers.map((p) => vscode.window.registerWebviewViewProvider(p.viewId, p, { webviewOptions: { retainContextWhenHidden: true } })),

    vscode.commands.registerCommand('codexPanel.open', showView),
    vscode.commands.registerCommand('codexPanel.generateCommitMessage', (arg?: unknown) => generateCommitMessage(quick, arg)),
    vscode.commands.registerCommand('codexPanel.newChat', async () => {
      (await showView()).newChat();
    }),
    vscode.commands.registerCommand('codexPanel.attachFiles', async () => {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFiles: true, canSelectFolders: false, openLabel: 'Attach' });
      const paths = (picked ?? []).filter((u) => u.scheme === 'file').map((u) => fsPathOf(u));
      if (paths.length > 0) (await showView()).addFiles(paths);
    }),
    vscode.commands.registerCommand('codexPanel.openSettings', async () => (await showView()).showSettings()),
    vscode.commands.registerCommand('codexPanel.checkUpdates', () =>
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Codex: checking for updates...' }, async () => {
        const msg = await s.checkCodexNow();
        if (msg.startsWith('Failed')) void vscode.window.showWarningMessage('Codex: ' + msg);
        else void vscode.window.showInformationMessage('Codex: ' + msg + '. ' + s.codexSummary());
      })),

    // Explorer: (clicked, all selected); editor title tab / editor body: (uri) or nothing -> the active editor's file
    vscode.commands.registerCommand('codexPanel.addToChat', async (clicked?: vscode.Uri, selected?: vscode.Uri[]) => {
      const uris = selected && selected.length > 0 ? selected : clicked instanceof vscode.Uri ? [clicked] : [];
      let paths = uris.filter((u) => u.scheme === 'file').map((u) => fsPathOf(u));
      if (paths.length === 0) {
        const p = ws.filePath(vscode.window.activeTextEditor);
        if (p) paths = [p];
      }
      if (paths.length === 0) return;
      (await showView()).addFiles(paths);
    }),
    ...(['ask', 'explain', 'fix'] as const).map((mode) =>
      vscode.commands.registerCommand(`codexPanel.${mode === 'ask' ? 'askSelection' : mode + 'Selection'}`, async () => {
        const ed = vscode.window.activeTextEditor;
        const file = ws.filePath(ed);
        if (!ed || !file || ed.selection.isEmpty) return;
        const sel = ed.selection;
        // a selection that ends at column 0 of a line does not include that line
        const endLine = (sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line - 1 : sel.end.line) + 1;
        (await showView()).addSelection(file, ed.document.getText(sel), sel.start.line + 1, endLine, mode);
      })),

    // changing the Codex source / path takes effect with a fresh app-server (Eclipse: after the preferences dialog)
    vscode.workspace.onDidChangeConfiguration((e) => {
      if ((e.affectsConfiguration('codexPanel.codexPath') || e.affectsConfiguration('codexPanel.codexSource')) && !s.isRunning) s.reconnect();
    }),
  );
  log('Codexter ' + host.version + ' activated, managed Codex folder: ' + host.codexBase);
}

export function deactivate(): void {
  session?.dispose();
  session = undefined;
}
