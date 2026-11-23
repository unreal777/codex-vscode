// Follow the active project (0.15.1): a chat used from another project moves to the project of the active editor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { followTarget } from '../core/followProject';

const root = path.resolve(__dirname, '..', '..');

test('follow: the chat moves only when the active editor is in an open folder that is not the chat\'s project', () => {
  const a = 'C:\\work\\shop', b = 'C:\\work\\portal';
  assert.equal(followTarget(true, a, a, b, 'win32'), b, 'another project: move');
  assert.equal(followTarget(true, a, null, b, 'win32'), b, 'the chat\'s folder is not open here: move');
  assert.equal(followTarget(true, a, a, a, 'win32'), null, 'same project: stay');
  assert.equal(followTarget(true, 'C:\\WORK\\Shop\\', a, 'c:\\work\\shop', 'win32'), null, 'case and trailing slash do not matter on Windows');
  assert.equal(followTarget(true, 'C:\\work\\shop\\api', a, a, 'win32'), null, 'a sub-folder of the active project: stay');
  assert.equal(followTarget(true, a, a, null, 'win32'), null, 'the active file is in no open folder: stay');
  assert.equal(followTarget(false, a, a, b, 'win32'), null, 'setting off: stay');
  assert.equal(followTarget(true, null, null, b, 'win32'), null, 'no chat folder yet: a new chat starts in the active project anyway');
  assert.equal(followTarget(true, '/x/Shop', '/x/Shop', '/x/shop', 'linux'), '/x/shop', 'case matters on Linux');
});

test('follow: wired through setting, panel send, session and page', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.contributes.configuration.properties['codexPanel.followActiveProject'].default, true);
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.ok(panel.includes("get<boolean>('followActiveProject', true)") && panel.includes('this.session.moveTo(to)'));
  assert.ok(panel.includes('followActiveProject: o?.followActiveProject !== false'));
  const session = fs.readFileSync(path.join(root, 'src', 'session.ts'), 'utf8');
  assert.match(session, /moveTo\(cwd: string\): void \{\s*if \(this\._threadId !== null\) this\._threadCwd = normalizeDrive\(cwd\);/);
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes("saveSettings({ followActiveProject: cbF.checked })") && app.includes('followsActive()'));
});
