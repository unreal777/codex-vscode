// Diffs of Codex changes in VS Code's diff editor (port of CompareHelper.java). The "before" text is rebuilt from the unified diff
// (Codex's fileChange items only carry the diff, and the file on disk already has the change). Both sides are virtual,
// read-only documents of the scheme codexpanel-diff:, served from memory.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { deletedContent, diffPath, parseGitDiff, reverseApply } from './core/unifiedDiff';

export const DIFF_SCHEME = 'codexpanel-diff';
const MAX_DOCS = 200;

interface Entry {
  /** shown name, '/' separated; its extension selects the syntax highlighting */
  name: string;
  before: string;
  after: string;
}

export class DiffProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly docs = new Map<string, string>();
  private counter = 0;
  private readonly reg: vscode.Disposable;

  constructor(private readonly log: (line: string) => void) {
    this.reg = vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, this);
  }

  dispose(): void {
    this.reg.dispose();
    this.docs.clear();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.path) ?? '';
  }

  private virtual(side: 'before' | 'after', name: string, text: string): vscode.Uri {
    const key = '/' + side + '/' + ++this.counter + '/' + name;
    this.docs.set(key, text);
    if (this.docs.size > MAX_DOCS) this.docs.delete(this.docs.keys().next().value as string); // oldest first
    return vscode.Uri.from({ scheme: DIFF_SCHEME, path: key });
  }

  /**
   * One file. diff is the hunk text from a fileChange item (or raw content for "add"/"delete");
   * the file on disk is assumed to contain the change already.
   */
  async openFileDiff(file: string, kind: string | null, diff: string | null): Promise<void> {
    const e = this.build(file, file, kind, diff ?? '');
    if (!e) {
      await this.open('Codex diff: ' + path.basename(file), [{ name: path.basename(file) + '.diff', before: '', after: diff ?? '' }]);
      return;
    }
    await this.open('Codex: ' + path.basename(file), [{ ...e, name: path.basename(file) }]);
  }

  /** Whole-turn diff ("diff --git" text); paths are relative to cwd. */
  async openTurnDiff(cwd: string, diff: string | null): Promise<void> {
    const entries: Entry[] = [];
    for (const fd of parseGitDiff(diff ?? '')) {
      const rel = diffPath(fd) as string;
      const kind = fd.isNew ? 'add' : fd.isDelete ? 'delete' : 'update';
      const e = this.build(path.resolve(cwd, rel), rel, kind, fd.hunks);
      if (e) entries.push(e);
    }
    if (entries.length === 0) {
      await this.open('Codex diff: Codex changes', [{ name: 'Codex changes.diff', before: '', after: diff ?? '' }]);
      return;
    }
    await this.open('Codex: changes of this turn', entries);
  }

  private build(file: string, label: string, kind: string | null, diff: string): Entry | null {
    const name = label.replace(/\\/g, '/');
    try {
      if (kind === 'add') {
        const after = isFile(file) ? read(file) : diff;
        return { name, before: '', after };
      }
      if (kind === 'delete') return { name, before: deletedContent(diff), after: '' };
      if (!isFile(file)) return null;
      const after = read(file);
      const before = reverseApply(after, diff);
      return before === null ? null : { name, before, after };
    } catch (e) {
      this.log('cannot build diff input for ' + file + ': ' + e);
      return null;
    }
  }

  private async open(title: string, entries: Entry[]): Promise<void> {
    const pairs = entries.map((e) => ({ e, left: this.virtual('before', e.name, e.before), right: this.virtual('after', e.name, e.after) }));
    if (pairs.length === 1) {
      await vscode.commands.executeCommand('vscode.diff', pairs[0].left, pairs[0].right, title + ' (before ↔ after)');
      return;
    }
    try { // multi-file diff editor of the built-in git extension; the label uri decides the displayed name
      await vscode.commands.executeCommand('vscode.changes', title,
        pairs.map((p) => [vscode.Uri.from({ scheme: DIFF_SCHEME, path: '/label/' + p.e.name }), p.left, p.right]));
    } catch (e) {
      this.log('vscode.changes unavailable, opening the files one by one: ' + e);
      for (const p of pairs) {
        await vscode.commands.executeCommand('vscode.diff', p.left, p.right, 'Codex: ' + p.e.name + ' (before ↔ after)', { preview: false });
      }
    }
  }
}

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}
