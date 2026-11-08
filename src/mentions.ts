// Answers the "@" popup: files of the chat's project, ranked by FileIndex (port of MentionSearch.java).
// The index is built with vscode.workspace.findFiles (so files.exclude / search.exclude are honoured like in the IDE, plus the
// folders the Java code skips) and cached per working directory. It is rebuilt when files were created or deleted, and at the
// latest every 30 seconds. Folders outside the workspace are walked on disk instead.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { FileIndex, FileIndexBuilder, isBinaryFile, isIgnoredFolder, scanFolder } from './core/fileIndex';
import { Json } from './core/jsonrpc';
import { normalizeDrive } from './core/winPath';
import { fsPathOf, isInside, WorkspaceBridge } from './workspace';

const MAX_AGE_MS = 30_000;
const RESULT_LIMIT = 40;
const IGNORED = ['.git', '.svn', '.hg', '.metadata', '.settings', '.idea', '.gradle', 'bin', 'target', 'build', 'node_modules', '__pycache__', '.vscode-test'];
const IGNORED_SEGMENT = new RegExp('[\\\\/](?:' + IGNORED.map((s) => s.replace(/\./g, '\\.')).join('|') + ')(?:[\\\\/]|$)');

interface Cached {
  index: FileIndex;
  generation: number;
}

export class MentionSearch implements vscode.Disposable {
  private readonly cache = new Map<string, Cached>();
  /** Bumped by the watcher whenever files appear or disappear; an index built under an older number is stale. */
  private generation = 0;
  private readonly watcher: vscode.FileSystemWatcher;
  private latest = 0;

  constructor(private readonly ws: WorkspaceBridge, private readonly log: (line: string) => void) {
    // content changes (typing, builds into bin/) must not invalidate the index: only created and deleted files
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
    const bump = (u: vscode.Uri) => {
      if (!IGNORED_SEGMENT.test(u.fsPath)) this.generation++;
    };
    this.watcher.onDidCreate(bump);
    this.watcher.onDidDelete(bump);
  }

  dispose(): void {
    this.watcher.dispose();
    this.cache.clear();
  }

  /** Runs the search and hands the "mentions" event to out; only the newest request of a burst of keystrokes is built. */
  async searchAsync(cwd: string, query: string, requestId: number, out: (e: Json) => void): Promise<void> {
    this.latest = requestId;
    const event: Json = { kind: 'mentions', requestId };
    try {
      event.items = await this.search(cwd, query);
    } catch (e) {
      this.log('file search failed for ' + cwd + ': ' + e);
      event.items = [];
      event.error = String((e as Error).message ?? e);
    }
    out(event);
  }

  async search(cwd: string, query: string): Promise<Json[]> {
    const index = await this.indexFor(cwd);
    const project = this.ws.projectName(cwd);
    const hits = index.search(query, RESULT_LIMIT, this.recentRelativePaths(cwd));
    return hits.map((h) => ({
      path: normalizeDrive(path.join(cwd, h.entry.path)),
      name: h.entry.name,
      dir: h.entry.dir,
      folder: h.entry.folder,
      project,
    }));
  }

  /** Recently activated editors that live below the working directory, as index-relative paths. */
  private recentRelativePaths(cwd: string): string[] {
    const out: string[] = [];
    for (const f of this.ws.recentFiles()) {
      if (isInside(f, cwd)) out.push(path.relative(cwd, f).replace(/\\/g, '/'));
    }
    return out;
  }

  private async indexFor(cwd: string): Promise<FileIndex> {
    const key = cwd.replace(/\\/g, '/').toLowerCase();
    const generation = this.generation;
    const cached = this.cache.get(key);
    if (cached && cached.generation === generation && Date.now() - cached.index.builtAtMillis < MAX_AGE_MS) return cached.index;
    const index = await this.build(cwd);
    this.cache.set(key, { index, generation });
    return index;
  }

  /** Glob of everything that must not be offered: files.exclude, search.exclude and the Java code's folder list. */
  private excludeGlob(): string {
    const parts = ['**/{' + IGNORED.join(',') + '}/**'];
    for (const section of ['files.exclude', 'search.exclude']) {
      const obj = vscode.workspace.getConfiguration().get<Record<string, boolean | { when?: string }>>(section) ?? {};
      for (const [glob, on] of Object.entries(obj)) if (on === true) parts.push(glob);
    }
    return '{' + parts.join(',') + '}';
  }

  private async build(cwd: string): Promise<FileIndex> {
    if (!this.ws.folderAt(cwd)) return scanFolder(cwd); // not in the workspace (e.g. a resumed chat of another project)
    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(cwd), '**/*'), this.excludeGlob());
    const builder = new FileIndexBuilder();
    const folders = new Set<string>();
    const files: string[] = [];
    for (const u of uris) {
      const rel = path.relative(cwd, fsPathOf(u)).replace(/\\/g, '/');
      if (rel === '' || rel.startsWith('..')) continue;
      const name = rel.substring(rel.lastIndexOf('/') + 1);
      if (isBinaryFile(name)) continue;
      files.push(rel);
      for (let i = rel.indexOf('/'); i >= 0; i = rel.indexOf('/', i + 1)) {
        const dir = rel.substring(0, i);
        if (isIgnoredFolder(dir.substring(dir.lastIndexOf('/') + 1))) continue;
        folders.add(dir);
      }
    }
    for (const d of [...folders].sort()) if (!builder.add(d, true)) break;
    for (const f of files) if (!builder.add(f, false)) break;
    return builder.build();
  }
}
