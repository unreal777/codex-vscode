// 0.9.0: edit the last message (thread/revert, then the new turn) and fork a new chat from an answer (thread/fork lastTurnId).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const calls = [];
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  const p = m.params || {};
  calls.push({ method: m.method, params: p });
  if (m.method === 'test/calls') return send({ id: m.id, result: { calls } });
  if (m.method === 'thread/revert') {
    if (process.env.REVERT_FAIL) return send({ id: m.id, error: { code: -32600, message: 'thread history is not paginated' } });
    return send({ id: m.id, result: { thread: { id: p.threadId } } });
  }
  if (m.method === 'turn/start') return send({ id: m.id, result: { turn: { id: 'new-turn' } } });
  if (m.method === 'turn/interrupt') { send({ id: m.id, result: {} }); return setTimeout(() => send({ method: 'turn/completed', params: { threadId: p.threadId, turn: { id: p.turnId, status: 'interrupted' } } }), 30); }
  if (m.method === 'thread/fork') return send({ id: m.id, result: { thread: { id: 'fork1' } } });
  if (m.method === 'thread/resume') return send({ id: m.id, result: { thread: { id: p.threadId, name: 'Login bug (fork)', turns: [{ id: 't1', items: [] }] }, cwd: 'C:\\\\w' } });
  send({ id: m.id, result: {} });
});
`;

async function setup(env: NodeJS.ProcessEnv = {}) {
  const dir = tmpDir('editfork-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir, undefined, { ...process.env, ...env });
  await c.start();
  const host = { log: () => {}, projectName: () => 'w', version: '0', codexBase: '', refreshHook: () => {}, permissionsPref: () => 'ask' } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c; priv.connected = true; priv._threadId = 'chat1'; priv._threadCwd = 'C:\\w';
  c.setEventListener({ onNotification: (m: string, p: any) => priv.handleNotification(m, p), onClosed: () => {} });
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const calls = async () => ((await c.call('test/calls', {})).calls as { method: string; params: any }[]).filter((x) => x.method !== 'test/calls');
  const wait = async (f: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150 && !(await f()); i++) await new Promise((r) => setTimeout(r, 20)); };
  return { c, s, priv, events, calls, wait };
}

const req = { text: 'fix it, also the tests', cwd: 'C:\\w', model: '', defaultModel: 'gpt-x', effort: '', permissions: 'ask', images: [], mentions: [] };

test('edit: a running reply is stopped first, then the turn is cut (thread/revert) and the new message sent', async () => {
  const t = await setup();
  try {
    t.priv.turnId = 'old-turn';   // the reply to the message being edited still runs
    t.s.send({ ...req, replaceTurnId: 'old-turn', editText: 'fix it, also the tests' });
    await t.wait(async () => (await t.calls()).some((x) => x.method === 'turn/start'));
    const seq = (await t.calls()).map((x) => x.method);
    assert.deepEqual(seq.filter((m) => ['turn/interrupt', 'thread/revert', 'turn/start'].includes(m)), ['turn/interrupt', 'thread/revert', 'turn/start']);
    const rv = (await t.calls()).find((x) => x.method === 'thread/revert')!;
    assert.deepEqual(rv.params, { threadId: 'chat1', beforeTurnId: 'old-turn' });
  } finally {
    t.c.close();
  }
});

test('edit: when the cut fails nothing is sent, the text goes back into the input and the chat is shown again', async () => {
  const t = await setup({ REVERT_FAIL: '1' });
  try {
    t.s.send({ ...req, replaceTurnId: 'old-turn', editText: 'my edited text' });
    await t.wait(() => t.events.some((e) => e.kind === 'focus'));
    await t.wait(async () => (await t.calls()).some((x) => x.method === 'thread/resume'));
    const seq = (await t.calls()).map((x) => x.method);
    assert.ok(!seq.includes('turn/start'), 'not sent');
    assert.ok(seq.includes('thread/resume'), 'the chat is loaded again');
    assert.match(t.events.find((e) => e.kind === 'toast').message, /Could not replace the last message: thread history is not paginated/);
    assert.equal(t.events.find((e) => e.kind === 'focus').text, 'my edited text');
    assert.ok(t.events.some((e) => e.kind === 'idle'));
  } finally {
    t.c.close();
  }
});

test('fork: thread/fork through the answer\'s turn, named "<title> (fork)", then opened', async () => {
  const t = await setup();
  try {
    t.priv.titles.set('chat1', 'Login bug');
    t.s.forkFrom('t1', 'ask');
    await t.wait(() => t.events.some((e) => e.kind === 'thread' && e.thread?.id === 'fork1'));
    const all = await t.calls();
    const f = all.find((x) => x.method === 'thread/fork')!;
    assert.equal(f.params.threadId, 'chat1');
    assert.equal(f.params.lastTurnId, 't1');
    assert.equal(f.params.cwd, 'C:\\w');
    assert.equal(f.params.excludeTurns, true);
    assert.deepEqual(all.find((x) => x.method === 'thread/name/set')!.params, { threadId: 'fork1', name: 'Login bug (fork)' });
    assert.equal(t.s.threadId, 'fork1', 'the fork is the open chat now');
    // a fork of a fork is not "(fork) (fork)"
    t.priv.titles.set('fork1', 'Login bug (fork)');
    t.s.forkFrom('t1', 'ask');
    await t.wait(async () => (await t.calls()).filter((x) => x.method === 'thread/name/set').length === 2);
    assert.equal((await t.calls()).filter((x) => x.method === 'thread/name/set')[1].params.name, 'Login bug (fork)');
  } finally {
    t.c.close();
  }
});

const DELETE_SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
// src <- f1 <- f2 (archived), src <- f3; other is unrelated
let live = [
  { id: 'src', name: 'Login bug', forkedFromId: null, cwd: 'C:\\\\w' },
  { id: 'f1', name: 'Login bug (fork)', forkedFromId: 'src', cwd: 'C:\\\\w' },
  { id: 'f3', name: null, preview: 'try another way', forkedFromId: 'src', cwd: 'C:\\\\w' },
  { id: 'other', name: 'Other', forkedFromId: null, cwd: 'C:\\\\w' },
];
let archived = [{ id: 'f2', name: 'Deeper fork', forkedFromId: 'f1', cwd: 'C:\\\\w' }];
const deleted = [];
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  const p = m.params || {};
  if (m.method === 'test/deleted') return send({ id: m.id, result: { deleted } });
  if (m.method === 'thread/list') return send({ id: m.id, result: { data: p.archived ? archived : live, nextCursor: null } });
  if (m.method === 'thread/delete') {
    const all = live.concat(archived);
    if (all.some((t) => t.forkedFromId === p.threadId)) return send({ id: m.id, error: { code: -32600, message: 'cannot delete thread ' + p.threadId + ': forked history still references it' } });
    live = live.filter((t) => t.id !== p.threadId); archived = archived.filter((t) => t.id !== p.threadId); deleted.push(p.threadId);
    return send({ id: m.id, result: {} });
  }
  send({ id: m.id, result: { data: [] } });
});
`;

test('delete of a forked chat: Codex refuses, the forks are named; "delete with forks" removes them first (deepest first)', async () => {
  const dir = tmpDir('forkdel-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, DELETE_SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const s = new CodexSession({ log: () => {}, projectName: () => 'w', version: '0', codexBase: '', refreshHook: () => {} } as unknown as SessionHost);
  const priv = s as any;
  priv.client = c; priv.connected = true; priv.projectSurvey = []; priv.projectSurveyAt = Date.now();
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const wait = async (f: () => boolean) => { for (let i = 0; i < 150 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };
  try {
    s.threadAction('delete', 'src');
    await wait(() => events.some((e) => e.kind === 'threadAction'));
    const refused = events.find((e) => e.kind === 'threadAction');
    assert.equal(refused.ok, false);
    assert.match(refused.error, /forked history still references it/);
    assert.deepEqual(refused.forks.map((f: any) => f.id).sort(), ['f1', 'f2', 'f3']);
    assert.equal(refused.forks.find((f: any) => f.id === 'f3').title, 'try another way');

    events.length = 0;
    s.threadAction('deleteWithForks', 'src');
    await wait(() => events.some((e) => e.kind === 'threadAction' && e.threadId === 'src'));
    const order = (await c.call('test/deleted', {})).deleted as string[];
    assert.deepEqual(order.slice(-1), ['src']);
    assert.ok(order.indexOf('f2') < order.indexOf('f1'), 'a fork of a fork goes first: ' + order);
    assert.deepEqual(order.slice().sort(), ['f1', 'f2', 'f3', 'src']);
    const acts = events.filter((e) => e.kind === 'threadAction');
    assert.deepEqual(acts.filter((e) => e.quiet).map((e) => e.threadId).sort(), ['f1', 'f2', 'f3'], 'each fork leaves the list without its own toast');
    const last = acts.find((e) => e.threadId === 'src');
    assert.deepEqual([last.action, last.ok], ['delete', true]);
  } finally {
    c.close();
  }
});

test('edit and fork: page and panel are wired', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes("replaceTurnId: edit ? edit.turnId : undefined"));
  assert.ok(app.includes("bridge.post({ type: 'fork', turnId: id"));
  assert.ok(app.includes('if (finalMsg) addForkButton(finalMsg, t.el);'));
  assert.ok(app.includes('state.turn.el.dataset.turn = turn.id') && app.includes('state.turn.el.dataset.turn = p.turn.id'));
  assert.ok(app.includes('if (tid && droppedTurns.has(tid)) return;'), 'late events of the replaced turn are ignored');
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.ok(panel.includes("case 'fork':") && panel.includes('req.replaceTurnId = replace'));
  assert.ok(panel.includes("a === 'deleteWithForks'"));
  assert.ok(app.includes("threadAction('deleteWithForks', t)") && app.includes('hist.forkAsk = { id: ev.threadId, forks: ev.forks }'));
});
