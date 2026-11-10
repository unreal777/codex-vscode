// The Codex chat view: a webview showing media/web (the same page as the Eclipse plugin), wired to the shared CodexSession.
// Port of CodexView.java. Host -> page: webview.postMessage(array of events) -> window.codexUi.receive (see media/vscode-bridge.js).
// Page -> host: window.__codexPost(JSON string) -> onDidReceiveMessage.
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveDropped } from './core/droppedPaths';
import { WEB_SCRIPTS } from './core/webScripts';
import { Json } from './core/jsonrpc';
import { migratePermissions, normalizePermissions } from './core/permissions';
import { DiffProvider } from './diff';
import { ChatActivity } from './chatActivity';
import { McpSettings } from './mcpSettings';
import { MentionSearch } from './mentions';
import { CodexSession, SendRequest } from './session';
import { normalizeDrive } from './core/winPath';
import { fsPathOf, isInside, WorkspaceBridge } from './workspace';

/** The same view lives in two places: the activity bar (VS Code before 1.106) and the secondary side bar (1.106 and later). One of them exists at a time. */
export const VIEW_ID = 'codexPanel.chat';
export const VIEW_ID_SECONDARY = 'codexPanel.chatSecondary';
export const NO_SECONDARY_KEY = 'codexPanel.noSecondarySidebar';
const FLUSH_MS = 50;

/** Model / effort / permissions live in globalState. The pre-0.2.0 keys mode + approvals are migrated into permissions when it was never set. */
export class Prefs {
  private static readonly DEFAULTS: Record<string, string> = { model: '', effort: '' };

  constructor(private readonly state: vscode.Memento) {}

  get(key: string): string {
    return this.state.get<string>('codexPanel.' + key) ?? Prefs.DEFAULTS[key] ?? '';
  }

  set(key: string, value: string): void {
    void this.state.update('codexPanel.' + key, value);
  }

  /** ask | auto | full | custom */
  permissions(): string {
    return migratePermissions({
      permissions: this.state.get<string>('codexPanel.permissions'),
      mode: this.state.get<string>('codexPanel.mode'),
      approvals: this.state.get<string>('codexPanel.approvals'),
    });
  }

  all(): Json {
    return { model: this.get('model'), effort: this.get('effort'), permissions: this.permissions() };
  }
}

export interface PanelSettings {
  defaultModel: string; defaultReasoningEffort: string; defaultPermissions: string; hiddenModels: string[]; fontSize: number;
  commitMessageModel: string; commitMessageEffort: string;
}
const SETTING_KEYS = ['defaultModel', 'defaultReasoningEffort', 'defaultPermissions', 'hiddenModels', 'fontSize', 'commitMessageModel', 'commitMessageEffort'];
const EFFORTS = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
/** '' = a new chat keeps the permissions used last */
const PERMISSIONS = ['', 'ask', 'auto', 'full', 'custom'];

/** Strings only, trimmed; the array deduped. Anything else becomes the default. */
export function sanitizeSettings(o: Json | null | undefined): PanelSettings {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const effort = s(o?.defaultReasoningEffort);
  const perms = s(o?.defaultPermissions);
  const hidden = Array.isArray(o?.hiddenModels) ? (o?.hiddenModels as unknown[]).map(s).filter((x) => x !== '') : [];
  return { defaultModel: s(o?.defaultModel), defaultReasoningEffort: EFFORTS.includes(effort) ? effort : '',
    defaultPermissions: PERMISSIONS.includes(perms) ? perms : '', hiddenModels: [...new Set(hidden)], fontSize: fontSizeOf(o?.fontSize),
    commitMessageModel: s(o?.commitMessageModel), commitMessageEffort: EFFORTS.includes(s(o?.commitMessageEffort)) ? s(o?.commitMessageEffort) : '' };
}

/** Font size of the panel in px: 0 = VS Code's own (UI) font size, else a whole number 8..32. */
export function fontSizeOf(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  return n === 0 ? 0 : Math.min(32, Math.max(8, n));
}

const str = (o: Json, k: string): string | null => (o && typeof o[k] === 'string' ? o[k] : null);
const intOf = (o: Json, k: string): number => (o && typeof o[k] === 'number' ? Math.trunc(o[k]) : 0);
const orEmpty = (s: string | null | undefined): string => s ?? '';

/** One attached file or folder of the page's composer. */

export class CodexViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private queue: Json[] = [];
  private flushTimer?: NodeJS.Timeout;
  private pageReady = false;
  private cwd: string | null = null;
  private readonly sink = (e: Json) => this.post(e);
  private readonly subs: vscode.Disposable[] = [];
  /** Set by the owner: told when this view became the one in use (resolved or visible). */
  onActive: (p: CodexViewProvider) => void = () => {};
  /** Set by the owner: the chat to reopen at startup (the branch's, else the project's last), handed out once per window (null afterwards). */
  takeLastThread: (cwd: string) => Promise<string | null> = async () => null;
  /** Set by the owner: the quick Codex run with web search of "MCP servers > Add by name". */
  mcpFind: (prompt: string) => Promise<string> = async () => { throw new Error('not available'); };
  private mcp: McpSettings | null = null;
  /** Set by the owner: unread marks, today's tabs, opening a chat at its last answer. */
  activity: ChatActivity | null = null;

  constructor(
    readonly viewId: string,
    private readonly ctx: vscode.ExtensionContext,
    private readonly session: CodexSession,
    private readonly ws: WorkspaceBridge,
    private readonly mentions: MentionSearch,
    private readonly diffs: DiffProvider,
    private readonly prefs: Prefs,
    private readonly log: (line: string) => void,
  ) {
    this.subs.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.post(this.themeEvent())),
      // the page keeps the input open while VS Code itself is in the background (Alt+Tab), see autoGrow in app.js
      vscode.window.onDidChangeWindowState((s) => this.post({ kind: 'windowFocus', focused: s.focused })),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (SETTING_KEYS.some((k) => e.affectsConfiguration('codexPanel.' + k))) this.post(this.settingsEvent());
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.post({ kind: 'openProjects', openProjects: this.ws.openProjects() })),
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        this.ws.rememberEditor(ed);
        // keep the last file when focus moves to a non-text editor; clear it only when no text editor is left open
        if (ed || vscode.window.visibleTextEditors.length === 0) this.postActiveFile(ed);
      }),
    );
    session.addSink(this.sink);
  }

  dispose(): void {
    this.session.removeSink(this.sink);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.subs.forEach((d) => d.dispose());
  }

  // ---- view lifecycle ----

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.pageReady = false;
    this.queue = []; // a fresh page gets the state through init + replay
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m) => {
      try {
        void this.handleMessage(typeof m === 'string' ? m : JSON.stringify(m));
      } catch (e) {
        this.log('[error] Codex UI message failed: ' + e);
      }
    });
    this.onActive(this);
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.onActive(this);
        this.post(this.themeEvent());
        this.post({ kind: 'focus' });
      }
    });
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
        this.pageReady = false;
      }
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const u = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', ...p)).toString();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`, // the page sets style attributes
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');
    const script = (p: string[]) => `<script nonce="${nonce}" src="${u(...p)}"></script>`;
    return `<!doctype html>
<html lang="en" class="vscode">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codex</title>
<link rel="stylesheet" href="${u('web', 'app.css')}">
<link rel="stylesheet" href="${u('vscode.css')}">
</head>
<body>
<div id="app"></div>
${script(['vscode-bridge.js'])}
${WEB_SCRIPTS.map((p) => script(['web', ...p.split('/')])).join('\n')}
</body>
</html>`;
  }

  /** True when the page exists and can take messages. */
  get isOpen(): boolean {
    return !!this.view;
  }

  get isVisible(): boolean {
    return !!this.view && this.view.visible;
  }

  // ---- host -> page ----

  private post(ev: Json): void {
    if (!this.view) return; // the other one of the two views is in use; a fresh page gets its state through init + replay
    this.queue.push(ev);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    this.flushTimer = undefined;
    if (!this.view || !this.pageReady) return;
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    void this.view.webview.postMessage(batch);
  }

  private themeEvent(): Json {
    const k = vscode.window.activeColorTheme.kind;
    // colours come from the --vscode-* variables (media/vscode.css); only light/dark has to be told
    return { kind: 'theme', theme: { dark: k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast } };
  }

  private settingsEvent(): Json {
    const c = vscode.workspace.getConfiguration('codexPanel');
    return { kind: 'settings', settings: sanitizeSettings(Object.fromEntries(SETTING_KEYS.map((k) => [k, c.get(k)]))) };
  }

  /** The page's settings dialog: only changed values are written, to the user settings. */
  private saveSettings(m: Json): void {
    const c = vscode.workspace.getConfiguration('codexPanel');
    const next = sanitizeSettings(m);
    const old = sanitizeSettings(Object.fromEntries(SETTING_KEYS.map((k) => [k, c.get(k)])));
    for (const k of SETTING_KEYS as (keyof PanelSettings)[]) {
      if (JSON.stringify(next[k]) !== JSON.stringify(old[k])) void c.update(k, next[k], vscode.ConfigurationTarget.Global);
    }
  }

  /** The view title gear: the page toggles its own settings view. */
  showSettings(): void {
    this.post({ kind: 'showSettings' });
  }

  private postActiveFile(ed: vscode.TextEditor | undefined): void {
    const p = this.ws.filePath(ed);
    const ev: Json = { kind: 'context', action: 'activeFile', item: null };
    if (p) {
      const item: Json = { path: p, startLine: 1 };
      const f = this.ws.folderAt(p);
      if (f) {
        item.project = f.name;
        item.projectPath = fsPathOf(f.uri);
      }
      ev.item = item;
    }
    this.post(ev);
  }

  private currentCwd(): string {
    return this.session.threadCwd ?? this.ws.resolveTarget().path;
  }

  private cwdEvent(): Json {
    return { kind: 'cwd', cwd: this.cwd, project: this.ws.projectName(this.cwd) };
  }

  private sendInit(): void {
    this.cwd = this.currentCwd();
    const init: Json = {
      kind: 'init',
      host: 'vscode',
      prefs: this.prefs.all(),
      theme: this.themeEvent().theme,
      cwd: this.cwd,
      project: this.ws.projectName(this.cwd),
      openProjects: this.ws.openProjects(), // preselects the History project filter
      historyQuery: this.session.historyQuery, // the History panel remembers its search and project selection
      historyCwds: this.session.historyCwds,
      historyManual: this.session.historyManual,
      settings: this.settingsEvent().settings,
    };
    this.post(init);
    this.session.replayStateTo(this.sink);
    this.session.connect();
    this.ws.rememberEditor(vscode.window.activeTextEditor);
    this.postActiveFile(vscode.window.activeTextEditor);
    if (this.session.threadId !== null) {
      if (!this.session.isRunning) void this.session.resume(this.session.threadId);
    } else {
      // first page of this window: reopen the branch's chat, else the one that was open when the project was closed
      void this.takeLastThread(this.cwd).then((last) => { if (last) void this.session.resume(last, 'restore'); });
    }
  }

  // ---- page -> host ----

  private async handleMessage(json: string): Promise<void> {
    const m = JSON.parse(json) as Json;
    const type = str(m, 'type');
    if (!type) return;
    switch (type) {
      case 'ready':
        this.pageReady = true;
        this.sendInit();
        break;
      case 'send':
        await this.onSend(m);
        break;
      case 'interrupt':
        this.session.interrupt();
        break;
      case 'newChat':
        this.newChat();
        break;
      case 'listThreads':
        this.onListThreads(m);
        break;
      case 'pasteRef': {
        const ref = this.pastedRef(orEmpty(str(m, 'text')));
        this.post({ kind: 'pasteRef', requestId: intOf(m, 'requestId'), ref });
        break;
      }
      case 'mcpList': case 'mcpToggle': case 'mcpRemove': case 'mcpTest': case 'mcpImport': case 'mcpFind':
        this.mcp ??= new McpSettings({
          appServer: () => this.session.appServer(), find: (p) => this.mcpFind(p),
          // globalStorage is <user folder>/globalStorage/<extension>: VS Code's mcp.json is in the user folder
          userDir: () => path.resolve(this.ctx.globalStorageUri.fsPath, '..', '..'),
          post: (e) => this.post(e), log: (l) => this.log(l),
        });
        this.mcp.handle(m);
        break;
      case 'aiSearch': {
        const cwds = Array.isArray(m.cwds) ? (m.cwds as unknown[]).filter((c): c is string => typeof c === 'string' && c !== '').map((c) => normalizeDrive(c)) : [];
        this.session.aiSearch(intOf(m, 'requestId'), orEmpty(str(m, 'query')), cwds, m.archived === true);
        break;
      }
      case 'mentionSearch':
        void this.mentions.searchAsync(this.currentCwd(), orEmpty(str(m, 'query')), intOf(m, 'requestId'), (e) => this.post(e));
        break;
      case 'dragEnter': // Eclipse needs this for its SWT drop overlay; here the page takes the drop itself (the types are only logged)
        this.log('[drop] dragenter, formats: ' + (Array.isArray(m.types) ? (m.types as unknown[]).join(', ') : '(none)'));
        break;
      case 'dropDebug':
        this.logDrop(m.info);
        break;
      case 'pickFiles':
        await this.pickFiles();
        break;
      case 'listPlugins':
        this.session.listPlugins(this.currentCwd());
        break;
      case 'goalSet':
        this.session.setGoal(orEmpty(str(m, 'objective')), this.currentCwd(), orEmpty(str(m, 'model')) || orEmpty(str(m, 'defaultModel')),
          str(m, 'permissions') ?? this.prefs.permissions());
        break;
      case 'goalClear':
        this.session.clearGoal();
        break;
      case 'dropText': // the page's own drop: uri-list or text (paths, one per line)
        this.handleDrop([orEmpty(str(m, 'text'))]);
        break;
      case 'resumeThread': {
        const id = str(m, 'threadId');
        if (id) void (this.activity ? this.activity.open(id) : this.session.resume(id));
        break;
      }
      case 'chatTitle':
        if (str(m, 'threadId') && str(m, 'title')) this.activity?.title(str(m, 'threadId') as string, str(m, 'title') as string);
        break;
      case 'tabClose':
        if (str(m, 'threadId')) this.activity?.closeTab(str(m, 'threadId') as string);
        break;
      case 'approval':
        this.session.approve(String(m.requestId), orEmpty(str(m, 'decision')));
        break;
      case 'openFile': {
        const err = await this.ws.openFile(str(m, 'path'), intOf(m, 'line'), intOf(m, 'column'), intOf(m, 'endLine'), this.session.threadCwd ?? this.cwd);
        if (err) this.toast(err);
        break;
      }
      case 'retryDownload':
        void this.session.checkCodexNow();
        break;
      case 'openDiff':
        await this.diffs.openFileDiff(orEmpty(str(m, 'path')), str(m, 'kind'), str(m, 'diff'));
        break;
      case 'openTurnDiff':
        await this.diffs.openTurnDiff(this.cwd ?? this.ws.resolveTarget().path, str(m, 'diff'));
        break;
      case 'openUrl': {
        const u = str(m, 'url');
        if (u && (u.startsWith('http://') || u.startsWith('https://'))) void vscode.env.openExternal(vscode.Uri.parse(u, true));
        break;
      }
      case 'openSettings':
        this.openSettings();
        break;
      case 'settingsSave':
        this.saveSettings(m);
        break;
      case 'threadAction': {
        const a = str(m, 'action'), id = str(m, 'threadId');
        if ((a === 'archive' || a === 'unarchive' || a === 'delete') && id) this.session.threadAction(a, id);
        break;
      }
      case 'retry':
        this.session.reconnect();
        break;
      case 'login':
        this.session.login();
        break;
      case 'loginCancel':
        this.session.cancelLogin();
        break;
      case 'sandboxSetup':
        this.session.sandboxSetup(str(m, 'mode'));
        break;
      case 'prefs':
        this.prefs.set('model', orEmpty(str(m, 'model')));
        this.prefs.set('effort', orEmpty(str(m, 'effort')));
        if (str(m, 'permissions') !== null) this.prefs.set('permissions', normalizePermissions(str(m, 'permissions')));
        break;
      default:
        break;
    }
  }

  openSettings(): void {
    void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:codexpanel.codex-panel');
  }

  /** New chat: the thread forgets its cwd, so the next one starts in the project of the active editor. */
  newChat(): void {
    this.session.newChat();
    this.cwd = this.ws.resolveTarget().path;
    this.post(this.cwdEvent());
  }

  private onListThreads(m: Json): void {
    // the page's project selection; an empty list means every project (the session expands each path to all known spellings)
    const cwds = Array.isArray(m.cwds) ? (m.cwds as unknown[]).filter((c): c is string => typeof c === 'string' && c !== '').map((c) => normalizeDrive(c)) : [];
    this.session.listThreads(intOf(m, 'requestId'), orEmpty(str(m, 'query')), cwds, m.manual === true, str(m, 'cursor'), m.projects === true, m.archived === true);
  }

  /** Debug aid for drops: what the webview received (formats and the start of each), written to the "Codexter" output channel. */
  private logDrop(info: unknown): void {
    const i = (info && typeof info === 'object' ? info : {}) as Json;
    const types: string[] = Array.isArray(i.types) ? i.types.map(String) : [];
    this.log('[drop] dataTransfer types (' + types.length + '): ' + (types.join(', ') || '(none)'));
    const data = (i.data && typeof i.data === 'object' ? i.data : {}) as Json;
    for (const t of types) {
      if (t in data) this.log('[drop]   ' + t + ' = ' + JSON.stringify(String(data[t]).slice(0, 300)));
    }
    const files: Json[] = Array.isArray(i.files) ? i.files : [];
    this.log('[drop] files (' + files.length + '): ' + files.map((f) => String(f.name) + ' [' + String(f.type || '?') + ', ' + String(f.size) + ' B]').join('; '));
  }

  /**
   * "+" > Files and folders. A native open dialog can not select files and folders at the same time on Windows and Linux (it falls back to
   * folders only), so there the kind is asked first; macOS allows both.
   */
  private async pickFiles(): Promise<void> {
    const base = this.currentCwd();
    let files = true, folders = true;
    if (process.platform !== 'darwin') {
      const pick = await vscode.window.showQuickPick(
        [{ label: '$(file) Files', files: true }, { label: '$(folder) Folders', files: false }],
        { placeHolder: 'Add to the Codexter chat', title: 'Files and folders' });
      if (!pick) return;
      files = pick.files;
      folders = !pick.files;
    }
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true, canSelectFiles: files, canSelectFolders: folders,
      defaultUri: vscode.Uri.file(base), openLabel: 'Add to chat', title: 'Add files and folders to the Codexter chat',
    });
    if (!uris || uris.length === 0) return;
    this.handleDrop(uris.filter((u) => u.scheme === 'file').map((u) => fsPathOf(u)));
  }

  toast(message: string): void {
    this.post({ kind: 'toast', message });
  }

  /**
   * The one entry point for every way a file reaches the chat from outside the page: a drop on the panel, the "Add to Codexter chat"
   * commands, a pasted path. Accepts strings with one path or file: URI per line. Folders become folder chips.
   */
  handleDrop(candidates: unknown[]): void {
    const items = resolveDropped(candidates, this.currentCwd());
    if (items.length === 0) {
      // plain text dropped on the panel (e.g. selected code from an editor) belongs into the input, not into the bin
      const text = candidates.filter((o): o is string => typeof o === 'string').join('\n');
      if (text.trim() !== '') this.post({ kind: 'insertText', text });
      else this.toast('Nothing to add: the dropped item is not a file or folder.');
      return;
    }
    const array = items.map((item) => {
      const p = normalizeDrive(item.path);
      const o: Json = { path: p, name: path.basename(p) || p, folder: item.folder };
      const owner = this.ws.folderAt(p);
      if (owner) {
        o.project = owner.name;
        o.projectPath = fsPathOf(owner.uri);
      }
      return o;
    });
    this.post({ kind: 'context', action: 'addPaths', items: array });
    this.post({ kind: 'focus' });
  }

  /** "Add to Codexter chat" from a menu: files and folders of the Explorer, or the file of the editor. */
  addFiles(paths: string[]): void {
    this.handleDrop(paths);
  }

  /** The editor selection the pasted text was copied from (active editor first, then the visible ones), as file + lines; null if none. */
  private pastedRef(text: string): Json | null {
    if (!text) return null;
    const eds = [vscode.window.activeTextEditor, ...vscode.window.visibleTextEditors].filter((e): e is vscode.TextEditor => !!e);
    for (const ed of eds) {
      const file = this.ws.filePath(ed);
      if (!file) continue;
      for (const sel of ed.selections) {
        if (sel.isEmpty || ed.document.getText(sel).trim() !== text) continue;
        return { path: file, rel: relative(file, this.session.threadCwd ?? this.cwd), startLine: sel.start.line + 1, endLine: sel.end.line + 1 };
      }
    }
    return null;
  }

  /** "Ask about selection": attach file + lines + text to the chat input. */
  addSelection(file: string, text: string, startLine: number, endLine: number, mode: string): void {
    this.post({ kind: 'context', action: 'add', item: { path: file, startLine, endLine, text } });
    const f: Json = { kind: 'focus' };
    if (mode === 'explain') f.text = 'Explain this code.';
    else if (mode === 'fix') f.text = 'Find and fix the problem in this code.';
    this.post(f);
  }

  private async onSend(m: Json): Promise<void> {
    // The thread keeps the cwd it started with, whatever editor is active now.
    let folder: vscode.WorkspaceFolder | undefined;
    if (this.session.threadId !== null && this.session.threadCwd !== null) {
      this.cwd = this.session.threadCwd;
      folder = this.ws.folderAt(this.cwd);
    } else {
      const t = this.ws.resolveTarget();
      this.cwd = t.path;
      folder = t.folder;
    }
    if (vscode.workspace.getConfiguration('codexPanel').get<boolean>('autosave', true)) await this.ws.saveDirty(folder);
    const cwd = this.cwd;
    let prompt = '';
    const referenced: string[] = [];
    const symbols: string[] = [];
    const mentions: { name: string; path: string }[] = [];
    if (Array.isArray(m.contexts)) {
      for (const c of m.contexts as Json[]) {
        if (c.kind === 'plugin') { // a plugin picked in the "+" menu: a mention input, not text
          const mp = str(c, 'path');
          if (mp && mp.startsWith('plugin://')) mentions.push({ name: orEmpty(str(c, 'name')) || mp.slice(9), path: mp });
          continue;
        }
        const p = relative(str(c, 'path'), cwd);
        if (c.kind === 'symbol') { // "#sym:name" pasted from an editor: the token stays in the text, its file and lines go here
          const tok = str(c, 'token'), a = intOf(c, 'startLine'), b = intOf(c, 'endLine');
          if (tok && /^#sym:\S+$/.test(tok) && p && a > 0) symbols.push(tok + ' = ' + p + ':' + a + (b > a ? '-' + b : ''));
          continue;
        }
        if (c.kind === 'selection') {
          prompt += 'Selected code in ' + p + ' (lines ' + c.startLine + '-' + c.endLine + '):\n```\n' + orEmpty(str(c, 'text')) + '\n```\n\n';
        } else if (c.kind === 'mention') { // "@" picks, drops and "Add to Codexter chat": by path only, like the active file
          referenced.push(p + (c.folder === true ? ' (folder)' : ''));
        } else {
          prompt += 'Active file: ' + p + '\n\n';
        }
      }
    }
    if (referenced.length > 0) {
      prompt += 'Referenced files (read them if needed):\n';
      for (const r of referenced) prompt += '- ' + r + '\n';
      prompt += '\n';
    }
    if (symbols.length > 0) {
      prompt += 'Referenced symbols (#sym:name = file:line):\n';
      for (const s of symbols) prompt += '- ' + s + '\n';
      prompt += '\n';
    }
    prompt += orEmpty(str(m, 'text'));
    const images = Array.isArray(m.images)
      ? (m.images as Json[]).filter((i) => typeof i.url === 'string' && /^data:image\/[a-z+.-]+;base64,/.test(i.url)).slice(0, 8).map((i) => ({ url: i.url as string, name: str(i, 'name') ?? undefined }))
      : [];
    const req: SendRequest = {
      text: prompt, cwd, model: orEmpty(str(m, 'model')), defaultModel: orEmpty(str(m, 'defaultModel')), effort: orEmpty(str(m, 'effort')),
      permissions: str(m, 'permissions') ?? this.prefs.permissions(), images, mentions, plan: typeof m.plan === 'boolean' ? m.plan : undefined,
    };
    this.session.send(req);
    this.post(this.cwdEvent());
  }

  /** Brings this view up (also from a collapsed side bar). */
  async reveal(): Promise<void> {
    await vscode.commands.executeCommand(this.viewId + '.focus');
  }
}

function relative(p: string | null, base: string | null): string {
  if (!p) return '';
  try {
    if (base && isInside(p, base)) return path.relative(base, p).replace(/\\/g, '/');
  } catch { /* fall through */ }
  return p;
}
