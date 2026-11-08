// Dev tool: what does VS Code put into a drag, and does the Codex webview receive it?
// Needs the isolated VS Code from tools/live-vscode.ps1 with the Codex view visible and an editor tab open.
// Usage: node tools/drag-probe.mjs "<tab label, e.g. README.md>" [shift|noshift] [tab|explorer]
// 1. Intercepts a real drag started by mouse events on the editor tab (or Explorer row) -> prints the drag data.
// 2. Replays dragEnter/dragOver/drop over the Codex view (with or without Shift) and reads which events the page saw.
const PORT = process.env.CDP_PORT || 9334;
const [label = 'README.md', shiftArg = 'shift', source = 'tab'] = process.argv.slice(2);
const modifiers = shiftArg === 'shift' ? 8 : 0;

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const wb = targets.find(t => t.type === 'page' && /workbench/.test(t.url));
const wv = targets.find(t => t.type === 'iframe' && /^vscode-webview:/.test(t.url) && /codexpanel\.codex-panel/i.test(t.url));
if (!wb || !wv) { console.error('workbench or Codex webview not found'); process.exit(2); }

function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else events.push(m); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise(r => ws.onopen = () => r({ ws, send, events }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- install event recorders in every context of the webview target (outer host page and the nested panel page)
const page = await connect(wv);
const ctxs = [];
page.ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.executionContextCreated') ctxs.push(m.params.context); });
await page.send('Runtime.enable');
await sleep(500);
const recorder = `(() => { window.__dragLog = []; for (const t of ['dragenter','dragover','dragleave','drop']) document.addEventListener(t, e => {
  if (window.__dragLog.length > 40) return;
  const dt = e.dataTransfer; window.__dragLog.push({ t, shift: e.shiftKey, types: dt ? [...dt.types] : [], files: dt && dt.files ? dt.files.length : 0,
    data: t === 'drop' && dt ? Object.fromEntries([...dt.types].map(k => { try { return [k, dt.getData(k).slice(0, 200)]; } catch (x) { return [k, '?']; } })) : undefined });
}, true); return location.href.slice(0, 60); })()`;
for (const c of ctxs) {
  const r = await page.send('Runtime.evaluate', { expression: recorder, contextId: c.id, returnByValue: true });
  console.log('recorder in context', c.id, r.result?.result?.value);
}

// --- workbench: locate source and the Codex view
const wbc = await connect(wb);
const rect = async expr => (await wbc.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;
const src = await rect(source === 'tab'
  ? `(() => { const t = [...document.querySelectorAll('.tabs-container .tab')].find(t => (t.getAttribute('aria-label')||'').startsWith(${JSON.stringify(label)})); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`
  : `(() => { const t = [...document.querySelectorAll('.explorer-folders-view .monaco-list-row')].find(t => (t.getAttribute('aria-label')||'').startsWith(${JSON.stringify(label)})); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; })()`);
let dst = await rect(`(() => { const p = document.querySelector('.part.auxiliarybar .content') || document.querySelector('.part.auxiliarybar'); const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (process.env.DST) { const [x, y] = process.env.DST.split(',').map(Number); dst.x = x; dst.y = y; }   // aim somewhere else, e.g. the editor, to compare
console.log('source', src, 'target', dst);
if (!src) { console.error('source not found'); process.exit(3); }

if (source === 'external') { // like a drag from Windows Explorer: no drag start inside VS Code
  const data = { items: [{ mimeType: 'text/uri-list', data: 'file:///D:/CodexPanel/codex-panel/README.md' }], files: ['D:\\CodexPanel\\codex-panel\\README.md'], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'dragOver', 'drop']) { await wbc.send('Input.dispatchDragEvent', { type, x: dst.x, y: dst.y, data, modifiers }); await sleep(150); }
  await sleep(500);
  for (const c of ctxs) {
    const r = await page.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__dragLog || null)', contextId: c.id, returnByValue: true });
    console.log('context', c.id, 'saw:', r.result?.result?.value);
  }
  process.exit(0);
}
// a drag left over from an earlier run blocks the next one: cancel it and release the button first
await wbc.send('Input.dispatchDragEvent', { type: 'dragCancel', x: 10, y: 10, data: { items: [], dragOperationsMask: 1 } });
await wbc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: src.x, y: src.y, button: 'left' });
await wbc.send('Input.setInterceptDrags', { enabled: true });
// the first attempt after an earlier drag is sometimes swallowed by Chromium's leftover mouse state: retry
let intercepted;
for (let attempt = 0; attempt < 4 && !intercepted; attempt++) {
  await wbc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: src.x, y: src.y });
  await wbc.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: src.x, y: src.y, button: 'left', clickCount: 1, buttons: 1 });   // Shift is pressed after the drag started (Shift on mouse down would select a range)
  for (let i = 1; i <= 10; i++) {
    await wbc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: src.x + (dst.x - src.x) * i / 10, y: src.y + (dst.y - src.y) * i / 10, button: 'left', buttons: 1, modifiers: i > 2 && process.env.SHIFT_MOUSE !== '0' ? modifiers : 0 });
    await sleep(30);
  }
  await sleep(300);
  intercepted = wbc.events.find(m => m.method === 'Input.dragIntercepted');
  if (!intercepted) await wbc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dst.x, y: dst.y, button: 'left' });
}
if (!intercepted) { console.error('no drag intercepted'); await wbc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dst.x, y: dst.y, button: 'left' }); process.exit(4); }
const data = intercepted.params.data;
console.log('DRAG DATA:', JSON.stringify(data.items.map(i => ({ mime: i.mimeType, data: i.data.slice(0, 200) })), null, 1), 'files', data.files, 'mask', data.dragOperationsMask);

const OVERS = Number(process.env.DRAGOVERS || 2);   // a real drag sends dragover every ~50 ms
for (const type of ['dragEnter', ...Array(OVERS).fill('dragOver'), 'drop']) {
  await wbc.send('Input.dispatchDragEvent', { type, x: dst.x, y: dst.y, data, modifiers });
  await sleep(150);
}
await wbc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dst.x, y: dst.y, button: 'left' });
await wbc.send('Input.setInterceptDrags', { enabled: false });
await sleep(500);

for (const c of ctxs) {
  const r = await page.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__dragLog || null)', contextId: c.id, returnByValue: true });
  console.log('context', c.id, 'saw:', r.result?.result?.value);
}
process.exit(0);
