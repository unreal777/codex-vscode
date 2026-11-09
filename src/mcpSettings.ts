// "MCP servers" of the in-panel settings: the servers of the Codex config (on / off, remove, check), servers of VS Code's mcp.json
// (Copilot) copied to Codex, and "add by name" where a quick Codex run with web search proposes the setup and the user confirms it.
// Everything is written by the app-server itself (config/batchWrite) into the user config.toml, which the Codex CLI and the Eclipse
// plugin share; comments and layout of the file are kept.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { AppServerClient } from './core/appServer';
import { Json } from './core/jsonrpc';
import {
  buildFindPrompt, codexServerRows, FindProposal, isServerName, parseFindAnswer, parseJsonc, proposalTarget, proposalValue, resolveCommand,
  sameInCodex, toCodexValue, VscodeServer, vscodeServers,
} from './core/mcpServers';

export interface McpDeps {
  appServer(): Promise<AppServerClient>;
  /** a quick read-only `codex exec` run with web search (fast model of the settings) */
  find(prompt: string): Promise<string>;
  /** VS Code's user folder (mcp.json lives there) */
  userDir(): string;
  post(e: Json): void;
  log(line: string): void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class McpSettings {
  private vscodeList: VscodeServer[] = [];
  private finding = false;

  constructor(private readonly d: McpDeps) {}

  handle(m: Json): void {
    const name = typeof m.name === 'string' ? m.name : '';
    switch (m.type) {
      case 'mcpList': void this.list(); break;
      case 'mcpToggle': void this.toggle(name, m.enabled === true); break;
      case 'mcpRemove': void this.remove(name); break;
      case 'mcpTest': void this.test(name); break;
      case 'mcpImport': void this.importVscode(typeof m.key === 'string' ? m.key : ''); break;
      case 'mcpFind': void this.find(typeof m.query === 'string' ? m.query.trim() : ''); break;
    }
  }

  /** Answers with {kind: 'mcp', servers, vscode} (or error). */
  async list(): Promise<void> {
    try {
      const c = await this.d.appServer();
      const codex = ((await c.readConfig()).config ?? {}).mcp_servers ?? {};
      this.vscodeList = this.readVscode();
      this.d.post({
        kind: 'mcp', servers: codexServerRows(codex),
        vscode: this.vscodeList.map((v) => ({
          key: v.key, name: v.name, target: v.url ?? [v.command ?? '', ...v.args].join(' '), source: v.source,
          inCodex: sameInCodex(v, codex), problem: v.problem,
        })),
      });
    } catch (e) {
      this.d.post({ kind: 'mcp', servers: [], vscode: [], error: errorText(e) });
    }
  }

  private readVscode(): VscodeServer[] {
    const files = [path.join(this.d.userDir(), 'mcp.json'),
      ...(vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file').map((f) => path.join(f.uri.fsPath, '.vscode', 'mcp.json'))];
    const out: VscodeServer[] = [];
    for (const f of files) {
      let text: string;
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      try {
        const label = f.startsWith(this.d.userDir()) ? 'VS Code user mcp.json' : path.basename(path.dirname(path.dirname(f))) + '/.vscode/mcp.json';
        for (const v of vscodeServers(parseJsonc(text), label)) if (!out.some((o) => o.key === v.key)) out.push(v);
      } catch (e) {
        this.d.log('[mcp] could not read ' + f + ': ' + errorText(e));
      }
    }
    return out;
  }

  private async write(edits: { keyPath: string; value: unknown }[]): Promise<AppServerClient> {
    const c = await this.d.appServer();
    await c.writeConfig(edits);
    try { await c.reloadMcpServers(); } catch (e) { this.d.log('[mcp] reload failed: ' + errorText(e)); }
    return c;
  }

  private note(text: string, ok = true, name = ''): void {
    this.d.post({ kind: 'mcpNote', text, ok, name });
  }

  private async toggle(name: string, enabled: boolean): Promise<void> {
    if (!isServerName(name)) return this.note('"' + name + '" can only be changed in config.toml itself.', false, name);
    try {
      await this.write([{ keyPath: 'mcp_servers.' + name + '.enabled', value: enabled }]);
      this.d.log('[mcp] ' + name + (enabled ? ' on' : ' off'));
    } catch (e) {
      this.note('Could not change ' + name + ': ' + errorText(e), false, name);
    }
    await this.list();
  }

  private async remove(name: string): Promise<void> {
    if (!isServerName(name)) return this.note('"' + name + '" can only be removed in config.toml itself.', false, name);
    const ok = await vscode.window.showWarningMessage('Remove the MCP server "' + name + '" from the Codex config?',
      { modal: true, detail: 'It is removed from ~/.codex/config.toml, so also for the Codex CLI and the Eclipse plugin. Switching it off keeps it instead.' }, 'Remove');
    if (ok !== 'Remove') return;
    try {
      await this.write([{ keyPath: 'mcp_servers.' + name, value: null }]);
      this.d.log('[mcp] removed ' + name);
      this.note(name + ' removed.', true);
    } catch (e) {
      this.note('Could not remove ' + name + ': ' + errorText(e), false, name);
    }
    await this.list();
  }

  /** Starts the server and reports its tools (or why it did not start) as a note on its row. */
  async test(name: string): Promise<void> {
    if (!name) return;
    this.d.post({ kind: 'mcpNote', name, text: 'Starting…', ok: true, busy: true });
    try {
      const c = await this.d.appServer();
      const r = await c.mcpServerStatus(name);
      const s = (Array.isArray(r.data) ? r.data : []).find((x: Json) => x && x.name === name);
      if (!s) return this.note('Not started (switched off?)', false, name);
      if (s.toolsError) return this.note(String(s.toolsError), false, name);
      const tools = Object.keys(s.tools ?? {}).length;
      if (s.authStatus === 'notLoggedIn') return this.note('Needs a login: run "codex mcp login ' + name + '" in a terminal', false, name);
      this.note(tools + (tools === 1 ? ' tool' : ' tools'), true, name);
    } catch (e) {
      this.note(errorText(e), false, name);
    }
  }

  private async importVscode(key: string): Promise<void> {
    const v = this.vscodeList.find((x) => x.key === key);
    if (!v) return;
    if (v.problem) return this.note(v.key + ': ' + v.problem, false);
    const answers: Record<string, string> = {};
    for (const i of v.inputs) {
      const a = await vscode.window.showInputBox({ title: 'MCP server ' + v.name, prompt: i.description + ' (${input:' + i.id + '})', password: i.password, ignoreFocusOut: true });
      if (a === undefined) return;
      answers[i.id] = a;
    }
    await this.add(v.name, toCodexValue(v, answers, os.homedir(), process.env));
  }

  private async add(name: string, value: Json): Promise<void> {
    if (typeof value.command === 'string') {
      const full = resolveCommand(value.command, process.env, os.homedir());
      if (full !== value.command) { this.d.log('[mcp] ' + value.command + ' is not on PATH, using ' + full); value = { ...value, command: full }; }
    }
    try {
      const c = await this.d.appServer();
      const existing = ((await c.readConfig()).config ?? {}).mcp_servers ?? {};
      if (existing[name]) return this.note('A server "' + name + '" is already in the Codex config.', false);
      await this.write([{ keyPath: 'mcp_servers.' + name, value }]);
      this.d.log('[mcp] added ' + name);
    } catch (e) {
      return this.note('Could not add ' + name + ': ' + errorText(e), false);
    }
    await this.list();
    await this.test(name);
  }

  private async find(query: string): Promise<void> {
    if (!query || this.finding) return;
    this.finding = true;
    this.d.post({ kind: 'mcpFind', busy: true });
    let p: FindProposal | null = null;
    try {
      const c = await this.d.appServer();
      const existing = Object.keys(((await c.readConfig()).config ?? {}).mcp_servers ?? {});
      const answer = await this.d.find(buildFindPrompt(query, process.platform === 'win32' ? 'Windows' : process.platform, existing));
      p = parseFindAnswer(answer);
      if (p.command) p.command = resolveCommand(p.command, process.env, os.homedir()); // the confirmation shows what will really run
      if (existing.some((n) => n.toLowerCase() === p!.name.toLowerCase())) throw new Error('"' + p.name + '" is already in the Codex config.');
    } catch (e) {
      this.d.post({ kind: 'mcpFind', busy: false, error: errorText(e) });
      this.finding = false;
      return;
    }
    this.d.post({ kind: 'mcpFind', busy: false });
    this.finding = false;
    // the user sees exactly what will run on this computer before anything is written
    const detail = [
      (p.transport === 'http' ? 'URL: ' : 'Command: ') + proposalTarget(p),
      p.env.length ? 'Asks for: ' + p.env.map((e) => e.name).join(', ') : '',
      p.notes ? 'Notes: ' + p.notes : '',
      p.source ? 'Source: ' + p.source : '',
      '', 'Found by AI: check the command before adding it. It goes into ~/.codex/config.toml (also used by the Codex CLI and Eclipse).',
    ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
    const ok = await vscode.window.showWarningMessage('Add the MCP server "' + p.name + '" to Codex?', { modal: true, detail }, 'Add');
    if (ok !== 'Add') return;
    const envValues: Record<string, string> = {};
    for (const e of p.env) {
      const a = await vscode.window.showInputBox({ title: 'MCP server ' + p.name, prompt: e.name + (e.description ? ': ' + e.description : '') + ' (empty: skip)',
        password: e.secret, ignoreFocusOut: true });
      if (a === undefined) return;
      envValues[e.name] = a;
    }
    await this.add(p.name, proposalValue(p, envValues));
  }
}
