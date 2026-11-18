// 0.9.0: the managed Codex install on macOS and Linux (npm dist-tags, executable name and mode, npm's shim on the PATH).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exeName, findExe, parseManifest, platformTag } from '../core/installer';
import { nativeBehindShim } from '../core/locator';
import { extractTarGz, fileModeFor, headerMode } from '../core/tar';
import { tgz, tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

const manifest = (version: string): unknown => ({
  name: '@openai/codex',
  version,
  dist: { tarball: `https://registry.npmjs.org/@openai/codex/-/codex-${version}.tgz`, integrity: 'sha512-AAAA' },
});

test('platform tag: Windows, macOS and Linux on x64 and arm64; anything else says to install Codex yourself', () => {
  assert.equal(platformTag('win32', 'x64'), 'win32-x64');
  assert.equal(platformTag('win32', 'arm64'), 'win32-arm64');
  assert.equal(platformTag('linux', 'x64'), 'linux-x64');
  assert.equal(platformTag('linux', 'arm64'), 'linux-arm64');
  assert.equal(platformTag('darwin', 'x64'), 'darwin-x64');
  assert.equal(platformTag('darwin', 'arm64'), 'darwin-arm64');
  assert.throws(() => platformTag('freebsd', 'x64'), /no managed Codex install for freebsd x64.*set its path/);
  assert.throws(() => platformTag('linux', 'ia32'), /no managed Codex install for linux ia32/);
  assert.throws(() => platformTag('linux', 'arm'), /no managed Codex install/);
  assert.equal(exeName('win32'), 'codex.exe');
  assert.equal(exeName('linux'), 'codex');
  assert.equal(exeName('darwin'), 'codex');
});

test('manifest: the stable build of the own platform only, on macOS and Linux too', () => {
  assert.equal(parseManifest(manifest('0.167.2-linux-x64'), 'linux-x64').version, '0.167.2');
  assert.equal(parseManifest(manifest('0.167.2-linux-arm64'), 'linux-arm64').version, '0.167.2');
  assert.equal(parseManifest(manifest('0.167.2-darwin-arm64'), 'darwin-arm64').version, '0.167.2');
  assert.equal(parseManifest(manifest('0.167.2-darwin-x64'), 'darwin-x64').version, '0.167.2');
  assert.throws(() => parseManifest(manifest('0.170.0-alpha.2-linux-x64'), 'linux-x64'), /non-stable/);
  assert.throws(() => parseManifest(manifest('0.167.2-darwin-x64'), 'darwin-arm64'), /foreign/);
  assert.throws(() => parseManifest(manifest('0.167.2-win32-x64'), 'linux-x64'), /foreign/);
  assert.throws(() => parseManifest(manifest('0.167.2-freebsd-x64'), 'linux-x64'), /non-stable or foreign/);
});

test('findExe: codex.exe on Windows, codex on macOS and Linux (vendor/<triple>/bin)', () => {
  const dir = tmpDir('platform-exe-');
  const bin = path.join(dir, 'vendor', 'x86_64-unknown-linux-musl', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'codex'), 'x');
  fs.writeFileSync(path.join(bin, 'codex-code-mode-host'), 'x');
  assert.equal(findExe(dir, 'linux'), path.join('vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex'));
  assert.equal(findExe(dir, 'darwin'), path.join('vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex'));
  assert.equal(findExe(dir, 'win32'), null, 'a Linux package has no codex.exe');
  const win = tmpDir('platform-exe-win-');
  fs.mkdirSync(path.join(win, 'vendor', 'x86_64-pc-windows-msvc', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(win, 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'), 'x');
  assert.equal(findExe(win, 'win32'), path.join('vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'));
  assert.equal(findExe(win, 'linux'), null);
});

test('tar modes: executable in the archive = 755 on disk, everything else 644, setuid never', () => {
  const h = Buffer.alloc(512);
  h.write('0000755', 100, 'ascii');
  assert.equal(headerMode(h), 0o755);
  h.fill(0, 100, 108); h.write('0104755', 100, 'ascii');
  assert.equal(headerMode(h), 0o4755, 'the bits are read as they are');
  h.fill(0, 100, 108);
  assert.equal(headerMode(h), 0);
  h.write('garbage', 100, 'ascii');
  assert.equal(headerMode(h), 0);
  assert.equal(fileModeFor(0o755), 0o755);
  assert.equal(fileModeFor(0o4755), 0o755, 'setuid is not kept');
  assert.equal(fileModeFor(0o700), 0o755);
  assert.equal(fileModeFor(0o644), 0o644);
  assert.equal(fileModeFor(0o666), 0o644, 'never group or world writable');
  assert.equal(fileModeFor(0), 0o644);
});

test('extracted files keep the executable bit (macOS, Linux)', { skip: process.platform === 'win32' }, async () => {
  const dir = tmpDir('platform-mode-');
  const f = path.join(dir, 'a.tgz');
  fs.writeFileSync(f, tgz([
    { name: 'package/vendor/t/bin/codex', content: '#!/bin/sh\necho hi\n', mode: 0o755 },
    { name: 'package/vendor/t/codex-path/rg', content: 'x', mode: 0o755 },
    { name: 'package/vendor/t/codex-package.json', content: '{}', mode: 0o644 },
  ]));
  const out = path.join(dir, 'out');
  assert.equal(await extractTarGz(f, out, 'package/vendor/'), 3);
  const mode = (p: string) => fs.statSync(path.join(out, 'vendor', 't', p)).mode & 0o777;
  assert.equal(mode('bin/codex'), 0o755);
  assert.equal(mode('codex-path/rg'), 0o755);
  assert.equal(mode('codex-package.json'), 0o644);
});

test('npm shim on the PATH: the native executable of the package behind it is started instead', () => {
  const prefix = tmpDir('platform-shim-');
  const pkg = path.join(prefix, 'lib', 'node_modules', '@openai', 'codex');
  const shimTarget = path.join(pkg, 'bin', 'codex.js');
  fs.mkdirSync(path.dirname(shimTarget), { recursive: true });
  fs.writeFileSync(shimTarget, '#!/usr/bin/env node\n');
  assert.equal(nativeBehindShim(shimTarget), null, 'no platform package: the shim itself is used');
  const native = path.join(pkg, 'node_modules', '@openai', 'codex-linux-x64', 'vendor', 'x86_64-unknown-linux-musl', 'bin', exeName());
  fs.mkdirSync(path.dirname(native), { recursive: true });
  fs.writeFileSync(native, 'x');
  const l = nativeBehindShim(shimTarget);
  assert.ok(l);
  assert.equal(fs.realpathSync(l.file), fs.realpathSync(native));
  assert.equal(l.source, 'npm vendor');
  // a plain binary on the PATH (Homebrew, a manual download) is left alone
  const plain = path.join(prefix, 'bin', 'codex');
  fs.mkdirSync(path.dirname(plain), { recursive: true });
  fs.writeFileSync(plain, 'x');
  assert.equal(nativeBehindShim(plain), null);
  assert.equal(nativeBehindShim(path.join(prefix, 'nope')), null);
});

test('Marketplace fields: name without GPT, keywords people search for, licence and icon', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.displayName, 'Codexter: chat for OpenAI Codex (unofficial)');
  assert.doesNotMatch(pkg.displayName, /GPT/i, 'OpenAI does not allow GPT in product names');
  assert.match(pkg.description, /Unofficial.*GPT models.*Not affiliated with OpenAI/);
  for (const k of ['codex', 'openai', 'chatgpt', 'gpt', 'ai chat', 'mcp']) assert.ok(pkg.keywords.includes(k), k);
  assert.ok(pkg.keywords.length <= 30, 'the Marketplace allows at most 30');
  assert.equal(new Set(pkg.keywords).size, pkg.keywords.length);
  assert.equal(pkg.license, 'MIT');
  assert.ok(fs.existsSync(path.join(root, pkg.icon)));
});

test('texts no longer say Windows only or codex.exe only', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
  assert.doesNotMatch(read('src', 'core', 'installer.ts'), /supports Windows only/);
  assert.doesNotMatch(read('src', 'session.ts'), /codex\.exe/);
  assert.match(read('package.json'), /`codex` on macOS and Linux/);
  assert.match(read('README.md'), /Runs on Windows, macOS and Linux \(x64 and arm64\)/);
  assert.match(read('README.md'), /has not been tried on real machines yet/);
  assert.match(read('INSTALL.md'), /Windows, macOS or Linux/);
  assert.match(read('INSTALL.de.md'), /Windows, macOS oder Linux/);
});
