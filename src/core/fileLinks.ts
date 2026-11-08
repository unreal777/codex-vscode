// File references from Codex answers (port of FileLinks.java): parsing of the forms path, path:42, path:42:7, path:42-50,
// path#L42, path#L42C7, path#L42-L50, file:///C:/x/Foo.java:42, "/C:/x/Foo.java" (as Codex writes it) and Windows paths,
// plus lookup of the file or folder on disk.
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A parsed reference; line/column/endLine/endColumn are 1-based, 0 = absent. */
export interface Ref {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

const FRAGMENT = /#L(\d+)(?:C(\d+))?(?:-L?(\d+)(?:C(\d+))?)?$/i;
const SUFFIX = /:(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/;
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):(?!\d)/;
const DRIVE_SLASH = /^\/([A-Za-z]:[\\/].*)$/;

const num = (s: string | undefined): number => (s === undefined ? 0 : parseInt(s, 10));

/** @returns null when raw is not a file reference (web link, anchor, other scheme) */
export function parseFileLink(raw: string | null | undefined): Ref | null {
  let s = (raw ?? '').trim();
  if (s === '' || s[0] === '#') return null;
  const sch = SCHEME.exec(s);
  const fileUri = s.substring(0, 5).toLowerCase() === 'file:';
  if (sch && sch[1].length > 1 && !fileUri) return null;
  const r: Ref = { path: '', line: 0, column: 0, endLine: 0, endColumn: 0 };
  let m = FRAGMENT.exec(s);
  if (m) {
    s = s.substring(0, m.index);
    set(r, m);
  } else {
    m = SUFFIX.exec(s);
    if (m && m.index > 1) { // index 1 would be "C:" followed by digits
      s = s.substring(0, m.index);
      set(r, m);
    }
  }
  if (fileUri) {
    s = s.substring(5);
    if (/^\/\/+[A-Za-z]:.*$/s.test(s)) s = s.replace(/^\/+/, '');
    else if (s.startsWith('///')) s = s.substring(2);
    else if (s.startsWith('//')) s = '\\\\' + s.substring(2).replace(/\//g, '\\');
    try {
      s = decodeURIComponent(s.replace(/\+/g, '%2B'));
    } catch { /* malformed escape: keep the text as written */ }
  }
  const d = DRIVE_SLASH.exec(s);
  if (d) s = d[1];
  if (s === '') return null;
  r.path = s;
  return r;
}

function set(r: Ref, m: RegExpExecArray): void {
  r.line = num(m[1]);
  r.column = num(m[2]);
  r.endLine = num(m[3]);
  r.endColumn = num(m[4]);
}

/** Absolute in the Windows sense (drive or UNC) on Windows, like Java's Path.isAbsolute; "/src/A.java" is NOT absolute there. */
export function isAbsolutePath(p: string): boolean {
  if (process.platform === 'win32') return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
  return path.isAbsolute(p);
}

const MAX_VISITED = 30000;
const SKIP = new Set(['.git', 'node_modules', 'target', 'build', 'bin', '.metadata', '.svn']);

/**
 * Finds the file or folder on disk: absolute path; relative to cwd; relative to each root (workspace folders);
 * last, a bounded search below cwd for a path ending with the given relative path (Codex sometimes writes only OrderService.java).
 * @returns an existing path or null
 */
export function resolveFileLink(p: string, cwd: string | null | undefined, roots: string[] | null | undefined): string | null {
  if (isAbsolutePath(p)) return fs.existsSync(p) ? path.normalize(p) : null;
  let rel = p.replace(/\\/g, '/');
  while (rel.startsWith('/')) rel = rel.substring(1); // "/src/Foo.java" means project-relative here
  const bases: string[] = [];
  if (cwd && cwd.trim()) bases.push(cwd);
  if (roots) bases.push(...roots);
  for (const b of bases) {
    const c = path.resolve(b, rel);
    if (fs.existsSync(c)) return c;
  }
  if (rel !== '' && !rel.includes('..')) {
    for (const b of bases) {
      const hit = findBySuffix(b, rel);
      if (hit) return hit;
    }
  }
  return null;
}

/** Shortest path below root that ends with suffix (case-insensitive, whole segments), or null. Depth 10, 30000 entries at most. */
export function findBySuffix(root: string, suffix: string): string | null {
  try {
    if (!fs.statSync(root).isDirectory()) return null;
  } catch {
    return null;
  }
  const tail = '/' + suffix.toLowerCase();
  let visited = 0;
  let best: string | null = null;
  let bestDepth = Infinity;
  const check = (full: string, relParts: string[]): boolean => {
    if (++visited > MAX_VISITED) return false;
    const s = '/' + relParts.join('/').toLowerCase();
    if (s.endsWith(tail) && relParts.length < bestDepth) {
      best = full;
      bestDepth = relParts.length;
    }
    return true;
  };
  const walk = (dir: string, rel: string[], depth: number): boolean => {
    if (depth > 10) return true;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return true; // unreadable: skipped
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const parts = [...rel, e.name];
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        if (!check(full, parts)) return false;
        if (!walk(full, parts, depth + 1)) return false;
      } else if (!check(full, parts)) {
        return false;
      }
    }
    return true;
  };
  walk(root, [], 1);
  return best;
}
