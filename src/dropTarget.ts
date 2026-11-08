// A compact native tree under the chat webview. VS Code never delivers workbench drags (editor tabs, Explorer items) to a webview view,
// but it does to a tree view with a drag-and-drop controller. The tree is also THE list of files and folders attached to the chat.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { candidatesOf } from './core/dropUris';
import { fsPathOf } from './workspace';
import type { ChipItem } from './panel';

export const DROP_VIEW_IDS = ['codexPanel.drop', 'codexPanel.dropSecondary'];
export const REMOVE_COMMAND = 'codexPanel.removeAttachment';

const MIMES = ['text/uri-list', 'application/vnd.code.uri-list', 'resourceurls', 'codeeditors', 'files', 'text/plain'];
const HINT_EMPTY = 'Drop files, folders or editor tabs here.';

export class DropTarget implements vscode.TreeDataProvider<ChipItem>, vscode.TreeDragAndDropController<ChipItem>, vscode.Disposable {
  readonly dropMimeTypes = MIMES;
  readonly dragMimeTypes: string[] = [];
  private items: ChipItem[] = [];
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly views: vscode.TreeView<ChipItem>[] = [];

  /** @param onDrop receives the candidate paths / URIs; the owner resolves them like any other drop and reveals the chat */
  constructor(private readonly onDrop: (candidates: string[]) => void, private readonly log: (line: string) => void) {}

  /** Creates the tree view for one of the two containers. */
  createView(id: string): vscode.TreeView<ChipItem> {
    const v = vscode.window.createTreeView<ChipItem>(id, { treeDataProvider: this, dragAndDropController: this, showCollapseAll: false, canSelectMany: false });
    this.views.push(v);
    v.message = this.message();
    return v;
  }

  setItems(items: ChipItem[]): void {
    this.items = items;
    for (const v of this.views) v.message = this.message();
    this.changed.fire();
  }

  private message(): string | undefined {
    return this.items.length === 0 ? HINT_EMPTY : undefined;
  }

  getChildren(): ChipItem[] {
    return this.items;
  }

  getTreeItem(el: ChipItem): vscode.TreeItem {
    const uri = vscode.Uri.file(el.path);
    const t = new vscode.TreeItem(el.name || path.basename(el.path) || el.path);
    t.resourceUri = uri;
    t.iconPath = el.folder ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
    // folder relative to the workspace (empty at its root); outside the workspace the full folder
    const rel = vscode.workspace.asRelativePath(el.path, false);
    const dir = rel === el.path ? path.dirname(el.path) : path.dirname(rel);
    const where = dir === '.' ? '' : dir;
    t.description = el.kind === 'file' ? (where ? where + ' · active file' : 'active file') : where;
    t.tooltip = el.path;
    t.contextValue = 'codexAttachment';
    if (!el.folder) t.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    return t;
  }

  async handleDrop(_target: ChipItem | undefined, dt: vscode.DataTransfer): Promise<void> {
    const values = new Map<string, string>();
    const files: string[] = [];
    for (const [mime, item] of dt) {
      let text = '';
      try { text = await item.asString(); } catch { /* a file item has no string */ }
      this.log('[drop-tree] ' + mime + ' = ' + JSON.stringify(text.slice(0, 300)));
      values.set(mime.toLowerCase(), text);
      const f = item.asFile();
      if (f?.uri && f.uri.scheme === 'file') files.push(fsPathOf(f.uri));
    }
    const found = [...candidatesOf(values), ...files];
    if (found.length === 0) this.log('[drop-tree] no file or folder found in the drop');
    this.onDrop(found);
  }

  dispose(): void {
    this.views.forEach((v) => v.dispose());
    this.changed.dispose();
  }
}
