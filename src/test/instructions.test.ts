// 0.8.0: instructions (Codex's own developer_instructions or Codexter's), the auto-compact limit and "Compact".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { agentsFile, codexInstructionsOf, sanitizeContextSettings, threadExtras } from '../core/instructions';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

test('context settings: sanitized, and the params a new or resumed chat gets', () => {
  assert.deepEqual(sanitizeContextSettings(undefined), { instructionsSource: 'codex', instructions: '', autoCompactTokens: 0 });
  assert.deepEqual(sanitizeContextSettings({ instructionsSource: 'codexter', instructions: '  Be brief.  ', autoCompactTokens: 200000.4 }),
    { instructionsSource: 'codexter', instructions: 'Be brief.', autoCompactTokens: 200000 });
  assert.equal(sanitizeContextSettings({ autoCompactTokens: 5 }).autoCompactTokens, 0);      // nonsense: Codex's own
  assert.equal(sanitizeContextSettings({ autoCompactTokens: '1e5' }).autoCompactTokens, 0);
  assert.equal(sanitizeContextSettings({ instructionsSource: 'other' }).instructionsSource, 'codex');

  const own = { instructionsSource: 'codexter' as const, instructions: 'Be brief.', autoCompactTokens: 150000 };
  assert.deepEqual(threadExtras(own, false), { developerInstructions: 'Be brief.', config: { model_auto_compact_token_limit: 150000 } });
  assert.deepEqual(threadExtras(own, true), { config: { model_auto_compact_token_limit: 150000 } });   // instructions only for a new chat
  assert.deepEqual(threadExtras({ ...own, instructionsSource: 'codex' }, false), { config: { model_auto_compact_token_limit: 150000 } });
  assert.deepEqual(threadExtras({ instructionsSource: 'codexter', instructions: '', autoCompactTokens: 0 }, false), {});
});

test('Codex\'s own instructions and AGENTS.md', () => {
  assert.equal(codexInstructionsOf({ config: { developer_instructions: 'Answer briefly.' } }), 'Answer briefly.');
  assert.equal(codexInstructionsOf({ config: {} }), '');
  assert.equal(codexInstructionsOf(null), '');
  assert.equal(agentsFile({ CODEX_HOME: 'D:\\ch' }), path.join('D:\\ch', 'AGENTS.md'));
  assert.equal(agentsFile({}), path.join(os.homedir(), '.codex', 'AGENTS.md'));
});

test('session: thread/start gets the extras, resume the limit only; Compact calls thread/compact/start', async () => {
  const dir = tmpDir('instr-');
  const log = path.join(dir, 'calls.jsonl');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, `
const fs = require('node:fs');
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ method: m.method, params: m.params }) + '\\n');
  if (m.method === 'thread/start') send({ id: m.id, result: { thread: { id: 'T1', name: null, path: null, turns: [] } } });
  else if (m.method === 'thread/resume') send({ id: m.id, result: { thread: { id: 'T1', name: 'x', path: null, turns: [{ id: 't', status: 'completed', items: [] }] } } });
  else if (m.method === 'turn/start') send({ id: m.id, result: { turn: { id: 'u1' } } });
  else send({ id: m.id, result: {} });
});`);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  const extras = (forResume: boolean) => threadExtras({ instructionsSource: 'codexter', instructions: 'Be brief.', autoCompactTokens: 120000 }, forResume);
  const host = { log: () => {}, projectName: () => 'p', version: '0', codexBase: '', permissionsPref: () => 'ask', refreshHook: () => {},
    threadExtras: extras } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  try {
    s.send({ text: 'hi', cwd: dir, contexts: [], images: [], mentions: [], model: '', defaultModel: '', effort: '', permissions: 'ask' } as any);
    const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    for (let i = 0; i < 50 && !calls().some((x) => x.method === 'turn/start'); i++) await new Promise((r) => setTimeout(r, 20));
    const start = calls().find((x) => x.method === 'thread/start');
    assert.equal(start.params.developerInstructions, 'Be brief.');
    assert.deepEqual(start.params.config, { model_auto_compact_token_limit: 120000 });
    for (let i = 0; i < 50 && priv.turnId !== 'u1'; i++) await new Promise((r) => setTimeout(r, 20));
    priv.turnId = null;   // the reply ended
    s.compact('ask');
    for (let i = 0; i < 50 && !calls().some((x) => x.method === 'thread/compact/start'); i++) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(calls().find((x) => x.method === 'thread/compact/start').params, { threadId: 'T1' });
    assert.equal(await s.resume('T1', 'user'), true);
    const resume = calls().filter((x) => x.method === 'thread/resume').pop();
    assert.equal(resume.params.developerInstructions, undefined);
    assert.deepEqual(resume.params.config, { model_auto_compact_token_limit: 120000 });
  } finally {
    c.close();
  }
});

test('settings and page: new keys, Compact in the footer, the instructions section', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const props = pkg.contributes.configuration.properties ?? pkg.contributes.configuration[0].properties;
  assert.deepEqual(props['codexPanel.instructionsSource'].enum, ['codex', 'codexter']);
  assert.equal(props['codexPanel.instructions'].editPresentation, 'multilineText');
  assert.equal(props['codexPanel.autoCompactTokens'].default, 0);
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.ok(panel.includes("'systemNotifications', 'instructionsSource', 'instructions', 'autoCompactTokens'];"));
  assert.ok(panel.includes("keyPath: 'developer_instructions', value: text.trim() === '' ? null : text.trim()"));
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes('<button id="f-compact" class="hidden" type="button"></button>'));
  assert.ok(app.includes("bridge.post({ type: 'compact' });"));
  assert.ok(app.includes("bridge.post({ type: 'instrRead' });"));
  assert.ok(app.includes("if (src === 'codex') { ins.codex = null; bridge.post({ type: 'instrWriteCodex', text: v }); }"));
});
