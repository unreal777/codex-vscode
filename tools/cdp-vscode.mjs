// Dev tool: drive the Codex view inside an isolated VS Code through Electron DevTools.
// Start VS Code with tools/live-vscode.ps1 (it passes --remote-debugging-port=9334).
// Usage:
//   node tools/cdp-vscode.mjs list
//   node tools/cdp-vscode.mjs eval "<js expression, runs inside the Codex page>"
//   node tools/cdp-vscode.mjs workbench "<js expression, runs in the VS Code window>"
//   node tools/cdp-vscode.mjs shot out.png        (screenshot of the whole VS Code window)
//   node tools/cdp-vscode.mjs console 5000        (console of the Codex page for N ms)
//
// VS Code puts a webview into an iframe (vscode-webview://...) whose own page holds the extension's HTML in a
// nested same-origin iframe "active-frame". We attach to the outer iframe target and evaluate inside the nested one.
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9334;
const [cmd, arg] = process.argv.slice(2);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
if (cmd === 'list') { for (const t of targets) console.log(t.type, t.title, t.url.slice(0, 160)); process.exit(0); }

const workbench = targets.find(t => t.type === 'page' && /workbench/.test(t.url));
const webview = targets.find(t => t.type === 'iframe' && /^vscode-webview:/.test(t.url) && /codexpanel\.codex-panel/i.test(t.url));
const target = (cmd === 'workbench' || cmd === 'shot') ? workbench : webview;
if (!target) { console.error('target not found (is the Codex view open?):', targets.map(t => t.type + ' ' + t.url.slice(0, 100))); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') console.log(`[${m.params.type}]`, m.params.args.map(a => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(r => ws.onopen = r);

// The page's CSP forbids eval, so we evaluate through DevTools in the nested frame's execution context:
// collect all contexts of this target and take the one whose document has the panel's #app element.
async function pageContext() {
  const contexts = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.executionContextCreated') contexts.push(m.params.context); });
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 500));
  for (const c of contexts) {
    const r = await send('Runtime.evaluate', { expression: "!!document.getElementById('app')", contextId: c.id, returnByValue: true });
    if (r.result?.result?.value === true) return c.id;
  }
  throw new Error('Codex page context not found');
}

if (cmd === 'eval' || cmd === 'workbench') {
  const params = { expression: arg, awaitPromise: true, returnByValue: true };
  if (cmd === 'eval') params.contextId = await pageContext();
  const res = await send('Runtime.evaluate', params);
  const r = res.result;
  console.log(r.exceptionDetails ? 'ERROR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : JSON.stringify(r.result.value, null, 1));
} else if (cmd === 'shot') {
  await send('Page.enable');
  const res = await Promise.race([
    send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot timed out')), 15000)),
  ]);
  writeFileSync(arg || 'shot.png', Buffer.from(res.result.data, 'base64'));
  console.log('saved', arg || 'shot.png');
} else if (cmd === 'console') {
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, Number(arg) || 5000));
}
ws.close();
