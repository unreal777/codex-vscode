// One Codex conversation service per VS Code window (port of CodexSession.java). Owns the app-server process, talks the
// protocol and publishes UI events ({"kind": ...}, see web/app.js) to the registered sinks.
// No vscode imports: everything host specific comes in through SessionHost.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from './core/appServer';
import { ProxyConfig } from './core/http';
import { Result } from './core/installer';
import { Json, RpcError } from './core/jsonrpc';
import { locate, Located, NotFoundError } from './core/locator';
import { permissionSettings, PermissionSettings } from './core/permissions';
import { mapPlugins } from './core/plugins';
import { cwdKey, expandCwds, isListable, str, threadMatches, threadTitle } from './core/threadRows';
import { normalizeDrive } from './core/winPath';
import { CodexUpdater, errorMessage } from './updater';

export interface SessionHost {
  /** %LOCALAPPDATA%\CodexPanel (shared with the Eclipse plugin) */
  codexBase: string;
  version: string;
  codexPath(): string;
  managedEnabled(): boolean;
  updateDays(): number;
  /** Stored permissions choice (ask | auto | full | custom); used when a chat is reopened. */
  permissionsPref(): string;
  /** Folder for pictures that must be handed to Codex as files (fallback when a data URL is refused). */
  imageDir(): string;
  proxy(): ProxyConfig;
  /** Extra environment for the codex process (proxy variables), merged over process.env. */
  processEnv(): NodeJS.ProcessEnv;
  /** Working directory of the app-server process itself. */
  workspaceDir(): string;
  projectName(dir: string | null | undefined): string;
  openExternal(url: string): void;
  /** A turn finished or files changed: let the IDE notice. */
  refreshHook(cwd: string | null): void;
  log(line: string): void;
  checked?(when: Date): void;
  /** The open chat changed: started, opened from the history (id) or New chat / archived / deleted (null). The host remembers it per project. */
  threadChanged?(id: string | null): void;
}

export type Sink = (event: Json) => void;

/** Thrown after the problem has already been shown to the user. */
class Reported extends Error {}

const FORWARD_PREFIXES = ['turn/', 'item/', 'thread/tokenUsage', 'thread/name', 'thread/goal', 'account/rateLimits', 'serverRequest/resolved', 'error', 'warning'];
const STICKY = new Set(['status', 'models', 'rateLimits', 'auth', 'sandbox', 'install', 'codexUpdated']);

const HISTORY_PAGE = 40;
const HISTORY_SCAN_PAGE = 100;
/** A search scans up to this many pages of 100 chats (4000) before it reports "more"; "Load more" continues. */
const HISTORY_MAX_SCAN_PAGES = 40;
/** A search page stops scanning as soon as it has this many matches. */
const HISTORY_WANTED = 30;
const SURVEY_MAX_PAGES = 50;
const SURVEY_MAX_AGE_MS = 60_000;

const withTimeout = <T>(p: Promise<T>, ms: number, what = 'request'): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what + ' timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

/** What the page sends with a message (see web/app.js "send"). */
export interface SendRequest {
  /** the prompt text, context lines already prepended */
  text: string;
  cwd: string;
  model: string;
  /** model Codex uses when `model` is empty (plan mode settings need a concrete one) */
  defaultModel: string;
  effort: string;
  permissions: string;
  /** pasted / dropped / sketched pictures: PNG data URLs */
  images: { url: string; name?: string }[];
  /** plugins picked in the "+" menu: {name, path: "plugin://<id>"} */
  mentions: { name: string; path: string }[];
  /** true: plan mode on, false: switch plan mode off again, undefined: leave it */
  plan?: boolean;
}

/** access mode -> [thread sandbox, turn sandbox policy type, approval policy] */
export function modeSettings(mode: string | null | undefined): [string, string, string] {
  switch (mode ?? '') {
    case 'read-only': return ['read-only', 'readOnly', 'on-request'];
    case 'full': return ['danger-full-access', 'dangerFullAccess', 'never'];
    default: return ['workspace-write', 'workspaceWrite', 'on-request'];
  }
}

/** ApprovalsReviewer value for a setting/UI string: anything but auto_review means the user decides. */
export function reviewer(approvals: string | null | undefined): string {
  return approvals === 'auto_review' ? 'auto_review' : 'user';
}

const ev = (kind: string): Json => ({ kind });
const describe = (t: unknown): string => (t instanceof RpcError ? t.message : String((t as Error)?.message ?? t));

export class CodexSession {
  private readonly sinks = new Set<Sink>();
  private readonly sticky = new Map<string, Json>();
  private readonly pendingApprovals = new Map<string, Json>();
  private readonly recentLog: string[] = [];
  private readonly updater: CodexUpdater;
  /** The Java session runs its work on one executor thread; here a promise chain keeps the same order. */
  private chain: Promise<unknown> = Promise.resolve();

  private latestHistoryRequest = 0;
  /** Search text and project selection of the History panel, kept for the whole window session (replayed when the view is re-created). */
  private _historyQuery = '';
  private _historyCwds: string[] = [];
  /** True once the user changed the project selection by hand (then the IDE's open projects no longer preselect it). */
  private _historyManual = false;
  /** Every spelling of a thread cwd seen so far (survey and listed rows); thread/list matches cwd exactly. */
  private readonly seenCwds = new Set<string>();
  private surveyInFlight: Promise<Json[]> | null = null;
  private stateDbOnlySupported = true;
  private projectSurvey: Json[] | null = null;
  private projectSurveyAt = 0;

  private client: AppServerClient | null = null;
  private connected = false;
  private connecting: Promise<AppServerClient> | null = null;
  private _threadId: string | null = null;
  private _threadCwd: string | null = null;
  private turnId: string | null = null;
  private needsResume = false;
  /** Version of the managed copy the running app-server was started from; null for other sources. */
  private runningVersion: string | null = null;
  private backgroundCheckScheduled = false;
  /** unknown | signedOut | waiting | signedIn */
  private authState = 'unknown';
  private loginId: string | null = null;
  private disposed = false;

  constructor(private readonly host: SessionHost) {
    this.updater = new CodexUpdater(host.codexBase, {
      managedEnabled: () => host.managedEnabled(),
      codexPath: () => host.codexPath(),
      updateDays: () => host.updateDays(),
      proxy: () => host.proxy(),
      warn: (l) => host.log('[warn] ' + l),
      checked: (d) => host.checked?.(d),
    }, (e) => this.emit(e), (r) => this.onCodexInstalled(r));
  }

  /** Runs fn after the previously queued work (send, resume, login, connect), never in parallel with it. */
  private submit<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  checkCodexNow(): Promise<string> {
    return this.updater.checkNow();
  }

  codexSummary(): string {
    return this.updater.summary();
  }

  private onCodexInstalled(r: Result): void {
    if (this.connected && r.version !== this.runningVersion && this.host.managedEnabled()) {
      const e = ev('codexUpdated');
      e.version = r.version;
      this.emit(e);
    }
  }

  // ---- sinks ----

  addSink(s: Sink): void {
    this.sinks.add(s);
  }

  removeSink(s: Sink): void {
    this.sinks.delete(s);
  }

  private emit(e: Json): void {
    if (STICKY.has(e.kind)) this.sticky.set(e.kind, e);
    for (const s of [...this.sinks]) {
      try { s(e); } catch (x) { this.host.log('[error] sink failed: ' + x); }
    }
  }

  /** Re-sends cached state to a view that just came up. */
  replayStateTo(s: Sink): void {
    for (const e of this.sticky.values()) s(e);
  }

  get threadId(): string | null { return this._threadId; }
  /** Working directory the current thread was started (or resumed) with; null before the first message. */
  get threadCwd(): string | null { return this._threadCwd; }
  get isRunning(): boolean { return this.turnId !== null; }
  get historyQuery(): string { return this._historyQuery; }
  get historyCwds(): string[] { return [...this._historyCwds]; }
  get historyManual(): boolean { return this._historyManual; }

  private status(state: string, message: string): void {
    this.emit({ kind: 'status', state, message });
  }

  private error(title: string, message: string, settings: boolean): void {
    const actions: Json[] = [];
    if (settings) actions.push({ label: 'Open settings', action: 'openSettings' });
    actions.push({ label: 'Retry', action: 'retry' });
    this.emit({ kind: 'error', title, message, actions });
  }

  // ---- connection ----

  /** Starts the app-server in the background if it is not running. */
  connect(): void {
    void this.submit(async () => {
      try {
        await this.connectBlocking();
      } catch { /* already reported to the UI */ }
    });
  }

  reconnect(): void {
    void this.submit(async () => {
      const old = this.client;
      this.client = null;
      this.connected = false;
      old?.close();
      try {
        await this.connectBlocking();
      } catch { /* already reported */ }
    });
  }

  /** One connect at a time; callers that arrive meanwhile share the result (Java: synchronized). */
  private connectBlocking(): Promise<AppServerClient> {
    if (this.connected && this.client && this.client.isAlive()) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;
    const p = this.doConnect().finally(() => { this.connecting = null; });
    this.connecting = p;
    return p;
  }

  private async doConnect(): Promise<AppServerClient> {
    this.status('connecting', 'Starting codex app-server...');
    try {
      const codex = await this.locateOrDownload();
      const env = { ...process.env, ...this.host.processEnv() };
      const c = new AppServerClient(codex.command(), this.host.workspaceDir(), (l) => this.log(l), env);
      c.setEventListener({
        onNotification: (method, params) => this.handleNotification(method, params),
        onClosed: (reason) => {
          if (this.client !== c) return;
          this.connected = false;
          this.needsResume = this._threadId !== null;
          this.turnId = null;
          this.pendingApprovals.clear();
          this.status('closed', 'Codex app-server stopped: ' + reason);
          this.error('Codex stopped', reason + this.lastLog(), false);
          this.emit(ev('idle'));
        },
      });
      for (const m of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval']) {
        c.onServerRequest(m, (req) => this.handleApprovalRequest(req));
      }
      this.client = c;
      await c.start();
      await withTimeout(c.initialize('codex-panel-vscode', 'Codexter for VS Code', this.host.version), 90_000, 'initialize');
      this.runningVersion = codex.version;
      this.connected = true;
      this.status('ready', 'Connected (' + codex.source + ')');
      this.loadModels(c);
      this.refreshRateLimits();
      this.refreshAccount(c);
      this.checkSandbox(c);
      if (!this.backgroundCheckScheduled && this.host.managedEnabled()) {
        this.backgroundCheckScheduled = true;
        this.updater.scheduleBackgroundCheck();
      }
      return c;
    } catch (e) {
      if (e instanceof Reported) {
        this.status('error', e.message);
        this.error('Could not download Codex', e.message +
          '\nCheck the proxy settings (VS Code setting "http.proxy"), or point the Codexter settings to your own codex.exe.', true);
      } else if (e instanceof NotFoundError) {
        this.status('error', 'codex not found');
        this.error('codex was not found', e.message + '\nSet the path to codex.exe in the Codexter settings.', true);
      } else {
        this.status('error', describe(e));
        this.error('Could not start Codex', describe(e) + this.lastLog(), true);
        this.client?.close();
        this.client = null;
      }
      throw e;
    }
  }

  /** explicit path > managed copy > npm/PATH; downloads the managed copy when that is the only way to get a codex. */
  private async locateOrDownload(): Promise<Located> {
    const override = this.host.codexPath();
    const managed = this.host.managedEnabled();
    try {
      return locate(override, this.host.codexBase, managed);
    } catch (nf) {
      if (!managed || !(nf instanceof NotFoundError)) throw nf;
      this.status('connecting', 'Downloading Codex...');
      try {
        await this.updater.run();
      } catch (e) {
        throw new Reported('Codex download failed: ' + errorMessage(e));
      }
      return locate(override, this.host.codexBase, true);
    }
  }

  private loadModels(c: AppServerClient): void {
    c.listModels().then((r) => {
      this.emit({ kind: 'models', data: r.data ?? [] });
    }, () => { /* models stay as they were */ });
  }

  refreshRateLimits(): void {
    const c = this.client;
    if (!c || !this.connected) return;
    c.readRateLimits().then((r) => this.emit({ kind: 'rateLimits', data: r }), () => { /* optional */ });
  }

  // ---- sign-in and Windows sandbox ----

  private auth(state: string, error: string | null, account: Json | null, url: string | null): void {
    this.authState = state;
    const e: Json = { kind: 'auth', state };
    if (error) e.error = error;
    if (account) e.account = account;
    if (url) e.url = url;
    this.emit(e);
  }

  /** account/read: signed in, signed out (card with the sign-in button) or no OpenAI auth needed. */
  private refreshAccount(c: AppServerClient): void {
    c.call('account/read', {}).then((r) => {
      const hasAccount = r.account !== null && typeof r.account === 'object';
      const needsAuth = r.requiresOpenaiAuth === true;
      if (hasAccount || !needsAuth) {
        const wasOut = this.authState !== 'signedIn' && this.authState !== 'unknown';
        this.auth('signedIn', null, hasAccount ? r.account : null, null);
        if (wasOut) { // models and limits can differ once signed in
          this.loadModels(c);
          this.refreshRateLimits();
        }
      } else {
        this.auth('signedOut', null, null, null);
      }
    }, (t) => this.log('account/read failed: ' + t));
  }

  /** "Sign in with ChatGPT": account/login/start, open the browser, then wait for account/login/completed. */
  login(): void {
    void this.submit(async () => {
      try {
        const c = await this.connectBlocking();
        const r = await withTimeout(c.call('account/login/start', { type: 'chatgpt' }), 60_000, 'sign-in');
        const url = str(r, 'authUrl');
        this.loginId = str(r, 'loginId');
        if (!url || !url.startsWith('https://')) throw new Error('Codex did not return a sign-in URL');
        this.auth('waiting', null, null, url);
        this.host.openExternal(url);
      } catch (e) {
        this.auth('signedOut', 'Could not start the sign-in: ' + describe(e), null, null);
      }
    });
  }

  cancelLogin(): void {
    const id = this.loginId;
    this.auth('signedOut', null, null, null);
    if (this.client && id) this.client.call('account/login/cancel', { loginId: id }).catch(() => undefined);
    this.loginId = null;
  }

  private sandbox(state: string, error: string | null, mode: string | null): void {
    const e: Json = { kind: 'sandbox', state };
    if (error) e.error = error;
    if (mode) e.mode = mode;
    this.emit(e);
  }

  /** windowsSandbox/readiness: anything but "ready" shows the one-time setup card. */
  private checkSandbox(c: AppServerClient): void {
    if (process.platform !== 'win32') return;
    c.call('windowsSandbox/readiness').then((r) => {
      this.sandbox(str(r, 'status') === 'ready' ? 'ready' : 'needed', null, null);
    }, (t) => this.log('windowsSandbox/readiness failed: ' + t));
  }

  /** @param mode elevated (asks for admin rights once) | unelevated */
  sandboxSetup(mode: string | null): void {
    const c = this.client;
    if (!c) return;
    const m = mode === 'unelevated' ? 'unelevated' : 'elevated';
    this.sandbox('running', null, m);
    c.call('windowsSandbox/setupStart', { mode: m, cwd: this.host.workspaceDir() }).catch((t) => this.sandbox('failed', describe(t), m));
  }

  private log(line: string): void {
    this.recentLog.push(line);
    while (this.recentLog.length > 40) this.recentLog.shift();
    this.host.log(line);
  }

  private lastLog(): string {
    let sb = '';
    for (const l of this.recentLog) {
      if (l.includes('ERROR') || l.toLowerCase().includes('panic')) sb += '\n' + (l.length > 300 ? l.substring(0, 300) : l);
    }
    return sb.length > 1200 ? sb.substring(0, 1200) : sb;
  }

  // ---- notifications and approvals ----

  private handleAccountNotification(method: string, params: Json): void {
    const c = this.client;
    if (method === 'account/login/completed') {
      if (params.success === true) {
        this.loginId = null;
        if (c) this.refreshAccount(c);
      } else if (this.authState === 'waiting') { // after a user cancel the state is already signedOut
        this.loginId = null;
        this.auth('signedOut', str(params, 'error') ?? 'Sign-in was not completed', null, null);
      }
    } else if (method === 'account/updated' && c) {
      this.refreshAccount(c);
    } else if (method === 'windowsSandbox/setupCompleted') {
      if (params.success === true) {
        this.sandbox('ready', null, null);
        if (c) this.checkSandbox(c);
      } else {
        this.sandbox('failed', str(params, 'error') ?? 'Setup did not complete', str(params, 'mode'));
      }
    }
  }

  private handleNotification(method: string, params: Json): void {
    if (method.startsWith('account/login/') || method === 'account/updated' || method.startsWith('windowsSandbox/')) {
      this.handleAccountNotification(method, params);
      return;
    }
    const tid = typeof params.threadId === 'string' ? params.threadId : null;
    if (tid !== null && this._threadId !== null && tid !== this._threadId) return;
    if (method === 'turn/started') {
      this.turnId = params.turn?.id ?? null;
    } else if (method === 'turn/completed') {
      this.turnId = null;
      this.host.refreshHook(this._threadCwd);
    } else if (method === 'item/completed') {
      if (params.item && params.item.type === 'fileChange') this.host.refreshHook(this._threadCwd);
    }
    if (!FORWARD_PREFIXES.some((p) => method.startsWith(p))) return;
    this.emit({ kind: 'notification', method, params });
  }

  private handleApprovalRequest(req: Json): void {
    this.pendingApprovals.set(String(req.id), req);
    this.emit({ kind: 'serverRequest', id: req.id, method: req.method, params: req.params });
  }

  /** @param decision accept | acceptForSession | decline */
  approve(requestId: string, decision: string): void {
    const req = this.pendingApprovals.get(String(requestId));
    this.pendingApprovals.delete(String(requestId));
    const c = this.client;
    if (!req || !c) return;
    if (req.method === 'item/permissions/requestApproval') {
      const granted: Json = {};
      if (decision !== 'decline') {
        const asked = req.params?.permissions;
        if (asked && typeof asked === 'object') for (const [k, v] of Object.entries(asked)) if (v !== null) granted[k] = v;
      }
      c.respond(req.id, { permissions: granted, scope: decision === 'acceptForSession' ? 'session' : 'turn' });
    } else {
      c.respondDecision(req.id, decision);
    }
  }

  // ---- conversation ----

  /** Starts the thread if there is none (first message, goal) or resumes it after a restart of the app-server. */
  private async ensureThread(c: AppServerClient, cwd: string, model: string, ps: PermissionSettings): Promise<string> {
    if (this._threadId === null) {
      const r = await withTimeout(c.startThread(cwd, model, ps.approvalPolicy, ps.sandbox, ps.reviewer), 60_000, 'thread/start');
      this._threadCwd = cwd;
      this._threadId = r.thread.id;
      this.host.threadChanged?.(this._threadId);
      this.emit(this.threadEvent(r.thread, null, true));
    } else if (this.needsResume) {
      await withTimeout(c.resumeThread(this._threadId, this._threadCwd, ps.approvalPolicy, ps.sandbox, ps.reviewer), 60_000, 'thread/resume');
      this.needsResume = false;
    }
    return this._threadId as string;
  }

  /** The turn's UserInput: text, plugin mentions, pictures (data URLs, or files when localImages is given). */
  static buildInput(req: SendRequest, localImages: string[] | null = null): Json[] {
    const input: Json[] = [];
    if (req.text.trim() !== '' || (req.images.length === 0 && req.mentions.length === 0)) input.push(AppServerClient.textInput(req.text));
    for (const m of req.mentions) input.push(AppServerClient.mentionInput(m.name, m.path));
    if (localImages) for (const f of localImages) input.push(AppServerClient.localImageInput(f));
    else for (const i of req.images) input.push(AppServerClient.imageInput(i.url));
    return input;
  }

  /** Writes the pictures to the image folder (PNG); old files of earlier sessions are removed. */
  private writeImages(images: { url: string }[]): string[] {
    const dir = this.host.imageDir();
    fs.mkdirSync(dir, { recursive: true });
    const week = Date.now() - 7 * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(dir)) {
      try { const full = path.join(dir, f); if (f.startsWith('img-') && fs.statSync(full).mtimeMs < week) fs.unlinkSync(full); } catch { /* best effort */ }
    }
    const files: string[] = [];
    images.forEach((img, i) => {
      const m = /^data:image\/[a-z+.-]+;base64,(.*)$/s.exec(img.url);
      if (!m) return;
      const f = path.join(dir, 'img-' + Date.now() + '-' + i + '.png');
      fs.writeFileSync(f, Buffer.from(m[1], 'base64'));
      files.push(f);
    });
    return files;
  }

  /**
   * Sends a user message; creates/resumes the thread as needed. Runs in the background.
   * The thread's cwd is fixed when the thread starts: cwd only matters for the first message.
   * Permissions: see core/permissions.ts; "custom" sends no sandbox / approval override at all.
   */
  send(req: SendRequest): void {
    const cwd = normalizeDrive(req.cwd);
    void this.submit(async () => {
      try {
        const c = await this.connectBlocking();
        const ps = permissionSettings(req.permissions);
        const threadId = await this.ensureThread(c, cwd, req.model, ps);
        let collaboration: Json | null = null;
        if (req.plan !== undefined) {
          const model = req.model || req.defaultModel;
          if (model) collaboration = AppServerClient.collaborationMode(req.plan ? 'plan' : 'default', model, req.effort);
          else if (req.plan) this.emit({ kind: 'toast', message: 'Plan mode needs a model: pick one in the model list.' });
        }
        const start = (input: Json[]) => withTimeout(
          c.startTurn(threadId, input, this._threadCwd, req.model, req.effort, ps.approvalPolicy, ps.sandboxPolicy, ps.reviewer, collaboration), 60_000, 'turn/start');
        let r: Json;
        try {
          r = await start(CodexSession.buildInput(req));
        } catch (e) {
          // a data URL the server refuses: hand the pictures over as files instead
          if (req.images.length > 0 && e instanceof RpcError && /image|url|data/i.test(e.message)) {
            this.log('turn/start refused the image data URL (' + e.message + '), retrying with files');
            r = await start(CodexSession.buildInput(req, this.writeImages(req.images)));
          } else {
            throw e;
          }
        }
        if (r.turn && r.turn.id) this.turnId = r.turn.id;
      } catch (e) {
        if (!(e instanceof NotFoundError) && !(e instanceof Reported) && this.connected) this.error('Could not send the message', describe(e), false);
        this.emit(ev('idle'));
      }
    });
  }

  /** "Goal" of the "+" menu: thread/goal/set (the thread is started first when there is none). Answers with a "goal" event. */
  setGoal(objective: string, cwd: string, model: string, permissions: string): void {
    const text = objective.trim();
    if (!text) return;
    void this.submit(async () => {
      try {
        const c = await this.connectBlocking();
        const threadId = await this.ensureThread(c, normalizeDrive(cwd), model, permissionSettings(permissions));
        const r = await withTimeout(c.setGoal(threadId, text), 30_000, 'thread/goal/set');
        this.emit({ kind: 'goal', goal: r.goal ?? null });
      } catch (e) {
        this.emit({ kind: 'toast', message: 'Could not set the goal: ' + describe(e) });
      }
    });
  }

  clearGoal(): void {
    const t = this._threadId;
    if (t === null) return;
    void this.submit(async () => {
      try {
        const c = await this.connectBlocking();
        await withTimeout(c.clearGoal(t), 30_000, 'thread/goal/clear');
        this.emit({ kind: 'goal', goal: null });
      } catch (e) {
        this.emit({ kind: 'toast', message: 'Could not clear the goal: ' + describe(e) });
      }
    });
  }

  /** Installed, enabled plugins for the "+" menu: a "plugins" event {items} or {items: [], error}. */
  listPlugins(cwd: string): void {
    void (async () => {
      try {
        const c = await this.connectBlocking();
        const r = await withTimeout(c.listInstalledPlugins(cwd ? [normalizeDrive(cwd)] : null), 30_000, 'plugin/installed');
        this.emit({ kind: 'plugins', items: mapPlugins(r) });
      } catch (e) {
        this.emit({ kind: 'plugins', items: [], error: describe(e) });
      }
    })();
  }

  /** "thread" UI event carrying the thread's own cwd and its project name. */
  private threadEvent(thread: Json, turns: Json[] | null, created: boolean): Json {
    const e = ev('thread');
    if (created) e.created = true;
    e.thread = thread;
    if (turns) e.turns = turns;
    if (this._threadCwd) {
      e.cwd = this._threadCwd;
      e.project = this.host.projectName(this._threadCwd);
    }
    return e;
  }

  interrupt(): void {
    const c = this.client;
    const t = this._threadId;
    const u = this.turnId;
    if (c && t && u) c.interruptTurn(t, u).catch(() => undefined);
  }

  /** True when current.json points to a managed Codex other than the one the running app-server was started from. */
  private codexUpdatePending(): boolean {
    try {
      const l = locate(this.host.codexPath(), this.host.codexBase, this.host.managedEnabled());
      return l.version !== null && l.version !== this.runningVersion;
    } catch {
      return false;
    }
  }

  newChat(): void {
    const idle = this.turnId === null;
    this.interrupt();
    this._threadId = null;
    this.turnId = null;
    this._threadCwd = null;
    this.needsResume = false;
    this.pendingApprovals.clear();
    this.host.threadChanged?.(null);
    this.emit(ev('newChat'));
    if (idle && this.connected && this.codexUpdatePending()) { // a newer Codex is on disk and no turn is running: switch now
      this.emit(ev('codexUpdated'));
      this.reconnect();
    }
  }

  // ---- history (all projects, search, paging) ----

  /**
   * Lists chats of ALL projects (or one project), newest first, one page per call; cursor continues a previous page.
   * Without a query a page is one server page. With a query the server pages are scanned until enough chats match, because
   * the server's searchTerm is case-sensitive and cannot see project names.
   * Answers with a "threads" event carrying requestId; the panel ignores answers to older requests.
   *
   * @param cwds     the panel's project selection (empty = every project); remembered here. The server matches cwd exactly, so each
   *                 path is expanded to every known spelling of the same folder first.
   * @param manual   the selection was changed by hand (remembered, replayed with init)
   * @param projects also (re)send the list of projects that occur in the history
   */
  listThreads(requestId: number, query: string, cwds: string[], manual: boolean, cursor: string | null, projects: boolean, archived = false): void {
    this.latestHistoryRequest = requestId;
    this._historyQuery = query ?? '';
    this._historyCwds = cwds.filter((p) => typeof p === 'string' && p !== '').map((p) => normalizeDrive(p));
    this._historyManual = manual;
    const selected = this._historyCwds;
    void (async () => {
      try {
        const c = await this.connectBlocking();
        if (projects) void this.surveyProjects(c);
        if (selected.length > 0 && this.projectSurvey === null) {
          try { await this.loadSurvey(c); } catch (e) { this.log('project survey failed: ' + e); } // spellings are then learned from the rows only
        }
        if (requestId !== this.latestHistoryRequest) return;
        const cwdFilter = selected.length > 0 ? expandCwds(selected, this.seenCwds) : null;
        const q = this._historyQuery;
        const scanning = q.trim() !== '';
        const pageSize = scanning ? HISTORY_SCAN_PAGE : HISTORY_PAGE;
        const projectByCwd = new Map<string, string>();
        const rows: Json[] = [];
        let next: string | null = cursor;
        let pages = 0;
        do {
          if (requestId !== this.latestHistoryRequest) return; // superseded by a newer keystroke
          const page = await this.fetchThreadPage(c, cwdFilter, next, pageSize, archived);
          pages++;
          for (const thread of page.data ?? []) {
            if (!isListable(thread)) continue;
            const cwd = str(thread, 'cwd');
            if (cwd) this.seenCwds.add(cwd);
            const key = cwdKey(cwd);
            let project = projectByCwd.get(key);
            if (project === undefined) {
              project = this.host.projectName(cwd);
              projectByCwd.set(key, project);
            }
            const title = threadTitle(str(thread, 'name'), str(thread, 'preview'));
            if (threadMatches(q, title, project)) rows.push({ id: thread.id, title, updatedAt: thread.updatedAt ?? null, cwd, project });
          }
          next = str(page, 'nextCursor');
        } while (next !== null && rows.length < HISTORY_WANTED && pages < HISTORY_MAX_SCAN_PAGES);
        const e: Json = { kind: 'threads', requestId, append: cursor !== null, data: rows };
        if (next !== null) e.nextCursor = next;
        this.emit(e);
      } catch (ex) {
        this.emit({ kind: 'threads', requestId, append: cursor !== null, data: [], error: describe(ex) });
      }
    })();
  }

  /** Archive / unarchive / delete a chat of the history. Answers with a "threadAction" event; the open chat is forgotten when it was the target. */
  threadAction(action: string, threadId: string): void {
    void (async () => {
      let error: string | undefined;
      try {
        const c = await this.connectBlocking();
        if (action === 'archive') await withTimeout(c.archiveThread(threadId), 30_000, 'thread/archive');
        else if (action === 'unarchive') await withTimeout(c.unarchiveThread(threadId), 30_000, 'thread/unarchive');
        else if (action === 'delete') await withTimeout(c.deleteThread(threadId), 30_000, 'thread/delete');
        else throw new Error('unknown action ' + action);
      } catch (e) {
        error = describe(e);
      }
      const e: Json = { kind: 'threadAction', action, threadId, ok: error === undefined };
      if (error !== undefined) e.error = error;
      this.emit(e);
      if (error !== undefined) return;
      this.projectSurvey = null;
      if (action !== 'unarchive' && this._threadId === threadId) this.newChat();
      try { await this.surveyProjects(await this.connectBlocking()); } catch { /* the filter keeps its list */ }
    })();
  }

  /** One server page; falls back to the slow scan-and-repair listing if this Codex does not know useStateDbOnly. */
  private async fetchThreadPage(c: AppServerClient, cwd: string[] | null, cursor: string | null, pageSize: number, archived = false): Promise<Json> {
    if (this.stateDbOnlySupported) {
      try {
        return await withTimeout(c.listThreads(cwd, cursor, pageSize, true, archived), 30_000, 'thread/list');
      } catch (e) {
        if (!(e instanceof RpcError)) throw e;
        this.stateDbOnlySupported = false;
        this.log('thread/list with useStateDbOnly failed, using the default listing: ' + e.message);
      }
    }
    return withTimeout(c.listThreads(cwd, cursor, pageSize, false, archived), 60_000, 'thread/list');
  }

  /** Distinct projects of the whole history (newest first) for the project filter; cached for a minute. Also learns every cwd spelling. */
  private loadSurvey(c: AppServerClient): Promise<Json[]> {
    const cached = this.projectSurvey;
    if (cached && Date.now() - this.projectSurveyAt <= SURVEY_MAX_AGE_MS) return Promise.resolve(cached);
    if (this.surveyInFlight) return this.surveyInFlight;
    const run = (async () => {
      const byCwd = new Map<string, Json>();
      let next: string | null = null;
      let pages = 0;
      do {
        const page = await this.fetchThreadPage(c, null, next, HISTORY_SCAN_PAGE);
        pages++;
        for (const thread of page.data ?? []) {
          const raw = str(thread, 'cwd');
          if (raw) this.seenCwds.add(raw);
          if (!isListable(thread)) continue;
          const cwd = raw;
          let entry = byCwd.get(cwdKey(cwd));
          if (!entry) {
            entry = { cwd, project: this.host.projectName(cwd), count: 0, updatedAt: thread.updatedAt ?? null };
            byCwd.set(cwdKey(cwd), entry);
          }
          entry.count++;
        }
        next = str(page, 'nextCursor');
      } while (next !== null && pages < SURVEY_MAX_PAGES);
      const result = [...byCwd.values()];
      this.projectSurvey = result;
      this.projectSurveyAt = Date.now();
      return result;
    })();
    this.surveyInFlight = run;
    const clear = () => { if (this.surveyInFlight === run) this.surveyInFlight = null; };
    run.then(clear, clear);
    return run;
  }

  private async surveyProjects(c: AppServerClient): Promise<void> {
    try {
      this.emit({ kind: 'historyProjects', data: await this.loadSurvey(c) });
    } catch (e) {
      this.log('project survey failed: ' + e); // the filter then lists the projects of the loaded pages only
    }
  }

  /** Opens a chat. quiet: reopening the project's last chat at startup; on failure (deleted elsewhere, ...) it only logs and forgets
   *  the id, and it does nothing if another chat was opened or started in the meantime. */
  resume(id: string, quiet = false): Promise<void> {
    return this.submit(async () => {
      if (quiet && this._threadId !== null) return;
      try {
        const c = await this.connectBlocking();
        if (this.turnId !== null) this.interrupt();
        const r = await withTimeout(c.resumeThread(id, null, null, null, permissionSettings(this.host.permissionsPref()).reviewer), 60_000, 'thread/resume');
        const thread = r.thread;
        let turns: Json[] = Array.isArray(thread?.turns) ? thread.turns : [];
        if (turns.length === 0) {
          const rr = await withTimeout(c.call('thread/read', { threadId: id, includeTurns: true }), 60_000, 'thread/read');
          if (Array.isArray(rr.thread?.turns)) turns = rr.thread.turns;
        }
        this._threadId = id;
        this._threadCwd = typeof r.cwd === 'string' ? r.cwd : null;
        this.needsResume = false;
        this.turnId = null;
        this.host.threadChanged?.(id);
        const e = this.threadEvent(thread, turns, false);
        try { // the chat's goal, if it has one (best effort: older Codex versions may not know goals)
          const g = await withTimeout(c.getGoal(id), 10_000, 'thread/goal/get');
          if (g.goal) e.goal = g.goal;
        } catch { /* no goal info */ }
        this.emit(e);
      } catch (e) {
        if (!quiet) {
          this.error('Could not open the chat', describe(e), false);
        } else {
          this.log('[warn] could not reopen the last chat ' + id + ': ' + describe(e));
          this.host.threadChanged?.(null);
        }
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    const c = this.client;
    this.client = null;
    this.connected = false;
    this.updater.dispose();
    this.sinks.clear();
    c?.close();
  }

  get isDisposed(): boolean { return this.disposed; }
}
