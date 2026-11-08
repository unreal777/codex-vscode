// Ports of the checks in tools/InstallerHarness.java (links), FeatureHarness.java (file index, thread rows, dropped paths)
// and CoreHarness.java (difftest), plus the JSON-RPC layer against a fake app-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppServerClient, sandboxPolicy } from '../core/appServer';
import { resolveDropped, MAX_ITEMS, toPath } from '../core/droppedPaths';
import { FileIndex, FileIndexBuilder, isBinaryFile, isIgnoredFolder, MAX_ENTRIES, scanFolder } from '../core/fileIndex';
import { parseFileLink, resolveFileLink } from '../core/fileLinks';
import { RpcError } from '../core/jsonrpc';
import { cwdKey, expandCwds, folderName, isListable, threadMatches, threadTitle } from '../core/threadRows';
import { normalizeDrive } from '../core/winPath';
import { deletedContent, diffPath, parseGitDiff, reverseApply } from '../core/unifiedDiff';
import { bypassProxy, resolveProxy } from '../core/http';
import { modeSettings, reviewer } from '../session';
import { tmpDir } from './helpers';

// ---------------- file links ----------------

function ref(input: string, p: string, line: number, col: number, endLine: number, endCol: number): void {
  const r = parseFileLink(input);
  assert.ok(r, 'parse ' + input);
  assert.deepEqual([r.path, r.line, r.column, r.endLine, r.endColumn], [p, line, col, endLine, endCol], input);
}

test('file link parsing: every form Codex writes', () => {
  ref('/C:/work/shop/README.md:1', 'C:/work/shop/README.md', 1, 0, 0, 0);
  ref('/C:/work/shop/src', 'C:/work/shop/src', 0, 0, 0, 0);
  ref('src/main/Foo.java', 'src/main/Foo.java', 0, 0, 0, 0);
  ref('src/main/Foo.java:42', 'src/main/Foo.java', 42, 0, 0, 0);
  ref('src/main/Foo.java:42:7', 'src/main/Foo.java', 42, 7, 0, 0);
  ref('src/main/Foo.java:42-50', 'src/main/Foo.java', 42, 0, 50, 0);
  ref('src/main/Foo.java#L42', 'src/main/Foo.java', 42, 0, 0, 0);
  ref('src/main/Foo.java#L42C7', 'src/main/Foo.java', 42, 7, 0, 0);
  ref('src/main/Foo.java#L42-L50', 'src/main/Foo.java', 42, 0, 50, 0);
  ref('src/main/Foo.java#L10C3-L12C8', 'src/main/Foo.java', 10, 3, 12, 8);
  ref('file:///C:/work/shop/src/Foo.java:42', 'C:/work/shop/src/Foo.java', 42, 0, 0, 0);
  ref('file:///C:/work/shop/src/Foo.java#L42', 'C:/work/shop/src/Foo.java', 42, 0, 0, 0);
  ref('file:///C:/work/my%20dir/Foo.java', 'C:/work/my dir/Foo.java', 0, 0, 0, 0);
  ref('file:///home/x/Foo.java#L3', '/home/x/Foo.java', 3, 0, 0, 0);
  ref('file://server/share/a.txt', '\\\\server\\share\\a.txt', 0, 0, 0, 0);
  ref('C:/work/shop/src/Foo.java:42', 'C:/work/shop/src/Foo.java', 42, 0, 0, 0);
  ref('C:\\work\\shop\\src\\Foo.java:42', 'C:\\work\\shop\\src\\Foo.java', 42, 0, 0, 0);
  ref('C:\\work\\Foo.java', 'C:\\work\\Foo.java', 0, 0, 0, 0);
  ref('Foo.java:120', 'Foo.java', 120, 0, 0, 0);
  ref('./src/Foo.java', './src/Foo.java', 0, 0, 0, 0);
  ref('file:///C:/work/Rosen%C3%B6gger/Foo.java', 'C:/work/Rosenögger/Foo.java', 0, 0, 0, 0);
  for (const no of ['https://example.com/x', 'mailto:a@b.c', '#section', 'javascript:alert(1)', '']) {
    assert.equal(parseFileLink(no), null, 'not a file: ' + no);
  }
});

test('file link resolving: cwd, roots, project-relative, bare names, partial paths', () => {
  const root = tmpDir('links-');
  fs.mkdirSync(path.join(root, 'src/main'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/main/Parser.java'), 'x');
  fs.writeFileSync(path.join(root, 'docs/My Guide.md'), 'x');
  fs.writeFileSync(path.join(root, 'node_modules/dep/Parser.java'), 'x');
  const other = tmpDir('links-other-');
  const parser = path.join(root, 'src/main/Parser.java');
  assert.equal(resolveFileLink('src/main/Parser.java', root, null), parser, 'relative to cwd');
  assert.equal(resolveFileLink('src/main/Parser.java', other, [root]), parser, 'relative to a workspace folder');
  assert.equal(resolveFileLink('/src/main/Parser.java', root, null), parser, 'leading slash = project relative');
  assert.equal(resolveFileLink(path.join(root, 'docs/My Guide.md'), null, null), path.join(root, 'docs/My Guide.md'), 'absolute');
  assert.equal(resolveFileLink(path.join(root, 'docs/My Guide.md').replace(/\\/g, '/'), null, null), path.join(root, 'docs/My Guide.md'), 'absolute, forward slashes');
  assert.equal(resolveFileLink('src', root, null), path.join(root, 'src'), 'folder');
  assert.equal(resolveFileLink('Parser.java', root, null), parser, 'bare file name found below cwd (skips node_modules)');
  assert.equal(resolveFileLink('main/Parser.java', root, null), parser, 'partial path found below cwd');
  assert.equal(resolveFileLink('src/main/Missing.java', root, [root]), null);
  assert.equal(resolveFileLink(path.join(root, 'nope.txt'), null, null), null);
  assert.equal(resolveFileLink('../Parser.java', path.join(root, 'docs'), null), null, 'dotdot does not search');
});

// ---------------- thread rows ----------------

test('thread titles', () => {
  assert.equal(threadTitle('Fix NPE', 'first message'), 'Fix NPE');
  assert.equal(threadTitle(null, '  Bitte die\nBestellung pruefen  '), 'Bitte die Bestellung pruefen');
  assert.equal(threadTitle(null, 'Active file: C:\\work\\shop\\src\\A.java\n\nWhy does this fail?'), 'Why does this fail?');
  assert.equal(threadTitle(null, 'Referenced files (read them if needed):\n- src/A.java\n- docs (folder)\n\nRefactor this'), 'Refactor this');
  assert.equal(threadTitle('', 'Active file: a.txt\n\nSelected code in a.txt (lines 1-2):\n```\nx = 1;\ny = 2;\n```\n\nExplain this code.'), 'Explain this code.');
  assert.notEqual(threadTitle(null, 'Active file: a.txt\n\n'), '', 'a preview that is only extension context stays visible');
  const long = 'x'.repeat(500);
  assert.ok(threadTitle(null, long).length <= 160 && threadTitle(null, long).endsWith('\u2026'));
});

test('thread folder names, cwd keys, search, listable', () => {
  assert.equal(folderName('C:\\work\\task_conceptPeople'), 'task_conceptPeople');
  assert.equal(folderName('/home/me/shop'), 'shop');
  assert.equal(folderName('C:\\work\\shop\\'), 'shop');
  assert.equal(folderName('\\\\?\\C:\\work\\billing'), 'billing');
  assert.equal(folderName('C:\\'), 'C:');
  assert.equal(folderName(null), '');
  assert.equal(cwdKey('C:\\Work\\Shop\\'), cwdKey('\\\\?\\c:/work/shop'));
  assert.notEqual(cwdKey('C:\\work\\shop'), cwdKey('C:\\work\\shop2'));

  assert.ok(threadMatches('', 't', 'p') && threadMatches(null, 't', 'p'));
  assert.ok(threadMatches('order', 'Fix the ORDER export', 'shop'), 'case-insensitive');
  assert.ok(threadMatches('conceptpeople', 'Refactor', 'task_conceptPeople'), 'matches the project name');
  assert.ok(threadMatches('shop invoice', 'Invoice export', 'shop') && !threadMatches('shop payroll', 'Invoice export', 'shop'), 'every word must occur');

  assert.ok(isListable({ id: '1', name: null, preview: 'hello', ephemeral: false, parentThreadId: null }));
  assert.ok(!isListable({ id: '2', preview: 'hello', ephemeral: true }));
  assert.ok(!isListable({ id: '3', preview: 'hello', parentThreadId: '1' }));
  assert.ok(!isListable({ id: '4', name: null, preview: '  ' }));
});

// ---------------- dropped paths ----------------

test('windows drive letter: uppercase on win32 only, nothing else touched', () => {
  assert.equal(normalizeDrive('d:\\CodexPanel\\codex-vscode', 'win32'), 'D:\\CodexPanel\\codex-vscode');
  assert.equal(normalizeDrive('d:/CodexPanel', 'win32'), 'D:/CodexPanel');
  assert.equal(normalizeDrive('d:', 'win32'), 'D:');
  assert.equal(normalizeDrive('D:\\x', 'win32'), 'D:\\x');
  assert.equal(normalizeDrive('c:\\Users\\a b\\ä', 'win32'), 'C:\\Users\\a b\\ä');
  assert.equal(normalizeDrive('\\\\?\\d:\\x', 'win32'), '\\\\?\\d:\\x', 'long-path prefix is left alone');
  assert.equal(normalizeDrive('\\\\server\\share', 'win32'), '\\\\server\\share');
  assert.equal(normalizeDrive('/home/me/d:x', 'win32'), '/home/me/d:x');
  assert.equal(normalizeDrive('dd:\\x', 'win32'), 'dd:\\x');
  assert.equal(normalizeDrive('d:foo', 'win32'), 'd:foo', 'drive-relative path is not a drive root');
  assert.equal(normalizeDrive('', 'win32'), '');
  assert.equal(normalizeDrive(null), null);
  assert.equal(normalizeDrive(undefined, 'win32'), null);
  assert.equal(normalizeDrive('d:\\x', 'linux'), 'd:\\x');
  assert.equal(normalizeDrive('d:\\x', 'darwin'), 'd:\\x');
  // default platform = the running one
  assert.equal(normalizeDrive('d:\\x'), process.platform === 'win32' ? 'D:\\x' : 'd:\\x');
});

test('cwd spelling expansion for the exact-match thread/list filter', () => {
  const seen = ['D:\\CodexPanel\\codex-vscode', 'd:\\codexpanel\\codex-vscode', 'D:/CodexPanel/codex-vscode/', '\\\\?\\D:\\CodexPanel\\codex-vscode', 'D:\\CodexPanel\\codex-panel', 'D:\\Other'];
  assert.deepEqual(expandCwds(['D:\\CodexPanel\\codex-vscode'], seen), [
    'D:\\CodexPanel\\codex-vscode', 'd:\\codexpanel\\codex-vscode', 'D:/CodexPanel/codex-vscode/', '\\\\?\\D:\\CodexPanel\\codex-vscode']);
  // the selected spelling leads even when it was never seen; unrelated folders (also longer names) are not pulled in
  assert.deepEqual(expandCwds(['d:\\CodexPanel\\codex-panel'], seen), ['d:\\CodexPanel\\codex-panel', 'D:\\CodexPanel\\codex-panel']);
  assert.deepEqual(expandCwds(['D:\\CodexPanel'], seen), ['D:\\CodexPanel']);
  // several selections, duplicates collapse, empty input stays empty
  assert.deepEqual(expandCwds(['D:\\Other', 'd:/other', 'D:\\Other'], seen), ['D:\\Other', 'd:/other']);
  assert.deepEqual(expandCwds([], seen), []);
  assert.deepEqual(expandCwds(['D:\\x'], []), ['D:\\x']);
  assert.deepEqual(expandCwds(['D:\\x'], new Set(['D:\\X\\', 'D:\\x'])), ['D:\\x', 'D:\\X\\']);
});

test('dropped paths: files, folders, relative, quotes, file: URIs, umlauts, spaces, duplicates, caps', () => {
  const root = tmpDir('dropped-');
  const project = path.join(root, 'shop');
  const folder = path.join(project, 'src');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'App.java');
  fs.writeFileSync(file, 'x');
  fs.mkdirSync(path.join(root, 'my docs'), { recursive: true });
  const spaced = path.join(root, 'my docs', 'a b.txt');
  fs.writeFileSync(spaced, 'x');
  const umlautDir = path.join(root, 'Rosenögger Müller');
  fs.mkdirSync(umlautDir, { recursive: true });
  const umlaut = path.join(umlautDir, 'Größe über.txt');
  fs.writeFileSync(umlaut, 'x');
  const cwd = project;

  const single = resolveDropped([file], cwd);
  assert.deepEqual(single, [{ path: file, folder: false }], 'absolute path becomes a file item');
  assert.deepEqual(resolveDropped([folder], cwd), [{ path: folder, folder: true }], 'a folder becomes a folder item');
  const relative = resolveDropped(['src/App.java', 'src'], cwd);
  assert.deepEqual(relative.map((i) => [i.path, i.folder]), [[file, false], [folder, true]], 'relative paths resolve against the chat cwd');
  const lines = resolveDropped([file + '\r\n"' + spaced + '"\n\nnot a path at all\n' + path.join(root, 'missing.txt')], cwd);
  assert.deepEqual(lines.map((i) => i.path), [file, spaced], 'one path per line, quotes stripped, junk and missing files ignored');
  const uri = resolveDropped([pathToFileURL(file).href, pathToFileURL(file).href + '\n' + file], cwd);
  assert.equal(uri.length, 1, 'file: URIs (percent-encoded) work and are de-duplicated');
  assert.equal(uri[0].path, file);
  assert.equal(resolveDropped(['file:///' + spaced.replace(/\\/g, '/')], cwd).length, 1, 'file: URI with a raw space in the path');
  assert.equal(resolveDropped([pathToFileURL(spaced).href], cwd)[0].path, spaced, 'file: URI with %20');
  assert.equal(resolveDropped([pathToFileURL(umlaut).href], cwd)[0].path, umlaut, 'file: URI with percent-encoded umlauts');
  assert.equal(resolveDropped(['file:///' + umlaut.replace(/\\/g, '/')], cwd)[0].path, umlaut, 'file: URI with raw umlauts');
  assert.equal(resolveDropped([umlaut], cwd)[0].path, umlaut, 'plain path with umlauts');
  assert.equal(resolveDropped([`"${umlaut}"`], cwd)[0].path, umlaut, 'quoted umlaut path');
  assert.equal(resolveDropped([pathToFileURL(umlautDir).href], cwd)[0].folder, true, 'a folder URI becomes a folder chip');
  assert.equal(toPath('vscode-remote://ssh-remote+host/home/x', cwd), null, 'other schemes are not paths');
  if (process.platform === 'win32') {
    assert.equal(resolveDropped(['/' + file.replace(/\\/g, '/')], cwd).length, 1, "'/C:/x' form that Codex writes");
    assert.equal(resolveDropped([file, file.toUpperCase()], cwd).length, 1, 'case-insensitive duplicates collapse on Windows');
  }
  const nested = resolveDropped([[file, [folder]], null, 42, 'http://example.com/x'], cwd);
  assert.equal(nested.length, 2, 'nested arrays flatten; null, numbers and http URLs are ignored');
  assert.ok(resolveDropped(['hello world', ''], cwd).length === 0 && resolveDropped(null, cwd).length === 0, 'nothing usable gives an empty list');

  const many: string[] = [];
  for (let i = 0; i < MAX_ITEMS + 10; i++) {
    const f = path.join(root, `f${i}.txt`);
    fs.writeFileSync(f, 'x');
    many.push(f);
  }
  assert.equal(resolveDropped(many, cwd).length, MAX_ITEMS, 'at most ' + MAX_ITEMS + ' items per drop');
});

// ---------------- file index ----------------

function sampleIndex(): FileIndex {
  const b = new FileIndexBuilder();
  for (const f of ['src', 'src/main', 'src/main/java', 'src/main/java/shop', 'src/test', 'docs']) b.add(f, true);
  for (const f of ['pom.xml', 'README.md', 'src/main/java/shop/OrderService.java', 'src/main/java/shop/OrderRepository.java', 'src/main/java/shop/Order.java',
    'src/main/java/shop/InvoiceExporter.java', 'src/main/java/shop/util/StringUtils.java', 'src/main/resources/application.properties',
    'src/test/java/shop/OrderServiceTest.java', 'docs/order-flow.md', 'docs/Ordering.txt', 'build.gradle', 'src/main/java/shop/ShippingOrderValidator.java']) b.add(f, false);
  return b.build();
}
const paths = (hits: ReturnType<FileIndex['search']>): string[] => hits.map((h) => h.entry.path);

test('file index ranking', () => {
  const index = sampleIndex();
  const order = paths(index.search('order', 10, []));
  assert.ok(order[0] === 'src/main/java/shop/Order.java' && order.includes('docs/order-flow.md'), order.join());
  assert.equal(paths(index.search('Order.java', 5, []))[0], 'src/main/java/shop/Order.java', 'exact name wins');
  const prefix = paths(index.search('OrderS', 5, []));
  assert.ok(prefix[0].endsWith('OrderService.java') && prefix[1].endsWith('OrderServiceTest.java'), prefix.join());
  assert.ok(paths(index.search('valid', 5, []))[0].endsWith('ShippingOrderValidator.java'), 'substring of the name');
  assert.ok(paths(index.search('osv', 5, [])).includes('src/main/java/shop/OrderService.java'), 'fuzzy initials');
  const inPath = paths(index.search('shop/order', 10, []));
  assert.ok(inPath.length >= 3 && inPath[0].includes('shop/Order'), 'a query with / matches against the path');
  assert.ok(paths(index.search('resources', 5, [])).includes('src/main/resources/application.properties'), 'path substring');
  assert.equal(index.search('zzzzqq', 5, []).length, 0);
  assert.equal(index.search('o', 3, []).length, 3, 'limit is respected');
  assert.ok(paths(index.search('@src\\main\\java\\shop\\order', 3, []))[0].startsWith('src/main/java/shop/Order'), 'leading @ and backslashes');
  assert.ok(paths(index.search('shop', 20, [])).includes('src/main/java/shop'), 'folder still found');

  const empty = paths(index.search('', 6, ['docs/order-flow.md', 'pom.xml']));
  assert.deepEqual(empty.slice(0, 4), ['docs/order-flow.md', 'pom.xml', 'README.md', 'build.gradle'], 'recent first, then shallow files, root first');
  assert.ok(!empty.includes('src') && !empty.includes('docs'), 'no folders before files');
  const boosted = paths(index.search('order', 10, ['docs/Ordering.txt']));
  assert.ok(boosted.indexOf('docs/Ordering.txt') < paths(index.search('order', 10, [])).indexOf('docs/Ordering.txt'), 'a recent file is lifted');
});

test('file index: ignored folders and binary extensions', () => {
  for (const n of ['.git', 'node_modules', 'target', 'bin', 'build', '.settings', '.metadata']) assert.ok(isIgnoredFolder(n), n);
  assert.ok(!isIgnoredFolder('src') && !isIgnoredFolder('binary-utils'));
  assert.ok(isBinaryFile('a.PNG') && isBinaryFile('lib/x.jar') && isBinaryFile('Foo.class'));
  assert.ok(!isBinaryFile('Foo.java') && !isBinaryFile('Makefile') && !isBinaryFile('notes.md'));
});

test('file index: folder scan and size cap', async () => {
  const root = tmpDir('fileindex-');
  for (const d of ['src/pkg', '.git/objects', 'node_modules/left-pad', 'bin', 'target/classes', 'docs']) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const f of ['src/pkg/App.java', 'src/pkg/Util.java', '.git/config', 'node_modules/left-pad/index.js', 'bin/App.class', 'target/classes/App.class', 'docs/logo.png', 'docs/guide.md', 'pom.xml']) {
    fs.writeFileSync(path.join(root, f), 'x');
  }
  const index = await scanFolder(root);
  const all = paths(index.search('', 100, []));
  const joined = all.join();
  assert.ok(!joined.includes('.git') && !joined.includes('node_modules') && !all.includes('bin/App.class') && !joined.includes('target') && !all.includes('docs/logo.png'), joined);
  for (const p of ['src/pkg/App.java', 'docs/guide.md', 'src/pkg', 'pom.xml']) assert.ok(all.includes(p), p);
  assert.equal(paths(index.search('app', 3, []))[0], 'src/pkg/App.java');

  const big = new FileIndexBuilder();
  let stopped = false;
  for (let i = 0; i < MAX_ENTRIES + 5; i++) {
    if (!big.add('f' + i, false)) { stopped = true; break; }
  }
  assert.ok(stopped && big.build().size === MAX_ENTRIES, 'index size is capped at ' + MAX_ENTRIES);
});

// ---------------- unified diff ----------------

test('unified diff: reverse-apply, parse, deleted content', () => {
  const after = 'alpha\nBETA\ngamma\n';
  const hunks = '@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n';
  assert.equal(reverseApply(after, hunks), 'alpha\nbeta\ngamma\n', 'update');
  assert.equal(reverseApply(after.replace(/\n/g, '\r\n'), hunks), 'alpha\r\nbeta\r\ngamma\r\n', 'update crlf');
  const h2 = '@@ -1,3 +1,4 @@\n l1\n+ins\n l2\n l3\n@@ -9,4 +10,3 @@\n l9\n-old\n+X\n l11\n';
  const after2 = 'l1\nins\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nX\nl11\nl12\n';
  assert.equal(reverseApply(after2, h2), 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nold\nl11\nl12\n', 'two hunks');
  assert.equal(reverseApply('something else\n', hunks), null, 'hunks that do not match give null');
  assert.equal(reverseApply('x\n\nalpha\nBETA\ngamma\n', hunks), 'x\n\nalpha\nbeta\ngamma\n', 'hunk found away from its stated line');

  const git = 'diff --git a/hello.txt b/hello.txt\nnew file mode 100644\nindex 0..4\n--- /dev/null\n+++ b/hello.txt\n@@ -0,0 +1 @@\n+hi\n'
    + 'diff --git a/notes.txt b/notes.txt\nindex 8..e\n--- a/notes.txt\n+++ b/notes.txt\n' + hunks;
  const fds = parseGitDiff(git);
  assert.equal(fds.length, 2);
  assert.deepEqual([diffPath(fds[0]), fds[0].isNew], ['hello.txt', true]);
  assert.equal(fds[1].hunks, hunks);
  assert.equal(deletedContent('@@ -1,2 +0,0 @@\n-a\n-b\n'), 'a\nb\n');
  const del = parseGitDiff('diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye\n');
  assert.deepEqual([diffPath(del[0]), del[0].isDelete], ['gone.txt', true]);
});

// ---------------- session helpers / proxy resolution ----------------

test('access modes and approvals reviewer', () => {
  assert.deepEqual(modeSettings('read-only'), ['read-only', 'readOnly', 'on-request']);
  assert.deepEqual(modeSettings('full'), ['danger-full-access', 'dangerFullAccess', 'never']);
  assert.deepEqual(modeSettings('auto'), ['workspace-write', 'workspaceWrite', 'on-request']);
  assert.deepEqual(modeSettings(''), ['workspace-write', 'workspaceWrite', 'on-request']);
  assert.equal(reviewer('auto_review'), 'auto_review');
  assert.equal(reviewer('user'), 'user');
  assert.equal(reviewer(null), 'user');
  assert.deepEqual(sandboxPolicy('readOnly'), { type: 'readOnly', networkAccess: false });
  assert.deepEqual(sandboxPolicy('dangerFullAccess'), { type: 'dangerFullAccess' });
  assert.equal(sandboxPolicy('workspaceWrite').excludeSlashTmp, false);
});

test('proxy resolution: setting beats environment, NO_PROXY honoured', () => {
  assert.equal(resolveProxy('http://p:8080', true, { HTTPS_PROXY: 'http://env:1' }).url, 'http://p:8080');
  assert.equal(resolveProxy('', true, { HTTPS_PROXY: 'http://env:1' }).url, 'http://env:1');
  assert.equal(resolveProxy(undefined, true, { http_proxy: 'http://low:2' }).url, 'http://low:2');
  assert.equal(resolveProxy(undefined, true, {}).url, undefined);
  assert.equal(resolveProxy('x', false, {}).strictSSL, false);
  assert.ok(bypassProxy('registry.npmjs.org', 'localhost, .npmjs.org'));
  assert.ok(bypassProxy('registry.npmjs.org', '*'));
  assert.ok(!bypassProxy('registry.npmjs.org', 'example.com,localhost'));
});

// ---------------- JSON-RPC against a fake app-server ----------------

const FAKE_SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'fake', echo: m.params } });
  else if (m.method === 'thread/list') send({ id: m.id, result: { data: [], nextCursor: null, echo: m.params } });
  else if (m.method === 'boom') send({ id: m.id, error: { code: -32000, message: 'exploded' } });
  else if (m.method === 'ask') { send({ id: 99, method: 'item/commandExecution/requestApproval', params: { command: 'ls' } }); send({ method: 'turn/started', params: { turn: { id: 't1' } } }); send({ id: m.id, result: {} }); }
  else if (m.method === 'unknownReq') { send({ id: 7, method: 'something/unsupported', params: {} }); send({ id: m.id, result: {} }); }
  else if (m.id !== undefined && m.method) send({ id: m.id, result: {} });
  else if (m.id === 99) send({ method: 'decision/seen', params: m.result });
  else if (m.id === 7) send({ method: 'error/seen', params: m.error });
});
`;

test('json-rpc: requests, errors, notifications, server requests, unsupported methods', async () => {
  const dir = tmpDir('fake-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, FAKE_SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  const notes: Array<[string, unknown]> = [];
  c.setEventListener({ onNotification: (m, p) => notes.push([m, p]), onClosed: () => {} });
  c.onServerRequest('item/commandExecution/requestApproval', (req) => c.respondDecision(req.id, 'accept'));
  await c.start();
  try {
    const init = await c.initialize('codex-panel-test', 'Test', '0.1.0');
    assert.deepEqual(init.echo, { clientInfo: { name: 'codex-panel-test', title: 'Test', version: '0.1.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
    const list = await c.listThreads('C:\\work\\shop', 'CUR', 40, true);
    assert.deepEqual(list.echo, { limit: 40, sortKey: 'updated_at', sortDirection: 'desc', archived: false, cwd: 'C:\\work\\shop', cursor: 'CUR', useStateDbOnly: true });
    const all = await c.listThreads(null, null, 40, false);
    assert.deepEqual(all.echo, { limit: 40, sortKey: 'updated_at', sortDirection: 'desc', archived: false });
    await assert.rejects(c.call('boom'), (e: Error) => e instanceof RpcError && e.code === -32000 && e.message === 'exploded');
    await c.call('ask');
    await c.call('unknownReq');
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(notes.some(([m, p]) => m === 'turn/started' && (p as any).turn.id === 't1'));
    assert.ok(notes.some(([m, p]) => m === 'decision/seen' && (p as any).decision === 'accept'), 'approval answered with {decision}');
    assert.ok(notes.some(([m, p]) => m === 'error/seen' && (p as any).code === -32601 && /Unsupported by Codex Panel/.test((p as any).message)), 'unsupported server request gets an error reply');
  } finally {
    c.close();
  }
});

test('json-rpc: process exit fails pending requests and reports the close once', async () => {
  const dir = tmpDir('fake-exit-');
  const script = path.join(dir, 'exit.js');
  fs.writeFileSync(script, "process.stdin.once('data', () => process.exit(3));");
  const c = new AppServerClient([process.execPath, script], dir);
  const closed: string[] = [];
  c.setEventListener({ onNotification: () => {}, onClosed: (r) => closed.push(r) });
  await c.start();
  await assert.rejects(c.call('anything'), /app-server process ended \(exit 3\)/);
  assert.equal(closed.length, 1);
  assert.match(closed[0], /exit 3/);
});

test('json-rpc: a missing executable is an error, not a hang', async () => {
  const c = new AppServerClient([path.join(tmpDir('nope-'), 'codex.exe')], undefined);
  await assert.rejects(c.start());
});
