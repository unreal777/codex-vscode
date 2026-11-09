// MCP servers of the in-panel settings: rows of the Codex config, servers of VS Code's mcp.json (Copilot) that can be copied to Codex,
// and the "add by name" AI answer. No VS Code imports (unit tested).
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A Codex server as the page shows it (no env values or headers: they may hold secrets). */
export interface CodexServerRow {
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'http';
  /** command line or URL */
  target: string;
}

/** A server of VS Code's mcp.json. */
export interface VscodeServer {
  /** key in mcp.json ("oraios/serena") */
  key: string;
  /** name it gets in Codex ("serena") */
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers: Record<string, string>;
  /** ${input:id} variables used (VS Code asks for them; here the user is asked once) */
  inputs: { id: string; description: string; password: boolean }[];
  /** why it can not be copied ('' = it can) */
  problem: string;
  /** file it came from */
  source: string;
}

/** A Codex server name usable as a config key: letters, digits, _ and -. */
export const isServerName = (n: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(n);

/** Codex name for an mcp.json key: the last path segment, other characters as _. */
export function codexNameFor(key: string): string {
  const last = key.split('/').filter(Boolean).pop() ?? key;
  const n = last.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return n || 'server';
}

const quoteArg = (a: string) => (/^[^\s"']+$/.test(a) ? a : '"' + a.replace(/"/g, '\\"') + '"');
const commandLine = (command: string, args: string[]) => [command, ...args].map(quoteArg).join(' ');

/** Rows of config/read's mcp_servers, sorted by name. */
export function codexServerRows(servers: Json | null | undefined): CodexServerRow[] {
  const rows: CodexServerRow[] = [];
  for (const [name, s] of Object.entries(servers ?? {})) {
    if (!s || typeof s !== 'object') continue;
    const url = typeof s.url === 'string' ? s.url : '';
    const args = Array.isArray(s.args) ? s.args.map(String) : [];
    rows.push({ name, enabled: s.enabled !== false, transport: url ? 'http' : 'stdio', target: url || commandLine(String(s.command ?? ''), args) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** JSON with comments and trailing commas (VS Code's mcp.json). Throws on anything else. */
export function parseJsonc(text: string): Json {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // a BOM (Windows editors) is not JSON
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const strMap = (o: unknown): Record<string, string> => {
  const m: Record<string, string> = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Json)) if (v !== null && v !== undefined) m[k] = String(v);
  return m;
};

/** The servers of one mcp.json ({servers: {...}, inputs: [...]}). */
export function vscodeServers(json: Json, source: string): VscodeServer[] {
  const servers = json && typeof json.servers === 'object' && json.servers ? json.servers : {};
  const inputDefs = new Map<string, Json>();
  if (Array.isArray(json?.inputs)) for (const i of json.inputs) if (i && typeof i.id === 'string') inputDefs.set(i.id, i);
  const out: VscodeServer[] = [];
  for (const [key, s] of Object.entries(servers as Json)) {
    if (!s || typeof s !== 'object') continue;
    const url = typeof s.url === 'string' ? s.url : undefined;
    const type = String(s.type ?? (url ? 'http' : 'stdio'));
    const v: VscodeServer = {
      key, name: codexNameFor(key), transport: url ? 'http' : 'stdio',
      command: typeof s.command === 'string' ? s.command : undefined, args: Array.isArray(s.args) ? s.args.map(String) : [],
      env: strMap(s.env), url, headers: strMap(s.headers), inputs: [], problem: '', source,
    };
    const all = [v.command ?? '', ...v.args, ...Object.values(v.env), v.url ?? '', ...Object.values(v.headers)].join('\n');
    const ids = new Set<string>();
    for (const m of all.matchAll(/\$\{input:([^}]+)\}/g)) ids.add(m[1]);
    v.inputs = [...ids].map((id) => ({ id, description: String(inputDefs.get(id)?.description ?? id), password: inputDefs.get(id)?.password === true }));
    const other = [...all.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]).filter((x) => !/^(input:|env:|userHome$)/.test(x));
    if (type === 'sse') v.problem = 'SSE servers are not supported by Codex';
    else if (!url && !v.command) v.problem = 'no command or URL';
    else if (typeof s.envFile === 'string') v.problem = 'uses an envFile';
    else if (other.length) v.problem = 'uses ${' + other[0] + '}';
    out.push(v);
  }
  return out;
}

/** The Codex server that is the same as v (same name, URL, or command and arguments), else null. */
export function sameInCodex(v: VscodeServer, codex: Json | null | undefined): string | null {
  const entries = Object.entries(codex ?? {});
  for (const [name] of entries) if (name.toLowerCase() === v.name.toLowerCase()) return name;
  for (const [name, s] of entries) {
    if (!s || typeof s !== 'object') continue;
    if (v.url && s.url === v.url) return name;
    if (v.command && s.command === v.command && JSON.stringify((s.args ?? []).map(String)) === JSON.stringify(v.args)) return name;
  }
  return null;
}

/**
 * The command as Codex should start it: a bare name that is on PATH stays as it is; one that is not, but sits in a usual install folder
 * (uv tools in ~/.local/bin, npm, cargo, scoop), becomes that full path. VS Code can find such tools when Codex can not (another PATH).
 */
export function resolveCommand(command: string, env: NodeJS.ProcessEnv, home: string, platform = process.platform,
  exists: (p: string) => boolean = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }): string {
  if (!command || /[\\/]/.test(command)) return command;
  const win = platform === 'win32';
  const exts = win ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase())] : [''];
  const hit = (dir: string) => exts.map((e) => path.join(dir, command + e)).find((p) => exists(p));
  const pathVar = env.PATH ?? env.Path ?? '';
  for (const dir of pathVar.split(win ? ';' : ':').filter(Boolean)) if (hit(dir)) return command;
  const extra = [path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(home, 'scoop', 'shims')];
  if (win && env.APPDATA) extra.push(path.join(env.APPDATA, 'npm'));
  for (const dir of extra) { const p = hit(dir); if (p) return p; }
  return command;
}

/** The value for config mcp_servers.<name>: variables replaced (${input:id} from answers, ${env:X}, ${userHome}). */
export function toCodexValue(v: VscodeServer, answers: Record<string, string>, home: string, env: NodeJS.ProcessEnv): Json {
  const sub = (s: string) => s.replace(/\$\{(input:[^}]+|env:[^}]+|userHome)\}/g, (_m, x: string) =>
    x === 'userHome' ? home : x.startsWith('env:') ? env[x.slice(4)] ?? '' : answers[x.slice(6)] ?? '');
  const map = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, val]) => [k, sub(val)]));
  if (v.url) {
    const o: Json = { url: sub(v.url) };
    if (Object.keys(v.headers).length) o.http_headers = map(v.headers);
    return o;
  }
  const o: Json = { command: sub(v.command ?? ''), args: v.args.map(sub) };
  if (Object.keys(v.env).length) o.env = map(v.env);
  return o;
}

// ---- "add by name": a quick Codex run with web search proposes the config, the user confirms ----

export interface FindProposal {
  name: string;
  transport: 'stdio' | 'http';
  command: string;
  args: string[];
  url: string;
  /** variables the user has to fill in (API keys, ...) */
  env: { name: string; description: string; secret: boolean }[];
  /** what has to be installed first, caveats */
  notes: string;
  /** page the setup comes from */
  source: string;
}

export function buildFindPrompt(query: string, platform: string, existing: string[]): string {
  return [
    'Find how to add an MCP server to the Codex CLI config (config.toml, [mcp_servers.<name>]).',
    'The user asks for: ' + query.replace(/\s+/g, ' ').trim(),
    'Platform: ' + platform + '. MCP servers already configured: ' + (existing.length ? existing.join(', ') : 'none') + '.',
    'Rules:',
    '- Search the web for the official setup instructions (the project README or the vendor docs). Prefer the official server.',
    '- Do not run commands or change files.',
    '- stdio servers: the command and its arguments, e.g. npx -y <package>, uvx <package>, or the installed program. HTTP servers: the URL (streamable HTTP only, not SSE).',
    '- Do not put secrets into the arguments; list each needed environment variable in "env" instead.',
    '- Answer with one JSON object only, no code fences:',
    '{"found": true, "name": "<short config key: letters, digits, _ or ->", "transport": "stdio" or "http", "command": "<program>", "args": ["..."],',
    ' "url": "<for http>", "env": [{"name": "API_KEY", "description": "<where to get it>", "secret": true}], "notes": "<what must be installed first, one or two sentences>", "source": "<URL of the instructions>"}',
    '- If you can not find such an MCP server, answer {"found": false, "notes": "<why>"}.',
  ].join('\n');
}

/** The proposal of the answer; throws with a readable reason when there is none or it is unusable. */
export function parseFindAnswer(text: string): FindProposal {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Codex did not answer with a server configuration');
  let o: Json;
  try { o = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('Codex did not answer with a server configuration'); }
  if (o.found === false) throw new Error(String(o.notes || 'Codex found no such MCP server'));
  const name = codexNameFor(String(o.name ?? ''));
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  const transport: 'stdio' | 'http' = o.transport === 'http' || (url && !o.command) ? 'http' : 'stdio';
  const p: FindProposal = {
    name, transport, command: transport === 'stdio' ? String(o.command ?? '').trim() : '', args: transport === 'stdio' && Array.isArray(o.args) ? o.args.map(String) : [],
    url: transport === 'http' ? url : '',
    env: Array.isArray(o.env) ? o.env.filter((e: Json) => e && typeof e.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.name))
      .map((e: Json) => ({ name: e.name, description: String(e.description ?? ''), secret: e.secret !== false })) : [],
    notes: String(o.notes ?? ''), source: String(o.source ?? ''),
  };
  if (transport === 'stdio' && !p.command) throw new Error('Codex gave no command for the server');
  if (transport === 'http' && !/^https?:\/\//i.test(p.url)) throw new Error('Codex gave no usable URL for the server');
  return p;
}

/** The value for config mcp_servers.<name> of a confirmed proposal with the user's environment values. */
export function proposalValue(p: FindProposal, envValues: Record<string, string>): Json {
  if (p.transport === 'http') return { url: p.url };
  const o: Json = { command: p.command, args: p.args };
  const env = Object.fromEntries(Object.entries(envValues).filter(([, v]) => v !== ''));
  if (Object.keys(env).length) o.env = env;
  return o;
}

/** The command line or URL of a proposal, for the confirmation. */
export const proposalTarget = (p: FindProposal): string => (p.transport === 'http' ? p.url : commandLine(p.command, p.args));
