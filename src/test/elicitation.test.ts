// MCP tool approvals: Codex asks with the server request mcpServer/elicitation/request (until 0.9.0 Codexter answered
// "Unsupported by Codex Panel", so Codex reported "user rejected MCP tool call"). Fake app-server only, no real turns.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ELICITATION_METHOD, elicitationResponse, formDefaults, persistOptions } from '../core/elicitation';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

// Shape as Codex 0.167.2 sends it for an MCP tool call (McpServerElicitationRequestParams, form mode, empty schema).
const TOOL_APPROVAL = {
  threadId: 'T', turnId: 't1', serverName: 'serena', mode: 'form',
  message: 'Allow the serena MCP server to run tool "replace_content"?',
  requestedSchema: { type: 'object', properties: {} },
  _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'], tool_title: 'replace_content', tool_params: { relative_path: 'a.ts', needle: 'x', repl: 'y' } },
};

test('elicitation: response shape for accept, accept for session, decline, url mode, form defaults', () => {
  assert.deepEqual(elicitationResponse(TOOL_APPROVAL, 'accept'), { action: 'accept', content: {} });
  assert.deepEqual(elicitationResponse(TOOL_APPROVAL, 'acceptForSession'), { action: 'accept', content: {}, _meta: { persist: 'session' } });
  assert.deepEqual(elicitationResponse(TOOL_APPROVAL, 'decline'), { action: 'decline', content: null });
  assert.deepEqual(elicitationResponse(TOOL_APPROVAL, 'cancel'), { action: 'cancel', content: null });
  const noPersist = { ...TOOL_APPROVAL, _meta: { codex_approval_kind: 'mcp_tool_call' } };
  assert.deepEqual(elicitationResponse(noPersist, 'acceptForSession'), { action: 'accept', content: {} }, 'no persist offered: nothing remembered');
  assert.deepEqual(persistOptions({ _meta: { persist: 'session' } }), ['session']);
  assert.deepEqual(persistOptions({}), []);
  assert.deepEqual(elicitationResponse({ mode: 'url', url: 'https://x', elicitationId: 'e', message: 'm' }, 'accept'), { action: 'accept', content: null });
  assert.deepEqual(formDefaults({ requestedSchema: { type: 'object', properties: { a: { type: 'string', default: 'v' }, b: { type: 'number' } } } }), { a: 'v' });
});

const SERVER = `
const fs = require('node:fs');
const path = require('node:path');
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const tool = ${JSON.stringify(TOOL_APPROVAL)};
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') {
    send({ id: m.id, result: { userAgent: 'fake' } });
    send({ id: 50, method: '${ELICITATION_METHOD}', params: tool });
    send({ id: 51, method: '${ELICITATION_METHOD}', params: tool });
    send({ id: 52, method: '${ELICITATION_METHOD}', params: { threadId: 'T', serverName: 'docs', mode: 'url', elicitationId: 'e1', message: 'Sign in', url: 'https://example.com/auth' } });
  } else if (m.method !== undefined) {
    if (m.id !== undefined) send({ id: m.id, result: {} });
  } else {
    fs.appendFileSync(path.join(__dirname, 'answers.jsonl'), JSON.stringify(m) + '\\n');
  }
});
`;

function fakeCodex(dir: string): string {
  fs.writeFileSync(path.join(dir, 'server.js'), SERVER);
  if (process.platform === 'win32') {
    const f = path.join(dir, 'codex.cmd');
    fs.writeFileSync(f, '@"' + process.execPath + '" "%~dp0server.js"\r\n');
    return f;
  }
  const f = path.join(dir, 'codex');
  fs.writeFileSync(f, '#!/bin/sh\nexec "' + process.execPath + '" "$(dirname "$0")/server.js"\n', { mode: 0o755 });
  return f;
}

async function until(what: string, ok: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('session: an MCP tool approval reaches the page as a serverRequest and the decision goes back as an elicitation response', async () => {
  const dir = tmpDir('elicit-server-');
  const exe = fakeCodex(dir);
  const host = {
    codexBase: dir, version: '0', codexPath: () => exe, managedEnabled: () => false, updateDays: () => 0,
    permissionsPref: () => 'ask', imageDir: () => dir, proxy: () => ({}), processEnv: () => ({}), workspaceDir: () => dir,
    projectName: () => 'p', openExternal: () => {}, refreshHook: () => {}, log: () => {},
  } as unknown as SessionHost;
  const s = new CodexSession(host);
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  try {
    await s.appServer();
    await until('3 approval cards', () => events.filter((e) => e.kind === 'serverRequest').length === 3);
    const reqs = events.filter((e) => e.kind === 'serverRequest');
    assert.deepEqual(reqs.map((e) => e.method), [ELICITATION_METHOD, ELICITATION_METHOD, ELICITATION_METHOD]);
    assert.equal(reqs[0].params._meta.codex_approval_kind, 'mcp_tool_call');
    s.approve(String(reqs[0].id), 'acceptForSession');
    s.approve(String(reqs[1].id), 'decline');
    s.approve(String(reqs[2].id), 'accept');
    s.approve(String(reqs[2].id), 'accept');   // a second click is ignored (the request is gone)
    const file = path.join(dir, 'answers.jsonl');
    await until('3 answers', () => fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim().split('\n').length >= 3);
    await new Promise((r) => setTimeout(r, 200));
    const answers = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(answers.length, 3);
    assert.ok(answers.every((a) => a.error === undefined), 'no "Unsupported by Codex Panel" error any more');
    const byId = new Map(answers.map((a) => [a.id, a.result]));
    assert.deepEqual(byId.get(50), { action: 'accept', content: {}, _meta: { persist: 'session' } });
    assert.deepEqual(byId.get(51), { action: 'decline', content: null });
    assert.deepEqual(byId.get(52), { action: 'accept', content: null });
  } finally {
    s.dispose();
  }
});

test('page: elicitations get an approval card (tool name, arguments, Allow / Allow for session / Deny) and the link opens outside', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.match(app, /method === 'mcpServer\/elicitation\/request'\) \{\s*return elicitationCard\(id, method, p\)/);
  assert.match(app, /codex_approval_kind === 'mcp_tool_call'/);
  assert.match(app, /persist\.includes\('session'\)/, 'Allow for session only when Codex offers to remember it');
  assert.match(app, /'data-url': p\.url/, 'a URL elicitation opens through openUrl, not inside the webview');
  assert.match(app, /if \(forSession\) btns\.append/);
});
