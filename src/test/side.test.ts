// 0.9.1: Clarify side chats: the link store, the read-only fork + turns, events kept out of the main chat, hidden from the History.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { addSide, findSide, forgetChat, isSideRow, linksOf, normalizeStore, SIDE_MARK, SIDE_PREFIX, sideIds, SideStore, sideTitle, sideTurns } from '../core/sideChats';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');
const entry = (id: string, base = 2) => ({ id, at: 1000, title: SIDE_PREFIX + 'Clarify: x', base });

test('store: links answer -> side chats, per chat, oldest first, no duplicates', () => {
  let s: SideStore = {};
  s = addSide(s, 'chat1', 't1', entry('a'));
  s = addSide(s, 'chat1', 't1', entry('b'));
  s = addSide(s, 'chat1', 't2', entry('c'));
  s = addSide(s, 'chat1', 't1', entry('a'));   // the same id again replaces, does not double
  assert.deepEqual(linksOf(s, 'chat1').t1.map((l) => l.id), ['b', 'a']);
  assert.deepEqual(linksOf(s, 'chat1').t2.map((l) => l.id), ['c']);
  assert.deepEqual(Object.keys(linksOf(s, 'other')), []);
  assert.deepEqual([...sideIds(s)].sort(), ['a', 'b', 'c']);
  assert.equal(findSide(s, 'c')!.turn, 't2');
  assert.equal(findSide(s, 'c')!.parent, 'chat1');
  assert.equal(findSide(s, 'zzz'), null);
  assert.ok(!('base' in linksOf(s, 'chat1').t1[0]), 'the page gets id, time and title only');
});

test('store: forgetting a side chat or a parent chat; a damaged store is repaired', () => {
  let s = addSide(addSide({}, 'chat1', 't1', entry('a')), 'chat1', 't2', entry('c'));
  s = addSide(s, 'chat2', 't9', entry('d'));
  assert.deepEqual(Object.keys(linksOf(forgetChat(s, 'a'), 'chat1')), ['t2']);
  assert.deepEqual(Object.keys(forgetChat(s, 'chat1')), ['chat2']);
  const bad = normalizeStore({ chat1: { t1: [{ id: 'ok', base: 3 }, { id: 5 }, null, { base: 1 }], t2: 'x' }, chat2: 7, chat3: { t: [] } });
  assert.deepEqual(bad, { chat1: { t1: [{ id: 'ok', at: 0, title: '', base: 3 }] } });
  assert.deepEqual(normalizeStore(undefined), {});
  assert.deepEqual(normalizeStore('nope'), {});
});

test('store: the oldest parent chats go when it is full', () => {
  let s: SideStore = {};
  for (let i = 0; i < 405; i++) s = addSide(s, 'chat' + i, 't', entry('s' + i));
  assert.equal(Object.keys(s).length, 400);
  assert.ok(!('chat0' in s) && 'chat404' in s);
});

test('History filter: rows of side chats are recognised by id and, without the store, by their name', () => {
  const ids = new Set(['a']);
  assert.equal(isSideRow({ id: 'a', name: 'x' }, ids), true);
  assert.equal(isSideRow({ id: 'zz', name: SIDE_PREFIX + 'Clarify: foo' }, ids), true);
  assert.equal(isSideRow({ id: 'zz', name: 'Fix login (fork)' }, ids), false);
  assert.equal(isSideRow({ id: 'zz', name: null, preview: 'hi' }, ids), false);
  assert.equal(sideTitle('  The   export\nwrites  a file ').startsWith(SIDE_PREFIX + 'Clarify: The export writes a file'), true);
  assert.ok(sideTitle('y'.repeat(300)).length < 90);
});

test('side turns: only the turns after the main chat\'s own, the steering mark is cut, commentary is not the answer', () => {
  const user = (text: string) => ({ type: 'userMessage', content: [{ type: 'text', text }] });
  const turns = [
    { id: 'm1', items: [user('main question'), { type: 'agentMessage', text: 'main answer' }] },
    { id: 's1', status: 'completed', items: [user(SIDE_MARK + 'what is X?'), { type: 'agentMessage', text: 'looking', phase: 'commentary' }, { type: 'agentMessage', text: 'X is Y', phase: 'final_answer' }] },
    { id: 's2', status: 'inProgress', items: [user(SIDE_MARK + 'and Z?')] },
  ];
  assert.deepEqual(sideTurns(turns, 1), [
    { id: 's1', user: 'what is X?', answer: 'X is Y', status: 'completed' },
    { id: 's2', user: 'and Z?', answer: '', status: 'inProgress' },
  ]);
  assert.deepEqual(sideTurns(turns, 3), []);
  assert.deepEqual(sideTurns(undefined as any, 0), []);
});

// ---- the session against a fake app-server ----

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const calls = [], responses = [];
const LIST = [
  { id: 'chat1', name: 'Login bug', preview: 'fix it', cwd: 'C:\\\\w', updatedAt: 5 },
  { id: 'side1', name: '\\u21b3 Clarify: the export', preview: 'x', cwd: 'C:\\\\w', updatedAt: 4, forkedFromId: 'chat1' },
  { id: 'lost', name: '\\u21b3 Clarify: store was lost', preview: 'x', cwd: 'C:\\\\w', updatedAt: 3, forkedFromId: 'chat1' },
  { id: 'fork2', name: 'Login bug (fork)', preview: 'x', cwd: 'C:\\\\w', updatedAt: 2, forkedFromId: 'chat1' },
];
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === undefined) { responses.push({ id: m.id, result: m.result, error: m.error }); return; }
  if (m.id === undefined) return;
  const p = m.params || {};
  calls.push({ method: m.method, params: p });
  if (m.method === 'test/calls') return send({ id: m.id, result: { calls, responses } });
  if (m.method === 'test/ask') { send({ id: 777, method: p.method, params: p.params }); return send({ id: m.id, result: {} }); }
  if (m.method === 'thread/read') return send({ id: m.id, result: { thread: { id: p.threadId, turns: p.threadId === 'chat1'
    ? [{ id: 't1', items: [] }, { id: 't2', items: [] }, { id: 't3', items: [] }]
    : [{ id: 't1', items: [] }, { id: 't2', items: [] }, { id: 's1', status: 'completed', items: [
        { type: 'userMessage', content: [{ type: 'text', text: ${JSON.stringify('[Codexter side question: answer only this question about your answer above, briefly. This side chat is read-only, change no files, and do not carry on the main task.]\n\n')} + 'what is X?' }] },
        { type: 'agentMessage', text: 'X is Y' }] }] } } });
  if (m.method === 'thread/fork') return send({ id: m.id, result: { thread: { id: 'side1' } } });
  if (m.method === 'thread/resume') return send({ id: m.id, result: { thread: { id: p.threadId, turns: [] }, cwd: 'C:\\\\w' } });
  if (m.method === 'turn/start') return send({ id: m.id, result: { turn: { id: 'st-' + calls.length } } });
  if (m.method === 'thread/list') return send({ id: m.id, result: { data: LIST, nextCursor: null } });
  send({ id: m.id, result: {} });
});
`;

async function setup(opts: { stored?: unknown; withHost?: boolean } = {}) {
  const dir = tmpDir('side-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const memo: { value: unknown; saves: number } = { value: opts.stored, saves: 0 };
  const used: string[] = [];
  const host = { log: () => {}, projectName: () => 'w', version: '0', codexBase: '', refreshHook: () => {}, permissionsPref: () => 'ask',
    sideLinks: () => memo.value, saveSideLinks: (s: unknown) => { memo.value = JSON.parse(JSON.stringify(s)); memo.saves++; },
    threadChanged: (id: string | null) => used.push('threadChanged:' + id), chatUsed: (id: string) => used.push('chatUsed:' + id),
    turnDone: (id: string) => used.push('turnDone:' + id) } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c; priv.connected = true; priv._threadId = 'chat1'; priv._threadCwd = 'C:\\w'; priv.projectSurvey = []; priv.projectSurveyAt = Date.now();
  c.setEventListener({ onNotification: (m: string, p: any) => priv.handleNotification(m, p), onClosed: () => {} });
  c.onServerRequest('item/commandExecution/requestApproval', (req) => priv.handleApprovalRequest(req));
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const info = async () => (await c.call('test/calls', {})) as { calls: { method: string; params: any }[]; responses: any[] };
  const calls = async () => (await info()).calls.filter((x) => x.method !== 'test/calls' && x.method !== 'test/ask');
  const wait = async (f: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150 && !(await f()); i++) await new Promise((r) => setTimeout(r, 20)); };
  return { c, s, priv, events, calls, info, wait, memo, used };
}

const ASK = { threadId: 'chat1', turnId: 't2', sideId: null as string | null, excerpt: 'The export writes a file', text: 'what is X?', model: 'gpt-x', effort: 'low' };

test('clarify: the first question forks the chat at that answer READ-ONLY and asks it read-only; the main chat is not touched', async () => {
  const t = await setup();
  try {
    t.s.sideAsk(ASK);
    await t.wait(async () => (await t.calls()).some((x) => x.method === 'turn/start'));
    const all = await t.calls();
    const fork = all.find((x) => x.method === 'thread/fork')!;
    assert.equal(fork.params.threadId, 'chat1');
    assert.equal(fork.params.lastTurnId, 't2');
    assert.equal(fork.params.sandbox, 'read-only');
    assert.equal(fork.params.approvalPolicy, 'never');
    const turn = all.find((x) => x.method === 'turn/start')!;
    assert.equal(turn.params.threadId, 'side1', 'the question goes to the side chat');
    assert.deepEqual(turn.params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
    assert.equal(turn.params.approvalPolicy, 'never');
    assert.equal(turn.params.input[0].text, SIDE_MARK + 'what is X?');
    assert.equal(turn.params.model, 'gpt-x');
    // nothing is sent to the main chat except reading it for the number of its own turns
    const toMain = all.filter((x) => x.params?.threadId === 'chat1').map((x) => x.method);
    assert.deepEqual(toMain.sort(), ['thread/fork', 'thread/read']);
    assert.equal(all.find((x) => x.method === 'thread/name/set')!.params.name, SIDE_PREFIX + 'Clarify: The export writes a file');
    // the main chat stays the open chat and learns nothing
    assert.equal(t.s.threadId, 'chat1');
    assert.deepEqual(t.used, []);
    assert.ok(!t.events.some((e) => e.kind === 'thread' || e.kind === 'notification'));
    // the page is told: the side chat exists, and chat1's answer t2 has it
    assert.equal(t.events.find((e) => e.kind === 'sideOpen').created, true);
    assert.deepEqual(t.events.find((e) => e.kind === 'sideLinks').links.t2.map((l: any) => l.id), ['side1']);
    // the link is stored by the host, with the number of turns that are the main chat's (t1, t2)
    assert.deepEqual((t.memo.value as SideStore).chat1.t2, [{ id: 'side1', at: (t.memo.value as SideStore).chat1.t2[0].at, title: SIDE_PREFIX + 'Clarify: The export writes a file', base: 2 }]);
  } finally {
    t.c.close();
  }
});

test('clarify: the events of the side chat go to the side pane only; its approvals are declined', async () => {
  const t = await setup({ stored: addSide({}, 'chat1', 't2', entry('side1')) });
  try {
    t.priv.handleNotification('turn/started', { threadId: 'side1', turn: { id: 'st1' } });
    t.priv.handleNotification('item/agentMessage/delta', { threadId: 'side1', itemId: 'm', delta: 'X is ' });
    t.priv.handleNotification('turn/completed', { threadId: 'side1', turn: { id: 'st1', status: 'completed' } });
    t.priv.handleNotification('thread/name/updated', { threadId: 'side1', threadName: 'x' });
    assert.deepEqual(t.events.map((e) => e.kind + ':' + (e.method ?? '')), ['sideEvent:turn/started', 'sideEvent:item/agentMessage/delta', 'sideEvent:turn/completed']);
    assert.ok(t.events.every((e) => e.id === 'side1'));
    assert.deepEqual(t.used, [], 'no unread mark, no notification, no AI name for a side chat');
    assert.equal(t.priv.turnId, null, 'the main chat is not "running"');
    // a command approval of the side chat: declined, never shown
    await t.c.call('test/ask', { method: 'item/commandExecution/requestApproval', params: { threadId: 'side1', command: 'rm x' } });
    await t.wait(async () => (await t.info()).responses.length > 0);
    assert.deepEqual((await t.info()).responses[0], { id: 777, result: { decision: 'decline' } });
    assert.ok(!t.events.some((e) => e.kind === 'serverRequest'));
    assert.ok(t.events.some((e) => e.method === 'sideDenied'));
    // the same request of the main chat is shown as usual
    await t.c.call('test/ask', { method: 'item/commandExecution/requestApproval', params: { threadId: 'chat1', command: 'ls' } });
    await t.wait(() => t.events.some((e) => e.kind === 'serverRequest'));
    assert.equal(t.events.find((e) => e.kind === 'serverRequest').params.threadId, 'chat1');
  } finally {
    t.c.close();
  }
});

test('clarify: a further question loads the side chat read-only first (after a restart of Codex) and is asked read-only again', async () => {
  const t = await setup({ stored: addSide({}, 'chat1', 't2', entry('side1')) });
  try {
    t.s.sideAsk({ ...ASK, sideId: 'side1', text: 'and Z?' });
    await t.wait(async () => (await t.calls()).some((x) => x.method === 'turn/start'));
    let all = await t.calls();
    const res = all.find((x) => x.method === 'thread/resume')!;
    assert.equal(res.params.threadId, 'side1');
    assert.equal(res.params.sandbox, 'read-only');
    assert.equal(res.params.approvalPolicy, 'never');
    assert.ok(!all.some((x) => x.method === 'thread/fork'), 'no new fork');
    assert.deepEqual(all.find((x) => x.method === 'turn/start')!.params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
    // loaded now: asking again does not resume again; while a reply runs a second question is refused
    t.priv.handleNotification('turn/started', { threadId: 'side1', turn: { id: 'st1' } });
    t.s.sideAsk({ ...ASK, sideId: 'side1', text: 'too early' });
    await t.wait(() => t.events.some((e) => e.method === 'sideFailed'));
    assert.match(t.events.find((e) => e.method === 'sideFailed').params.message, /still being answered/);
    t.priv.handleNotification('turn/completed', { threadId: 'side1', turn: { id: 'st1', status: 'completed' } });
    t.s.sideAsk({ ...ASK, sideId: 'side1', text: 'now' });
    await t.wait(async () => (await t.calls()).filter((x) => x.method === 'turn/start').length === 2);
    all = await t.calls();
    assert.equal(all.filter((x) => x.method === 'thread/resume').length, 1);
    // a restart of the app-server forgets what was loaded: resumed read-only again
    t.priv.sideLoaded.clear();
    t.s.sideAsk({ ...ASK, sideId: 'side1', text: 'again' });
    await t.wait(async () => (await t.calls()).filter((x) => x.method === 'turn/start').length === 3);
    assert.equal((await t.calls()).filter((x) => x.method === 'thread/resume').length, 2);
  } finally {
    t.c.close();
  }
});

test('clarify: reopening shows the side chat\'s own turns only; an answer that is not saved yet and a missing chat are reported', async () => {
  const t = await setup({ stored: addSide({}, 'chat1', 't2', entry('side1', 2)) });
  try {
    t.s.sideShow('side1');
    await t.wait(() => t.events.some((e) => e.kind === 'sideOpen'));
    const o = t.events.find((e) => e.kind === 'sideOpen');
    assert.deepEqual([o.parent, o.turnId, o.side.id, o.running], ['chat1', 't2', 'side1', false]);
    assert.deepEqual(o.turns, [{ id: 's1', user: 'what is X?', answer: 'X is Y', status: 'completed' }]);
    t.events.length = 0;
    t.s.sideShow('nope');
    await t.wait(() => t.events.some((e) => e.kind === 'sideOpen'));
    assert.match(t.events[0].error, /gone/);
    t.events.length = 0;
    t.s.sideAsk({ ...ASK, turnId: 'not-there' });
    await t.wait(() => t.events.some((e) => e.method === 'sideFailed'));
    assert.match(t.events[0].params.message, /not saved in the chat yet/);
    assert.ok(!(await t.calls()).some((x) => x.method === 'thread/fork'), 'no fork for an answer the chat does not have');
  } finally {
    t.c.close();
  }
});

test('History: side chats are not listed (by the store, and by their name when the store is lost); other forks are', async () => {
  const t = await setup({ stored: addSide({}, 'chat1', 't2', entry('side1')) });
  try {
    t.s.listThreads(1, '', [], false, null, false);
    await t.wait(() => t.events.some((e) => e.kind === 'threads'));
    assert.deepEqual(t.events.find((e) => e.kind === 'threads').data.map((r: any) => r.id), ['chat1', 'fork2']);
  } finally {
    t.c.close();
  }
});

test('deleting a chat forgets its side chats\' links', async () => {
  const t = await setup({ stored: addSide(addSide({}, 'chat1', 't2', entry('side1')), 'chat2', 't1', entry('side9')) });
  try {
    t.priv.forgetSide('chat1');
    assert.deepEqual(Object.keys(t.memo.value as SideStore), ['chat2']);
    t.priv.forgetSide('side9');
    assert.deepEqual(t.memo.value, {});
    const saves = t.memo.saves;
    t.priv.forgetSide('unknown');
    assert.equal(t.memo.saves, saves, 'nothing to forget, nothing saved');
  } finally {
    t.c.close();
  }
});

test('clarify: page and panel are wired; the History and fork code did not change', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes('if (finalMsg) addSideButton(finalMsg, t.el);'));
  assert.ok(app.includes('if (planCards.length) addSideButton(planCards[planCards.length - 1], t.el);'), 'a plan gets Clarify too');
  assert.match(app, /class: 'card plan-card'[^\n]*\n\s*rec\.el\._rec = rec;/, 'the plan gives Clarify its excerpt');
  for (const m of ["type: 'sideAsk'", "type: 'sideShow'", "type: 'sideInterrupt'", "case 'sideOpen'", "case 'sideEvent'", "case 'sideLinks'"]) assert.ok(app.includes(m), m);
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  for (const m of ["case 'sideAsk'", "case 'sideShow'", "case 'sideInterrupt'"]) assert.ok(panel.includes(m), m);
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert.ok(ext.includes("'codexPanel.sideChats'") && ext.includes('saveSideLinks'));
  const css = fs.readFileSync(path.join(root, 'web', 'app.css'), 'utf8');
  assert.ok(css.includes('#side {') && css.includes('.aside'));
});
