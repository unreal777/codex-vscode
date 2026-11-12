// 0.7.8: a chat opened again keeps its model / effort and shows its context usage at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { lastTokenUsage, tokenUsageFromLines } from '../core/rollout';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');
const tc = (total: number, window: number | null) => JSON.stringify({ timestamp: 't', type: 'event_msg', payload: { type: 'token_count',
  info: { total_token_usage: { input_tokens: 900, cached_input_tokens: 800, output_tokens: 50, reasoning_output_tokens: 5, total_tokens: 950 },
    last_token_usage: { input_tokens: total - 10, cached_input_tokens: 1, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: total },
    model_context_window: window }, rate_limits: null } });

test('token usage of a session file: the last token_count event, camelCase like thread/tokenUsage/updated', () => {
  const text = ['{"type":"session_meta","payload":{}}', tc(100, 475000), '{"type":"response_item","payload":{"type":"message"}}', tc(38300, 475000),
    '{"type":"event_msg","payload":{"type":"token_count","info":null}}', '{"broken'].join('\n');
  const u = tokenUsageFromLines(text);
  assert.deepEqual(u, { last: { inputTokens: 38290, cachedInputTokens: 1, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 38300 },
    total: { inputTokens: 900, cachedInputTokens: 800, outputTokens: 50, reasoningOutputTokens: 5, totalTokens: 950 }, modelContextWindow: 475000 });
  assert.equal(tokenUsageFromLines('{"type":"session_meta"}'), null);
  assert.equal(tokenUsageFromLines(tc(5, null))?.modelContextWindow, null);
});

test('lastTokenUsage reads only the end of a big file, and is null for a missing one', () => {
  const dir = tmpDir('rollout-');
  const f = path.join(dir, 'rollout.jsonl');
  const filler = '{"type":"response_item","payload":{"text":"' + 'x'.repeat(1000) + '"}}\n';
  fs.writeFileSync(f, tc(1, 1000) + '\n' + filler.repeat(600) + tc(4242, 475000) + '\n' + filler.repeat(20));
  assert.equal(lastTokenUsage(f)?.last.totalTokens, 4242);
  // the only token_count is beyond the first 256 KB from the end: the 4 MB pass finds it
  const g = path.join(dir, 'old.jsonl');
  fs.writeFileSync(g, tc(77, 1000) + '\n' + filler.repeat(400));
  assert.equal(lastTokenUsage(g)?.last.totalTokens, 77);
  assert.equal(lastTokenUsage(path.join(dir, 'missing.jsonl')), null);
  assert.equal(lastTokenUsage(null), null);
});

test('session resume: the thread event carries the chat\'s model, effort and context usage', async () => {
  const dir = tmpDir('resume-cfg-');
  const rollout = path.join(dir, 'rollout.jsonl');
  fs.writeFileSync(rollout, tc(38300, 475000) + '\n');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (m.method === 'thread/resume') send({ id: m.id, result: { thread: { id: 'T', name: 'Old chat', path: ${JSON.stringify(rollout)}, turns: [{ id: 't1', status: 'completed', items: [] }] },
    cwd: 'D:\\\\p', model: 'gpt-6.1-terra', reasoningEffort: 'xhigh', collaborationMode: { mode: 'default', settings: {} } } });
  else send({ id: m.id, result: { goal: null } });
});`);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const host = { log: () => {}, projectName: () => 'p', version: '0', codexBase: '', permissionsPref: () => 'ask', refreshHook: () => {} } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  try {
    assert.equal(await s.resume('T'), true);
    const e = events.find((x) => x.kind === 'thread');
    assert.equal(e.model, 'gpt-6.1-terra');
    assert.equal(e.effort, 'xhigh');
    assert.equal(e.tokenUsage.last.totalTokens, 38300);
    assert.equal(e.tokenUsage.modelContextWindow, 475000);
    assert.equal(e.planMode, false);
  } finally {
    c.close();
  }
});

test('page: a loaded chat takes its model / effort / usage; an effort survives until the model list is there', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes("if (typeof ev.model === 'string' && ev.model) {"));
  assert.ok(app.includes('if (ev.tokenUsage) { state.tokenUsage = ev.tokenUsage; renderFooter(); }'));
  assert.ok(app.includes('!state.models.length) efforts.push(state.prefs.effort);'));
});
