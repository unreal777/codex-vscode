// Thin helpers over `codex app-server` (port of AppServerClient.java). Payloads stay raw objects;
// only the request shapes we send are built here.
import { Json, JsonRpcConnection } from './jsonrpc';

export interface EventListener {
  onNotification(method: string, params: Json, raw: Json): void;
  /** App-server went away. */
  onClosed(reason: string): void;
}

export function sandboxPolicy(type: string): Json {
  const s: Json = { type };
  if (type === 'readOnly') {
    s.networkAccess = false;
  } else if (type === 'workspaceWrite') {
    s.writableRoots = [];
    s.networkAccess = false;
    s.excludeTmpdirEnvVar = false;
    s.excludeSlashTmp = false;
  }
  return s;
}

export class AppServerClient {
  private readonly rpc: JsonRpcConnection;
  private readonly handlers = new Map<string, (msg: Json) => void>();
  private listener?: EventListener;
  rawTap: (msg: Json) => void = () => {};

  /** @param executable command prefix from Located.command(); "app-server" is appended */
  constructor(executable: string[], cwd: string | undefined, log?: (line: string) => void, env?: NodeJS.ProcessEnv) {
    this.rpc = new JsonRpcConnection([...executable, 'app-server'], cwd, log, env);
    this.rpc.onNotification = (m) => this.handleNotification(m);
    this.rpc.onServerRequest = (m) => this.handleServerRequest(m);
    this.rpc.onRaw = (m) => this.rawTap(m);
    this.rpc.onClose = (r) => this.listener?.onClosed(r);
  }

  setEventListener(l: EventListener): void {
    this.listener = l;
  }

  /**
   * Registers a handler for a server-to-client request method. The handler must eventually call respond / respondError.
   * Unregistered methods get an error reply so Codex never hangs.
   */
  onServerRequest(method: string, handler: (msg: Json) => void): void {
    this.handlers.set(method, handler);
  }

  start(): Promise<void> {
    return this.rpc.start();
  }

  isAlive(): boolean {
    return this.rpc.isAlive();
  }

  close(): void {
    this.rpc.close();
  }

  private handleNotification(msg: Json): void {
    const p = msg.params && typeof msg.params === 'object' ? msg.params : {};
    this.listener?.onNotification(msg.method, p, msg);
  }

  private handleServerRequest(msg: Json): void {
    const h = this.handlers.get(msg.method);
    if (!h) {
      this.rpc.respondError(msg.id, -32601, 'Unsupported by Codex Panel: ' + msg.method);
      return;
    }
    try {
      h(msg);
    } catch (e) {
      this.rpc.respondError(msg.id, -32603, 'Handler failed: ' + e);
    }
  }

  respond(id: Json, result: Json): void {
    this.rpc.respond(id, result);
  }

  respondError(id: Json, message: string): void {
    this.rpc.respondError(id, -32000, message);
  }

  /** Reply to a command/fileChange approval request with {"decision": ...}. */
  respondDecision(id: Json, decision: string): void {
    this.respond(id, { decision });
  }

  // ---- requests ----

  /** Sends initialize, then the "initialized" notification. */
  async initialize(name: string, title: string, version: string): Promise<Json> {
    const r = await this.rpc.request('initialize', {
      clientInfo: { name, title, version },
      // experimentalApi: turn/start.collaborationMode (plan mode) is an experimental field and is refused without it
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.rpc.notify('initialized');
    return r ?? {};
  }

  listModels(): Promise<Json> {
    return this.call('model/list', { limit: 100 });
  }

  /**
   * One page of thread/list, newest first, never archived chats. Same params as the Eclipse plugin (verified there against the
   * real app-server): cwd (string or string[]) matches exactly - the caller expands spellings; useStateDbOnly reads the index only (fast); searchTerm is a case-sensitive
   * title substring, so the typed query is NOT sent: the panel filters case-insensitively itself.
   */
  listThreads(cwd: string | string[] | null, cursor: string | null, limit: number, stateDbOnly: boolean, archived = false): Promise<Json> {
    const p: Json = { limit, sortKey: 'updated_at', sortDirection: 'desc', archived };
    if (Array.isArray(cwd) ? cwd.length > 0 : cwd) p.cwd = cwd; // string | string[]; exact match per entry
    if (cursor) p.cursor = cursor;
    if (stateDbOnly) p.useStateDbOnly = true;
    return this.call('thread/list', p);
  }

  // ---- config (user config.toml, written by Codex itself: comments and layout are kept) ----

  /** Effective config ({config: {...}}); mcp_servers holds the servers of config.toml with their env / headers (secrets: never sent to the page). */
  readConfig(): Promise<Json> { return this.call('config/read', { includeLayers: false }); }
  /** Edits of the user config.toml; value null removes the key. Loaded threads get the new settings (reloadUserConfig). */
  writeConfig(edits: { keyPath: string; value: unknown }[]): Promise<Json> {
    return this.call('config/batchWrite', { edits: edits.map((e) => ({ keyPath: e.keyPath, mergeStrategy: 'replace', value: e.value })), reloadUserConfig: true });
  }
  /** Re-reads the MCP servers of the config. */
  reloadMcpServers(): Promise<Json> { return this.call('config/mcpServer/reload', {}); }
  /** Starts one server (or all) and lists its tools; toolsError says why it did not start. */
  mcpServerStatus(serverName: string | null): Promise<Json> {
    const p: Json = { detail: 'toolsAndAuthOnly' };
    if (serverName) p.serverName = serverName;
    return this.call('mcpServerStatus/list', p);
  }

  archiveThread(threadId: string): Promise<Json> { return this.call('thread/archive', { threadId }); }
  /** answers {thread} */
  unarchiveThread(threadId: string): Promise<Json> { return this.call('thread/unarchive', { threadId }); }
  deleteThread(threadId: string): Promise<Json> { return this.call('thread/delete', { threadId }); }
  /** Sets the chat's name (Codex sends thread/name/updated for a loaded chat). */
  renameThread(threadId: string, name: string): Promise<Json> { return this.call('thread/name/set', { threadId, name }); }

  /** @param sandbox read-only | workspace-write | danger-full-access */
  /** extra: developerInstructions, config overrides (core/instructions.ts threadExtras) */
  startThread(cwd: string, model: string | null, approvalPolicy: string | null, sandbox: string | null, approvalsReviewer: string | null, extra: Json = {}): Promise<Json> {
    const p: Json = { ...extra, cwd };
    if (model) p.model = model;
    if (approvalPolicy) p.approvalPolicy = approvalPolicy;
    if (sandbox) p.sandbox = sandbox;
    if (approvalsReviewer) p.approvalsReviewer = approvalsReviewer;
    return this.call('thread/start', p);
  }

  resumeThread(threadId: string, cwd: string | null, approvalPolicy: string | null, sandbox: string | null, approvalsReviewer: string | null, extra: Json = {}): Promise<Json> {
    const p: Json = { ...extra, threadId };
    if (cwd) p.cwd = cwd;
    if (approvalPolicy) p.approvalPolicy = approvalPolicy;
    if (sandbox) p.sandbox = sandbox;
    if (approvalsReviewer) p.approvalsReviewer = approvalsReviewer;
    return this.call('thread/resume', p);
  }

  /** The pieces of a turn's input (UserInput of the protocol). */
  static textInput(text: string): Json { return { type: 'text', text, text_elements: [] }; }
  static imageInput(url: string): Json { return { type: 'image', url }; }
  static localImageInput(path: string): Json { return { type: 'localImage', path }; }
  /** A plugin (or skill) picked in the "+" menu: path is "plugin://<name>@<marketplace>". */
  static mentionInput(name: string, path: string): Json { return { type: 'mention', name, path }; }

  /** collaborationMode of turn/start (experimental, needs initialize.capabilities.experimentalApi). Settings.model is required there. */
  static collaborationMode(mode: 'plan' | 'default', model: string, effort: string | null): Json {
    return { mode, settings: { model, reasoning_effort: effort || null, developer_instructions: null } };
  }

  /**
   * @param input        UserInput items (see textInput / imageInput / mentionInput)
   * @param sandboxType  readOnly | workspaceWrite | dangerFullAccess (null keeps the thread default)
   * @param effort       reasoning effort or null
   * @param collaboration collaborationMode object or null (leaves the thread's mode alone)
   */
  startTurn(threadId: string, input: Json[], cwd: string | null, model: string | null, effort: string | null,
    approvalPolicy: string | null, sandboxType: string | null, approvalsReviewer: string | null, collaboration: Json | null = null): Promise<Json> {
    const p: Json = { threadId, input };
    if (cwd) p.cwd = cwd;
    if (model) p.model = model;
    if (effort) p.effort = effort;
    p.summary = 'auto';
    if (approvalPolicy) p.approvalPolicy = approvalPolicy;
    if (sandboxType) p.sandboxPolicy = sandboxPolicy(sandboxType);
    if (approvalsReviewer) p.approvalsReviewer = approvalsReviewer;
    if (collaboration) p.collaborationMode = collaboration;
    return this.call('turn/start', p);
  }

  setGoal(threadId: string, objective: string): Promise<Json> {
    return this.call('thread/goal/set', { threadId, objective, origin: 'user' });
  }

  /** Codex summarizes the chat so far; it runs like a turn (turn/started, a contextCompaction item, turn/completed). */
  compactThread(threadId: string): Promise<Json> { return this.call('thread/compact/start', { threadId }); }

  clearGoal(threadId: string): Promise<Json> {
    return this.call('thread/goal/clear', { threadId, origin: 'user' });
  }

  getGoal(threadId: string): Promise<Json> {
    return this.call('thread/goal/get', { threadId });
  }

  /** Installed plugins (all marketplaces); cwds lets Codex find repo marketplaces too. */
  listInstalledPlugins(cwds: string[] | null): Promise<Json> {
    const p: Json = {};
    if (cwds && cwds.length) p.cwds = cwds;
    return this.call('plugin/installed', p);
  }

  interruptTurn(threadId: string, turnId: string): Promise<Json> {
    return this.call('turn/interrupt', { threadId, turnId });
  }

  readRateLimits(): Promise<Json> {
    return this.call('account/rateLimits/read');
  }

  async call(method: string, params?: Json): Promise<Json> {
    const r = await this.rpc.request(method, params);
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  }
}
