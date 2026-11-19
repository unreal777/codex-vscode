// Codexter (Codex Panel) for VS Code: entry point. Wires the session, the webview view, commands and the workspace glue.
import { DEFAULT_LANGUAGES } from './core/dictationLanguages';
import { sanitizeContextSettings, threadExtras } from './core/instructions';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { BranchChats } from './branchChats';
import { ChatActivity } from './chatActivity';
import { ImageEditor } from './imageEditor';
import { HtmlPreview } from './htmlPreview';
import { generateCommitMessage } from './commitMessage';
import { DEFAULT_QUICK_MODEL, mcpServerNames, readCodexConfig, runCodexExec } from './core/commitMessage';
import { micSupported, startWindowsRecorder } from './core/micRecorder';
import { locate } from './core/locator';
import { DiffProvider } from './diff';
import { DROP_VIEW_IDS, DropTarget } from './dropTarget';
import { MentionSearch } from './mentions';
import { supportsSecondarySidebar } from './core/vscodeVersion';
import { CodexViewProvider, NO_SECONDARY_KEY, Prefs, VIEW_ID, VIEW_ID_SECONDARY } from './panel';
import { processProxyEnv, proxyConfig } from './proxy';
import { ChatPlace, cwdForWorkspace, FsOps, repoIdOf } from './core/repoIdentity';
import { limitAlerts, LimitFired, LimitSnapshot } from './core/limits';
import { osNotify } from './core/osNotify';
import { CodexSession, SessionHost } from './session';
import { fsPathOf, WorkspaceBridge } from './workspace';

let session: CodexSession | undefined;
/** workspaceState key: id of the chat that was open in this project. */
const LAST_THREAD_KEY = 'codexPanel.lastThread';
/** globalState key: the 80% / 90% limit messages already shown (0.14.1), per window; cleared again when usage falls below a level. */
const LIMIT_KEY = 'codexPanel.limitAlerts';
/** globalState key: where each chat was (folder, branch) when its last message was sent; the newest PLACES_MAX (0.13.1). */
const PLACES_KEY = 'codexPanel.chatPlaces';
const PLACES_MAX = 2000;
/** The real file system for core/repoIdentity.ts */
const NODE_FS: FsOps = {
  isDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
  isFile: (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } },
  read: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
};
/** thread id -> the name the AI gave it (globalState, the newest AUTO_NAMES_MAX) */
const AUTO_NAMES_KEY = 'codexPanel.autoNames';
const AUTO_NAMES_MAX = 2000;
/** parent chat -> answer -> its Clarify side chats (globalState, see core/sideChats.ts) */
const SIDE_LINKS_KEY = 'codexPanel.sideChats';

/**
 * Directory holding the managed Codex copy (<base>/codex/...). Windows: %LOCALAPPDATA%\CodexPanel, the same folder the Eclipse
 * plugin uses, because Codex is ~500 MB and both IDEs must not break each other. macOS and Linux (no LOCALAPPDATA), or when that
 * folder can not be made: the extension's global storage.
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
  let activity: ChatActivity | undefined;
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
      activity?.opened(id);
    },
    chatUsed: (threadId, cwd) => { branches?.used(threadId, cwd); activity?.used(threadId); },
    chatsChanged: () => activity?.publish(),
    turnDone: (threadId, background, status) => activity?.turnDone(threadId, background, status),
    needsApproval: (threadId) => activity?.needsApproval(threadId),
    // AI search of the History panel: same fast model / effort as the commit messages, run outside any project (no AGENTS.md)
    ask: (prompt) => runCodexExec({ command: quick.locateCodex().command(), cwd: os.tmpdir(), env: quick.env(), prompt,
      model: quick.model(), effort: quick.effort(), mcpOff: quick.mcpOff(), timeoutMs: 120_000, log, tag: 'search' }),
    threadExtras: (forResume) => threadExtras(sanitizeContextSettings({ instructionsSource: cfg().get('instructionsSource'),
      instructions: cfg().get('instructions'), autoCompactTokens: cfg().get('autoCompactTokens') }), forResume),
    // AI chat names: the setting, and the names the AI gave (a chat renamed by hand is left alone)
    autoNameMode: () => cfg().get<string>('autoChatNames', 'auto'),
    autoNameOf: (id) => ctx.globalState.get<Record<string, string>>(AUTO_NAMES_KEY, {})[id],
    rememberAutoName: (id, name) => {
      const all = { ...ctx.globalState.get<Record<string, string>>(AUTO_NAMES_KEY, {}) };
      if (name === null && !(id in all)) return;
      delete all[id];   // re-added last: the oldest go first when the list is full
      if (name !== null) all[id] = name;
      const ids = Object.keys(all);
      for (const old of ids.slice(0, Math.max(0, ids.length - AUTO_NAMES_MAX))) delete all[old];
      void ctx.globalState.update(AUTO_NAMES_KEY, all);
    },
    renamed: (id, name) => activity?.title(id, name),
    // 0.13.0: a chat of another copy of an open repository (same remote) runs in this window's copy
    adjustCwd: (cwd) => {
      const folders = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file').map((f) => f.uri.fsPath);
      const to = cwdForWorkspace(cwd, folders, NODE_FS);
      if (to !== cwd) log('[cwd] chat of another copy of this repository: ' + cwd + ' -> ' + to);
      return to;
    },
    branchAt: (cwd) => branches?.branchAt(cwd) ?? null,
    // 0.14.1: 80% and 90% of a Codex limit window: one message per level (VS Code, or a system notification when VS Code is in the background)
    limitsChanged: (snap) => {
      const r = limitAlerts(snap as LimitSnapshot, ctx.globalState.get<LimitFired>(LIMIT_KEY, {}));
      void ctx.globalState.update(LIMIT_KEY, r.fired);
      for (const a of r.alerts) {
        log('[limit] ' + a.text);
        const msg = 'Codexter: ' + a.text;
        if (vscode.window.state.focused) { void vscode.window.showWarningMessage(msg); continue; }
        const link = vscode.env.uriScheme + '://' + ctx.extension.id + '/open';
        void osNotify('Codexter', a.text, link).then((err) => { if (err) void vscode.window.showWarningMessage(msg); });
      }
    },
    lastPlace: (id) => ctx.globalState.get<Record<string, ChatPlace>>(PLACES_KEY, {})[id],
    rememberPlace: (id, place) => {
      const all = { ...ctx.globalState.get<Record<string, ChatPlace>>(PLACES_KEY, {}) };
      const old = all[id];
      if (old && old.cwd === place.cwd && old.branch === place.branch) return;
      delete all[id];   // re-added last: the oldest go first when the list is full
      all[id] = { cwd: place.cwd, branch: place.branch };
      const ids = Object.keys(all);
      for (const k of ids.slice(0, Math.max(0, ids.length - PLACES_MAX))) delete all[k];
      void ctx.globalState.update(PLACES_KEY, all);
    },
    // Clarify side chats: which answers have which side chats (never written into the chats themselves)
    sideLinks: () => ctx.globalState.get<unknown>(SIDE_LINKS_KEY),
    saveSideLinks: (store) => { void ctx.globalState.update(SIDE_LINKS_KEY, store); },
    // dictation: the extension records the microphone (webviews may not); Windows only for now
    dictationLanguages: () => cfg().get<unknown>('dictationLanguages', DEFAULT_LANGUAGES),
    startRecorder: micSupported() ? (ev) => startWindowsRecorder(path.join(ctx.extensionPath, 'media', 'mic-win.ps1'), ev, log) : undefined,
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
  branches = new BranchChats(ctx.globalState, ctx.workspaceState, {
    openThread: () => s.threadId,
    isRunning: () => s.isRunning,
    open: (id) => s.resume(id, 'switch'),
    log,
  }, (root) => repoIdOf(root, NODE_FS)?.id ?? root);
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
  // unread marks, today's tabs, notifications of replies that finish while their chat is not open
  activity = new ChatActivity(ctx, s, () => showView(), log);
  const act = activity;
  const images = new ImageEditor(ctx.extensionUri);
  ctx.subscriptions.push(images);
  const previews = new HtmlPreview();
  ctx.subscriptions.push(previews);
  providers.forEach((p) => { p.onActive = (x) => { lastActive = x; }; p.takeLastThread = takeLastThread; p.mcpFind = mcpFind; p.activity = act; p.images = images; p.previews = previews; });
  act.publish();
  // a click on a system notification opens vscode://UnrealDeveloper.codex-panel/open?thread=<id>
  ctx.subscriptions.push(vscode.window.registerUriHandler({
    handleUri: (uri: vscode.Uri) => {
      if (uri.path !== '/open') return;
      const id = new URLSearchParams(uri.query).get('thread');
      if (id) void act.open(id, true);
    },
  }));
  /** The view in use: the visible one, else the one that was open last, else the home of this VS Code version. */
  const current = (): CodexViewProvider => providers.find((p) => p.isVisible) ?? (lastActive.isOpen ? lastActive : undefined) ?? providers.find((p) => p.isOpen) ?? providers[secondary ? 1 : 0];

  // remember editors from the start (feeds "recent files first" in the "@" popup)
  ws.rememberEditor(vscode.window.activeTextEditor);

  const showView = async (): Promise<CodexViewProvider> => {
    await providers[secondary ? 1 : 0].reveal();
    return current();
  };

  // codexPanel.openOnStartup: show Codexter in its side bar when VS Code starts (else VS Code shows the view used last there,
  // e.g. Copilot Chat); the keyboard goes back to the editor, like at any start
  if (cfg().get<boolean>('openOnStartup', false)) {
    void (async () => {
      try {
        await showView();
        if (vscode.window.activeTextEditor) await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      } catch (e) { log('[startup] open Codexter: ' + String(e)); }
    })();
  }

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
    vscode.commands.registerCommand('codexPanel.review', async () => (await showView()).startReview()),
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
