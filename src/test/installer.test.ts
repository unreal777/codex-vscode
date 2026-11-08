// Port of tools/InstallerHarness.java (negative + links modes) plus checks for the shared %LOCALAPPDATA%\CodexPanel layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';
import { CodexInstaller, checkDue, checkUrl, compareVersions, digestFile, parseManifest, platformTag, readState, verifyIntegrity } from '../core/installer';
import { extractTarGz } from '../core/tar';
import { locate } from '../core/locator';
import { paxRecord, tgz, tmpDir } from './helpers';

const manifest = (version: string): unknown => ({
  name: '@openai/codex',
  version,
  dist: { tarball: `https://registry.npmjs.org/@openai/codex/-/codex-${version}.tgz`, integrity: 'sha512-AAAA' },
});
const noProgress = () => {};

test('registry URL checks: https, exactly registry.npmjs.org, no credentials', () => {
  assert.throws(() => checkUrl(new URL('http://registry.npmjs.org/x.tgz')), /refusing/);
  assert.throws(() => checkUrl(new URL('https://evil.example.com/x.tgz')), /refusing/);
  assert.throws(() => checkUrl(new URL('https://registry.npmjs.org.evil.com/x.tgz')), /refusing/);
  assert.throws(() => checkUrl(new URL('https://registry.npmjs.org@evil.com/x.tgz')), /refusing/);
  assert.throws(() => checkUrl(new URL('https://user:pw@registry.npmjs.org/x.tgz')), /refusing/);
  assert.throws(() => checkUrl(new URL('https://registry.npmjs.org:8443/x.tgz')), /refusing/);
  checkUrl(new URL('https://registry.npmjs.org/@openai/codex/-/codex-0.166.0-win32-x64.tgz'));
  checkUrl(new URL('https://registry.npmjs.org:443/x.tgz'));
});

test('manifest: only stable per-platform versions are accepted', () => {
  assert.throws(() => parseManifest(manifest('0.168.0-alpha.1-win32-x64'), 'win32-x64'), /non-stable/);
  assert.throws(() => parseManifest(manifest('0.168.0-beta.3-win32-x64'), 'win32-x64'), /non-stable/);
  assert.throws(() => parseManifest(manifest('0.166.0-linux-x64'), 'win32-x64'), /non-stable/);
  assert.throws(() => parseManifest(manifest('0.166.0-win32-arm64'), 'win32-x64'), /non-stable/);
  assert.throws(() => parseManifest(manifest('0.166.0'), 'win32-x64'), /non-stable/);
  assert.equal(parseManifest(manifest('0.166.0-win32-x64'), 'win32-x64').version, '0.166.0');
  assert.throws(() => parseManifest({ name: 'evil', version: '0.166.0-win32-x64' }, 'win32-x64'), /not @openai\/codex/);
  const noIntegrity = { name: '@openai/codex', version: '0.166.0-win32-x64', dist: { tarball: 'https://registry.npmjs.org/x.tgz' } };
  assert.throws(() => parseManifest(noIntegrity, 'win32-x64'), /lacks tarball\/sha512/);
  const sha1 = { name: '@openai/codex', version: '0.166.0-win32-x64', dist: { tarball: 'https://registry.npmjs.org/x.tgz', integrity: 'sha1-abc' } };
  assert.throws(() => parseManifest(sha1, 'win32-x64'), /lacks tarball\/sha512/);
  const evilTarball = { name: '@openai/codex', version: '0.166.0-win32-x64', dist: { tarball: 'https://evil.example.com/x.tgz', integrity: 'sha512-AAAA' } };
  assert.throws(() => parseManifest(evilTarball, 'win32-x64'), /refusing/);
  assert.match(platformTag(), /^win32-(x64|arm64)$/);
});

test('version compare', () => {
  assert.ok(compareVersions('0.166.0', '0.99.1') > 0);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0);
});

test('good archive extracts the vendor folder only', async () => {
  const dir = tmpDir('installer-good-');
  const f = path.join(dir, 'good.tgz');
  fs.writeFileSync(f, tgz([{ name: 'package/package.json', content: '{}' }, { name: 'package/vendor/x/bin/readme.txt', content: 'hello' }]));
  const out = path.join(dir, 'out');
  const n = await extractTarGz(f, out, 'package/vendor/');
  assert.equal(n, 1);
  assert.equal(fs.readFileSync(path.join(out, 'vendor/x/bin/readme.txt'), 'utf8'), 'hello');
  assert.ok(!fs.existsSync(path.join(out, 'package.json')));
});

test('large file is streamed across chunk boundaries intact', async () => {
  const dir = tmpDir('installer-big-');
  const big = crypto.randomBytes(5 * 1024 * 1024 + 123);
  const f = path.join(dir, 'big.tgz');
  fs.writeFileSync(f, tgz([{ name: 'package/vendor/x/bin/big.bin', content: big }, { name: 'package/vendor/x/bin/after.txt', content: 'tail' }]));
  const n = await extractTarGz(f, path.join(dir, 'out'), 'package/vendor/');
  assert.equal(n, 2);
  assert.ok(fs.readFileSync(path.join(dir, 'out/vendor/x/bin/big.bin')).equals(big));
  assert.equal(fs.readFileSync(path.join(dir, 'out/vendor/x/bin/after.txt'), 'utf8'), 'tail');
});

test('pax long names are honoured', async () => {
  const dir = tmpDir('installer-pax-');
  const longName = 'package/vendor/' + 'd'.repeat(60) + '/' + 'e'.repeat(60) + '/file.txt';
  const f = path.join(dir, 'pax.tgz');
  fs.writeFileSync(f, tgz([{ name: 'PaxHeader', type: 'x', content: paxRecord('path', longName) }, { name: 'short', content: 'pax' }]));
  const n = await extractTarGz(f, path.join(dir, 'out'), 'package/vendor/');
  assert.equal(n, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'out', longName.substring('package/'.length)), 'utf8'), 'pax');
});

test('zip-slip: unsafe entry names reject the whole archive and nothing escapes', async () => {
  const dir = tmpDir('installer-evil-');
  const cases: Array<[string, string]> = [
    ['package/vendor/../../evil.txt', 'dotdot'],
    ['/abs/evil.txt', 'absolute'],
    ['package/vendor/C:/evil.txt', 'drive letter'],
    ['package/vendor/..\\..\\evil.txt', 'backslash'],
    ['../evil.txt', 'leading dotdot'],
  ];
  for (const [name, label] of cases) {
    const f = path.join(dir, 'evil.tgz');
    fs.writeFileSync(f, tgz([{ name: 'package/vendor/ok.txt', content: 'ok' }, { name, content: 'pwned' }]));
    const out = path.join(dir, 'out-' + label.replace(/ /g, '_'));
    await assert.rejects(extractTarGz(f, out, 'package/vendor/'), /unsafe path/, label);
    assert.ok(!fs.existsSync(path.join(dir, 'evil.txt')) && !fs.existsSync(path.join(path.dirname(out), 'evil.txt')) && !fs.existsSync('C:/evil.txt'), 'escaped: ' + label);
  }
  // an unsafe name is fatal even for entries outside the extracted prefix
  const f = path.join(dir, 'outside.tgz');
  fs.writeFileSync(f, tgz([{ name: 'package/../evil.txt', content: 'x' }]));
  await assert.rejects(extractTarGz(f, path.join(dir, 'out-outside'), 'package/vendor/'), /unsafe path/);
});

test('symlinks and hard links in the archive are never created', async () => {
  const dir = tmpDir('installer-link-');
  const f = path.join(dir, 'link.tgz');
  fs.writeFileSync(f, tgz([
    { name: 'package/vendor/x/bin/real.txt', content: 'real' },
    { name: 'package/vendor/x/bin/sym', type: '2', linkName: '../../../../../../Windows/win.ini' },
    { name: 'package/vendor/x/bin/hard', type: '1', linkName: 'package/vendor/x/bin/real.txt' },
  ]));
  const out = path.join(dir, 'out');
  const n = await extractTarGz(f, out, 'package/vendor/');
  assert.equal(n, 1);
  assert.ok(fs.existsSync(path.join(out, 'vendor/x/bin/real.txt')));
  assert.ok(!fs.existsSync(path.join(out, 'vendor/x/bin/sym')) && !fs.existsSync(path.join(out, 'vendor/x/bin/hard')));
});

test('truncated archive is rejected', async () => {
  const dir = tmpDir('installer-trunc-');
  const full = tgz([{ name: 'package/vendor/x/a.bin', content: crypto.randomBytes(200000) }]);
  const f = path.join(dir, 't.tgz');
  fs.writeFileSync(f, full.subarray(0, Math.floor(full.length / 2)));
  await assert.rejects(extractTarGz(f, path.join(dir, 'out'), 'package/vendor/'));
});

test('integrity: right sha512 passes; flipped byte, wrong hash and sha1 are rejected before extraction', async () => {
  const dir = tmpDir('installer-sha-');
  const good = tgz([{ name: 'package/package.json', content: '{}' }, { name: 'package/vendor/x/bin/readme.txt', content: 'hello' }]);
  const goodFile = path.join(dir, 'good.tgz');
  fs.writeFileSync(goodFile, good);
  const expected = 'sha512-' + (await digestFile(goodFile)).toString('base64');
  verifyIntegrity(await digestFile(goodFile), expected);
  verifyIntegrity(await digestFile(goodFile), 'sha1-zzz ' + expected); // several hashes: one match is enough
  const bad = Buffer.from(good);
  bad[Math.floor(bad.length / 2)] ^= 0x01;
  const badFile = path.join(dir, 'bad.tgz');
  fs.writeFileSync(badFile, bad);
  assert.throws(() => verifyIntegrity(crypto.createHash('sha512').update(bad).digest(), expected), /integrity check failed/);
  assert.throws(() => verifyIntegrity(crypto.createHash('sha512').update(good).digest(), 'sha1-' + 'A'.repeat(27) + '='), /integrity check failed/);
  assert.throws(() => verifyIntegrity(crypto.createHash('sha512').update(good).digest(), 'sha512-!!!notbase64'), /integrity check failed/);

  const base = path.join(dir, 'base');
  const inst = new CodexInstaller(base);
  const r = { version: '9.9.9', tarball: 'https://registry.npmjs.org/x.tgz', integrity: expected };
  await assert.rejects(inst.installFromFile(badFile, r, noProgress), /integrity check failed/);
  assert.ok(!fs.existsSync(path.join(base, 'codex/9.9.9')) && !fs.existsSync(path.join(base, 'codex/.tmp-9.9.9')), 'nothing installed after rejection');
  await assert.rejects(inst.installFromFile(goodFile, r, noProgress), /codex\.exe not found/);
  assert.ok(!fs.existsSync(path.join(base, 'codex/.tmp-9.9.9')) && !fs.existsSync(path.join(base, 'codex/9.9.9')), 'tmp dir removed after failed install');
  assert.ok(!fs.existsSync(path.join(base, 'codex/current.json')), 'current.json untouched by a failed install');
});

// The one executable we can fake without shipping a binary: node.exe prints "v<version>" for --version, and the installer only
// requires that the output contains the version string.
test('full install from file: layout, current.json format, previous version, cleanup (Windows)', { skip: process.platform !== 'win32' }, async () => {
  const dir = tmpDir('installer-full-');
  const version = process.versions.node;
  const triple = 'x86_64-pc-windows-msvc';
  const archive = path.join(dir, 'codex.tgz');
  fs.writeFileSync(archive, tgz([
    { name: 'package/package.json', content: '{}' },
    { name: `package/vendor/${triple}/bin/codex.exe`, content: fs.readFileSync(process.execPath) },
    { name: `package/vendor/${triple}/codex-resources/helper.txt`, content: 'helper' },
  ]));
  const integrity = 'sha512-' + (await digestFile(archive)).toString('base64');

  // a state as the Eclipse plugin wrote it (Java Instant with nanoseconds), an old version folder and leftovers
  const base = path.join(dir, 'CodexPanel');
  const root = path.join(base, 'codex');
  fs.mkdirSync(path.join(root, '0.1.0', 'vendor'), { recursive: true });
  fs.mkdirSync(path.join(root, '0.0.9'), { recursive: true });
  fs.mkdirSync(path.join(root, '.tmp-0.2.0'), { recursive: true });
  fs.writeFileSync(path.join(root, '.dl-0.2.0.tgz'), 'partial');
  const exe010 = path.join(root, '0.1.0', 'vendor', 'codex.exe');
  fs.writeFileSync(exe010, 'x');
  fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({
    version: '0.1.0', exePath: exe010, installedAt: '2026-11-04T12:51:25.165428700Z', lastCheck: '2026-11-04T14:12:19.647810100Z',
  }));
  const before = readState(base);
  assert.equal(before.version, '0.1.0');
  assert.equal(before.lastCheck?.toISOString(), '2026-11-04T14:12:19.647Z');

  const phases: string[] = [];
  await new CodexInstaller(base).installFromFile(archive, { version, tarball: 'https://registry.npmjs.org/x.tgz', integrity }, (p) => phases.push(p));
  assert.deepEqual(phases, ['extracting', 'validating']);

  const state = readState(base);
  assert.equal(state.version, version);
  assert.equal(state.previous, '0.1.0');
  assert.equal(state.exe, path.join(root, version, 'vendor', triple, 'bin', 'codex.exe'));
  assert.ok(fs.existsSync(state.exe as string));
  assert.ok(fs.existsSync(path.join(root, version, 'vendor', triple, 'codex-resources', 'helper.txt')), 'helpers next to codex.exe');
  assert.ok(!fs.existsSync(path.join(root, '.tmp-' + version)), 'no temp folder left');
  assert.ok(!fs.existsSync(path.join(root, 'current.json.tmp')), 'no temp state file left');
  assert.ok(!fs.existsSync(path.join(root, '0.0.9')) && !fs.existsSync(path.join(root, '.tmp-0.2.0')) && !fs.existsSync(path.join(root, '.dl-0.2.0.tgz')),
    'old versions and leftovers cleaned');
  assert.ok(fs.existsSync(path.join(root, '0.1.0')), 'the previous version is kept');

  // current.json: same keys and order as Gson wrote them, ISO instants, absolute exePath
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'current.json'), 'utf8'));
  assert.deepEqual(Object.keys(raw), ['version', 'exePath', 'previous', 'installedAt', 'lastCheck']);
  assert.match(raw.installedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);
  assert.equal(fs.readFileSync(path.join(root, 'current.json'), 'utf8').charCodeAt(0), 0x7b, 'no BOM');

  // the locator prefers the managed copy and reads exactly this file
  const l = locate(null, base, true, {});
  assert.equal(l.version, version);
  assert.equal(l.file, state.exe);
  assert.ok(!checkDue(base, 7) && !checkDue(base, 0));
  fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ version, exePath: state.exe, lastCheck: '2020-01-01T00:00:00Z' }));
  assert.ok(checkDue(base, 7), 'an old lastCheck is due');
  assert.ok(!checkDue(base, 0), 'interval 0 = never check automatically');
});

test('locator: explicit path wins, missing managed copy falls through with a clear message', () => {
  const dir = tmpDir('locator-');
  const exe = path.join(dir, 'codex.exe');
  fs.writeFileSync(exe, 'x');
  assert.equal(locate(exe, dir, true, {}).source, 'extension setting');
  assert.throws(() => locate('', dir, true, { PATH: '', APPDATA: dir }), /codex executable not found.*managed copy/);
  assert.equal(locate('', dir, false, { CODEX_EXECUTABLE: exe }).source, 'CODEX_EXECUTABLE');
});

// ---- proxy: CONNECT tunnelling against the real registry through a local proxy (skipped when offline) ----

test('registry manifest through a local CONNECT proxy with basic auth', async (t) => {
  const seen: Array<{ url?: string; auth?: string }> = [];
  const proxy = http.createServer();
  proxy.on('connect', (req, clientSocket) => {
    seen.push({ url: req.url, auth: req.headers['proxy-authorization'] as string | undefined });
    const [host, port] = (req.url as string).split(':');
    const up = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      up.pipe(clientSocket);
      clientSocket.pipe(up);
    });
    up.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => up.destroy());
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  const port = (proxy.address() as net.AddressInfo).port;
  try {
    const inst = new CodexInstaller(tmpDir('installer-proxy-'), { url: `http://us%40er:pa%20ss@127.0.0.1:${port}`, strictSSL: true });
    let remote;
    try {
      remote = await inst.fetchLatest();
    } catch (e) {
      if (seen.length > 0) throw e; // the proxy was used, so this is a real failure
      t.skip('registry not reachable: ' + (e as Error).message);
      return;
    }
    assert.match(remote.version, /^\d+\.\d+\.\d+$/);
    assert.ok(remote.integrity.startsWith('sha512-'));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'registry.npmjs.org:443');
    assert.equal(seen[0].auth, 'Basic ' + Buffer.from('us@er:pa ss').toString('base64'));
  } finally {
    proxy.close();
    proxy.closeAllConnections?.();
  }
});

test('a proxy that refuses the tunnel gives a clear error', async () => {
  const proxy = http.createServer();
  proxy.on('connect', (_req, sock) => sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  const port = (proxy.address() as net.AddressInfo).port;
  try {
    const inst = new CodexInstaller(tmpDir('installer-proxy403-'), { url: `http://127.0.0.1:${port}` });
    await assert.rejects(inst.fetchLatest(), /proxy refused the tunnel: HTTP 403/);
  } finally {
    proxy.close();
  }
});
