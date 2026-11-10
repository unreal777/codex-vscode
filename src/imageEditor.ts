// Attached pictures shown big in their own editor tab (the chat panel is too small): view, draw, write, save back. One tab at a time;
// opening another picture replaces it. The page script is web/imageEditor.js.
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

export interface ImageRequest {
  /** data URL of the picture; empty for a new sketch */
  url: string;
  name: string;
  /** tools and Save (attached pictures, new sketch) or view only (pictures of sent messages) */
  editable: boolean;
  /** a new white sketch */
  blank: boolean;
}

export class ImageEditor implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private onSave: ((url: string) => void) | null = null;
  private pending: ImageRequest | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  dispose(): void { this.panel?.dispose(); }

  open(req: ImageRequest, onSave: (url: string) => void): void {
    this.onSave = onSave;
    this.pending = req;
    const title = req.blank ? 'Sketch' : (req.editable ? 'Edit: ' : 'Image: ') + (req.name || 'image');
    if (this.panel) {
      this.panel.title = title;
      this.panel.reveal(vscode.ViewColumn.Active, false);
      void this.panel.webview.postMessage({ kind: 'init', ...req });   // the page starts over with the new picture
      this.pending = null;
      return;
    }
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    const p = vscode.window.createWebviewPanel('codexPanel.image', title, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, localResourceRoots: [media], retainContextWhenHidden: true });
    p.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'codex.svg');
    p.webview.html = this.html(p.webview);
    p.webview.onDidReceiveMessage((m: { type?: string; url?: string }) => {
      if (m.type === 'ready' && this.pending) { void p.webview.postMessage({ kind: 'init', ...this.pending }); this.pending = null; }
      else if (m.type === 'save' && typeof m.url === 'string' && /^data:image\/png;base64,/.test(m.url)) { this.onSave?.(m.url); p.dispose(); }
      else if (m.type === 'close') p.dispose();
    });
    p.onDidDispose(() => { if (this.panel === p) { this.panel = null; this.onSave = null; } });
    this.panel = p;
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const u = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', ...p)).toString();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Image</title>
<link rel="stylesheet" href="${u('web', 'imageEditor.css')}">
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${u('web', 'imageEditor.js')}"></script>
</body>
</html>`;
  }
}
