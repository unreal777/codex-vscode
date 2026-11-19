// "Preview" of an html code block in an answer: a static page in an editor tab of its own. No scripts (enableScripts off and a CSP that
// forbids them), no local files, no command links. One tab at a time; another preview replaces its content.
import * as vscode from 'vscode';
import { previewDocument } from './core/htmlPreview';

export class HtmlPreview implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;

  dispose(): void { this.panel?.dispose(); }

  open(html: string): void {
    if (this.panel) { this.panel.webview.html = previewDocument(html); this.panel.reveal(vscode.ViewColumn.Active, false); return; }
    const p = vscode.window.createWebviewPanel('codexPanel.htmlPreview', 'HTML preview', { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: false, enableForms: false, enableCommandUris: false, localResourceRoots: [], retainContextWhenHidden: false });
    p.webview.html = previewDocument(html);
    p.onDidDispose(() => { if (this.panel === p) this.panel = null; });
    this.panel = p;
  }
}
