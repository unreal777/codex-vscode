// Which repository a folder belongs to, independent of where it lies on disk (0.13.0): two copies of one project (a copied folder, a second
// clone, a git worktree) share the address of their remote. Used by the branch chats (one memory for all copies) and to run a chat of
// another copy in this window's folder. No VS Code imports (unit tested); the file system comes in through FsOps.
import * as path from 'node:path';

export interface FsOps {
  isDir(p: string): boolean;
  isFile(p: string): boolean;
  /** file text, null when it can not be read */
  read(p: string): string | null;
}

/** A remote URL without protocol, user, port, ".git" and case: "git@github.com:Org/App.git" and "https://github.com/org/app" are the same. */
export function normalizeRemote(url: string): string | null {
  let u = (url || '').trim();
  if (!u) return null;
  let out: string;
  const scp = /^(?:[^@/\\\s]+@)?([^:/\\\s]{2,}):(?!\/\/)(.+)$/.exec(u);   // git@host:owner/repo (a host of 2+ characters: never a drive letter)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    try {
      const p = new URL(u);
      out = p.protocol === 'file:' ? 'file:' + decodeURIComponent(p.pathname) : p.hostname + p.pathname;
    } catch {
      return null;
    }
  } else if (scp) {
    out = scp[1] + '/' + scp[2];
  } else {
    out = 'file:' + u;   // a local path as the remote
  }
  out = out.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return out ? out.toLowerCase() : null;
}

/** The URL of remote "origin" in a git config, else of the first remote that has one. */
export function remoteOfConfig(text: string): string | null {
  let section: string | null = null;
  let first: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const s = /^\s*\[\s*remote\s+"([^"]*)"\s*\]/.exec(line);
    if (s) { section = s[1]; continue; }
    if (/^\s*\[/.test(line)) { section = null; continue; }
    const u = section !== null ? /^\s*url\s*=\s*(.*?)\s*$/i.exec(line) : null;
    if (!u || !u[1]) continue;
    const url = u[1].replace(/^"(.*)"$/, '$1');
    if (section === 'origin') return url;
    if (first === null) first = url;
  }
  return first;
}

/** The working tree root above (or at) dir, and the folder that holds its config (a worktree's ".git" file points to its git dir, whose
 *  "commondir" leads to the shared one). null when dir is in no repository. */
export function findRepo(dir: string, fs: FsOps): { root: string; configDir: string } | null {
  let cur = path.resolve(dir);
  for (let i = 0; i < 64; i++) {
    const dotGit = path.join(cur, '.git');
    if (fs.isDir(dotGit)) return { root: cur, configDir: dotGit };
    if (fs.isFile(dotGit)) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.read(dotGit) ?? '');
      if (!m) return null;
      const gitDir = path.resolve(cur, m[1]);
      const common = (fs.read(path.join(gitDir, 'commondir')) ?? '').trim();
      return { root: cur, configDir: common ? path.resolve(gitDir, common) : gitDir };
    }
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
  return null;
}

/** Comparable form of a path (slashes, no trailing slash, case-insensitive on Windows). */
export function samePathKey(p: string, platform: NodeJS.Platform = process.platform): string {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return platform === 'win32' ? s.toLowerCase() : s;
}

/** Identity of the repository of dir: "remote:<address>" when it has a remote, else "path:<root>" (then only that folder matches). */
export function repoIdOf(dir: string, fs: FsOps, platform: NodeJS.Platform = process.platform): { root: string; id: string } | null {
  const r = findRepo(dir, fs);
  if (!r) return null;
  const remote = normalizeRemote(remoteOfConfig(fs.read(path.join(r.configDir, 'config')) ?? '') ?? '');
  return { root: r.root, id: remote ? 'remote:' + remote : 'path:' + samePathKey(r.root, platform) };
}

/** Where a chat worked when its last message was sent (0.13.1). branch null = unknown (no repository, detached HEAD). */
export interface ChatPlace { cwd: string; branch: string | null }

/** Start of the line put in front of a message when the chat moved; the page and the History hide it (stripPreamble). */
export const MOVE_NOTE_PREFIX = 'Chat moved: ';

/**
 * The one-line note for the model when the chat now works in another folder or on another branch than at its last message: earlier
 * messages name files of the old place, and Codex does not tell the model about a new folder or branch by itself. null = nothing moved.
 */
export function moveNote(prev: ChatPlace | null | undefined, now: ChatPlace, platform: NodeJS.Platform = process.platform): string | null {
  if (!prev || !prev.cwd || !now.cwd) return null;
  const folder = samePathKey(prev.cwd, platform) !== samePathKey(now.cwd, platform);
  const branch = !!prev.branch && !!now.branch && prev.branch !== now.branch;
  if (!folder && !branch) return null;
  const at = (p: ChatPlace) => 'folder ' + p.cwd + (p.branch ? ' on git branch ' + p.branch : '');
  return MOVE_NOTE_PREFIX + 'this chat now works in ' + at(now) + ' (before: ' + at(prev) + '). Earlier messages may name files or paths of the old ' +
    (folder ? 'folder' : 'branch') + ': read and change the files here, using paths in this folder.';
}

function inside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  const c = samePathKey(child, platform), p = samePathKey(parent, platform);
  return c === p || c.startsWith(p + '/');
}

/**
 * The folder a chat should run in when it is opened in a window with these workspace folders. A chat whose folder lies in another copy of
 * a repository that is open here (same remote) runs in the same sub folder of this copy; anything else keeps its folder.
 */
export function cwdForWorkspace(cwd: string, folders: string[], fs: FsOps, platform: NodeJS.Platform = process.platform): string {
  if (!cwd || folders.some((f) => inside(cwd, f, platform))) return cwd;
  const src = repoIdOf(cwd, fs, platform);
  if (!src || !src.id.startsWith('remote:')) return cwd;
  for (const f of folders) {
    const dst = repoIdOf(f, fs, platform);
    if (!dst || dst.id !== src.id || samePathKey(dst.root, platform) === samePathKey(src.root, platform)) continue;
    const target = path.join(dst.root, path.relative(src.root, path.resolve(cwd)));
    return fs.isDir(target) ? target : dst.root;
  }
  return cwd;
}
