// 0.14.0: a turn's steps fold: while it runs only the last few stay in view, and when it ends everything between the question and
// the answer is in the "Worked for" fold, answered approvals and auto-review checks included (checked live on the dev page).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.join(__dirname, '..', '..');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

test('steps fold while the turn runs: the last LIVE_KEEP stay, never during a chat load', () => {
  assert.match(app, /const LIVE_KEEP = 3;/);
  assert.match(app, /if \(role === 'work' && !state\.loadingThread\) liveFold\(t\);/);
  assert.match(app, /loose\.slice\(0, loose\.length - LIVE_KEEP\)\.forEach\(\(k\) => g\.body\.append\(k\)\)/);
});

test('a waiting approval and a refused auto-review check never fold; answered approvals and other checks do', () => {
  assert.match(app, /!\(k\.classList\.contains\('approval'\) && !k\.classList\.contains\('done'\)\)/);
  assert.match(app, /!\(k\.classList\.contains\('autoreview'\) && \(k\.classList\.contains\('denied'\) \|\| k\.classList\.contains\('timedOut'\)\)\)/);
  assert.match(app, /append\(approvalCard\(ev\.id, ev\.method, p\), 'work'\)/);
  assert.match(app, /el\.className = 'autoreview wk ' \+ status;/);
});

test('at the end the answer is found in the fold too and comes back out after it', () => {
  assert.match(app, /const all = \(t\.group \? Array\.from\(t\.group\.body\.children\) : \[\]\)\.concat\(kids\);/);
  assert.match(app, /if \(finalMsg && finalMsg\.parentNode === g\.body\) g\.el\.after\(finalMsg\);/);
  assert.match(app, /t\.group\.lbl\.textContent = what \+ ' · ' \+ STR\.steps\(n\);/);
});
