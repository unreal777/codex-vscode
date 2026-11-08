// Turns whatever a drop or a menu command delivers (paths, file: URIs, text with one path per line) into existing files and
// folders (port of DroppedPaths.java). Host-specific objects (vscode.Uri) are converted to paths by the caller first.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAbsolutePath } from './fileLinks';

/** An existing file or folder, as an absolute path. */
export interface DroppedItem {
  path: string;
  folder: boolean;
}

/** Upper bound so dropping a whole disk cannot flood the composer with chips. */
export const MAX_ITEMS = 25;

function texts(candidate: unknown): string[] {
  if (typeof candidate === 'string') return candidate.split(/\r\n|[\n\r\u000B\u000C\u0085\u2028\u2029]/);
  if (Array.isArray(candidate)) return candidate.flatMap(texts);
  return [];
}

/** Accepts "C:\x\Foo.java", "/C:/x/Foo.java", "file:///C:/x/Foo.java", quoted paths and paths relative to cwd. */
export function toPath(raw: string | null | undefined, cwd?: string | null): string | null {
  let text = (raw ?? '').trim();
  if (text.length > 1 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    text = text.substring(1, text.length - 1).trim();
  }
  if (text === '') return null;
  try {
    if (text.substring(0, 5).toLowerCase() === 'file:') return path.resolve(fileURLToPath(new URL(text.replace(/ /g, '%20'))));
    if (/^\/[A-Za-z]:[/\\]/.test(text)) text = text.substring(1); // what Codex writes: /C:/x/Foo.java
    if (/^[A-Za-z][A-Za-z0-9+.-]+:\/\//.test(text)) return null; // some other URL scheme (http, vscode-remote, ...)
    if (text.includes('\0')) return null;
    if (isAbsolutePath(text)) return path.resolve(text);
    return cwd ? path.resolve(cwd, text) : null;
  } catch {
    return null; // not a path (a sentence, a URL, ...): the drop just does not produce a chip for it
  }
}

/**
 * @param candidates strings (one string may hold several lines) or nested arrays of them; anything else is ignored
 * @param cwd        base for relative paths (may be null)
 * @returns existing files/folders, de-duplicated, in the order given, at most MAX_ITEMS
 */
export function resolveDropped(candidates: unknown[] | null | undefined, cwd?: string | null): DroppedItem[] {
  const found = new Map<string, DroppedItem>();
  if (!candidates) return [];
  for (const candidate of candidates) {
    for (const text of texts(candidate)) {
      const p = toPath(text, cwd);
      if (!p) continue;
      let st: fs.Stats;
      try { st = fs.statSync(p); } catch { continue; }
      const key = p.toLowerCase();
      if (!found.has(key) && found.size < MAX_ITEMS) found.set(key, { path: p, folder: st.isDirectory() });
    }
  }
  return [...found.values()];
}
