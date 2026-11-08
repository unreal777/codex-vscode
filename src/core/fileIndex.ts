// Searchable list of the files (and folders) of one project for the "@" popup (port of FileIndex.java).
// Paths are relative to the index root and always use '/'.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Entry {
  path: string;
  name: string;
  /** Folder part of path ("" for entries in the root). */
  dir: string;
  folder: boolean;
}

export interface Hit {
  entry: Entry;
  score: number;
}

function makeEntry(p: string, folder: boolean): Entry {
  const slash = p.lastIndexOf('/');
  return { path: p, folder, name: slash < 0 ? p : p.substring(slash + 1), dir: slash < 0 ? '' : p.substring(0, slash) };
}

/** Folders that never contain anything worth mentioning (VCS data, build output, dependencies, IDE metadata). */
const IGNORED_FOLDERS = new Set(['.git', '.svn', '.hg', '.metadata', '.settings', '.idea', '.gradle', 'bin', 'target', 'build', 'node_modules',
  '__pycache__', '.vscode-test']);

/** Extensions of files that are not text; mentioning them would only waste the model's context. */
const BINARY_EXTENSIONS = new Set(['class', 'jar', 'war', 'ear', 'zip', 'gz', 'tgz', '7z', 'rar', 'tar', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico',
  'webp', 'tif', 'tiff', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'exe', 'dll', 'so', 'dylib', 'lib', 'obj', 'o', 'pdb', 'mp3', 'mp4',
  'avi', 'mov', 'wav', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'bin', 'dat', 'db', 'sqlite', 'jks', 'p12', 'keystore', 'iso', 'img', 'psd', 'swf']);

/** Upper bound so a huge checkout cannot exhaust memory. */
export const MAX_ENTRIES = 100_000;

export function isIgnoredFolder(name: string): boolean {
  return IGNORED_FOLDERS.has(name);
}

export function isBinaryFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && BINARY_EXTENSIONS.has(name.substring(dot + 1).toLowerCase());
}

/** Collects entries; the producer (VS Code file search or file walker) applies isIgnoredFolder / isBinaryFile itself. */
export class FileIndexBuilder {
  private readonly entries: Entry[] = [];

  /** @returns false once the size limit is reached (the producer should stop) */
  add(relativePath: string, folder: boolean): boolean {
    if (this.entries.length >= MAX_ENTRIES) return false;
    this.entries.push(makeEntry(relativePath.replace(/\\/g, '/'), folder));
    return true;
  }

  build(): FileIndex {
    return new FileIndex(this.entries);
  }
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0); // UTF-16 order, like String.compareTo
const isLetterOrDigit = (c: string): boolean => /[\p{L}\p{N}]/u.test(c);
const isUpperCase = (c: string): boolean => c !== c.toLowerCase() && c === c.toUpperCase();

function depth(p: string): number {
  let d = 0;
  for (let i = 0; i < p.length; i++) if (p[i] === '/') d++;
  return d;
}

export function normalizeQuery(query: string | null | undefined): string {
  let q = (query ?? '').trim().replace(/\\/g, '/').toLowerCase();
  while (q.startsWith('@') || q.startsWith('./') || q.startsWith('/')) q = q.startsWith('./') ? q.substring(2) : q.substring(1);
  return q;
}

/**
 * Subsequence match of q (lower case) in text; 0..99, higher is tighter, -1 when q is not a subsequence.
 * Rewards consecutive characters and characters at word starts (after a separator or at a camelCase hump).
 */
export function fuzzy(text: string, q: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  let from = 0;
  let previous = -2;
  for (let i = 0; i < q.length; i++) {
    const at = lower.indexOf(q[i], from);
    if (at < 0) return -1;
    if (at === previous + 1) score += 8; // consecutive
    else score -= Math.min(at - from, 6); // gap
    if (at === 0 || !isLetterOrDigit(text[at - 1]) || isUpperCase(text[at])) score += 6; // word start or camelCase hump
    previous = at;
    from = at + 1;
  }
  return Math.max(0, Math.min(99, 40 + score));
}

/** -1 when the entry does not match. Categories are 100 points apart so a better category always wins. */
export function score(entry: Entry, q: string): number {
  const name = entry.name.toLowerCase();
  const p = entry.path.toLowerCase();
  let base: number;
  if (q.indexOf('/') >= 0) { // the user types a path: compare against the whole path
    if (p === q) base = 1000;
    else if (p.endsWith('/' + q)) base = 900;
    else if (p.startsWith(q)) base = 850;
    else if (p.includes(q)) base = 600;
    else {
      const f = fuzzy(entry.path, q);
      base = f < 0 ? -1 : 200 + f;
    }
  } else if (name === q) {
    base = 1000;
  } else if (name.startsWith(q)) {
    base = 800 - Math.min(name.length - q.length, 50);
  } else if (name.includes(q)) {
    const at = name.indexOf(q);
    const wordStart = at === 0 || !isLetterOrDigit(name[at - 1]);
    base = 600 - Math.min(at, 50) + (wordStart ? 40 : 0);
  } else {
    const fn = fuzzy(entry.name, q);
    if (fn >= 0) {
      base = 400 + fn;
    } else if (p.includes(q)) {
      base = 300 - Math.min(Math.trunc(p.indexOf(q) / 4), 50);
    } else {
      const fp = fuzzy(entry.path, q);
      base = fp < 0 ? -1 : 200 + fp;
    }
  }
  if (base < 0) return -1;
  return entry.folder ? base - 30 : base;
}

export class FileIndex {
  readonly builtAtMillis = Date.now();

  constructor(private readonly entries: Entry[]) {}

  get size(): number {
    return this.entries.length;
  }

  /**
   * Best matches for the typed text.
   * Order: exact name, name prefix, name substring, fuzzy name, path substring, fuzzy path. Files beat folders on equal footing.
   * With an empty query the recently opened files come first (in the given order), then the shallowest files.
   * @param recentPaths relative paths of recently opened editors, most recent first (may be empty)
   */
  search(query: string | null | undefined, limit: number, recentPaths: string[] = []): Hit[] {
    const q = normalizeQuery(query);
    let hits: Hit[] = [];
    if (q === '') {
      for (let rank = 0; rank < recentPaths.length && hits.length < limit; rank++) {
        const recent = this.entries.find((e) => e.path === recentPaths[rank]);
        if (recent && !hits.some((h) => h.entry === recent)) hits.push({ entry: recent, score: 10_000 - rank });
      }
      const rest = [...this.entries].sort((a, b) => (a.folder ? 1 : 0) - (b.folder ? 1 : 0) || depth(a.path) - depth(b.path) || cmp(a.path, b.path));
      for (const e of rest) {
        if (hits.length >= limit) break;
        if (!hits.some((h) => h.entry === e)) hits.push({ entry: e, score: 0 });
      }
      return hits;
    }
    for (const entry of this.entries) {
      let s = score(entry, q);
      if (s < 0) continue;
      const recentRank = recentPaths.indexOf(entry.path);
      if (recentRank >= 0) s += Math.max(10, 60 - 5 * recentRank);
      hits.push({ entry, score: s });
    }
    hits.sort((a, b) => b.score - a.score || a.entry.path.length - b.entry.path.length || cmp(a.entry.path, b.entry.path));
    if (hits.length > limit) hits = hits.slice(0, limit);
    return hits;
  }
}

/** Plain-folder scan (cwd is not a workspace folder): walks the tree with the same ignore rules. */
export async function scanFolder(root: string): Promise<FileIndex> {
  const builder = new FileIndexBuilder();
  let full = false;
  const walk = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable entries are simply not offered
    }
    for (const e of entries) {
      if (full) return;
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (e.isDirectory()) {
        if (isIgnoredFolder(e.name)) continue;
        if (!builder.add(rel, true)) { full = true; return; }
        await walk(abs);
      } else if (e.isFile() || e.isSymbolicLink()) {
        if (isBinaryFile(e.name)) continue;
        if (!builder.add(rel, false)) { full = true; return; }
      }
    }
  };
  await walk(root);
  return builder.build();
}
