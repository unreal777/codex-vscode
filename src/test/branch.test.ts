// 0.5.6: last used chat per git branch (decisions in core/branchChats.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { branchKey, forget, MAX_AGE_MS, onSwitch, prune, record } from '../core/branchChats';

const R = 'C:\\work\\app';
const DAY = 24 * 60 * 60 * 1000;

test('branchKey ignores case, slash direction and a trailing slash of the root', () => {
  assert.equal(branchKey('C:\\Work\\App\\', 'main'), branchKey('c:/work/app', 'main'));
  assert.notEqual(branchKey(R, 'main'), branchKey(R, 'Main'));
});

test('record / prune / forget', () => {
  let m = record({}, R, 'main', 't1', 1000);
  m = record(m, R, 'feature', 't2', 1000 + 40 * DAY);
  assert.deepEqual(Object.keys(prune(m, 1000 + MAX_AGE_MS)), [branchKey(R, 'main'), branchKey(R, 'feature')]);
  assert.deepEqual(Object.keys(prune(m, 1000 + 31 * DAY)), [branchKey(R, 'feature')], 'unused for more than 30 days: dropped');
  assert.deepEqual(prune({ x: null as never, y: { thread: 1 } as never }, 0), {});
  assert.deepEqual(Object.keys(forget(m, R, 'main')), [branchKey(R, 'feature')]);
});

test('switching to a branch that has a chat opens it', () => {
  const m = record(record({}, R, 'main', 't1', 0), R, 'feature', 't2', 0);
  assert.equal(onSwitch(m, R, 'main', 'feature', 't1', false, 5).open, 't2');
  assert.equal(onSwitch(m, R, 'main', 'feature', 't2', false, 5).open, null, 'already open');
  assert.equal(onSwitch(m, R, 'main', 'feature', 't1', false, 5).map, m, 'nothing stored');
});

test('a branch created from where the open chat was used takes the chat over', () => {
  const m = record({}, R, 'master', 't1', 0);
  const d = onSwitch(m, R, 'master', 'fix-login', 't1', true, 9);
  assert.equal(d.open, null);
  assert.deepEqual(d.map, { [branchKey(R, 'fix-login')]: { thread: 't1', at: 9 } }, 'moved from master to the new branch');
});

test('no take-over for another commit, another chat, or a chat never used on the old branch', () => {
  const m = record({}, R, 'master', 't1', 0);
  assert.equal(onSwitch(m, R, 'master', 'old-branch', 't1', false, 9).map, m, 'checked out an existing branch elsewhere');
  assert.equal(onSwitch(m, R, 'master', 'new', 't9', true, 9).map, m, 'the open chat was not used on master');
  assert.equal(onSwitch(m, R, 'master', 'new', null, true, 9).map, m, 'no chat open');
  assert.equal(onSwitch(m, R, null, 'new', 't1', true, 9).map, m, 'came from a detached HEAD');
});
