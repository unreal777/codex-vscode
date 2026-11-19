// 0.13.0: one repository in several folders (a copied folder, a second clone, a git worktree): branch chats shared by the remote,
// and a chat of another copy runs in this window's copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { branchKey, migrateLegacy } from '../core/branchChats';
import { cwdForWorkspace, FsOps, MOVE_NOTE_PREFIX, moveNote, normalizeRemote, remoteOfConfig, repoIdOf } from '../core/repoIdentity';
import { stripPreamble } from '../core/threadRows';

/** A file system of absolute paths: dirs and files (with text). */
function fakeFs(dirs: string[], files: Record<string, string>): FsOps {
  const norm = (p: string) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  const d = new Set(dirs.map(norm));
  const f = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  return { isDir: (p) => d.has(norm(p)), isFile: (p) => f.has(norm(p)), read: (p) => f.get(norm(p)) ?? null };
}
const cfg = (url: string) => '[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://example.com/other.git\n[remote "origin"]\n\turl = ' + url + '\n';
const A = path.resolve('/work/shop');
const B = path.resolve('/work/shop-2');

test('normalizeRemote: https, ssh, scp form, user, port, .git and case give one address', () => {
  const want = 'github.com/org/app';
  for (const u of ['https://github.com/Org/App.git', 'https://user:tok@github.com/org/app/', 'ssh://git@github.com:22/org/app.git', 'git@github.com:Org/app.git', 'git@github.com:org/app'])
    assert.equal(normalizeRemote(u), want, u);
  assert.notEqual(normalizeRemote('https://github.com/org/app2'), want);
  assert.equal(normalizeRemote(''), null);
  assert.match(normalizeRemote('C:\\repos\\app.git') ?? '', /^file:c:\/repos\/app$/);
});

test('remoteOfConfig: origin first, else the first remote, none without remotes', () => {
  assert.equal(remoteOfConfig(cfg('git@github.com:org/app.git')), 'git@github.com:org/app.git');
  assert.equal(remoteOfConfig('[remote "fork"]\n  url = https://x.org/a\n[remote "b"]\n  url = https://x.org/b\n'), 'https://x.org/a');
  assert.equal(remoteOfConfig('[core]\n\tbare = false\n'), null);
});

test('repoIdOf: two copies with the same remote match; a git worktree reads the shared config; no remote = the folder', () => {
  const W = path.resolve('/work/shop-wt');
  const fs = fakeFs([A, B, path.join(A, '.git'), path.join(B, '.git'), path.join(A, 'web'), W, path.resolve('/solo'), path.resolve('/solo/.git')], {
    [path.join(A, '.git', 'config')]: cfg('https://github.com/org/shop.git'),
    [path.join(B, '.git', 'config')]: cfg('git@github.com:org/shop.git'),
    [path.join(W, '.git')]: 'gitdir: ' + path.join(A, '.git', 'worktrees', 'shop-wt') + '\n',
    [path.join(A, '.git', 'worktrees', 'shop-wt', 'commondir')]: '../..\n',
    [path.resolve('/solo/.git/config')]: '[core]\n',
  });
  const a = repoIdOf(path.join(A, 'web'), fs);
  assert.equal(a?.id, 'remote:github.com/org/shop');
  assert.equal(a?.root, A);
  assert.equal(repoIdOf(B, fs)?.id, a?.id);
  assert.equal(repoIdOf(W, fs)?.id, a?.id, 'worktree');
  assert.match(repoIdOf(path.resolve('/solo'), fs)?.id ?? '', /^path:/);
  assert.equal(repoIdOf(path.resolve('/nowhere'), fs), null);
});

test('cwdForWorkspace: a chat of the other copy runs in the same sub folder here; other repositories and own folders stay', () => {
  const fs = fakeFs([A, B, path.join(A, '.git'), path.join(B, '.git'), path.join(A, 'web'), path.join(B, 'web'), path.join(A, 'only-a'), path.resolve('/other'), path.resolve('/other/.git')], {
    [path.join(A, '.git', 'config')]: cfg('https://github.com/org/shop.git'),
    [path.join(B, '.git', 'config')]: cfg('https://github.com/org/shop.git'),
    [path.resolve('/other/.git/config')]: cfg('https://github.com/org/other.git'),
  });
  assert.equal(cwdForWorkspace(path.join(A, 'web'), [B], fs), path.join(B, 'web'));
  assert.equal(cwdForWorkspace(path.join(A, 'only-a'), [B], fs), B, 'sub folder missing here: the root of this copy');
  assert.equal(cwdForWorkspace(path.join(B, 'web'), [B], fs), path.join(B, 'web'), 'already in this window');
  assert.equal(cwdForWorkspace(path.resolve('/other'), [B], fs), path.resolve('/other'), 'another repository');
  assert.equal(cwdForWorkspace(path.join(A, 'web'), [], fs), path.join(A, 'web'), 'no folder open');
});

test('migrateLegacy: the per-folder entries of a root move to the repository key, a newer shared entry wins, others stay', () => {
  const legacy = { [branchKey(A, 'main')]: { thread: 'old-main', at: 5 }, [branchKey(A, 'feat')]: { thread: 'feat', at: 7 }, [branchKey(B, 'main')]: { thread: 'b', at: 1 } };
  const id = 'remote:github.com/org/shop';
  const shared = { [branchKey(id, 'main')]: { thread: 'new-main', at: 9 } };
  const m = migrateLegacy(shared, legacy, A, id);
  assert.ok(m);
  assert.deepEqual(m.map, { [branchKey(id, 'main')]: { thread: 'new-main', at: 9 }, [branchKey(id, 'feat')]: { thread: 'feat', at: 7 } });
  assert.deepEqual(m.rest, { [branchKey(B, 'main')]: { thread: 'b', at: 1 } });
  assert.equal(migrateLegacy(shared, {}, A, id), null);
});

test('0.13.1: a note for the model when the chat moved to another folder or branch, hidden from titles', () => {
  assert.equal(moveNote(null, { cwd: B, branch: 'feat' }), null, 'nothing known: no note');
  assert.equal(moveNote({ cwd: A, branch: 'feat' }, { cwd: A, branch: 'feat' }), null);
  assert.equal(moveNote({ cwd: A, branch: null }, { cwd: A, branch: 'feat' }), null, 'branch unknown before: no note');
  const folder = moveNote({ cwd: A, branch: 'feat' }, { cwd: B, branch: 'feat' }) ?? '';
  assert.ok(folder.startsWith(MOVE_NOTE_PREFIX));
  assert.ok(folder.includes(B) && folder.includes('(before: folder ' + A));
  assert.match(folder, /paths of the old folder/);
  assert.ok(!folder.includes('\n'), 'one line');
  const branch = moveNote({ cwd: A, branch: 'main' }, { cwd: A, branch: 'feat' }) ?? '';
  assert.match(branch, /on git branch feat \(before: .* on git branch main\)\. Earlier messages may name files or paths of the old branch/);
  assert.equal(stripPreamble(folder + '\n\nActive file: x.ts\n\nfix the test'), 'fix the test');
});