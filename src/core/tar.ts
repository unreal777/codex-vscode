// Minimal streaming tar.gz reader (ustar + pax/GNU long names) for npm tarballs (port of TarExtractor.java).
// Every entry name is validated, whether or not it is extracted: absolute paths, drive letters, backslashes and ".."
// segments make the whole archive invalid (zip-slip). Only regular files and folders below keepPrefix are written;
// symlinks, hard links and everything else are skipped, never created.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

/** Pulls exact byte counts out of an async chunk stream. */
class ByteReader {
  private readonly it: AsyncIterator<Buffer>;
  private buf: Buffer = Buffer.alloc(0);

  constructor(src: AsyncIterable<Buffer>) {
    this.it = src[Symbol.asyncIterator]();
  }

  private async fill(): Promise<boolean> {
    const r = await this.it.next();
    if (r.done) return false;
    this.buf = this.buf.length ? Buffer.concat([this.buf, r.value]) : r.value;
    return true;
  }

  /** Exactly n bytes; null on clean EOF before the first byte when eofOk. */
  async readExact(n: number, eofOk = false): Promise<Buffer | null> {
    while (this.buf.length < n) {
      if (!(await this.fill())) {
        if (this.buf.length === 0 && eofOk) return null;
        throw new Error('truncated archive');
      }
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  /** Up to max bytes (at least one); throws at EOF. */
  async readSome(max: number): Promise<Buffer> {
    while (this.buf.length === 0) {
      if (!(await this.fill())) throw new Error('truncated archive');
    }
    const n = Math.min(max, this.buf.length);
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  async skip(n: number): Promise<void> {
    while (n > 0) {
      const b = await this.readSome(Math.min(n, 1 << 20));
      n -= b.length;
    }
  }
}

function cString(b: Buffer, off = 0, len = b.length - off): string {
  let end = off;
  while (end < off + len && b[end] !== 0) end++;
  return b.toString('utf8', off, end);
}

function parseSize(h: Buffer): number {
  if ((h[124] & 0x80) !== 0) { // base-256 for very large files
    let v = h[124] & 0x7f;
    for (let i = 125; i < 136; i++) v = v * 256 + h[i];
    return v;
  }
  const s = cString(h, 124, 12).trim();
  return s === '' ? 0 : parseInt(s, 8);
}

function headerName(h: Buffer): string {
  const name = cString(h, 0, 100);
  if (h.toString('ascii', 257, 262) === 'ustar') {
    const prefix = cString(h, 345, 155);
    if (prefix) return prefix + '/' + name;
  }
  return name;
}

const pad = (size: number): number => (512 - (size % 512)) % 512;

/** Returns the name without a leading "./" or trailing "/"; throws for anything that could escape. */
export function validateEntryName(name: string): string {
  let n = name;
  while (n.startsWith('./')) n = n.substring(2);
  while (n.endsWith('/')) n = n.substring(0, n.length - 1);
  if (n === '' || n.startsWith('/') || n.includes('\\') || n.includes(':') || n.includes('\0')) throw new Error('unsafe path in archive: ' + name);
  for (const seg of n.split('/')) if (seg === '..' || seg === '') throw new Error('unsafe path in archive: ' + name);
  return n;
}

/**
 * Extracts regular files below keepPrefix (e.g. "package/vendor/") into dest, dropping the leading "package/" so the
 * result is dest/vendor/...
 * @returns number of files written
 */
export async function extractTarGz(tgz: string, dest: string, keepPrefix: string): Promise<number> {
  const root = path.resolve(dest);
  await fs.promises.mkdir(root, { recursive: true });
  const gunzip = zlib.createGunzip();
  const file = fs.createReadStream(tgz);
  file.on('error', (e) => gunzip.destroy(e));
  file.pipe(gunzip);
  const rd = new ByteReader(gunzip as unknown as AsyncIterable<Buffer>);
  let written = 0;
  try {
    let longName: string | null = null;
    let paxPath: string | null = null;
    let paxSize = -1;
    for (;;) {
      const h = await rd.readExact(512, true);
      if (h === null) break;
      if (h.every((x) => x === 0)) break;
      const type = h[156] === 0 ? '\0' : String.fromCharCode(h[156]);
      const size = paxSize >= 0 ? paxSize : parseSize(h);
      const name = longName ?? paxPath ?? headerName(h);
      longName = null;
      paxPath = null;
      paxSize = -1;
      if (type === 'x' || type === 'g' || type === 'L') {
        const want = Math.min(size, 1 << 20);
        const data = (await rd.readExact(want)) as Buffer;
        await rd.skip(size - data.length + pad(size));
        if (type === 'L') {
          longName = cString(data);
        } else if (type === 'x') {
          for (const rec of data.toString('utf8').split('\n')) {
            const sp = rec.indexOf(' ');
            const eq = rec.indexOf('=');
            if (sp < 0 || eq < sp) continue;
            const key = rec.substring(sp + 1, eq);
            const val = rec.substring(eq + 1);
            if (key === 'path') paxPath = val;
            else if (key === 'size') paxSize = parseInt(val, 10);
          }
        }
        continue;
      }
      const clean = validateEntryName(name);
      const isFile = type === '0' || type === '\0' || type === '7';
      const wanted = clean.startsWith(keepPrefix) && (isFile || type === '5');
      if (!wanted) { // other entries (package.json, links, ...) are skipped, never created
        await rd.skip(size + pad(size));
        continue;
      }
      const target = path.resolve(root, clean.substring('package/'.length));
      const rel = path.relative(root, target);
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('unsafe path in archive: ' + name);
      if (type === '5') {
        await fs.promises.mkdir(target, { recursive: true });
        continue;
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const fh = await fs.promises.open(target, 'w');
      try {
        for (let left = size; left > 0;) {
          const chunk = await rd.readSome(Math.min(1 << 20, left));
          await fh.write(chunk);
          left -= chunk.length;
        }
      } finally {
        await fh.close();
      }
      await rd.skip(pad(size));
      written++;
    }
  } finally {
    file.destroy();
    gunzip.destroy();
  }
  return written;
}
