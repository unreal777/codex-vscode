// 0.15.0: "Your browser" in the MCP settings: Chrome DevTools MCP --autoConnect / Playwright MCP --extension.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { argsWithFlag, BROWSER_PRESETS, browserStates } from '../core/browserMcp';

const root = path.join(__dirname, '..', '..');

test('presets: the official packages with the flag that uses the open browser', () => {
  assert.deepEqual(BROWSER_PRESETS.chrome.args, ['-y', 'chrome-devtools-mcp@latest', '--autoConnect']);
  assert.deepEqual(BROWSER_PRESETS.playwright.args, ['-y', '@playwright/mcp@latest', '--extension']);
  assert.equal(BROWSER_PRESETS.chrome.setupUrl, 'chrome://inspect/#remote-debugging');
});

test('browserStates: missing, a server of the package without the flag, ready; any server name, any version', () => {
  assert.deepEqual(browserStates({}).map((s) => s.state), ['missing', 'missing']);
  assert.deepEqual(browserStates(null).map((s) => s.name), ['chrome-devtools', 'playwright']);
  const s = browserStates({
    'chrome-devtools': { command: 'npx', args: ['chrome-devtools-mcp@0.12.1', '--isolated'] },
    web: { command: 'C:\\nodejs\\npx.cmd', args: ['-y', '@playwright/mcp@latest', '--extension'], enabled: false },
    serena: { command: 'uvx', args: ['serena'] },
  });
  assert.deepEqual(s.map((x) => [x.kind, x.state, x.name, x.enabled]), [['chrome', 'plain', 'chrome-devtools', true], ['playwright', 'ready', 'web', false]]);
  const two = browserStates({ a: { command: 'npx', args: ['chrome-devtools-mcp@latest'] }, b: { command: 'npx', args: ['chrome-devtools-mcp', '--autoConnect'] } });
  assert.equal(two[0].state, 'ready');
  assert.equal(two[0].name, 'b', 'the one that already uses the open browser wins');
  assert.equal(browserStates({ x: { command: 'npx', args: ['chrome-devtools-mcp-extra'] } })[0].state, 'missing', 'another package');
});

test('argsWithFlag adds the flag once, keeping the user\'s arguments', () => {
  assert.deepEqual(argsWithFlag({ args: ['-y', 'chrome-devtools-mcp@latest', '--isolated'] }, 'chrome'), ['-y', 'chrome-devtools-mcp@latest', '--isolated', '--autoConnect']);
  assert.deepEqual(argsWithFlag({ args: ['@playwright/mcp', '--extension'] }, 'playwright'), ['@playwright/mcp', '--extension']);
  assert.deepEqual(argsWithFlag({}, 'playwright'), ['--extension']);
});

test('page and host: the block, the message, the confirmation and the browser step', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  const host = fs.readFileSync(path.join(root, 'src', 'mcpSettings.ts'), 'utf8');
  assert.match(app, /h\('div', \{ class: 'set-sub', text: STR\.mcpBrTitle \}\), renderBrowserMcp\(mc\)/);
  assert.match(app, /bridge\.post\(\{ type: 'mcpBrowser', kind: b\.kind \}\)/);
  assert.match(host, /case 'mcpBrowser': if \(m\.kind === 'chrome' \|\| m\.kind === 'playwright'\) void this\.browser\(m\.kind\)/);
  assert.match(host, /showWarningMessage\('Let Codex use your browser\?', \{ modal: true, detail \}, 'Connect'\)/);
  assert.match(host, /vscode\.env\.clipboard\.writeText\(p\.setupUrl\)/);
  assert.match(host, /kind: 'mcp', servers: codexServerRows\(codex\), browser: browserStates\(codex\)/);
});
