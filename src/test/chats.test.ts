// 0.7.0: chats beside the open one (background replies, unread marks, today's tabs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { addToday, dayKey, pruneUnread, removeToday, tabsOf, todayOf, UNREAD_MAX_AGE_MS } from '../core/chatList';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

test('unread marks go away after 3 days', () => {
  const now = 10 * UNREAD_MAX_AGE_MS;
  assert.deepEqual(pruneUnread({ a: now - 1000, b: now - UNREAD_MAX_AGE_MS - 1, c: 'x' as unknown as number }, now), { a: now - 1000 });
  assert.deepEqual(pruneUnread(undefined, now), {});
});

test("today's chats: local day, kept order, titles, hide, tabs with marks", () => {
  assert.equal(dayKey(new Date(2026, 10, 9, 23, 59)), '2026-11-09');
  assert.deepEqual(todayOf({ day: '2026-11-08', chats: [{ id: 'old', title: 'x' }] }, '2026-11-09'), { day: '2026-11-09', chats: [] }, 'yesterday is gone');
  let t = todayOf(undefined, '2026-11-09');
  t = addToday(t, 'a', '');
  t = addToday(t, 'b', 'Second');
  assert.equal(addToday(t, 'b', 'Second'), t, 'nothing changed: same object');
  t = addToday(t, 'a', 'First');
  assert.deepEqual(t.chats, [{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }], 'order kept, title filled in');
  const tabs = tabsOf(addToday(t, 'c', ''), { b: 1 }, ['c'], (id) => (id === 'c' ? 'From session' : null));
  assert.deepEqual(tabs, [
    { id: 'a', title: 'First', unread: false, running: false },
    { id: 'b', title: 'Second', unread: true, running: false },
    { id: 'c', title: 'From session', unread: false, running: true },
  ]);
  assert.deepEqual(removeToday(t, 'a').chats.map((c) => c.id), ['b']);
});

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (m.method === 'thread/resume') {
    const id = m.params.threadId;
    const turns = id === 'A' ? [{ id: 'tA', status: 'inProgress', items: [] }] : [{ id: 't0', status: 'completed', items: [] }];
    send({ id: m.id, result: { thread: { id, name: 'Chat ' + id, turns }, cwd: 'D:\\\\p' } });
  } else send({ id: m.id, result: { goal: null } });
});
`;

test('session: leaving a running chat keeps its reply in the background; its end, approvals and reopening', async () => {
  const dir = tmpDir('chats-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const calls: string[] = [];
  const host = {
    log: () => {}, projectName: () => 'p', version: '0', codexBase: '', permissionsPref: () => 'ask', refreshHook: () => {},
    threadChanged: (id: string | null) => calls.push('opened ' + id),
    chatsChanged: () => calls.push('changed'),
    turnDone: (id: string, bg: boolean, status: string) => calls.push('done ' + id + ' ' + bg + ' ' + status),
    needsApproval: (id: string) => calls.push('approval ' + id),
  } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  try {
    // chat A is open and its reply runs; New chat leaves it running (no interrupt)
    priv._threadId = 'A'; priv.turnId = 'tA'; priv._threadCwd = 'D:\\p';
    s.newChat();
    assert.equal(s.threadId, null);
    assert.equal(s.isRunning, false);
    assert.deepEqual(s.runningChats(), ['A']);
    assert.ok(calls.includes('changed'));

    // A's events do not reach the new chat; an approval of A is kept and announced
    events.length = 0;
    priv.handleNotification('item/agentMessage/delta', { threadId: 'A', itemId: 'i', delta: 'x' });
    priv.handleApprovalRequest({ id: 7, method: 'item/commandExecution/requestApproval', params: { threadId: 'A', command: 'ls' } });
    assert.equal(events.length, 0, 'nothing of A is shown in the new chat');
    assert.ok(calls.includes('approval A'));

    // reopening A: its turn is running again, the approval is shown
    calls.length = 0;
    assert.equal(await s.resume('A'), true);
    assert.equal(s.threadId, 'A');
    assert.equal(s.isRunning, true);
    assert.deepEqual(s.runningChats(), ['A']);
    assert.equal(s.titleOf('A'), 'Chat A');
    const kinds = events.map((e) => e.kind + (e.method ? ':' + e.method : ''));
    assert.ok(kinds.indexOf('thread') < kinds.indexOf('notification:turn/started'), kinds.join());
    assert.equal(events.find((e) => e.kind === 'serverRequest').id, 7);

    // opening B leaves A in the background again; A ends there: turnDone(background)
    events.length = 0;
    assert.equal(await s.resume('B'), true);
    assert.deepEqual(s.runningChats(), ['A']);
    priv.handleNotification('turn/completed', { threadId: 'A', turn: { id: 'tA', status: 'completed' } });
    assert.ok(calls.includes('done A true completed'));
    assert.deepEqual(s.runningChats(), []);
    assert.ok(!events.some((e) => e.kind === 'notification'), 'A\'s end is not shown in B');

    // the open chat's own end: turnDone(not background)
    priv.turnId = 'tB';
    priv.handleNotification('turn/completed', { threadId: 'B', turn: { id: 'tB', status: 'failed' } });
    assert.ok(calls.includes('done B false failed'));
    assert.equal(s.isRunning, false);
  } finally {
    c.close();
  }
});

test('page: tabs, unread dots, last answer, running reply of a loaded chat', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.match(app, /id="tabs"/);
  assert.ok(app.includes("topbar.classList.toggle('with-tabs', show)"), '0.7.1: tabs in the top bar');
  assert.match(app, /case 'chats':/);
  assert.match(app, /case 'scrollToLastAnswer':/);
  assert.match(app, /turn\.status === 'inProgress' && idx === ev\.turns\.length - 1/);
  assert.match(app, /type: 'chatTitle'/);
  assert.match(app, /type: 'tabClose'/);
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.match(panel, /case 'chatTitle':/);
  assert.match(panel, /case 'tabClose':/);
});

test('0.7.2: kept chats for a fast tab switch, references drawn by the overlay', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes('function stashChat()') && app.includes('function restoreChat(id)') && app.includes('function openChat(id)'));
  assert.ok(app.includes("if (p && p.threadId && state.threadId && p.threadId !== state.threadId) return;"), 'events of the chat just left are not drawn');
  assert.ok(app.includes("id: 'sym-tip'"), 'own tooltip for references');
  const css = fs.readFileSync(path.join(root, 'web', 'app.css'), 'utf8');
  assert.ok(css.includes('#input.with-refs { color: transparent;'), 'the overlay draws the text when there are references');
});

test('0.7.3: Diff of a changed file opens the git change view first', () => {
  const diff = fs.readFileSync(path.join(root, 'src', 'diff.ts'), 'utf8');
  assert.ok(diff.includes("executeCommand('git.openChange', uri)"));
  assert.ok(diff.indexOf('if (await this.openGitChange(file)) return;') > 0, 'tried before the rebuilt diff');
});
