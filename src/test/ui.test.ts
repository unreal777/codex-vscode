// 0.2.0 features: one permissions setting (mapping + migration), turn input (images, plugin mentions, plan mode), plugin list mapping,
// drop payload parsing (web/dropdata.js, the file that ships in media/web), secondary side bar contributions.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { migratePermissions, normalizePermissions, permissionSettings } from '../core/permissions';
import { iconDataUri, mapPlugins } from '../core/plugins';
import { parseVersion, supportsSecondarySidebar } from '../core/vscodeVersion';
import { CodexSession, SendRequest } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

// ---------------- permissions ----------------

test('permissions: every choice maps to sandbox, turn sandbox policy, approval policy and reviewer', () => {
  assert.deepEqual(permissionSettings('ask'), { sandbox: 'workspace-write', sandboxPolicy: 'workspaceWrite', approvalPolicy: 'on-request', reviewer: 'user' });
  assert.deepEqual(permissionSettings('auto'), { sandbox: 'workspace-write', sandboxPolicy: 'workspaceWrite', approvalPolicy: 'on-request', reviewer: 'auto_review' });
  assert.deepEqual(permissionSettings('full'), { sandbox: 'danger-full-access', sandboxPolicy: 'dangerFullAccess', approvalPolicy: 'never', reviewer: 'user' });
  // custom: no overrides at all, Codex uses config.toml
  assert.deepEqual(permissionSettings('custom'), { sandbox: null, sandboxPolicy: null, approvalPolicy: null, reviewer: null });
  // anything unknown is the safe default
  assert.deepEqual(permissionSettings('nonsense'), permissionSettings('ask'));
  assert.deepEqual(permissionSettings(undefined), permissionSettings('ask'));
  assert.equal(normalizePermissions('full'), 'full');
  assert.equal(normalizePermissions(''), 'ask');
});

test('permissions: stored mode x approvals of 0.1.x migrate sensibly', () => {
  const m = (mode: string | undefined, approvals: string | undefined) => migratePermissions({ mode, approvals });
  assert.equal(m('read-only', 'user'), 'ask');
  assert.equal(m('read-only', 'auto_review'), 'ask');
  assert.equal(m('auto', 'user'), 'ask');
  assert.equal(m('auto', 'auto_review'), 'auto');
  assert.equal(m('full', 'user'), 'full');
  assert.equal(m('full', 'auto_review'), 'full');
  assert.equal(m(undefined, undefined), 'ask');
  assert.equal(migratePermissions({ permissions: 'custom', mode: 'full', approvals: 'user' }), 'custom', 'a stored permissions value wins');
  assert.equal(migratePermissions({ permissions: 'bogus', mode: 'full' }), 'full', 'an invalid one falls back to migration');
});

// ---------------- turn input ----------------

const req = (o: Partial<SendRequest>): SendRequest => ({ text: 'hi', cwd: 'C:\\w', model: '', defaultModel: 'gpt-x', effort: '', permissions: 'ask', images: [], mentions: [], ...o });

test('turn input: text, plugin mentions, images as data URLs, or as files', () => {
  assert.deepEqual(CodexSession.buildInput(req({})), [{ type: 'text', text: 'hi', text_elements: [] }]);
  const withAll = CodexSession.buildInput(req({
    mentions: [{ name: 'Figma', path: 'plugin://figma@openai-curated' }],
    images: [{ url: 'data:image/png;base64,AAAA' }],
  }));
  assert.deepEqual(withAll, [
    { type: 'text', text: 'hi', text_elements: [] },
    { type: 'mention', name: 'Figma', path: 'plugin://figma@openai-curated' },
    { type: 'image', url: 'data:image/png;base64,AAAA' },
  ]);
  const files = CodexSession.buildInput(req({ text: '  ', images: [{ url: 'data:image/png;base64,AAAA' }] }), ['C:\\img\\a.png']);
  assert.deepEqual(files, [{ type: 'localImage', path: 'C:\\img\\a.png' }], 'an image-only message sends no empty text item');
  assert.deepEqual(CodexSession.buildInput(req({ text: '' })), [{ type: 'text', text: '', text_elements: [] }], 'a completely empty message keeps one text item');
});

const ECHO_SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => { const m = JSON.parse(line); if (m.id !== undefined) process.stdout.write(JSON.stringify({ id: m.id, result: { method: m.method, echo: m.params, turn: { id: 't' } } }) + '\\n'); });
`;

test('turn/start and goal/plugin requests carry the documented params (collaborationMode, origin, no overrides for custom)', async () => {
  const dir = tmpDir('echo-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, ECHO_SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  try {
    const ps = permissionSettings('ask');
    const plan = AppServerClient.collaborationMode('plan', 'gpt-x', 'high');
    assert.deepEqual(plan, { mode: 'plan', settings: { model: 'gpt-x', reasoning_effort: 'high', developer_instructions: null } });
    assert.deepEqual(AppServerClient.collaborationMode('default', 'gpt-x', '').settings.reasoning_effort, null);
    const r = await c.startTurn('th', CodexSession.buildInput(req({})), 'C:\\w', '', 'high', ps.approvalPolicy, ps.sandboxPolicy, ps.reviewer, plan);
    assert.equal(r.echo.threadId, 'th');
    assert.deepEqual(r.echo.collaborationMode, plan);
    assert.equal(r.echo.approvalPolicy, 'on-request');
    assert.deepEqual(r.echo.sandboxPolicy.type, 'workspaceWrite');
    assert.equal(r.echo.approvalsReviewer, 'user');
    assert.equal(r.echo.effort, 'high');
    assert.ok(!('model' in r.echo), 'an empty model is not sent');
    const cu = permissionSettings('custom');
    const r2 = await c.startTurn('th', CodexSession.buildInput(req({})), null, '', '', cu.approvalPolicy, cu.sandboxPolicy, cu.reviewer);
    for (const k of ['approvalPolicy', 'sandboxPolicy', 'approvalsReviewer', 'collaborationMode', 'cwd', 'model', 'effort']) assert.ok(!(k in r2.echo), 'custom sends no ' + k);
    const t = await c.startThread('C:\\w', null, cu.approvalPolicy, cu.sandbox, cu.reviewer);
    assert.deepEqual(t.echo, { cwd: 'C:\\w' }, 'custom: thread/start without sandbox, approval policy or reviewer');
    const g = await c.setGoal('th', 'ship it');
    assert.equal(g.method, 'thread/goal/set');
    assert.deepEqual(g.echo, { threadId: 'th', objective: 'ship it', origin: 'user' });
    assert.deepEqual((await c.clearGoal('th')).echo, { threadId: 'th', origin: 'user' });
    assert.deepEqual((await c.getGoal('th')).echo, { threadId: 'th' });
    assert.deepEqual((await c.listInstalledPlugins(['C:\\w'])).echo, { cwds: ['C:\\w'] });
    assert.deepEqual((await c.listInstalledPlugins(null)).echo, {});
  } finally {
    c.close();
  }
});

// ---------------- plugins ----------------

test('plugin list: installed and enabled only, icons as data URIs, one entry per id', () => {
  const dir = tmpDir('plugin-icons-');
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, Buffer.from([1, 2, 3]));
  const big = path.join(dir, 'big.png');
  fs.writeFileSync(big, Buffer.alloc(200 * 1024));
  assert.equal(iconDataUri(png), 'data:image/png;base64,AQID');
  assert.equal(iconDataUri(big), null, 'icons above 150 KB are left out');
  assert.equal(iconDataUri(path.join(dir, 'icon.exe')), null);
  assert.equal(iconDataUri(null), null);
  const response = {
    marketplaces: [
      { name: 'openai-curated', plugins: [
        { id: 'figma@openai-curated', name: 'figma', installed: true, enabled: true, interface: { displayName: 'Figma', shortDescription: 'Create designs', brandColor: '#7048e8', composerIcon: png } },
        { id: 'off@openai-curated', name: 'off', installed: true, enabled: false, interface: null },
        { id: 'new@openai-curated', name: 'new', installed: false, enabled: false, interface: null },
      ] },
      { name: 'local', plugins: [
        { id: 'figma@openai-curated', name: 'figma', installed: true, enabled: true, interface: null },
        { id: 'plain@local', name: 'plain', installed: true, enabled: true, interface: { displayName: ' ', shortDescription: null, brandColor: 'javascript:1', composerIcon: null, logo: png } },
      ] },
    ],
  };
  const items = mapPlugins(response);
  assert.deepEqual(items.map((i) => i.id), ['figma@openai-curated', 'plain@local']);
  assert.deepEqual(items[0], { id: 'figma@openai-curated', name: 'Figma', description: 'Create designs', brandColor: '#7048e8', icon: 'data:image/png;base64,AQID', marketplace: 'openai-curated' });
  assert.equal(items[1].name, 'plain', 'a blank displayName falls back to the plugin name');
  assert.equal(items[1].brandColor, null, 'only hex colours pass');
  assert.equal(items[1].icon, 'data:image/png;base64,AQID', 'the logo is used when there is no composer icon');
  assert.deepEqual(mapPlugins({}), []);
  assert.deepEqual(mapPlugins({ marketplaces: null }), []);
});

// ---------------- drop payloads ----------------

// the shipped copy: sync-web puts it into media/web
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CodexDrop = require(path.join(root, 'media', 'web', 'dropdata.js')) as {
  parse(dt: unknown): { text: string; lines: string[]; from: string[] };
  debug(dt: unknown): { types: string[]; data: Record<string, string>; files: unknown[] };
};

/** A DataTransfer stand-in; browsers lower-case custom format names, like here. */
function dt(data: Record<string, string>, files: Array<{ name: string; type: string; size: number }> = []): unknown {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) lower[k.toLowerCase()] = v;
  return { types: Object.keys(lower), getData: (t: string) => lower[t.toLowerCase()] ?? '', files };
}

test('drop payload: CodeEditors JSON of an editor tab (string and UriComponents resources)', () => {
  const tab = JSON.stringify([
    { resource: 'file:///c%3A/work/my%20shop/src/Main.java', viewState: {}, languageId: 'java' },
    { resource: { scheme: 'file', path: '/c:/work/shop/README.md', fsPath: 'c:\\work\\shop\\README.md' } },
    { resource: { scheme: 'file', path: '/c:/work/shop/pom.xml' } },
    { resource: 'untitled:Untitled-1' },
    { resource: 'vscode-userdata:/settings.json' },
  ]);
  const r = CodexDrop.parse(dt({ CodeEditors: tab }));
  assert.deepEqual(r.lines, ['file:///c%3A/work/my%20shop/src/Main.java', 'c:\\work\\shop\\README.md', 'file:///c:/work/shop/pom.xml']);
  assert.deepEqual(r.from, ['CodeEditors']);
  assert.equal(r.text, r.lines.join('\n'));
});

test('drop payload: uri lists, ResourceURLs, CodeFiles, de-duplicated and comments ignored', () => {
  const r = CodexDrop.parse(dt({
    'application/vnd.code.uri-list': 'file:///c%3A/a/one.ts\r\nfile:///c%3A/a/two.ts',
    'text/uri-list': '# a comment\r\nfile:///c%3A/a/one.ts\r\nfile:///c%3A/a/three.ts\r\n',
    ResourceURLs: JSON.stringify(['file:///c%3A/a/four.ts', 'https://example.com/x']),
    CodeFiles: JSON.stringify(['C:\\a\\five.ts', { fsPath: 'C:\\a\\six.ts' }]),
  }));
  assert.deepEqual(r.lines, ['file:///c%3A/a/one.ts', 'file:///c%3A/a/two.ts', 'file:///c%3A/a/three.ts', 'file:///c%3A/a/four.ts', 'C:\\a\\five.ts', 'C:\\a\\six.ts']);
  assert.deepEqual(r.from, ['application/vnd.code.uri-list', 'text/uri-list', 'ResourceURLs', 'CodeFiles']);
});

test('drop payload: nothing usable gives an empty result (the page then falls back to text/plain) and broken JSON is ignored', () => {
  assert.equal(CodexDrop.parse(dt({})).text, '');
  assert.equal(CodexDrop.parse(dt({ CodeEditors: '{not json', ResourceURLs: '"x"' })).text, '');
  assert.equal(CodexDrop.parse(dt({ 'text/plain': 'C:\\a\\b.ts' })).text, '', 'text/plain is the caller\'s fallback, not parsed here');
  assert.deepEqual(CodexDrop.parse(dt({ 'text/uri-list': '/home/me/a.ts' })).lines, ['/home/me/a.ts']);
  assert.equal(CodexDrop.parse(null).text, '');
});

test('drop payload: the debug summary lists every format with its first 300 characters and the files', () => {
  const long = 'x'.repeat(500);
  const d = CodexDrop.debug(dt({ 'text/plain': long, CodeEditors: '[]', Files: '' }, [{ name: 'a.png', type: 'image/png', size: 12 }]));
  assert.deepEqual(d.types, ['text/plain', 'codeeditors', 'files']);
  assert.equal(d.data['text/plain'].length, 300);
  assert.equal(d.data['codeeditors'], '[]');
  assert.ok(!('files' in d.data), 'the Files pseudo format is not read');
  assert.deepEqual(d.files, [{ name: 'a.png', type: 'image/png', size: 12 }]);
});

// ---------------- secondary side bar ----------------

test('secondary side bar: version switch at 1.106', () => {
  assert.deepEqual(parseVersion('1.106.0'), [1, 106]);
  assert.equal(parseVersion('nonsense'), null);
  assert.equal(supportsSecondarySidebar('1.105.9'), false);
  assert.equal(supportsSecondarySidebar('1.106.0'), true);
  assert.equal(supportsSecondarySidebar('1.107.1-insider'), true);
  assert.equal(supportsSecondarySidebar('2.0.0'), true);
  assert.equal(supportsSecondarySidebar('1.90.0'), false);
  assert.equal(supportsSecondarySidebar('weird'), true);
});

test('package.json: both view homes, one context key, engines unchanged, commands target both views', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.vscode, '^1.90.0');
  assert.equal(pkg.version, '0.7.3');
  const c = pkg.contributes;
  assert.equal(c.viewsContainers.secondarySidebar[0].id, 'codexPanelSecondary');
  assert.equal(c.viewsContainers.secondarySidebar[0].when, '!codexPanel.noSecondarySidebar');
  assert.equal(c.viewsContainers.activitybar[0].when, 'codexPanel.noSecondarySidebar');
  assert.equal(c.views['codexPanelSecondary'][0].id, 'codexPanel.chatSecondary');
  assert.equal(c.views['codexPanelSecondary'][0].type, 'webview');
  assert.equal(c.views.codexPanel[0].id, 'codexPanel.chat');
  assert.equal(c.views['codexPanelSecondary'][0].when, '!codexPanel.noSecondarySidebar');
  assert.equal(c.views.codexPanel[0].when, 'codexPanel.noSecondarySidebar');
  // VS Code silently drops a view container whose id is not /^[a-z0-9_-]+$/i; its views then end up in the Explorer
  for (const where of Object.keys(c.viewsContainers))
    for (const vc of c.viewsContainers[where]) assert.match(vc.id, /^[a-z0-9_-]+$/i, where + ' container id ' + vc.id);
  for (const m of c.menus['view/title']) assert.ok(m.when.includes('codexPanel.chat') && m.when.includes('codexPanel.chatSecondary'), m.command);
  assert.ok(pkg.activationEvents.includes('onStartupFinished'), 'the context key must be set on old VS Code versions too');
  const keys = c.keybindings.map((k: { command: string }) => k.command);
  assert.ok(keys.includes('codexPanel.open'));
});
