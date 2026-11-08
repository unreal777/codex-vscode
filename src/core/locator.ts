// Finds the codex executable without relying on npm shell wrappers (port of CodexLocator.java).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readState } from './installer';

export class Located {
  constructor(public readonly file: string, public readonly source: string, public readonly version: string | null = null) {}

  /** Command prefix to start the executable (.cmd/.bat go through cmd.exe). */
  command(): string[] {
    const n = path.basename(this.file).toLowerCase();
    if (n.endsWith('.cmd') || n.endsWith('.bat')) return ['cmd.exe', '/c', path.resolve(this.file)];
    return [path.resolve(this.file)];
  }

  toString(): string {
    return path.resolve(this.file) + ' (' + this.source + ')';
  }
}

export class NotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'NotFoundError';
  }
}

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/**
 * Order: explicit path, managed copy (if useManaged), CODEX_EXECUTABLE / npm global / PATH.
 * @param override    path configured in settings, may be empty
 * @param managedBase directory holding the managed copy (%LOCALAPPDATA%\CodexPanel)
 */
export function locate(override?: string | null, managedBase?: string | null, useManaged = false, env: NodeJS.ProcessEnv = process.env): Located {
  const tried: string[] = [];
  if (override && override.trim()) {
    if (isFile(override.trim())) return new Located(override.trim(), 'extension setting');
    tried.push(override.trim() + ' (extension setting)');
  }
  if (useManaged && managedBase) {
    const s = readState(managedBase);
    if (s.version && s.exe && isFile(s.exe)) return new Located(s.exe, 'managed ' + s.version, s.version);
    tried.push('managed copy (not downloaded yet)');
  }
  const l = locateSystem(tried, env);
  if (l) return l;
  throw new NotFoundError('codex executable not found. Tried: ' + tried.join('; '));
}

/** Codex installed by the user (CODEX_EXECUTABLE, npm global, PATH), or null. */
export function locateSystem(tried: string[] = [], env: NodeJS.ProcessEnv = process.env): Located | null {
  const ce = env.CODEX_EXECUTABLE;
  if (ce && ce.trim()) {
    if (isFile(ce.trim())) return new Located(ce.trim(), 'CODEX_EXECUTABLE');
    tried.push(ce.trim() + ' (CODEX_EXECUTABLE)');
  }
  const appData = env.APPDATA;
  if (appData) {
    const scope = path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'node_modules', '@openai');
    const l = globVendor(scope);
    if (l) return l;
    tried.push(scope + '\\codex-*\\vendor\\*\\bin\\codex.exe');
  }
  const pathEnv = env.PATH ?? env.Path;
  if (pathEnv) {
    const win = process.platform === 'win32';
    const exts = win ? ['.exe', '.cmd', '.bat'] : [''];
    for (const dir of pathEnv.split(path.delimiter)) {
      if (!dir.trim()) continue;
      for (const ext of exts) {
        const f = path.join(dir.trim(), 'codex' + ext);
        if (isFile(f)) return new Located(f, 'PATH');
      }
    }
    tried.push('PATH');
  }
  return null;
}

function globVendor(openaiScope: string): Located | null {
  if (!isDir(openaiScope)) return null;
  try {
    for (const pkg of fs.readdirSync(openaiScope)) {
      if (!pkg.startsWith('codex-')) continue;
      const vendor = path.join(openaiScope, pkg, 'vendor');
      if (!isDir(vendor)) continue;
      for (const triple of fs.readdirSync(vendor)) {
        const exe = path.join(vendor, triple, 'bin', 'codex.exe');
        if (isFile(exe)) return new Located(exe, 'npm vendor');
      }
    }
  } catch { /* fall through to the next strategy */ }
  return null;
}
