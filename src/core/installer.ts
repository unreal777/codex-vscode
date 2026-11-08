// Keeps a private copy of the Codex CLI up to date, straight from the official npm registry
// (port of CodexInstaller.java). The folder layout, file names, current.json format and the temp/atomic-rename behaviour are
// IDENTICAL to the Eclipse plugin, because both IDEs use %LOCALAPPDATA%\CodexPanel at the same time.
//
//   <base>/codex/<version>/vendor/<triple>/bin/codex.exe   (+ helper executables next to it)
//   <base>/codex/current.json                              {version, exePath, previous, installedAt, lastCheck}
//
// Only the per-platform npm dist-tag ("win32-x64") is used, so alpha/beta builds are never installed.
// Security: https and host registry.npmjs.org only (also after redirects), sha512 integrity from the registry is verified before
// extraction, archive paths are validated, and the only thing ever executed is `codex.exe --version`.
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GetOptions, httpsGet, ProxyConfig } from './http';
import { extractTarGz } from './tar';

export const REGISTRY_HOST = 'registry.npmjs.org';
const STABLE = /^(\d+)\.(\d+)\.(\d+)-(win32-(?:x64|arm64))$/;

export interface Remote {
  version: string;
  tarball: string;
  integrity: string;
}

/** Contents of current.json. */
export interface State {
  version?: string;
  previous?: string;
  exe?: string;
  installedAt?: Date;
  lastCheck?: Date;
}

export type Status = 'UP_TO_DATE' | 'INSTALLED';
export interface Result {
  status: Status;
  version: string;
}

/** Progress sink; may throw to abort. phase: downloading | verifying | extracting | validating; total is -1 when unknown. */
export type Progress = (phase: string, version: string, done: number, total: number) => void;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function exists(p: string): boolean {
  try { fs.lstatSync(p); return true; } catch { return false; }
}

function isRegularFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDirectory(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function toDate(s: unknown): Date | undefined {
  if (typeof s !== 'string') return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export function installed(s: State): boolean {
  return !!s.version && !!s.exe && isRegularFile(s.exe);
}

/** Reads <base>/codex/current.json; missing or unreadable = "not installed". */
export function readState(base: string): State {
  const s: State = {};
  try {
    const o = JSON.parse(fs.readFileSync(path.join(base, 'codex', 'current.json'), 'utf8').replace(/^﻿/, ''));
    const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
    s.version = str('version');
    s.previous = str('previous');
    s.exe = str('exePath');
    s.installedAt = toDate(o.installedAt);
    s.lastCheck = toDate(o.lastCheck);
  } catch { /* no state yet (or unreadable): treated as "not installed" */ }
  return s;
}

/** True when auto-checks are on and the last check is older than `days`. */
export function checkDue(base: string, days: number): boolean {
  if (days <= 0) return false;
  const s = readState(base);
  return !s.lastCheck || s.lastCheck.getTime() + days * 86400000 < Date.now();
}

export function platformTag(): string {
  return process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
}

/** https and exactly registry.npmjs.org, no credentials in the URL. */
export function checkUrl(u: URL): void {
  if (u.protocol !== 'https:' || u.hostname !== REGISTRY_HOST || u.username || u.password || (u.port !== '' && u.port !== '443')) {
    throw new Error('refusing to contact ' + u.href);
  }
}

export function parseManifest(o: any, tag: string): Remote {
  const version = typeof o?.version === 'string' ? o.version : undefined;
  if (o?.name !== '@openai/codex' || !version) throw new Error('registry answer is not @openai/codex');
  const m = STABLE.exec(version);
  if (!m || m[4] !== tag) throw new Error('registry returned a non-stable or foreign version: ' + version);
  const dist = o.dist && typeof o.dist === 'object' ? o.dist : undefined;
  const tarball = typeof dist?.tarball === 'string' ? dist.tarball : undefined;
  const integrity = typeof dist?.integrity === 'string' ? dist.integrity : undefined;
  if (!tarball || !integrity || !integrity.startsWith('sha512-')) throw new Error('registry manifest lacks tarball/sha512 integrity');
  checkUrl(new URL(tarball));
  return { version: m[1] + '.' + m[2] + '.' + m[3], tarball, integrity };
}

export function compareVersions(a: string, b: string): number {
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < 3; i++) {
    const c = Math.sign(parseInt(x[i], 10) - parseInt(y[i], 10));
    if (c !== 0) return c;
  }
  return 0;
}

/** @param integrity "sha512-<base64>" (possibly several space-separated hashes) */
export function verifyIntegrity(actual: Buffer, integrity: string): void {
  for (const tok of integrity.trim().split(/\s+/)) {
    if (!tok.startsWith('sha512-')) continue;
    const expected = Buffer.from(tok.substring(7), 'base64');
    if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) return;
  }
  throw new Error('integrity check failed: downloaded file does not match the registry sha512 (got sha512-' + actual.toString('base64') + ')');
}

export function digestFile(f: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512');
    fs.createReadStream(f).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest())).on('error', reject);
  });
}

/** Deletes a tree item by item; entries locked by a running process stay (the next cleanup retries). Never throws. */
export function deleteTree(p: string): void {
  let st: fs.Stats;
  try { st = fs.lstatSync(p); } catch { return; }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    let names: string[] = [];
    try { names = fs.readdirSync(p); } catch { /* ignore */ }
    for (const n of names) deleteTree(path.join(p, n));
    try { fs.rmdirSync(p); } catch { /* locked */ }
  } else {
    try { fs.unlinkSync(p); } catch { /* locked */ }
  }
}

/** Relative path of vendor/<triple>/bin/codex.exe below dir, or null. */
export function findExe(dir: string): string | null {
  const vendor = path.join(dir, 'vendor');
  if (!isDirectory(vendor)) return null;
  for (const t of fs.readdirSync(vendor)) {
    const exe = path.join(vendor, t, 'bin', 'codex.exe');
    if (isRegularFile(exe)) return path.relative(dir, exe);
  }
  return null;
}

/** Runs `codex.exe --version`, the only thing we ever execute from a download. */
function validate(exe: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ['--version'], { cwd: path.dirname(exe), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const add = (c: Buffer) => { if (out.length < 4096) out += c.toString('utf8'); };
    p.stdout.on('data', add);
    p.stderr.on('data', add);
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error('codex.exe --version did not finish'));
    }, 30000);
    p.once('error', (e) => { clearTimeout(timer); reject(new Error('downloaded codex.exe failed validation: ' + e.message)); });
    p.once('close', (code) => {
      clearTimeout(timer);
      const text = out.trim().substring(0, 4096);
      if (code !== 0 || !text.includes(version)) reject(new Error('downloaded codex.exe failed validation: ' + text));
      else resolve();
    });
  });
}

async function moveWithRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) { // antivirus often holds fresh files for a moment
      if (i >= 5) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

export class CodexInstaller {
  private readonly root: string;
  private chain: Promise<unknown> = Promise.resolve();

  /** @param base state directory; everything lives in base/codex */
  constructor(private readonly base: string, private readonly proxy?: ProxyConfig | (() => ProxyConfig), private readonly userAgent = 'codex-panel-vscode') {
    this.root = path.join(base, 'codex');
  }

  /** Same role as `synchronized` in the Java class: one install at a time per installer instance. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private writeState(s: State): void {
    const o: Record<string, string> = {};
    if (s.version) {
      o.version = s.version;
      o.exePath = s.exe as string;
    }
    if (s.previous) o.previous = s.previous;
    if (s.installedAt) o.installedAt = s.installedAt.toISOString();
    if (s.lastCheck) o.lastCheck = s.lastCheck.toISOString();
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = path.join(this.root, 'current.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(o), 'utf8');
    fs.renameSync(tmp, path.join(this.root, 'current.json')); // atomic replace on the same volume
  }

  private reqOptions(accept: string): GetOptions {
    return { accept, userAgent: this.userAgent, proxy: typeof this.proxy === 'function' ? this.proxy() : this.proxy };
  }

  /** GET with manual redirects; every hop must pass checkUrl. */
  private async get(uri: URL, accept: string) {
    for (let hop = 0; hop < 4; hop++) {
      checkUrl(uri);
      const r = await httpsGet(uri, this.reqOptions(accept));
      const c = r.statusCode ?? 0;
      if (c >= 300 && c < 400) {
        const loc = r.headers.location;
        r.resume();
        if (!loc) throw new Error('redirect without location');
        uri = new URL(loc, uri);
        continue;
      }
      if (c !== 200) {
        r.resume();
        throw new Error('registry answered HTTP ' + c + ' for ' + uri.href);
      }
      return r;
    }
    throw new Error('too many redirects');
  }

  /** One small request: the registry resolves the dist-tag to that version's manifest. */
  async fetchLatest(): Promise<Remote> {
    if (process.platform !== 'win32') throw new Error('the managed Codex install supports Windows only');
    const tag = platformTag();
    const r = await this.get(new URL('https://' + REGISTRY_HOST + '/@openai/codex/' + tag), 'application/json');
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const c of r) {
      chunks.push(c as Buffer);
      n += (c as Buffer).length;
      if (n > (1 << 20)) break;
    }
    r.destroy();
    let o: unknown;
    try {
      o = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      throw new Error('unexpected registry answer');
    }
    return parseManifest(o, tag);
  }

  /** Checks the registry and installs a newer stable build if there is one. */
  checkAndInstall(p: Progress): Promise<Result> {
    return this.serialized(async () => {
      const r = await this.fetchLatest();
      const s = readState(this.base);
      s.lastCheck = new Date();
      if (installed(s) && compareVersions(r.version, s.version as string) <= 0) {
        this.writeState(s);
        return { status: 'UP_TO_DATE' as Status, version: s.version as string };
      }
      await this.installUnlocked(r, p);
      return { status: 'INSTALLED' as Status, version: r.version };
    });
  }

  /** Downloads, verifies, extracts, validates and activates r. */
  install(r: Remote, p: Progress): Promise<void> {
    return this.serialized(() => this.installUnlocked(r, p));
  }

  private async installUnlocked(r: Remote, p: Progress): Promise<void> {
    fs.mkdirSync(this.root, { recursive: true });
    this.cleanup(null, null);
    const tgz = path.join(this.root, '.dl-' + r.version + '.tgz');
    try {
      const digest = await this.download(r, tgz, p);
      p('verifying', r.version, 0, -1);
      verifyIntegrity(digest, r.integrity);
      await this.activate(tgz, r.version, p);
    } finally {
      try { fs.unlinkSync(tgz); } catch { /* not there */ }
    }
  }

  /** Verifies the file against r.integrity, then extracts it as version r.version. Exposed for tests with local files. */
  async installFromFile(tgz: string, r: Remote, p: Progress): Promise<void> {
    verifyIntegrity(await digestFile(tgz), r.integrity);
    await this.activate(tgz, r.version, p);
  }

  private async activate(tgz: string, version: string, p: Progress): Promise<void> {
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = path.join(this.root, '.tmp-' + version);
    deleteTree(tmp);
    try {
      p('extracting', version, 0, -1);
      if ((await extractTarGz(tgz, tmp, 'package/vendor/')) === 0) throw new Error('archive contains no package/vendor files');
      const rel = findExe(tmp);
      if (rel === null) throw new Error('codex.exe not found in archive');
      p('validating', version, 0, -1);
      await validate(path.join(tmp, rel), version);
      const dest = path.join(this.root, version);
      if (exists(dest)) deleteTree(dest);
      if (exists(dest)) { // locked files: keep the old copy, it is the same version
        deleteTree(tmp);
      } else {
        await moveWithRetry(tmp, dest);
      }
      const s = readState(this.base);
      if (version !== s.version) s.previous = s.version;
      s.version = version;
      s.exe = path.join(dest, rel);
      s.installedAt = new Date();
      s.lastCheck = new Date();
      this.writeState(s);
      this.cleanup(s.version, s.previous ?? null);
    } catch (e) {
      deleteTree(tmp);
      throw e;
    }
  }

  private async download(r: Remote, out: string, p: Progress): Promise<Buffer> {
    const resp = await this.get(new URL(r.tarball), 'application/octet-stream');
    const len = resp.headers['content-length'];
    const total = len !== undefined && /^\d+$/.test(len) ? Number(len) : -1;
    const md = crypto.createHash('sha512');
    let done = 0;
    let lastReport = 0;
    p('downloading', r.version, 0, total);
    const fh = await fs.promises.open(out, 'w');
    try {
      for await (const chunk of resp) {
        const buf = chunk as Buffer;
        md.update(buf);
        await fh.write(buf);
        done += buf.length;
        if (done - lastReport >= (1 << 20)) {
          lastReport = done;
          p('downloading', r.version, done, total); // may throw to cancel
        }
      }
    } catch (e) {
      resp.destroy();
      throw e;
    } finally {
      await fh.close();
    }
    if (total >= 0 && done !== total) throw new Error('download incomplete: ' + done + ' of ' + total + ' bytes');
    p('downloading', r.version, done, total);
    return md.digest();
  }

  /** Keeps keep1/keep2 (may be null) and deletes other versions plus leftovers; never fails. */
  private cleanup(keep1: string | null, keep2: string | null): void {
    let names: string[];
    try { names = fs.readdirSync(this.root); } catch { return; }
    for (const n of names) {
      const d = path.join(this.root, n);
      const leftover = n.startsWith('.tmp-') || n.startsWith('.dl-');
      const oldVersion = keep1 !== null && isDirectory(d) && !n.startsWith('.') && n !== keep1 && n !== keep2;
      if (leftover || oldVersion) deleteTree(d);
    }
  }
}
