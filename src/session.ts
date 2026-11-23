// One Codex conversation service per VS Code window (port of CodexSession.java). Owns the app-server process, talks the
// protocol and publishes UI events ({"kind": ...}, see web/app.js) to the registered sinks.
// No vscode imports: everything host specific comes in through SessionHost.
import { dictationPrompt, DictationLanguages, isForeign, parseLanguages } from './core/dictationLanguages';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AppServerClient } from './core/appServer';
import { ChatPlace, moveNote } from './core/repoIdentity';
import { ProxyConfig } from './core/http';
import { Result } from './core/installer';
import { Json, RpcError } from './core/jsonrpc';
import { locate, Located, NotFoundError } from './core/locator';
import { permissionSettings, PermissionSettings } from './core/permissions';
import { mapPlugins } from './core/plugins';
import { AI_MAX_CHATS, buildSearchPrompt, parseSearchAnswer } from './core/aiSearch';
import { ELICITATION_METHOD, elicitationResponse } from './core/elicitation';
import { autoNameMode, buildTitlePrompt, ChatMessage, cleanTitle, shouldAutoName, transcriptOf } from './core/chatTitle';
import { MIC_RATE, pcmLevel, Recorder, RecorderEvents } from './core/micRecorder';
import { lastTokenUsage } from './core/rollout';
import { addSide, findSide, forgetChat, isSideRow, linksOf, normalizeStore, sideIds, SideStore, sideQuestion, sideTitle, sideTurns } from './core/sideChats';
import { cwdKey, expandCwds, isListable, str, threadMatches, threadPreview, threadTitle } from './core/threadRows';
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
  /** A message was sent in this chat (turn/start accepted); cwd is the chat's folder. Remembers it for the checked-out git branch. */
  chatUsed?(threadId: string, cwd: string): void;
  /** The running chats changed (a reply started or ended, a chat went to or came back from the background). */
  chatsChanged?(): void;
  /** A reply ended; background: the chat was not open. status: completed | interrupted | failed. */
  turnDone?(threadId: string, background: boolean, status: string): void;
  /** A chat running in the background asks for an approval. */
  needsApproval?(threadId: string): void;
  /** One question to a temporary read-only `codex exec` run (fast model of the settings); resolves with the answer. Used by the AI search. */
  ask?(prompt: string): Promise<string>;
  /** Extra params of thread/start (instructions of Codexter, auto-compact limit) or thread/resume (forResume: the limit only). */
  threadExtras?(forResume: boolean): Json;
  /** codexPanel.autoChatNames: off | first | auto */
  autoNameMode?(): string;
  /** The name the AI gave this chat last (a chat whose name differs was named by hand and is left alone). */
  autoNameOf?(threadId: string): string | undefined;
  /** Remembers the AI's name of a chat; null: named by hand. */
  rememberAutoName?(threadId: string, name: string | null): void;
  /** A chat got a new name (its tab). */
  renamed?(threadId: string, name: string): void;
  /** 0.13.0: the folder an opened chat runs in (a chat of another copy of the same repository runs in this window's copy) */
  adjustCwd?(cwd: string): string;
  /** 0.14.1: a new rate limit snapshot of the account (for the 80% / 90% alerts) */
  limitsChanged?(snap: Json): void;
  /** 0.13.1: the git branch checked out at a folder (null: none or not known yet) */
  branchAt?(cwd: string): string | null;
  /** 0.13.1: where the chat was when its last message was sent, and remembering it */
  lastPlace?(threadId: string): ChatPlace | undefined;
  rememberPlace?(threadId: string, place: ChatPlace): void;
  /** Starts the microphone for dictation (missing where it can not record). */
  startRecorder?(ev: RecorderEvents): Recorder;
  /** setting codexPanel.dictationLanguages: codes like ['en', 'ru'] ([] = any language) */
  dictationLanguages?(): unknown;
  /** The stored links "answer -> side chats" (Clarify), as saved before; undefined = none yet. */
  sideLinks?(): unknown;
  /** Saves the links of the side chats. */
  saveSideLinks?(store: SideStore): void;
}

/** One dictation: microphone -> Codex realtime (voice mode, text output) on a hidden ephemeral chat -> the user's words as text. */
interface Dictation {
  /** the view that started it (only it gets the text) */
  owner: string;
  /** the languages the user speaks: a hint for the voice model, and phrases in another script are dropped */
  langs: DictationLanguages;
  threadId: string | null;
  rec: Recorder | null;
  /** the voice session is up (audio can be sent) */
  live: boolean;
  /** audio recorded before the voice session was up */
  queue: { data: string; bytes: number }[];
  /** speech segments heard whose text has not come yet */
  speaking: number;
  stopping: boolean;
  recEnded: boolean;
  draining: boolean;
  lastText: number;
  timer: NodeJS.Timeout | null;
}

/** Longest dictation; then it stops by itself. */
export const DICTATION_MAX_MS = 10 * 60_000;
/** After the end of the recording: how long to wait for the text of the last words. */
export const DICTATION_TAIL_MS = 8_000;
/** The voice model is told to stay silent (it answers anyway; its answers and the tasks it hands to Codex are dropped). */
const DICTATION_PROMPT = 'You are a silent dictation microphone. The user dictates text for later. Do not reply, do not call any tool or function, never start the background agent.';

export type Sink = (event: Json) => void;

/** Thrown after the problem has already been shown to the user. */
class Reported extends Error {}

const FORWARD_PREFIXES = ['turn/', 'item/', 'thread/tokenUsage', 'thread/name', 'thread/goal', 'account/rateLimits', 'serverRequest/resolved', 'error', 'warning'];
const STICKY = new Set(['status', 'models', 'rateLimits', 'auth', 'sandbox', 'install', 'codexUpdated', 'chats']);

const HISTORY_PAGE = 40;
const HISTORY_SCAN_PAGE = 100;
/** A search scans up to this many pages of 100 chats (4000) before it reports "more"; "Load more" continues. */
const HISTORY_MAX_SCAN_PAGES = 40;
/** A search page stops scanning as soon as it has this many matches. */
const HISTORY_WANTED = 30;
const SURVEY_MAX_PAGES = 50;
/** Codex's refusal to delete a chat that a fork still uses. */
const FORK_REFUSAL = /forked history still references/i;
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
  /** "Edit" of the last message: this turn (and what came after it) is cut from the chat first, then the message is sent */
  replaceTurnId?: string;
  /** the typed text, put back into the input when the edit can not be done */
  editText?: string;
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
const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const describe = (t: unknown): string => (t instanceof RpcError ? t.message : String((t as Error)?.message ?? t));

export class CodexSession {
  private readonly sinks = new Set<Sink>();
  private readonly sticky = new Map<string, Json>();
  private readonly pendingApprovals = new Map<string, Json>();
  /** Chats left while their reply was running (New chat, another chat opened): the reply goes on in the app-server; their events
   *  only update this map and tell the host when the reply is done. Opening such a chat again takes it back. */
  private readonly background = new Map<string, { turnId: string | null; cwd: string | null }>();
  /** Titles of the chats seen in this window (thread name or first message), for notifications and tabs. */
  private readonly titles = new Map<string, string>();
  /** Finished answers per chat, counted for the AI names (read once from the chat, then counted here). */
  private readonly answerCounts = new Map<string, number>();
  /** Chats whose AI name is being written. */
  private readonly naming = new Set<string>();
  /** Clarify side chats: the links (a copy of the host's store), the side chats the app-server has loaded read-only, their running turns. */
  private sideStore: SideStore | null = null;
  private sideIdCache: Set<string> | null = null;
  private readonly sideLoaded = new Set<string>();
  private readonly sideTurnOf = new Map<string, string>();
  /** The running dictation (mic button), or null. */
  private dict: Dictation | null = null;
  private readonly dictThreads = new Set<string>();
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
  /** the chat's folder as Codex has it (before adjustCwd): where it was when no place of its last message is remembered */
  private threadOriginCwd: string | null = null;
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

  /** The chat goes on in another folder (follow the active project): the next turn runs there, and the message says so (moveNote). */
  moveTo(cwd: string): void {
    if (this._threadId !== null) this._threadCwd = normalizeDrive(cwd);
  }
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

  /** The connected app-server (connects first if needed); for config requests of the MCP settings. */
  appServer(): Promise<AppServerClient> {
    return this.connectBlocking();
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
          if (this.dict) this.dictationFail(this.dict, 'Codex stopped');
          this.needsResume = this._threadId !== null;
          this.turnId = null;
          this.pendingApprovals.clear();
          this.background.clear();
          this.sideLoaded.clear();
          this.sideTurnOf.clear();
          this.host.chatsChanged?.();
          this.status('closed', 'Codex app-server stopped: ' + reason);
          this.error('Codex stopped', reason + this.lastLog(), false);
          this.emit(ev('idle'));
        },
      });
      for (const m of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', ELICITATION_METHOD]) {
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
          '\nCheck the proxy settings (VS Code setting "http.proxy"), or install Codex yourself and set its path in the Codexter settings.', true);
      } else if (e instanceof NotFoundError) {
        this.status('error', 'codex not found');
        this.error('codex was not found', e.message + '\nSet the path to your Codex executable in the Codexter settings.', true);
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
    c.readRateLimits().then((r) => {
      this.emit({ kind: 'rateLimits', data: r });
      this.host.limitsChanged?.(r.rateLimits || r);
    }, () => { /* optional */ });
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
    if (tid !== null && this.dictThreads.has(tid)) {   // the hidden chats of the dictation: never shown, even after it ended
      if (this.dict !== null && tid === this.dict.threadId) this.dictationNotification(this.dict, method, params);
      return;
    }
    if (tid !== null && this.sideIdSet().has(tid)) {   // a Clarify side chat: only its own pane shows it
      this.sideNotification(tid, method, params);
      return;
    }
    if (method === 'thread/name/updated' && tid !== null) {
      const name = str(params, 'threadName') ?? str(params, 'name');
      if (name) this.titles.set(tid, name);
    }
    if (tid !== null && tid !== this._threadId && this.background.has(tid)) {
      this.backgroundNotification(tid, method, params);
      return;
    }
    if (tid !== null && this._threadId !== null && tid !== this._threadId) return;
    if (method === 'turn/started') {
      this.turnId = params.turn?.id ?? null;
      this.host.chatsChanged?.();
    } else if (method === 'turn/completed') {
      this.turnId = null;
      this.host.refreshHook(this._threadCwd);
      const status = str(params.turn ?? {}, 'status') ?? 'completed';
      if (this._threadId !== null) {
        this.host.turnDone?.(this._threadId, false, status);
        if (status === 'completed') this.autoName(this._threadId);
      }
      this.host.chatsChanged?.();
    } else if (method === 'item/completed') {
      if (params.item && params.item.type === 'fileChange') this.host.refreshHook(this._threadCwd);
    }
    if (method === 'account/rateLimits/updated') this.host.limitsChanged?.(params.rateLimits || params);
    if (!FORWARD_PREFIXES.some((p) => method.startsWith(p))) return;
    this.emit({ kind: 'notification', method, params });
  }

  /** An event of a chat running in the background: only its end (and a new turn of it) matters here. */
  private backgroundNotification(tid: string, method: string, params: Json): void {
    const bg = this.background.get(tid);
    if (!bg) return;
    if (method === 'turn/started') {
      bg.turnId = params.turn?.id ?? bg.turnId;
    } else if (method === 'turn/completed') {
      this.background.delete(tid);
      this.dropStaleApprovals();
      this.host.refreshHook(bg.cwd);
      const status = str(params.turn ?? {}, 'status') ?? 'completed';
      this.host.turnDone?.(tid, true, status);
      if (status === 'completed') this.autoName(tid);
      this.host.chatsChanged?.();
    } else if (method === 'item/completed' && params.item && params.item.type === 'fileChange') {
      this.host.refreshHook(bg.cwd);
    }
  }

  private handleApprovalRequest(req: Json): void {
    this.pendingApprovals.set(String(req.id), req);
    const tid = req.params?.threadId;
    if (typeof tid === 'string' && this.sideIdSet().has(tid)) {   // a side chat is read-only: whatever it asks for is declined
      this.approve(String(req.id), 'decline');
      this.emit({ kind: 'sideEvent', id: tid, method: 'sideDenied', params: {} });
      return;
    }
    if (typeof tid === 'string' && tid !== this._threadId && this.background.has(tid)) {
      this.host.needsApproval?.(tid);   // shown when the chat is opened again
      return;
    }
    this.emit({ kind: 'serverRequest', id: req.id, method: req.method, params: req.params });
  }

  /** @param decision accept | acceptForSession | decline (| cancel for an MCP elicitation) */
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
    } else if (req.method === ELICITATION_METHOD) {
      c.respond(req.id, elicitationResponse(req.params, decision));   // MCP tool approval (or an MCP server's own question)
    } else {
      c.respondDecision(req.id, decision);
    }
  }

  // ---- conversation ----

  /** Starts the thread if there is none (first message, goal) or resumes it after a restart of the app-server. */
  private async ensureThread(c: AppServerClient, cwd: string, model: string, ps: PermissionSettings): Promise<string> {
    if (this._threadId === null) {
      const r = await withTimeout(c.startThread(cwd, model, ps.approvalPolicy, ps.sandbox, ps.reviewer, this.host.threadExtras?.(false) ?? {}), 60_000, 'thread/start');
      this._threadCwd = cwd;
      this.threadOriginCwd = cwd;
      this._threadId = r.thread.id;
      this.host.threadChanged?.(this._threadId);
      this.emit(this.threadEvent(r.thread, null, true));
    } else if (this.needsResume) {
      await withTimeout(c.resumeThread(this._threadId, this._threadCwd, ps.approvalPolicy, ps.sandbox, ps.reviewer, this.host.threadExtras?.(true) ?? {}), 60_000, 'thread/resume');
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
        if (req.replaceTurnId && !(await this.cutTurn(c, threadId, req.replaceTurnId, req.editText ?? ''))) { this.emit(ev('idle')); return; }
        let collaboration: Json | null = null;
        if (req.plan !== undefined) {
          const model = req.model || req.defaultModel;
          if (model) collaboration = AppServerClient.collaborationMode(req.plan ? 'plan' : 'default', model, req.effort);
          else if (req.plan) this.emit({ kind: 'toast', message: 'Plan mode needs a model: pick one in the model list.' });
        }
        // 0.13.1: the chat works in another folder or on another branch than at its last message: one line tells the model (hidden in the page)
        const here = this._threadCwd ?? cwd;
        const place: ChatPlace = { cwd: here, branch: this.host.branchAt?.(here) ?? null };
        const before = this.host.lastPlace?.(threadId) ?? (this.threadOriginCwd ? { cwd: this.threadOriginCwd, branch: null } : null);
        const note = moveNote(before, place);
        if (note) { this.log('[cwd] ' + note); req = { ...req, text: note + '\n\n' + req.text }; }
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
        this.host.rememberPlace?.(threadId, place);
        this.host.chatUsed?.(threadId, this._threadCwd ?? cwd);
      } catch (e) {
        if (!(e instanceof NotFoundError) && !(e instanceof Reported) && this.connected) this.error('Could not send the message', describe(e), false);
        this.emit(ev('idle'));
      }
    });
  }

  /**
   * "Edit" of the last message: a running reply is interrupted (and awaited), then thread/revert drops the turn and everything after
   * it from the chat's history (files Codex changed stay as they are). False when that failed: the chat is shown again as the
   * server has it and the typed text goes back into the input.
   */
  private async cutTurn(c: AppServerClient, threadId: string, turnId: string, text: string): Promise<boolean> {
    try {
      if (this.turnId !== null) {
        this.interrupt();
        for (let i = 0; i < 150 && this.turnId !== null; i++) await new Promise((r) => setTimeout(r, 100));
        if (this.turnId !== null) throw new Error('the running reply did not stop');
      }
      await withTimeout(c.call('thread/revert', { threadId, beforeTurnId: turnId }), 30_000, 'thread/revert');
      this.log('[edit] ' + threadId + ': cut from turn ' + turnId);
      return true;
    } catch (e) {
      this.log('[edit] ' + threadId + ' failed: ' + describe(e));
      this.emit({ kind: 'toast', message: 'Could not replace the last message: ' + describe(e) });
      this.emit({ kind: 'focus', text });
      void this.resume(threadId);   // the page shows the chat as it is again
      return false;
    }
  }

  /**
   * "Fork" of an answer: a new chat with the history up to and including that answer's turn (thread/fork lastTurnId), opened in
   * place of this one (a running reply goes on in the background). The new chat is named "<title> (fork)". Note: Codex then
   * refuses to delete the source chat while the fork exists.
   */
  forkFrom(turnId: string, permissions: string): void {
    const source = this._threadId;
    if (source === null) return;
    void (async () => {
      try {
        const c = await this.connectBlocking();
        const ps = permissionSettings(permissions);
        const r = await withTimeout(c.call('thread/fork', { threadId: source, lastTurnId: turnId, cwd: this._threadCwd, approvalPolicy: ps.approvalPolicy,
          sandbox: ps.sandbox, approvalsReviewer: ps.reviewer, excludeTurns: true }), 60_000, 'thread/fork');
        const id = str(r.thread ?? {}, 'id');
        if (!id) throw new Error('Codex returned no chat');
        this.log('[fork] ' + source + ' through turn ' + turnId + ' -> ' + id);
        const title = this.titles.get(source);
        if (title) await this.renameThread(id, cut(title.replace(/ \(fork(?: \d+)?\)$/, ''), 150) + ' (fork)', true);
        await this.resume(id);
      } catch (e) {
        this.emit({ kind: 'toast', message: 'Could not fork the chat: ' + describe(e) });
      }
    })();
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

  /** "Compact" in the footer: Codex summarizes the open chat now (the reply events show it like a turn). */
  compact(permissions: string): void {
    const t = this._threadId;
    if (t === null || this.turnId !== null) return;
    void this.submit(async () => {
      try {
        const c = await this.connectBlocking();
        await this.ensureThread(c, this._threadCwd ?? '', '', permissionSettings(permissions));
        await withTimeout(c.compactThread(t), 60_000, 'thread/compact/start');
      } catch (e) {
        this.emit({ kind: 'toast', message: 'Could not compact the context: ' + describe(e) });
        this.emit(ev('idle'));
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
    if (thread && typeof thread.id === 'string') {
      const t = threadTitle(str(thread, 'name'), str(thread, 'preview'));
      if (t) this.titles.set(thread.id, t);
    }
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

  /** The open chat is being left: a running reply goes on in the background. Returns how to undo it (opening another chat failed). */
  private leaveOpenThread(): () => void {
    const id = this._threadId, turn = this.turnId;
    if (id === null || turn === null) return () => {};
    this.background.set(id, { turnId: turn, cwd: this._threadCwd });
    this.turnId = null;
    this.host.chatsChanged?.();
    return () => {
      const bg = this.background.get(id);
      if (!bg || this._threadId !== id) return;
      this.background.delete(id);
      this.turnId = bg.turnId;
      this.host.chatsChanged?.();
    };
  }

  /** Approvals of chats that are neither open nor running in the background are void. */
  private dropStaleApprovals(): void {
    for (const [k, req] of this.pendingApprovals) {
      const t = req.params?.threadId;
      if (typeof t !== 'string' || (t !== this._threadId && !this.background.has(t))) this.pendingApprovals.delete(k);
    }
  }

  /** Ids of the chats whose reply is running (open one included). */
  runningChats(): string[] {
    const ids = [...this.background.keys()];
    if (this._threadId !== null && this.turnId !== null) ids.push(this._threadId);
    return ids;
  }

  /** Title of a chat seen in this window, or null. */
  titleOf(id: string): string | null { return this.titles.get(id) ?? null; }

  /** A UI event for every view (the host's chat list: unread marks, tabs). */
  broadcast(e: Json): void { this.emit(e); }

  newChat(): void {
    this.leaveOpenThread();   // a running reply goes on in the background (it used to be interrupted)
    const idle = this.background.size === 0;
    this._threadId = null;
    this.turnId = null;
    this._threadCwd = null;
    this.threadOriginCwd = null;
    this.needsResume = false;
    this.dropStaleApprovals();
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
        const sides = this.sideIdSet(true);   // Clarify side chats are not listed (the answer's badge opens them)
        let next: string | null = cursor;
        let pages = 0;
        do {
          if (requestId !== this.latestHistoryRequest) return; // superseded by a newer keystroke
          const page = await this.fetchThreadPage(c, cwdFilter, next, pageSize, archived);
          pages++;
          for (const thread of page.data ?? []) {
            if (!isListable(thread) || isSideRow(thread, sides)) continue;
            const cwd = str(thread, 'cwd');
            if (cwd) this.seenCwds.add(cwd);
            const key = cwdKey(cwd);
            let project = projectByCwd.get(key);
            if (project === undefined) {
              project = this.host.projectName(cwd);
              projectByCwd.set(key, project);
            }
            const title = threadTitle(str(thread, 'name'), str(thread, 'preview'));
            if (threadMatches(q, title, project)) {
              rows.push({ id: thread.id, title, preview: threadPreview(str(thread, 'preview')), updatedAt: thread.updatedAt ?? null, cwd, project });
            }
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

  /**
   * AI search: the newest chats of the selection (up to AI_MAX_CHATS) go to host.ask with the description; answers with a "threads"
   * event (ai: true, no paging) whose rows are the matches, best first. A newer listThreads / aiSearch makes the page drop the answer.
   */
  aiSearch(requestId: number, query: string, cwds: string[], archived = false): void {
    this.latestHistoryRequest = requestId;
    this._historyQuery = query ?? '';
    this._historyCwds = cwds.filter((p) => typeof p === 'string' && p !== '').map((p) => normalizeDrive(p));
    const selected = this._historyCwds;
    void (async () => {
      try {
        const ask = this.host.ask?.bind(this.host);
        if (!ask) throw new Error('AI search is not available here');
        const c = await this.connectBlocking();
        if (selected.length > 0 && this.projectSurvey === null) {
          try { await this.loadSurvey(c); } catch (e) { this.log('project survey failed: ' + e); }
        }
        const cwdFilter = selected.length > 0 ? expandCwds(selected, this.seenCwds) : null;
        const rows: Json[] = [];
        const projectByCwd = new Map<string, string>();
        const sides = this.sideIdSet(true);
        let next: string | null = null;
        let pages = 0;
        do {
          if (requestId !== this.latestHistoryRequest) return;
          const page = await this.fetchThreadPage(c, cwdFilter, next, HISTORY_SCAN_PAGE, archived);
          pages++;
          for (const thread of page.data ?? []) {
            if (!isListable(thread) || isSideRow(thread, sides) || rows.length >= AI_MAX_CHATS) continue;
            const cwd = str(thread, 'cwd');
            if (cwd) this.seenCwds.add(cwd);
            const key = cwdKey(cwd);
            let project = projectByCwd.get(key);
            if (project === undefined) {
              project = this.host.projectName(cwd);
              projectByCwd.set(key, project);
            }
            rows.push({ id: thread.id, title: threadTitle(str(thread, 'name'), str(thread, 'preview')), preview: threadPreview(str(thread, 'preview')),
              updatedAt: thread.updatedAt ?? null, cwd, project });
          }
          next = str(page, 'nextCursor');
        } while (next !== null && rows.length < AI_MAX_CHATS && pages < HISTORY_MAX_SCAN_PAGES);
        if (requestId !== this.latestHistoryRequest) return;
        let data: Json[] = [];
        if (rows.length > 0) {
          const { prompt, count } = buildSearchPrompt(query, rows.map((r) => ({ title: r.title, project: r.project, updatedAt: r.updatedAt, preview: r.preview })));
          const started = Date.now();
          const answer = await ask(prompt);
          this.log('[search] ' + count + ' chats, answer "' + answer.slice(0, 200).replace(/\s+/g, ' ') + '" after ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
          data = parseSearchAnswer(answer, count).map((i) => rows[i]);
        }
        this.emit({ kind: 'threads', requestId, append: false, ai: true, data, scanned: rows.length });
      } catch (ex) {
        this.emit({ kind: 'threads', requestId, append: false, ai: true, data: [], error: describe(ex) });
      }
    })();
  }

  /** Archive / unarchive / delete a chat of the history. Answers with a "threadAction" event; the open chat is forgotten when it was the target. */
  threadAction(action: string, threadId: string): void {
    void (async () => {
      let error: string | undefined;
      let forks: { id: string; title: string }[] = [];
      try {
        const c = await this.connectBlocking();
        if (action === 'archive') await withTimeout(c.archiveThread(threadId), 30_000, 'thread/archive');
        else if (action === 'unarchive') await withTimeout(c.unarchiveThread(threadId), 30_000, 'thread/unarchive');
        else if (action === 'delete') {
          try {
            await withTimeout(c.deleteThread(threadId), 30_000, 'thread/delete');
          } catch (e) {
            // Codex keeps a chat while a fork of it exists: name the forks, the page asks whether to delete them too
            if (FORK_REFUSAL.test(describe(e))) forks = await this.forksOf(c, threadId).catch(() => []);
            throw e;
          }
        } else if (action === 'deleteWithForks') {
          // the forks first (a fork's own forks before it), then the chat
          for (const f of await this.forksOf(c, threadId)) {
            await withTimeout(c.deleteThread(f.id), 30_000, 'thread/delete');
            this.log('[delete] fork ' + f.id + ' of ' + threadId);
            this.forgetSide(f.id);
            this.emit({ kind: 'threadAction', action: 'delete', threadId: f.id, ok: true, quiet: true });
            if (this._threadId === f.id) this.newChat();
          }
          await withTimeout(c.deleteThread(threadId), 30_000, 'thread/delete');
          action = 'delete';
        } else throw new Error('unknown action ' + action);
      } catch (e) {
        error = describe(e);
        if (action === 'deleteWithForks') action = 'delete';
      }
      const e: Json = { kind: 'threadAction', action, threadId, ok: error === undefined };
      if (error !== undefined) e.error = error;
      if (forks.length > 0) e.forks = forks;
      this.emit(e);
      if (error !== undefined) return;
      if (action === 'delete') this.forgetSide(threadId);
      this.projectSurvey = null;
      if (action !== 'unarchive' && this._threadId === threadId) this.newChat();
      try { await this.surveyProjects(await this.connectBlocking()); } catch { /* the filter keeps its list */ }
    })();
  }

  /** The chat's name, its messages and its number of turns (thread/read). */
  private async readChat(threadId: string): Promise<{ name: string | null; msgs: ChatMessage[]; turns: number }> {
    const c = await this.connectBlocking();
    const rr = await withTimeout(c.call('thread/read', { threadId, includeTurns: true }), 60_000, 'thread/read');
    const turns: Json[] = Array.isArray(rr.thread?.turns) ? rr.thread.turns : [];
    return { name: str(rr.thread ?? {}, 'name'), msgs: transcriptOf(turns), turns: turns.length };
  }

  /** The quick model's name for a chat; '' when it gave none. */
  private async writeTitle(msgs: ChatMessage[], current: string | null): Promise<string> {
    const ask = this.host.ask?.bind(this.host);
    if (!ask) throw new Error('AI names are not available here');
    if (msgs.length === 0) throw new Error('the chat has no messages yet');
    return cleanTitle(await ask(buildTitlePrompt(msgs, current)));
  }

  /**
   * After a finished answer: names the chat by AI (codexPanel.autoChatNames) after its first answer and, in "auto", every
   * AUTO_NAME_EVERY answers. A chat named by hand (its name is not the one the AI gave it) is left alone. Failures are only logged.
   */
  private autoName(threadId: string): void {
    const mode = autoNameMode(this.host.autoNameMode?.());
    if (mode === 'off' || !this.host.ask || this.naming.has(threadId)) return;
    const known = this.answerCounts.get(threadId);
    if (known !== undefined) {
      this.answerCounts.set(threadId, known + 1);
      if (!shouldAutoName(mode, known + 1)) return;
    }
    this.naming.add(threadId);
    void (async () => {
      try {
        const chat = await this.readChat(threadId);
        this.answerCounts.set(threadId, chat.turns);
        if (!shouldAutoName(mode, chat.turns)) return;
        if (chat.name && chat.name !== this.host.autoNameOf?.(threadId)) return;   // named by hand
        const t0 = Date.now();
        const title = await this.writeTitle(chat.msgs, chat.name);
        this.log('[name] ' + threadId + ' after ' + chat.turns + ' turns: "' + title + '" (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
        if (title && title !== chat.name) await this.renameThread(threadId, title, true);
      } catch (e) {
        this.log('[name] ' + threadId + ' failed: ' + describe(e));
      } finally {
        this.naming.delete(threadId);
      }
    })();
  }

  /** "Suggest a name" of the rename input: answers with a "titleSuggested" event (name, or error); renames nothing. */
  suggestTitle(threadId: string): void {
    void (async () => {
      const e: Json = { kind: 'titleSuggested', threadId };
      try {
        const chat = await this.readChat(threadId);
        e.name = await this.writeTitle(chat.msgs, null);
        if (!e.name) e.error = 'no name came back';
      } catch (ex) {
        e.error = describe(ex);
      }
      this.emit(e);
    })();
  }

  /**
   * Every fork of a chat, forks of forks too (thread/list rows carry forkedFromId; archived chats are scanned as well), in the
   * order they can be deleted: a fork's own forks come before it.
   */
  private async forksOf(c: AppServerClient, threadId: string): Promise<{ id: string; title: string }[]> {
    const children = new Map<string, { id: string; title: string }[]>();
    for (const archived of [false, true]) {
      let next: string | null = null, pages = 0;
      do {
        const page = await this.fetchThreadPage(c, null, next, HISTORY_SCAN_PAGE, archived);
        for (const t of page.data ?? []) {
          const from = str(t, 'forkedFromId');
          if (!from || typeof t.id !== 'string') continue;
          const list = children.get(from) ?? [];
          list.push({ id: t.id, title: threadTitle(str(t, 'name'), str(t, 'preview')) });
          children.set(from, list);
        }
        next = str(page, 'nextCursor');
      } while (next !== null && ++pages < HISTORY_MAX_SCAN_PAGES);
    }
    const out: { id: string; title: string }[] = [];
    const seen = new Set<string>([threadId]);
    const visit = (id: string) => {
      for (const f of children.get(id) ?? []) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        visit(f.id);
        out.push(f);
      }
    };
    visit(threadId);
    return out;
  }

  /** Renames a chat (History, the title of the open chat). Answers with a "threadAction" event (action "rename", the name it got).
   *  auto: the name is the AI's (it may be renewed later); otherwise the chat counts as named by hand. */
  async renameThread(threadId: string, name: string, auto = false): Promise<boolean> {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 160);
    let error: string | undefined = clean ? undefined : 'the name is empty';
    if (clean) {
      try {
        const c = await this.connectBlocking();
        await withTimeout(c.renameThread(threadId, clean), 30_000, 'thread/name/set');
      } catch (e) {
        error = describe(e);
      }
    }
    const e: Json = { kind: 'threadAction', action: 'rename', threadId, ok: error === undefined };
    if (error !== undefined) e.error = error;
    else {
      e.name = clean;
      if (auto) e.auto = true;
      this.titles.set(threadId, clean);
      this.host.rememberAutoName?.(threadId, auto ? clean : null);
      this.host.renamed?.(threadId, clean);
    }
    this.emit(e);
    return error === undefined;
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

  /** Opens a chat; true when it is open now.
   *  user: from the history, errors are shown.
   *  restore: the project's / branch's last chat at startup; does nothing if a chat was opened or started in the meantime, and on failure
   *    (deleted elsewhere, ...) it only logs and forgets the id.
   *  switch: the chat of a branch that was just checked out; replaces the open chat, failures are only logged. */
  resume(id: string, mode: 'user' | 'restore' | 'switch' = 'user'): Promise<boolean> {
    return this.submit(async () => {
      if (mode === 'restore' && this._threadId !== null) return false;
      if (mode === 'switch' && (this._threadId === id || this.turnId !== null)) return this._threadId === id;
      if (this._threadId === id && mode === 'user' && this.turnId !== null) return true;   // already open with its reply running
      let undoLeave = () => {};
      try {
        const c = await this.connectBlocking();
        if (this._threadId !== id) undoLeave = this.leaveOpenThread();   // the open chat's reply goes on in the background
        const t0 = Date.now();
        const r = await withTimeout(c.resumeThread(id, null, null, null, permissionSettings(this.host.permissionsPref()).reviewer, this.host.threadExtras?.(true) ?? {}),
          60_000, 'thread/resume');
        const t1 = Date.now();
        const thread = r.thread;
        let turns: Json[] = Array.isArray(thread?.turns) ? thread.turns : [];
        // the turns (when resume did not bring them) and the goal are asked at the same time
        const goal = withTimeout(c.getGoal(id), 10_000, 'thread/goal/get').then((g) => g.goal ?? null, () => null); // older Codex: no goals
        if (turns.length === 0) {
          const rr = await withTimeout(c.call('thread/read', { threadId: id, includeTurns: true }), 60_000, 'thread/read');
          if (Array.isArray(rr.thread?.turns)) turns = rr.thread.turns;
        }
        const g = await goal;
        this.log('[resume] ' + id + ': ' + turns.length + ' turns, resume ' + (t1 - t0) + ' ms, total ' + (Date.now() - t0) + ' ms');
        // a chat whose reply was running in the background: take it back (its reply keeps streaming into the view)
        const bg = this.background.get(id);
        this.background.delete(id);
        this._threadId = id;
        const cwd: string | null = typeof r.cwd === 'string' ? r.cwd : bg?.cwd ?? null;
        this._threadCwd = cwd && this.host.adjustCwd ? this.host.adjustCwd(cwd) : cwd;
        this.threadOriginCwd = cwd;   // turn/start passes it, so turns run there
        this.needsResume = false;
        this.turnId = bg?.turnId ?? null;
        this.dropStaleApprovals();
        this.host.threadChanged?.(id);
        const e = this.threadEvent(thread, turns, false);
        // the thread's collaboration mode (newer servers): the page shows the plan mode chip for it
        const mode = r.collaborationMode?.mode;
        if (mode === 'plan' || mode === 'default') e.planMode = mode === 'plan';
        // the chat keeps its own model and effort (not the defaults of new chats), and shows its context usage right away
        const model = str(r, 'model') ?? str(thread ?? {}, 'model');
        if (model) { e.model = model; e.effort = str(r, 'reasoningEffort') ?? str(thread ?? {}, 'reasoningEffort') ?? ''; }
        const usage = lastTokenUsage(str(thread ?? {}, 'path'));
        if (usage) e.tokenUsage = usage;
        if (g) e.goal = g;
        this.emit(e);
        this.emitSideLinks(id, false);
        if (this.turnId !== null) {
          this.emit({ kind: 'notification', method: 'turn/started', params: { threadId: id, turn: { id: this.turnId } } });
          for (const req of this.pendingApprovals.values()) {   // approvals asked while it was in the background
            if (req.params?.threadId === id) this.emit({ kind: 'serverRequest', id: req.id, method: req.method, params: req.params });
          }
        }
        this.host.chatsChanged?.();
        return true;
      } catch (e) {
        undoLeave();
        if (mode === 'user') {
          this.error('Could not open the chat', describe(e), false);
        } else {
          this.log('[warn] could not open the ' + (mode === 'restore' ? 'last' : 'branch\'s') + ' chat ' + id + ': ' + describe(e));
          if (mode === 'restore') this.host.threadChanged?.(null);
        }
        return false;
      }
    });
  }

  // ---- Clarify side chats ----
  // A question about one answer goes to a fork of the chat made at that answer (thread/fork lastTurnId), run read-only: thread sandbox
  // read-only, approval policy never, every turn with sandboxPolicy readOnly, and whatever it still asks for is declined. The fork is
  // linked to the answer in the host's store (core/sideChats.ts), never written into the main chat, hidden from the History, and
  // made only with the first question. Its events go to the page as sideOpen / sideEvent, never to the main chat's feed.

  /** The links of the side chats: read from the host once, then kept here; `fresh` reads them again (another window may have changed them). */
  private sideLinksNow(fresh = false): SideStore {
    if (this.sideStore === null || (fresh && this.host.sideLinks)) {
      const raw = this.host.sideLinks ? this.host.sideLinks() : this.sideStore;
      this.sideStore = normalizeStore(raw ?? this.sideStore ?? {});
      this.sideIdCache = null;
    }
    return this.sideStore;
  }

  private sideIdSet(fresh = false): Set<string> {
    const store = this.sideLinksNow(fresh);
    return (this.sideIdCache ??= sideIds(store));
  }

  private changeSides(fn: (s: SideStore) => SideStore): void {
    this.sideStore = fn(this.sideLinksNow(true));
    this.sideIdCache = null;
    this.host.saveSideLinks?.(this.sideStore);
  }

  /** A chat was deleted: its links (a parent chat) or its place in them (a side chat) go. */
  private forgetSide(id: string): void {
    const s = this.sideLinksNow(true);
    if (!(id in s) && !sideIds(s).has(id)) return;
    this.changeSides((x) => forgetChat(x, id));
    this.sideLoaded.delete(id);
  }

  /** Tells the page which answers of a chat have side chats (always: also an empty list, after the last one went). */
  private emitSideLinks(parent: string, always: boolean): void {
    const links = linksOf(this.sideLinksNow(true), parent);
    if (always || Object.keys(links).length > 0) this.emit({ kind: 'sideLinks', threadId: parent, links });
  }

  private sideNotification(tid: string, method: string, params: Json): void {
    if (method === 'turn/started') this.sideTurnOf.set(tid, str(params.turn ?? {}, 'id') ?? '');
    else if (method === 'turn/completed') this.sideTurnOf.delete(tid);
    if (['turn/started', 'turn/completed', 'item/started', 'item/completed', 'item/agentMessage/delta', 'error'].includes(method)) {
      this.emit({ kind: 'sideEvent', id: tid, method, params });
    }
  }

  /** The side chat must be loaded in the app-server (after a restart of it) with the read-only settings before a turn runs in it. */
  private async ensureSideLoaded(c: AppServerClient, id: string): Promise<void> {
    if (this.sideLoaded.has(id)) return;
    await withTimeout(c.resumeThread(id, null, 'never', 'read-only', null, this.host.threadExtras?.(true) ?? {}), 60_000, 'thread/resume');
    this.sideLoaded.add(id);
  }

  /** Makes the side chat of an answer: a read-only fork through that turn, named after the answer, linked in the store. */
  private async sideCreate(c: AppServerClient, parent: string, turnId: string, excerpt: string): Promise<string> {
    // the fork starts with the main chat's turns up to this answer; the side chat's own turns come after them
    const rr = await withTimeout(c.call('thread/read', { threadId: parent, includeTurns: true }), 60_000, 'thread/read');
    const turns: Json[] = Array.isArray(rr.thread?.turns) ? rr.thread.turns : [];
    const at = turns.findIndex((t) => t?.id === turnId);
    if (at < 0) throw new Error('this answer is not saved in the chat yet, try again in a moment');
    const r = await withTimeout(c.call('thread/fork', { threadId: parent, lastTurnId: turnId, cwd: this._threadCwd, approvalPolicy: 'never',
      sandbox: 'read-only', excludeTurns: true }), 60_000, 'thread/fork');
    const id = str(r.thread ?? {}, 'id');
    if (!id) throw new Error('Codex returned no chat');
    const entry = { id, at: Date.now(), title: sideTitle(excerpt), base: at + 1 };
    this.sideLoaded.add(id);
    this.changeSides((s) => addSide(s, parent, turnId, entry));   // linked before anything else happens to it
    this.log('[clarify] ' + parent + ' turn ' + turnId + ' -> ' + id + ' (read-only, ' + entry.base + ' turns of the main chat)');
    try { await withTimeout(c.renameThread(id, entry.title), 30_000, 'thread/name/set'); } catch (e) { this.log('[clarify] name failed: ' + describe(e)); }
    this.emit({ kind: 'sideOpen', parent, turnId, side: { id, at: entry.at, title: entry.title }, turns: [], running: false, created: true });
    this.emitSideLinks(parent, true);
    return id;
  }

  /**
   * A question about an answer. sideId null: the first question of a new side chat (the fork is made now); else a further question of
   * that side chat. The question is sent read-only; the reply streams as sideEvent events. A failure comes as sideEvent "sideFailed".
   */
  sideAsk(a: { threadId: string; turnId: string; sideId: string | null; excerpt: string; text: string; model: string; effort: string }): void {
    const text = a.text.trim();
    if (!text || !a.turnId) return;
    void (async () => {
      let id = a.sideId;
      try {
        const c = await this.connectBlocking();
        if (id === null) {
          if (this._threadId !== a.threadId) throw new Error('the chat is not open any more');
          id = await this.sideCreate(c, a.threadId, a.turnId, a.excerpt);
        } else {
          if (findSide(this.sideLinksNow(true), id) === null) throw new Error('this clarification is gone');
          await this.ensureSideLoaded(c, id);
        }
        if (this.sideTurnOf.has(id)) throw new Error('the previous question is still being answered');
        const r = await withTimeout(c.startTurn(id, [AppServerClient.textInput(sideQuestion(text))], null, a.model || null, a.effort || null,
          'never', 'readOnly', null), 60_000, 'turn/start');
        if (r.turn?.id) this.sideTurnOf.set(id, r.turn.id);
      } catch (e) {
        this.log('[clarify] failed: ' + describe(e));
        this.emit({ kind: 'sideEvent', id: id ?? '', method: 'sideFailed', params: { message: describe(e), parent: a.threadId, turnId: a.turnId } });
      }
    })();
  }

  /** Opens a side chat again (the answer's badge): its own turns, and whether its reply still runs. Answers with a sideOpen event. */
  sideShow(sideId: string): void {
    void (async () => {
      const found = findSide(this.sideLinksNow(true), sideId);
      try {
        if (!found) throw new Error('this clarification is gone');
        const c = await this.connectBlocking();
        await this.ensureSideLoaded(c, sideId);
        const rr = await withTimeout(c.call('thread/read', { threadId: sideId, includeTurns: true }), 60_000, 'thread/read');
        this.emit({ kind: 'sideOpen', parent: found.parent, turnId: found.turn, side: { id: sideId, at: found.entry.at, title: found.entry.title },
          turns: sideTurns(rr.thread?.turns ?? [], found.entry.base), running: this.sideTurnOf.has(sideId) });
      } catch (e) {
        this.emit({ kind: 'sideOpen', parent: found?.parent ?? '', turnId: found?.turn ?? '', side: { id: sideId }, turns: [], running: false, error: describe(e) });
      }
    })();
  }

  sideInterrupt(sideId: string): void {
    const c = this.client, t = this.sideTurnOf.get(sideId);
    if (c && t) c.interruptTurn(sideId, t).catch(() => undefined);
  }

  // ---- dictation ----

  /** Can this window dictate (a microphone recorder exists here)? */
  get dictationAvailable(): boolean { return !!this.host.startRecorder; }

  private dictEmit(d: Dictation, e: Json): void { this.emit({ ...e, owner: d.owner }); }

  /**
   * Dictation (the mic button): records the microphone and sends it to Codex's voice mode (thread/realtime, experimental, text
   * output, version v2) on a hidden ephemeral chat. The text of what the user said comes as "dictationText" events; the voice
   * model's own answers are dropped and every task it hands to Codex is interrupted at once. State: "dictation" events.
   */
  startDictation(owner: string): void {
    if (this.dict !== null) return;
    const start = this.host.startRecorder?.bind(this.host);
    if (!start) { this.emit({ kind: 'dictation', owner, state: 'off', error: 'Dictation works on Windows only for now.' }); return; }
    const d: Dictation = { owner, langs: parseLanguages(this.host.dictationLanguages?.() ?? []), threadId: null, rec: null, live: false, queue: [], speaking: 0, stopping: false, recEnded: false, draining: false, lastText: 0, timer: null };
    this.dict = d;
    this.dictEmit(d, { kind: 'dictation', state: 'starting' });
    d.timer = setTimeout(() => this.stopDictation(), DICTATION_MAX_MS);
    try {
      d.rec = start({
        onReady: () => { if (this.dict === d && !d.stopping) this.dictEmit(d, { kind: 'dictation', state: 'listening' }); },
        onChunk: (data, bytes) => this.dictationAudio(d, data, bytes),
        onEnd: (err) => {
          d.recEnded = true;
          if (err) this.dictationFail(d, 'Microphone: ' + err); else this.dictationDrain(d);
        },
      });
    } catch (e) {
      this.dictationFail(d, 'Microphone: ' + describe(e));
      return;
    }
    void (async () => {
      try {
        const c = await this.connectBlocking();
        const th = await withTimeout(c.call('thread/start', { cwd: os.tmpdir(), ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' }), 30_000, 'thread/start');
        if (this.dict !== d) return;
        d.threadId = str(th.thread ?? {}, 'id');
        if (!d.threadId) throw new Error('Codex started no chat for the dictation');
        this.dictThreads.add(d.threadId);
        await withTimeout(c.call('thread/realtime/start', { threadId: d.threadId, outputModality: 'text', version: 'v2', transport: { type: 'websocket' },
          prompt: dictationPrompt(DICTATION_PROMPT, d.langs), includeStartupContext: false }), 30_000, 'thread/realtime/start');
      } catch (e) {
        this.dictationFail(d, 'Codex voice mode: ' + describe(e));
      }
    })();
  }

  /** Ends the recording; the text of the last words still comes, then the state goes "off". */
  stopDictation(): void {
    const d = this.dict;
    if (d === null || d.stopping) return;
    d.stopping = true;
    this.dictEmit(d, { kind: 'dictation', state: 'stopping' });
    if (d.rec && !d.recEnded) d.rec.stop(); else this.dictationDrain(d);
  }

  private dictationAudio(d: Dictation, data: string, bytes: number): void {
    if (this.dict !== d) return;
    // the level bars next to the mic button (10 a second, 2 decimals are enough)
    if (!d.stopping) this.dictEmit(d, { kind: 'dictationLevel', level: Math.round(pcmLevel(data) * 100) / 100 });
    if (!d.live) { d.queue.push({ data, bytes }); return; }
    this.sendDictationAudio(d, data, bytes);
  }

  private sendDictationAudio(d: Dictation, data: string, bytes: number): void {
    const c = this.client;
    if (!c || !d.threadId) return;
    c.call('thread/realtime/appendAudio', { threadId: d.threadId, audio: { data, numChannels: 1, sampleRate: MIC_RATE, samplesPerChannel: Math.floor(bytes / 2) } })
      .catch((e) => this.log('[dictation] appendAudio: ' + describe(e)));
  }

  private dictationNotification(d: Dictation, method: string, params: Json): void {
    if (method === 'thread/realtime/started') {
      d.live = true;
      const q = d.queue;
      d.queue = [];
      for (const a of q) this.sendDictationAudio(d, a.data, a.bytes);
      if (d.recEnded) this.dictationDrain(d);
    } else if (method === 'thread/realtime/itemAdded') {
      if (params.item?.type === 'input_audio_buffer.speech_started') d.speaking++;
    } else if (method === 'thread/realtime/transcript/done') {
      if (params.role !== 'user') return;   // the voice model's answer
      d.speaking = Math.max(0, d.speaking - 1);
      d.lastText = Date.now();
      const text = typeof params.text === 'string' ? params.text.trim() : '';
      if (!text) return;
      if (isForeign(text, d.langs)) {   // e.g. a Chinese phrase while the user speaks Russian: noise taken for words
        this.log('[dictation] dropped, not in ' + d.langs.names.join(', ') + ': ' + text);
        this.dictEmit(d, { kind: 'dictationDropped', text });
        return;
      }
      this.dictEmit(d, { kind: 'dictationText', text });
    } else if (method === 'turn/started') {   // the voice model handed a task to Codex: not wanted here
      const turnId = params.turn?.id;
      if (this.client && d.threadId && typeof turnId === 'string') this.client.call('turn/interrupt', { threadId: d.threadId, turnId }).catch(() => undefined);
    } else if (method === 'thread/realtime/error') {
      this.dictationFail(d, 'Codex voice mode: ' + (str(params, 'message') ?? 'error'));
    } else if (method === 'thread/realtime/closed') {
      if (d.stopping) this.dictationFinish(d, null);
      else this.dictationFail(d, 'Codex closed the voice mode (' + (str(params, 'reason') ?? 'no reason') + ')');
    }
  }

  /** The recording is over: a second of silence ends the last words, their text is awaited (DICTATION_TAIL_MS at most). */
  private dictationDrain(d: Dictation): void {
    if (this.dict !== d || d.draining) return;
    if (!d.stopping) { d.stopping = true; this.dictEmit(d, { kind: 'dictation', state: 'stopping' }); }   // the recorder ended by itself
    if (!d.live) return;   // drained once the voice session is up (or ended by a failure)
    d.draining = true;
    const quiet = Buffer.alloc(MIC_RATE / 10 * 2).toString('base64');
    for (let i = 0; i < 12; i++) this.sendDictationAudio(d, quiet, MIC_RATE / 10 * 2);
    const until = Date.now() + DICTATION_TAIL_MS;
    const check = () => {
      if (this.dict !== d) return;
      const settled = d.speaking === 0 && Date.now() - d.lastText > 300;
      if (settled || Date.now() >= until) { this.dictationFinish(d, null); return; }
      setTimeout(check, 200);
    };
    setTimeout(check, 1500);   // the server needs the silence to end the segment
  }

  private dictationFail(d: Dictation, error: string): void {
    if (this.dict !== d) return;
    this.log('[dictation] ' + error);
    d.stopping = true;
    if (d.rec && !d.recEnded) d.rec.stop();
    this.dictationFinish(d, error);
  }

  private dictationFinish(d: Dictation, error: string | null): void {
    if (this.dict !== d) return;
    this.dict = null;
    if (d.timer) clearTimeout(d.timer);
    if (this.client && d.threadId) this.client.call('thread/realtime/stop', { threadId: d.threadId }).catch(() => undefined);
    const e: Json = { kind: 'dictation', state: 'off' };
    if (error) e.error = error;
    this.dictEmit(d, e);
  }

  dispose(): void {
    if (this.dict) { const d = this.dict; this.dict = null; d.rec?.stop(); if (d.timer) clearTimeout(d.timer); }
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
