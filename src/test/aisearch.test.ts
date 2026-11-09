// 0.5.9: AI search of the History panel (prompt, answer parsing, session flow) and the quick model default.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { AI_MAX_CHATS, AI_MAX_LIST_CHARS, AI_MAX_RESULTS, AI_PREVIEW_CHARS, buildSearchPrompt, parseSearchAnswer } from '../core/aiSearch';
import { DEFAULT_QUICK_MODEL } from '../core/commitMessage';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

test('AI search prompt: numbered chats with date, project, title and the start of the first message', () => {
  const { prompt, count } = buildSearchPrompt('where we fixed\n the order paging', [
    { title: 'Fix paging', project: 'shop', updatedAt: Date.UTC(2026, 9, 2) / 1000, preview: 'The order list\nshows page 2 twice' },
    { title: '', project: '', updatedAt: null, preview: 'x'.repeat(AI_PREVIEW_CHARS + 50) },
  ], new Date(Date.UTC(2026, 10, 9)));
  assert.equal(count, 2);
  assert.match(prompt, /Today is 2026-11-09\./);
  assert.match(prompt, /The user is looking for:\nwhere we fixed the order paging\n/);
  assert.match(prompt, /\[1\] 2026-10-02 \| shop \| Fix paging\n {4}The order list shows page 2 twice/);
  assert.match(prompt, new RegExp('\\[2\\] \\? \\| \\? \\| \\(untitled\\)\\n {4}x{' + AI_PREVIEW_CHARS + '}$'));
  assert.match(prompt, /Do not run commands/);
});

test('AI search prompt: at most AI_MAX_CHATS chats and AI_MAX_LIST_CHARS characters (oldest left out)', () => {
  const many = Array.from({ length: AI_MAX_CHATS + 20 }, (_, i) => ({ title: 't' + i, project: 'p', updatedAt: 0, preview: '' }));
  assert.equal(buildSearchPrompt('q', many).count, AI_MAX_CHATS);
  const big = Array.from({ length: AI_MAX_CHATS }, (_, i) => ({ title: 't' + i, project: 'p', updatedAt: 0, preview: 'y'.repeat(AI_PREVIEW_CHARS) }));
  const r = buildSearchPrompt('q', big);
  assert.ok(r.count < AI_MAX_CHATS && r.count > 200, 'cut by size: ' + r.count);
  assert.ok(r.prompt.length < AI_MAX_LIST_CHARS + 2000);
  assert.match(r.prompt, /\[1\] /);
});

test('AI search answer: numbers in order, deduplicated, in range, dates ignored, "none" is empty', () => {
  assert.deepEqual(parseSearchAnswer('12, 3, 40', 50), [11, 2, 39]);
  assert.deepEqual(parseSearchAnswer('[3] 2026-10-02, 3, 0, 99, 1', 10), [2, 0]);
  assert.deepEqual(parseSearchAnswer('none', 10), []);
  assert.equal(parseSearchAnswer(Array.from({ length: 60 }, (_, i) => i + 1).join(','), 100).length, AI_MAX_RESULTS);
});

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const threads = [
  { id: 'a', name: 'Fix paging', preview: 'The order list shows page 2 twice', cwd: 'D:\\\\shop', updatedAt: 1790000000 },
  { id: 'b', name: null, preview: 'Add dark mode', cwd: 'D:\\\\web', updatedAt: 1780000000 },
  { id: 'c', name: 'Login', preview: 'OAuth callback fails', cwd: 'D:\\\\shop', updatedAt: 1770000000 },
];
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (m.method === 'thread/list') {
    const cwd = m.params && m.params.cwd;
    const data = cwd ? threads.filter((t) => [].concat(cwd).includes(t.cwd)) : threads;
    send({ id: m.id, result: { data, nextCursor: null } });
  } else send({ id: m.id, result: {} });
});
`;

test('session aiSearch: lists the chats of the selection, asks once, answers with the matches (ai: true)', async () => {
  const dir = tmpDir('ai-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const prompts: string[] = [];
  let answer = '3, 1';
  const host = {
    log: () => {}, projectName: (d: string | null) => path.win32.basename(d ?? ''), version: '0', codexBase: '',
    ask: async (p: string) => { prompts.push(p); if (answer === 'fail') throw new Error('model not found'); return answer; },
  } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  priv.projectSurvey = [];
  priv.projectSurveyAt = Date.now();
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const next = async () => {
    for (let i = 0; i < 200 && !events.some((e) => e.kind === 'threads'); i++) await new Promise((r) => setTimeout(r, 20));
    const e = events.find((x) => x.kind === 'threads');
    events.length = 0;
    return e;
  };
  try {
    s.aiSearch(7, 'paging bug', []);
    let e = await next();
    assert.equal(e.requestId, 7);
    assert.equal(e.ai, true);
    assert.equal(e.scanned, 3);
    assert.deepEqual(e.data.map((r: any) => r.id), ['c', 'a']);
    assert.equal(e.data[1].project, 'shop');
    assert.match(prompts[0], /\[2\] .* \| web \| Add dark mode/);
    assert.equal(s.historyQuery, 'paging bug', 'the description is remembered like a search');

    s.aiSearch(8, 'login', ['D:\\shop']);
    e = await next();
    assert.equal(prompts.length, 2);
    assert.doesNotMatch(prompts[1], /dark mode/, 'only the selected project');
    assert.deepEqual(e.data.map((r: any) => r.id), ['a'], '3 is out of range for 2 chats, 1 is the newest of shop');

    answer = 'fail';
    s.aiSearch(9, 'x', []);
    e = await next();
    assert.equal(e.error, 'model not found');
    assert.deepEqual(e.data, []);

    const bare = new CodexSession({ log: () => {}, projectName: () => '', version: '0', codexBase: '' } as unknown as SessionHost);
    const ev: any[] = [];
    bare.addSink((x) => ev.push(x));
    bare.aiSearch(1, 'x', []);
    for (let i = 0; i < 50 && !ev.some((x) => x.kind === 'threads'); i++) await new Promise((r) => setTimeout(r, 20));
    assert.match(ev.find((x) => x.kind === 'threads').error, /not available/);
  } finally {
    c.close();
  }
});

test('quick model: GPT-6-Luna by default (package.json and code agree), the page has the AI switch and its message', () => {
  assert.equal(DEFAULT_QUICK_MODEL, 'gpt-6-luna');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.contributes.configuration.properties['codexPanel.commitMessageModel'].default, DEFAULT_QUICK_MODEL);
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.match(app, /id="hist-ai"/);
  assert.match(app, /type: 'aiSearch'/);
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.match(panel, /case 'aiSearch'/);
});
