// Test helpers: temp folders and a tar.gz builder that does NOT sanitise entry names (that is the point of the security tests).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const created: string[] = [];
process.on('exit', () => { // keep the temp folder clean (one test copies node.exe)
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

export function tmpDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(d);
  return d;
}

export interface TarEntry {
  name: string;
  content?: string | Buffer;
  /** tar type flag: '0' file (default), '5' folder, '2' symlink, 'x' pax header, 'L' GNU long name */
  type?: string;
  linkName?: string;
}

function put(h: Buffer, off: number, s: string, max: number): void {
  const b = Buffer.from(s, 'utf8');
  b.copy(h, off, 0, Math.min(b.length, max));
}

export function tgz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const data = e.content === undefined ? Buffer.alloc(0) : Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, 'utf8');
    const h = Buffer.alloc(512);
    put(h, 0, e.name, 100);
    put(h, 100, '0000644', 8);
    put(h, 108, '0000000', 8);
    put(h, 116, '0000000', 8);
    put(h, 124, data.length.toString(8).padStart(11, '0'), 12);
    put(h, 136, '00000000000', 12);
    h.fill(0x20, 148, 156);
    h[156] = (e.type ?? '0').charCodeAt(0);
    if (e.linkName) put(h, 157, e.linkName, 100);
    put(h, 257, 'ustar', 6);
    put(h, 263, '00', 2);
    let sum = 0;
    for (const b of h) sum += b;
    put(h, 148, sum.toString(8).padStart(6, '0'), 7);
    parts.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts), { level: 1 });
}

/** A pax extended header record "<len> path=<value>\n" with the correct decimal length. */
export function paxRecord(key: string, value: string): string {
  const body = ' ' + key + '=' + value + '\n';
  let len = body.length;
  for (let i = 0; i < 3; i++) len = String(len).length + body.length;
  return len + body;
}
