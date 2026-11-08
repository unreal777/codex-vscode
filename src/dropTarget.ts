// A small native tree under the chat webview. VS Code never delivers drags from its own editor tabs / Explorer to a webview view (the iframe
// gets pointer-events:none during a workbench drag; with Shift nothing arrived either on the user's Windows machine), but it does deliver them
// to a tree view with a drag-and-drop controller. The tree has no items (the chips stay in the chat); VS Code keeps every extension view at
// least ~120 px high (ViewPane default minimumBodySize), so it can not be smaller.
import * as vscode from 'vscode';
import { candidatesOf } from './core/dropUris';
import { fsPathOf } from './workspace';

export const DROP_VIEW_IDS = ['codexPanel.drop', 'codexPanel.dropSecondary'];

const MIMES = ['text/uri-list', 'application/vnd.code.uri-list', 'resourceurls', 'codeeditors', 'files', 'text/plain'];
const HINT = 'Drop files, folders or editor tabs here to attach them.';

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
