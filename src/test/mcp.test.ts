// 0.6.0: MCP servers in the settings (Codex config rows, VS Code mcp.json import, "add by name" answer, config requests).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { execArgs } from '../core/commitMessage';
import {
  buildFindPrompt, codexNameFor, codexServerRows, isServerName, parseFindAnswer, parseJsonc, proposalTarget, proposalValue, resolveCommand, sameInCodex,
  toCodexValue, vscodeServers,
} from '../core/mcpServers';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

test('Codex rows: name, on/off, stdio command line or URL, sorted; no env values', () => {
  const rows = codexServerRows({
    zeta: { url: 'https://x/mcp', enabled: true, http_headers: { Authorization: 'secret' } },
    alpha: { command: 'npx', args: ['-y', 'drawio mcp'], env: { KEY: 'secret' }, enabled: false },
    bad: 'x',
  });
  assert.deepEqual(rows, [
    { name: 'alpha', enabled: false, transport: 'stdio', target: 'npx -y "drawio mcp"' },
    { name: 'zeta', enabled: true, transport: 'http', target: 'https://x/mcp' },
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /secret/);
});

test('names: last segment of the mcp.json key, safe characters only', () => {
  assert.equal(codexNameFor('oraios/serena'), 'serena');
  assert.equal(codexNameFor('io.github.upstash/context7'), 'context7');
  assert.equal(codexNameFor('microsoft/playwright-mcp'), 'playwright-mcp');
  assert.equal(codexNameFor('my server!'), 'my_server');
  assert.equal(codexNameFor('///'), 'server');
  assert.ok(isServerName('chrome-devtools') && isServerName('a_b9'));
  assert.ok(!isServerName('a.b') && !isServerName('') && !isServerName('a b'));
});

test('mcp.json: comments and trailing commas, inputs, problems', () => {
  const json = parseJsonc(`{
    // user servers
    "servers": {
      "oraios/serena": { "type": "stdio", "command": "serena", "args": ["start-mcp-server", "--context", "ide-assistant"], },
      "io.github.upstash/context7": { "command": "npx", "args": ["@upstash/context7-mcp"], "env": { "CONTEXT7_API_KEY": "\${input:CONTEXT7_API_KEY}" } },
      "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/" }, /* block */
      "old": { "type": "sse", "url": "https://x/sse" },
      "ws": { "command": "node", "args": ["\${workspaceFolder}/s.js"] },
      "home": { "command": "\${userHome}/bin/x", "env": { "P": "\${env:PATH_X}" } },
      "url-with-slashes": { "url": "https://a//b" },
    },
    "inputs": [{ "id": "CONTEXT7_API_KEY", "type": "promptString", "description": "Context7 key", "password": true }],
  }`);
  const v = vscodeServers(json, 'user');
  assert.deepEqual(v.map((x) => x.name), ['serena', 'context7', 'github', 'old', 'ws', 'home', 'url-with-slashes']);
  assert.equal(v[0].problem, '');
  assert.deepEqual(v[0].args, ['start-mcp-server', '--context', 'ide-assistant']);
  assert.deepEqual(v[1].inputs, [{ id: 'CONTEXT7_API_KEY', description: 'Context7 key', password: true }]);
  assert.equal(v[2].transport, 'http');
  assert.match(v[3].problem, /SSE/);
  assert.match(v[4].problem, /workspaceFolder/);
  assert.equal(v[5].problem, '');
  assert.equal(v[6].url, 'https://a//b', 'a // inside a string is not a comment');
  assert.deepEqual(parseJsonc('﻿{"servers": {}}'), { servers: {} }, 'a BOM is skipped');

  assert.deepEqual(toCodexValue(v[1], { CONTEXT7_API_KEY: 'k1' }, 'C:/Users/u', {}), { command: 'npx', args: ['@upstash/context7-mcp'], env: { CONTEXT7_API_KEY: 'k1' } });
  assert.deepEqual(toCodexValue(v[5], {}, 'C:/Users/u', { PATH_X: 'p' }), { command: 'C:/Users/u/bin/x', args: [], env: { P: 'p' } });
  assert.deepEqual(toCodexValue(v[2], {}, '', {}), { url: 'https://api.githubcopilot.com/mcp/' });
  assert.deepEqual(toCodexValue(v[0], {}, '', {}), { command: 'serena', args: ['start-mcp-server', '--context', 'ide-assistant'] });
});

test('resolveCommand: on PATH stays bare, else a usual install folder gives the full path, paths unchanged', () => {
  const files = new Set([path.join('C:\\bin', 'node.exe'), path.join('C:\\Users\\u', '.local', 'bin', 'serena.exe'), path.join('C:\\AppData', 'npm', 'x.cmd')]);
  const env = { PATH: 'C:\\bin;C:\\other', PATHEXT: '.EXE;.CMD', APPDATA: 'C:\\AppData' };
  const r = (c: string) => resolveCommand(c, env, 'C:\\Users\\u', 'win32', (p) => files.has(p));
  assert.equal(r('node'), 'node');
  assert.equal(r('serena'), path.join('C:\\Users\\u', '.local', 'bin', 'serena.exe'));
  assert.equal(r('x'), path.join('C:\\AppData', 'npm', 'x.cmd'));
  assert.equal(r('missing'), 'missing');
  assert.equal(r('C:\\tools\\a.exe'), 'C:\\tools\\a.exe');
  assert.equal(r(''), '');
});

test('sameInCodex: by name (any case), URL, or command with the same arguments', () => {
  const [serena, ctx, gh] = vscodeServers({ servers: {
    'oraios/serena': { command: 'serena', args: ['a'] },
    'up/context7': { command: 'npx', args: ['@upstash/context7-mcp'] },
    github: { url: 'https://g/mcp' },
  } }, 'user');
  const codex = { Serena: { command: 'x' }, ctx7: { command: 'npx', args: ['@upstash/context7-mcp'] }, gh2: { url: 'https://g/mcp' } };
  assert.equal(sameInCodex(serena, codex), 'Serena');
  assert.equal(sameInCodex(ctx, codex), 'ctx7');
  assert.equal(sameInCodex(gh, codex), 'gh2');
  assert.equal(sameInCodex(ctx, { other: { command: 'npx', args: ['other'] } }), null);
});

test('add by name: prompt, answer (fenced, http, not found, unusable), value and target', () => {
  const prompt = buildFindPrompt('  serena\n code tools ', 'Windows', ['drawio', 'unityMCP']);
  assert.match(prompt, /The user asks for: serena code tools\n/);
  assert.match(prompt, /Platform: Windows\. MCP servers already configured: drawio, unityMCP\./);
  assert.match(prompt, /Do not put secrets into the arguments/);

  const p = parseFindAnswer('```json\n{"found": true, "name": "oraios/serena", "transport": "stdio", "command": "uvx", "args": ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "codex"],'
    + ' "env": [{"name": "TOKEN", "description": "from x"}, {"name": "bad name"}], "notes": "needs uv", "source": "https://github.com/oraios/serena"}\n```');
  assert.equal(p.name, 'serena');
  assert.equal(p.transport, 'stdio');
  assert.deepEqual(p.env, [{ name: 'TOKEN', description: 'from x', secret: true }]);
  assert.equal(proposalTarget(p), 'uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context codex');
  assert.deepEqual(proposalValue(p, { TOKEN: '' }), { command: 'uvx', args: p.args }, 'an empty value is skipped');
  assert.deepEqual(proposalValue(p, { TOKEN: 't' }).env, { TOKEN: 't' });

  const h = parseFindAnswer('{"found": true, "name": "github", "url": "https://api.githubcopilot.com/mcp/"}');
  assert.equal(h.transport, 'http');
  assert.deepEqual(proposalValue(h, {}), { url: 'https://api.githubcopilot.com/mcp/' });

  assert.throws(() => parseFindAnswer('{"found": false, "notes": "no such server"}'), /no such server/);
  assert.throws(() => parseFindAnswer('I could not find it'), /did not answer/);
  assert.throws(() => parseFindAnswer('{"found": true, "name": "x", "transport": "stdio"}'), /no command/);
  assert.throws(() => parseFindAnswer('{"found": true, "name": "x", "transport": "http", "url": "ftp://x"}'), /no usable URL/);
});

test('codex exec: extra -c overrides (web search of "add by name") come after the MCP switches', () => {
  assert.deepEqual(execArgs('o.txt', 'gpt-6-luna', 'low', ['drawio'], ['web_search="live"']).slice(-5),
    ['-c', 'mcp_servers.drawio.enabled=false', '-c', 'web_search="live"', '-']);
});

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id !== undefined) process.stdout.write(JSON.stringify({ id: m.id, result: { method: m.method, echo: m.params } }) + '\\n');
});
`;

test('config requests: config/read, config/batchWrite (replace, null removes, reload), mcpServer reload and status', async () => {
  const dir = tmpDir('mcp-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  try {
    assert.deepEqual((await c.readConfig()).echo, { includeLayers: false });
    const w = await c.writeConfig([{ keyPath: 'mcp_servers.serena', value: { command: 'serena' } }, { keyPath: 'mcp_servers.old', value: null }]);
    assert.equal(w.method, 'config/batchWrite');
    assert.deepEqual(w.echo, { edits: [
      { keyPath: 'mcp_servers.serena', mergeStrategy: 'replace', value: { command: 'serena' } },
      { keyPath: 'mcp_servers.old', mergeStrategy: 'replace', value: null },
    ], reloadUserConfig: true });
    assert.equal((await c.reloadMcpServers()).method, 'config/mcpServer/reload');
    const s = await c.mcpServerStatus('serena');
    assert.equal(s.method, 'mcpServerStatus/list');
    assert.deepEqual(s.echo, { detail: 'toolsAndAuthOnly', serverName: 'serena' });
  } finally {
    c.close();
  }
});

test('page and host know the MCP messages', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  for (const t of ['mcpList', 'mcpToggle', 'mcpRemove', 'mcpTest', 'mcpImport', 'mcpFind']) {
    assert.match(app, new RegExp("type: '" + t + "'"), 'page sends ' + t);
  }
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.match(panel, /case 'mcpList': case 'mcpToggle': case 'mcpRemove': case 'mcpTest': case 'mcpImport': case 'mcpFind':/);
  assert.match(app, /case 'mcp': case 'mcpNote': case 'mcpFind': onMcp\(ev\)/);
});

test('0.6.1: input lists and pasted symbol references are wired (page and host)', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.match(app, /function listKey\(e\)/);
  assert.match(app, /type: 'pasteRef'/);
  assert.match(app, /case 'pasteRef': onPasteRef\(ev\)/);
  assert.match(app, /id="input-hl"/);
  assert.match(app, /Referenced \(\?:files\|symbols\)/);
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.match(panel, /case 'pasteRef'/);
  assert.ok(panel.includes("'Referenced symbols (#sym:name = file:line):\\n'"), 'host writes the symbol lines');
});
