// A tiny native tree under the chat webview. VS Code blocks webview views during workbench drags unless Shift is held (the webview iframe gets
// pointer-events:none on drag/dragover without shiftKey), but it does deliver them to a tree view with a drag-and-drop controller.
// So Shift+drop on the chat is the main way; this tree (no items) is only a small fallback target.
import * as vscode from 'vscode';
import { candidatesOf } from './core/dropUris';
import { fsPathOf } from './workspace';

export const DROP_VIEW_IDS = ['codexPanel.drop', 'codexPanel.dropSecondary'];

const MIMES = ['text/uri-list', 'application/vnd.code.uri-list', 'resourceurls', 'codeeditors', 'files', 'text/plain'];
const HINT = 'Drop files or editor tabs here, or hold Shift and drop them on the chat.';

export class DropTarget implements vscode.TreeDataProvider<never>, vscode.TreeDragAndDropController<never>, vscode.Disposable {
  readonly dropMimeTypes = MIMES;
  readonly dragMimeTypes: string[] = [];
  private readonly views: vscode.TreeView<never>[] = [];

  /** @param onDrop receives the candidate paths / URIs; the owner resolves them like any other drop and reveals the chat */
  constructor(private readonly onDrop: (candidates: string[]) => void, private readonly log: (line: string) => void) {}

  readonly onDidChangeTreeData = new vscode.EventEmitter<void>().event;

  /** Creates the tree view for one of the two containers. */
  createView(id: string): vscode.TreeView<never> {
    const v = vscode.window.createTreeView<never>(id, { treeDataProvider: this, dragAndDropController: this, showCollapseAll: false, canSelectMany: false });
    this.views.push(v);
    v.message = HINT;
    return v;
  }

  getChildren(): never[] {
    return [];
  }

  getTreeItem(el: never): vscode.TreeItem {
    return el;
  }

  async handleDrop(_target: never | undefined, dt: vscode.DataTransfer): Promise<void> {
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
  }
}
