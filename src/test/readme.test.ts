// 0.7.9: the README shows the features with GIFs from media/readme (the vsix links them on GitHub);
// ending a list on the last line of the input keeps the caret on the new line; the dev page replays fixtures again.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

test('README: every GIF it shows exists in media/readme (relative links for GitHub)', () => {
  const readme = read('README.md');
  const gifs = [...readme.matchAll(/!\[[^\]]*\]\((media\/readme\/[^)]+\.gif)\)/g)].map((m) => m[1]);
  assert.deepEqual(gifs.sort(), ['chat', 'commit', 'dnd', 'history-ai', 'image', 'input', 'mcp', 'tabs'].map((n) => `media/readme/${n}.gif`));
  for (const g of gifs) {
    const size = fs.statSync(path.join(root, g)).size;
    assert.ok(size > 10_000 && size < 1_500_000, `${g}: ${size} bytes`);
  }
});

test('vsix README: its images and links point to the GitHub repository (the extension page shows only https: images)', () => {
  const pkg = read('scripts/package.mjs');
  assert.ok(pkg.includes("const REPO = 'unreal777/codex-vscode', BRANCH = 'main';"));
  assert.ok(pkg.includes("'--baseImagesUrl', `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`"));
  assert.ok(pkg.includes("'--baseContentUrl', `https://github.com/${REPO}/blob/${BRANCH}/`"));
  assert.ok(!pkg.includes('--no-rewrite-relative-links'));
  assert.equal(JSON.parse(read('package.json')).repository.url, 'https://github.com/unreal777/codex-vscode.git');
  // vsce lets a negation win over any ignore line: media/readme stays out of the vsix by not being named
  const ignore = read('.vscodeignore').split(/\r?\n/);
  assert.ok(ignore.includes('!README.md') && ignore.includes('!media/*') && ignore.includes('!media/web/**'));
  assert.ok(!ignore.some((l) => l.startsWith('!media/**') || /media\/readme/.test(l)));
});

test('input: a list ended with Enter on the last line leaves the caret on the new empty line', () => {
  const app = read('web/app.js');
  const typeOver = app.slice(app.indexOf('function typeOver('), app.indexOf('function listKey('));
  assert.ok(typeOver.includes('input.setSelectionRange(s + text.length, s + text.length);'));
});

test('dev page: fixtures recorded in other threads play in the open dev thread', () => {
  const bridge = read('web/dev-bridge.js');
  assert.ok(bridge.includes("const ours = (p) => (p && p.threadId ? Object.assign({}, p, { threadId: 'dev-thread' }) : p);"));
  assert.ok(bridge.includes("push({ kind: 'notification', method: m.method, params: ours(m.params) });"));
  assert.ok(bridge.includes("push({ kind: 'serverRequest', id: m.id, method: m.method, params: ours(m.params) });"));
});
