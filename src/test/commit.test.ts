// 0.5.5: "Generate commit message" with Codex (prompt, codex exec arguments, answer cleanup, the exec run with a fake codex).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPrompt, cleanMessage, execArgs, MAX_DIFF_CHARS, runCodexExec } from '../core/commitMessage';
import { tmpDir } from './helpers';

test('buildPrompt: staged / all changes, recent subjects, untracked files, long diffs are cut', () => {
  const p = buildPrompt({ diff: 'diff --git a/x b/x', staged: true, untracked: [], recentSubjects: ['Fix login', 'Add history'] });
  assert.match(p, /staged changes/);
  assert.match(p, /Do not run commands/);
  assert.match(p, /- Fix login\n- Add history/);
  assert.ok(p.endsWith('diff --git a/x b/x'));
  assert.ok(!p.includes('untracked'));
  const all = buildPrompt({ diff: 'x'.repeat(MAX_DIFF_CHARS + 10), staged: false, untracked: ['src/new.ts'], recentSubjects: [] });
  assert.match(all, /nothing is staged/);
  assert.match(all, /New untracked files \(content not shown\):\n- src\/new\.ts/);
  assert.match(all, /\[\.\.\. diff cut, 10 more characters\]/);
  assert.ok(!all.includes('Recent commit subjects'));
});

test('cleanMessage: fences, labels, quotes, trailing spaces', () => {
  assert.equal(cleanMessage('```\nFix login\n\n- details  \n```'), 'Fix login\n\n- details');
  assert.equal(cleanMessage('```text\r\nAdd x\r\n```'), 'Add x');
  assert.equal(cleanMessage('Commit message: Add x'), 'Add x');
  assert.equal(cleanMessage('"Add x"'), 'Add x');
  assert.equal(cleanMessage('  \n '), '');
});

test('execArgs: ephemeral read-only run, answer to a file, prompt on stdin; model and effort only when set', () => {
  assert.deepEqual(execArgs('o.txt', '', ''), ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-o', 'o.txt', '-']);
  assert.deepEqual(execArgs('o.txt', 'gpt-x', 'low').slice(7), ['-m', 'gpt-x', '-c', 'model_reasoning_effort="low"', '-']);
});

const FAKE = `
const fs = require('node:fs');
const args = process.argv.slice(2);
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  if (process.env.FAKE_FAIL) { process.stderr.write('boom: not signed in\\n'); process.exit(3); }
  const out = args[args.indexOf('-o') + 1];
  fs.writeFileSync(out, '\`\`\`\\nSubject from ' + (input.includes('staged changes') ? 'staged' : 'all') + '\\n\`\`\`\\n');
});
`;

test('runCodexExec: returns the cleaned answer; failures carry the end of stderr', async () => {
  const dir = tmpDir('commit-fake-');
  const script = path.join(dir, 'fake-codex.js');
  fs.writeFileSync(script, FAKE);
  const base = { command: [process.execPath, script], cwd: dir, prompt: buildPrompt({ diff: 'd', staged: true, untracked: [], recentSubjects: [] }),
    model: '', effort: '', timeoutMs: 20_000 };
  assert.equal(await runCodexExec({ ...base, env: process.env }), 'Subject from staged');
  await assert.rejects(runCodexExec({ ...base, env: { ...process.env, FAKE_FAIL: '1' } }), /exit code 3\): boom: not signed in/);
});
