// 0.3.0: history actions (archive / unarchive / delete), settings contributions, web script list, drop target parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { candidatesOf, uriOf } from '../core/dropUris';
import { WEB_SCRIPTS } from '../core/webScripts';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (m.params && m.params.threadId === 'bad') send({ id: m.id, error: { code: -32000, message: 'no such thread' } });
  else send({ id: m.id, result: { method: m.method, echo: m.params, data: [], nextCursor: null, thread: { id: m.params && m.params.threadId } } });
});
`;

async function server(): Promise<AppServerClient> {
  const dir = tmpDir('hist-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  return c;
}

test('archive / unarchive / delete send thread/* with {threadId}; listThreads passes the archived flag', async () => {
  const c = await server();
  try {
    assert.deepEqual((await c.archiveThread('t1')).echo, { threadId: 't1' });
    assert.equal((await c.archiveThread('t1')).method, 'thread/archive');
    const un = await c.unarchiveThread('t2');
    assert.equal(un.method, 'thread/unarchive');
    assert.deepEqual(un.echo, { threadId: 't2' });
    assert.equal(un.thread.id, 't2');
    const del = await c.deleteThread('t3');
    assert.equal(del.method, 'thread/delete');
    assert.deepEqual(del.echo, { threadId: 't3' });
    assert.equal((await c.listThreads(null, null, 10, true)).echo.archived, false);
    assert.equal((await c.listThreads(null, null, 10, true, true)).echo.archived, true);
  } finally {
    c.close();
  }
});

test('session threadAction: ok event, error event, open chat is forgotten, survey cache dropped', async () => {
  const c = await server();
  const host = { log: () => {}, projectName: (d: string | null) => d ?? '', version: '0', codexBase: '' } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  priv.projectSurvey = [{ cwd: 'x' }];
  priv.projectSurveyAt = Date.now();
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const waitFor = async (pred: () => boolean) => { for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20)); };
  try {
    priv._threadId = 'open';
    s.threadAction('archive', 'open');
    await waitFor(() => events.some((e) => e.kind === 'historyProjects'));
    const ok = events.find((e) => e.kind === 'threadAction');
    assert.deepEqual(ok, { kind: 'threadAction', action: 'archive', threadId: 'open', ok: true });
    assert.equal(s.threadId, null, 'the open chat is forgotten');
    assert.ok(events.some((e) => e.kind === 'newChat'));
    assert.deepEqual(events.find((e) => e.kind === 'historyProjects').data, [], 'survey reloaded from the server');
    events.length = 0;
    priv._threadId = 'other';
    s.threadAction('delete', 'bad');
    await waitFor(() => events.some((e) => e.kind === 'threadAction'));
    const bad = events.find((e) => e.kind === 'threadAction');
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'no such thread');
    assert.equal(s.threadId, 'other', 'a failed action or another chat leaves the open chat alone');
  } finally {
    c.close();
  }
});

test('last chat: open / new chat report threadChanged; a quiet reopen fails silently and skips when a chat is open', async () => {
  const c = await server();
  const changed: (string | null)[] = [];
  const host = { log: () => {}, projectName: (d: string | null) => d ?? '', version: '0', codexBase: '',
    permissionsPref: () => 'ask', threadChanged: (id: string | null) => changed.push(id) } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  try {
    await s.resume('t1', true);
    assert.equal(s.threadId, 't1');
    assert.deepEqual(changed, ['t1']);
    await s.resume('t2', true);
    assert.equal(s.threadId, 't1', 'a quiet reopen never replaces an open chat');
    s.newChat();
    assert.deepEqual(changed, ['t1', null]);
    await s.resume('bad', true);
    assert.equal(s.threadId, null);
    assert.deepEqual(changed, ['t1', null, null]);
    assert.ok(!events.some((e) => e.kind === 'error'), 'no error shown for a quiet reopen');
    await s.resume('bad');
    assert.ok(events.some((e) => e.kind === 'error'), 'opening from the history still shows the error');
  } finally {
    c.close();
  }
});

test('package.json: the three settings and the attach-files drop target', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const p = pkg.contributes.configuration.properties;
  assert.equal(p['codexPanel.defaultModel'].type, 'string');
  assert.equal(p['codexPanel.defaultModel'].default, '');
  assert.equal(p['codexPanel.defaultReasoningEffort'].type, 'string');
  assert.equal(p['codexPanel.defaultReasoningEffort'].default, '');
  assert.deepEqual(p['codexPanel.defaultReasoningEffort'].enum, ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
  assert.equal(p['codexPanel.defaultReasoningEffort'].enumDescriptions.length, 7);
  assert.equal(p['codexPanel.hiddenModels'].type, 'array');
  assert.equal(p['codexPanel.hiddenModels'].items.type, 'string');
  assert.deepEqual(p['codexPanel.hiddenModels'].default, []);
  const v = pkg.contributes.views;
  assert.equal(v.codexPanel[1].id, 'codexPanel.drop');
  assert.equal(v.codexPanel[1].when, 'codexPanel.noSecondarySidebar');
  assert.equal(v.codexPanelSecondary[1].id, 'codexPanel.dropSecondary');
  assert.equal(v.codexPanelSecondary[1].when, '!codexPanel.noSecondarySidebar');
  assert.equal(v.codexPanel[0].initialSize, 12);
  assert.equal(v.codexPanel[1].initialSize, 1);
  assert.equal(v.codexPanelSecondary[0].name, 'Chat');
  assert.ok(!pkg.contributes.commands.some((c: any) => c.command === 'codexPanel.removeAttachment'));
  assert.equal(pkg.contributes.menus['view/item/context'], undefined);
  assert.equal(pkg.displayName.startsWith('Codexter'), true);
});

test('the panel loads exactly the scripts of web/index.html, in order', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(WEB_SCRIPTS, srcs);
  assert.ok(WEB_SCRIPTS.includes('dropdata.js'));
});

test('drop target: uri-list, resourceurls, codeeditors, plain text fallback', () => {
  const m = (o: Record<string, string>) => new Map(Object.entries(o));
  assert.deepEqual(candidatesOf(m({ 'text/uri-list': '# c\r\nfile:///c%3A/a.txt\r\nfile:///c%3A/b.txt\r\n' })), ['file:///c%3A/a.txt', 'file:///c%3A/b.txt']);
  assert.deepEqual(candidatesOf(m({ resourceurls: '["file:///c%3A/a.txt"]', 'text/uri-list': 'file:///c%3A/a.txt' })), ['file:///c%3A/a.txt']);
  assert.deepEqual(candidatesOf(m({ codeeditors: JSON.stringify([{ resource: 'file:///c%3A/x.ts' }, { resource: { scheme: 'file', path: '/c:/y.ts', fsPath: 'c:\y.ts' } }]) })), ['file:///c%3A/x.ts', 'c:\y.ts']);
  assert.deepEqual(candidatesOf(m({ 'text/plain': 'C:\p\z.txt' })), ['C:\p\z.txt']);
  assert.deepEqual(candidatesOf(m({ codeeditors: 'not json' })), []);
  assert.equal(uriOf({ scheme: 'file', path: '/c:/q' }), 'file:///c:/q');
  assert.equal(uriOf(null), '');
});
