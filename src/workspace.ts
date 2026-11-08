// Glue between Codex and the VS Code workspace: cwd, autosave, opening files (port of WorkspaceBridge.java).
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseFileLink, resolveFileLink } from './core/fileLinks';
import { folderName } from './core/threadRows';
import { normalizeDrive } from './core/winPath';

const MAX_RECENT = 30;

/** Is child equal to or below base? Case-insensitive on Windows (path.relative does that). */
export function isInside(child: string, base: string): boolean {
  const rel = path.relative(base, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Filesystem path of a URI with an uppercase Windows drive letter (what Codex and Eclipse store); use this instead of Uri.fsPath. */
export function fsPathOf(uri: vscode.Uri): string {
  return normalizeDrive(uri.fsPath);
}

export interface OpenProject {
  name: string;
  cwd: string;
}

export interface Target {
  path: string;
  folder?: vscode.WorkspaceFolder;
}

export class WorkspaceBridge {
  private readonly recent: string[] = [];
  private lastFileEditor?: vscode.TextEditor;

  // ---- folders ----

  private folders(): vscode.WorkspaceFolder[] {
    return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file');
  }

  /** Directory for the app-server process itself (not the thread). */
  workspaceDir(): string {
    const f = this.folders()[0];
    return f ? fsPathOf(f.uri) : normalizeDrive(os.homedir());
  }

  /** Workspace folder of the active editor, else the first workspace folder; project name = folder name. */
  resolveTarget(): Target {
    const ed = vscode.window.activeTextEditor ?? this.lastFileEditor;
    if (ed && ed.document.uri.scheme === 'file') {
      const f = vscode.workspace.getWorkspaceFolder(ed.document.uri);
      if (f && f.uri.scheme === 'file') return { path: fsPathOf(f.uri), folder: f };
    }
    const first = this.folders()[0];
    if (first) return { path: fsPathOf(first.uri), folder: first };
    return { path: this.workspaceDir() };
  }

  /** Workspace folder whose location equals or contains the directory (deepest wins), else undefined. */
  folderAt(dir: string | null | undefined): vscode.WorkspaceFolder | undefined {
    if (!dir) return undefined;
    let best: vscode.WorkspaceFolder | undefined;
    let bestLen = -1;
    for (const f of this.folders()) {
      const fp = fsPathOf(f.uri);
      if (isInside(dir, fp) && fp.length > bestLen) {
        best = f;
        bestLen = fp.length;
      }
    }
    return best;
  }

  /** Workspace folder name for a directory, else the folder name of the directory. */
  projectName(dir: string | null | undefined): string {
    const f = this.folderAt(dir);
    return f ? f.name : folderName(dir);
  }

  /** The folders open in this window (all of a multi-root workspace) as {name, cwd}, for the History project preselection. */
  openProjects(): OpenProject[] {
    return this.folders().map((f) => ({ name: f.name, cwd: fsPathOf(f.uri) }));
  }

  // ---- editors ----

  /** Absolute path of the file in the editor, or null (non-file documents). */
  filePath(ed: vscode.TextEditor | undefined): string | null {
    return ed && ed.document.uri.scheme === 'file' ? fsPathOf(ed.document.uri) : null;
  }

  /** Called when an editor is activated: feeds the "recently opened files first" order of the "@" popup. */
  rememberEditor(ed: vscode.TextEditor | undefined): void {
    const p = this.filePath(ed);
    if (!p) return;
    this.lastFileEditor = ed;
    const i = this.recent.indexOf(p);
    if (i >= 0) this.recent.splice(i, 1);
    this.recent.unshift(p);
    while (this.recent.length > MAX_RECENT) this.recent.pop();
  }

  /** Absolute paths of recently activated editors, newest first. */
  recentFiles(): string[] {
    return [...this.recent];
  }

  /** Saves dirty editors that belong to the workspace folder (so Codex sees current content). */
  async saveDirty(folder: vscode.WorkspaceFolder | undefined): Promise<void> {
    if (!folder) return;
    for (const d of vscode.workspace.textDocuments) {
      if (d.isDirty && d.uri.scheme === 'file' && isInside(fsPathOf(d.uri), fsPathOf(folder.uri))) await d.save();
    }
  }

  // ---- opening files ----

  /**
   * Opens a file from a chat link (absolute, relative to the chat's cwd, relative to a workspace folder, file: URI) and selects the
   * line/range; folders are revealed in the Explorer instead.
   * @returns null on success, otherwise a short message to show in the panel
   */
  async openFile(rawPath: string | null, line: number, column: number, endLine: number, cwd: string | null): Promise<string | null> {
    if (!rawPath) return 'No file to open';
    const ref = parseFileLink(rawPath);
    if (!ref) return 'Not a file: ' + rawPath;
    if (line <= 0) {
      line = ref.line;
      column = ref.column;
      endLine = ref.endLine;
    }
    const roots = this.folders().map((f) => fsPathOf(f.uri));
    const found = resolveFileLink(ref.path, cwd, roots);
    if (!found) return 'File not found: ' + ref.path + (ref.line > 0 ? ':' + ref.line : '');
    const uri = vscode.Uri.file(normalizeDrive(found));
    try {
      if (fs.statSync(found).isDirectory()) {
        if (this.folderAt(found)) await vscode.commands.executeCommand('revealInExplorer', uri);
        else await vscode.commands.executeCommand('revealFileInOS', uri); // outside the workspace: system file explorer
        return null;
      }
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        await vscode.commands.executeCommand('vscode.open', uri); // binary or not a text file
        return null;
      }
      const sel = line > 0 ? selectionFor(doc, line, column, endLine) : undefined;
      const ed = await vscode.window.showTextDocument(doc, { preview: false, selection: sel });
      if (sel) ed.revealRange(sel, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      return null;
    } catch (e) {
      return 'Cannot open ' + ref.path + ': ' + (e as Error).message;
    }
  }
}

/** Caret at line:column, or the whole line, or the lines line..endLine (1-based), clamped to the document. */
export function selectionFor(doc: vscode.TextDocument, line: number, column: number, endLine: number): vscode.Range {
  const last = doc.lineCount;
  const first = doc.lineAt(Math.min(line, last) - 1);
  if (endLine > line) {
    const end = doc.lineAt(Math.min(endLine, last) - 1);
    const startCh = column > 0 ? Math.min(column - 1, first.text.length) : 0;
    return new vscode.Range(first.lineNumber, startCh, end.lineNumber, end.text.length);
  }
  if (column > 0) {
    const p = new vscode.Position(first.lineNumber, Math.min(column - 1, first.text.length));
    return new vscode.Range(p, p);
  }
  return new vscode.Range(first.lineNumber, 0, first.lineNumber, first.text.length);
}
