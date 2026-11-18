// 0.9.0: chat names written by AI (after the first answer, every 5 answers, never over a name given by hand; the sparkle of the rename input).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { AUTO_NAME_EVERY, autoNameMode, buildTitlePrompt, cleanTitle, MAX_TITLE_CHARS, shouldAutoName, transcriptOf } from '../core/chatTitle';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

const turn = (user: string, ...answers: string[]) => ({
  items: [{ type: 'userMessage', content: [{ type: 'text', text: user }, { type: 'image', url: 'data:' }] }, { type: 'reasoning', summary: [] },
    ...answers.map((text) => ({ type: 'agentMessage', text }))],
});

test('AI names: when, the mode setting', () => {
  assert.equal(autoNameMode(undefined), 'auto');
  assert.equal(autoNameMode('first'), 'first');
  assert.equal(autoNameMode('nonsense'), 'auto');
  assert.deepEqual([0, 1, 2, 4, 5, 6, 10].map((n) => shouldAutoName('auto', n)), [false, true, false, false, true, false, true]);
  assert.equal(AUTO_NAME_EVERY, 5);
  assert.deepEqual([1, 5, 10].map((n) => shouldAutoName('first', n)), [true, false, false]);
  assert.deepEqual([1, 5].map((n) => shouldAutoName('off', n)), [false, false]);
});

test('AI names: the transcript leaves out the extension\'s context lines and keeps the last answer of each turn', () => {
  const msgs = transcriptOf([
    turn('Active file: src/a.ts\n\nWhy does the build fail?', 'Looking', 'The import is wrong.'),
    turn('Active file: src/a.ts\n\n', ''),
    { items: null },
  ]);
  assert.deepEqual(msgs, [{ role: 'user', text: 'Why does the build fail?' }, { role: 'assistant', text: 'The import is wrong.' }]);
});

test('AI names: the prompt has the first message and the latest ones, cut; the current name when there is one', () => {
  const msgs = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: 'm' + i + ' ' + 'x'.repeat(i === 19 ? 2000 : 5) }));
  const p = buildTitlePrompt(msgs, 'Build fails');
  assert.match(p, /Current name \(keep it if it still fits\): Build fails/);
  assert.match(p, /User: m0 /);
  assert.doesNotMatch(p, /m1 |m12 /);
  assert.match(p, /Assistant: m13 /);
  assert.match(p, /Assistant: m19 x+…$/);
  assert.ok(p.length < 6000, String(p.length));
  assert.match(p, /Do not run commands/);
  assert.doesNotMatch(buildTitlePrompt(msgs.slice(0, 2), null), /Current name|latest ones/);
});

test('AI names: the answer is cleaned', () => {
  assert.equal(cleanTitle('"Fix the login redirect."'), 'Fix the login redirect');
  assert.equal(cleanTitle('\n\nTitle: **Paging bug in orders**\nmore'), 'Paging bug in orders');
  assert.equal(cleanTitle('«Ошибка сборки»'), 'Ошибка сборки');
  assert.equal(cleanTitle('   '), '');
  assert.equal(cleanTitle('a'.repeat(200)).length, MAX_TITLE_CHARS);
});

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
let turns = 1; const names = {}; let reads = 0;
const turn = (i) => ({ items: [{ type: 'userMessage', content: [{ type: 'text', text: 'question ' + i }] }, { type: 'agentMessage', text: 'answer ' + i }] });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  const p = m.params || {};
  if (m.method === 'test/set') { if (p.turns !== undefined) turns = p.turns; if (p.name !== undefined) names[p.threadId] = p.name; send({ id: m.id, result: { reads } }); }
  else if (m.method === 'thread/read') { reads++; send({ id: m.id, result: { thread: { id: p.threadId, name: names[p.threadId] ?? null, turns: Array.from({ length: turns }, (_, i) => turn(i + 1)) } } }); }
  else if (m.method === 'thread/name/set') { names[p.threadId] = p.name; send({ id: m.id, result: {} }); }
  else send({ id: m.id, result: {} });
});
`;

test('session: names the chat after the first answer and every 5 answers, never over a name given by hand', async () => {
  const dir = tmpDir('name-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const prompts: string[] = [];
  const memo: Record<string, string> = {};
  const renamed: string[] = [];
  let mode = 'auto';
  let answer = 'Build error';
  const host = {
    log: () => {}, projectName: () => '', version: '0', codexBase: '', refreshHook: () => {},
    ask: async (p: string) => { prompts.push(p); return answer; },
    autoNameMode: () => mode,
    autoNameOf: (id: string) => memo[id],
    rememberAutoName: (id: string, name: string | null) => { if (name === null) delete memo[id]; else memo[id] = name; },
    renamed: (id: string, name: string) => renamed.push(id + '=' + name),
  } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  priv._threadId = 't1';
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const done = (status = 'completed') => priv.handleNotification('turn/completed', { threadId: 't1', turn: { id: 'u', status } });
  const settle = async () => { for (let i = 0; i < 100 && priv.naming.size > 0; i++) await new Promise((r) => setTimeout(r, 20)); await new Promise((r) => setTimeout(r, 30)); };
  const reads = async () => (await c.call('test/set', {})).reads as number;
  try {
    done();
    await settle();
    assert.equal(prompts.length, 1, 'named after the first answer');
    assert.match(prompts[0], /User: question 1/);
    assert.deepEqual(renamed, ['t1=Build error']);
    assert.equal(memo.t1, 'Build error');
    const ev = events.find((e) => e.kind === 'threadAction');
    assert.deepEqual([ev.action, ev.name, ev.auto], ['rename', 'Build error', true]);

    for (let n = 2; n <= 4; n++) { await c.call('test/set', { turns: n }); done(); await settle(); }
    assert.equal(prompts.length, 1, 'answers 2 to 4: no new name');
    assert.equal(await reads(), 1, 'counted here, the chat is not read again');

    answer = 'Release notes';
    await c.call('test/set', { turns: 5 });
    done(); await settle();
    assert.equal(prompts.length, 2, 'the 5th answer');
    assert.match(prompts[1], /Current name \(keep it if it still fits\): Build error/);
    assert.equal(memo.t1, 'Release notes');

    done('interrupted'); await settle();
    assert.equal(priv.answerCounts.get('t1'), 5, 'an interrupted reply does not count');

    // renamed by hand: the AI leaves it alone
    await s.renameThread('t1', 'My name');
    assert.equal(memo.t1, undefined);
    await c.call('test/set', { turns: 10 });
    priv.answerCounts.set('t1', 9);
    done(); await settle();
    assert.equal(prompts.length, 2, 'a name given by hand is kept');

    // the sparkle: a suggestion, nothing renamed
    answer = '"Suggested."';
    events.length = 0;
    s.suggestTitle('t1');
    for (let i = 0; i < 100 && !events.some((e) => e.kind === 'titleSuggested'); i++) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(events.find((e) => e.kind === 'titleSuggested'), { kind: 'titleSuggested', threadId: 't1', name: 'Suggested' });
    assert.doesNotMatch(prompts[2], /Current name/);
    assert.ok(!events.some((e) => e.kind === 'threadAction'));

    // off: nothing is asked
    mode = 'off';
    priv.answerCounts.clear();
    await s.renameThread('t1', 'x', true);
    await c.call('test/set', { turns: 1 });
    done(); await settle();
    assert.equal(prompts.length, 3);
  } finally {
    c.close();
  }
});

test('AI names: setting, page and panel are wired', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const p = pkg.contributes.configuration.properties['codexPanel.autoChatNames'];
  assert.equal(p.default, 'auto');
  assert.deepEqual(p.enum, ['auto', 'first', 'off']);
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes("bridge.post({ type: 'suggestTitle', threadId: id })"));
  assert.ok(app.includes("case 'titleSuggested': onTitleSuggested(ev); break;"));
  assert.ok(app.includes("action: 'rename', threadId: id, name, auto: !!auto"));
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.ok(panel.includes("case 'suggestTitle':") && panel.includes("m.auto === true"));
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert.ok(ext.includes("autoNameMode: () => cfg().get<string>('autoChatNames', 'auto')"));
});
