// 0.8.4: renaming a chat (thread/name/set) from the History, a tab or the title.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (m.params && m.params.threadId === 'bad') send({ id: m.id, error: { code: -32000, message: 'no rollout found for thread id bad' } });
  else send({ id: m.id, result: { method: m.method, echo: m.params } });
});
`;

async function server(): Promise<AppServerClient> {
  const dir = tmpDir('rename-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir);
  await c.start();
  return c;
}

test('renameThread sends thread/name/set with {threadId, name}', async () => {
  const c = await server();
  try {
    const r = await c.renameThread('t1', 'Orders');
    assert.equal(r.method, 'thread/name/set');
    assert.deepEqual(r.echo, { threadId: 't1', name: 'Orders' });
  } finally {
    c.close();
  }
});

test('session renameThread: ok event with the cleaned name, title remembered; errors and empty names say so', async () => {
  const c = await server();
  const host = { log: () => {}, projectName: (d: string | null) => d ?? '', version: '0', codexBase: '' } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  try {
    assert.equal(await s.renameThread('t1', '  Fix   the\norders  '), true);
    assert.deepEqual(events.pop(), { kind: 'threadAction', action: 'rename', threadId: 't1', ok: true, name: 'Fix the orders' });
    assert.equal(s.titleOf('t1'), 'Fix the orders', 'tabs and notifications use the new name');

    assert.equal(await s.renameThread('bad', 'X'), false);
    const bad = events.pop();
    assert.equal(bad.ok, false);
    assert.match(bad.error, /no rollout/);
    assert.equal(s.titleOf('bad'), null);

    assert.equal(await s.renameThread('t2', '   '), false);
    assert.equal(events.pop().error, 'the name is empty');
  } finally {
    c.close();
  }
});

test('page and host wire the rename: History button, F2, tab double click, title double click, threadAction rename', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'web', 'app.css'), 'utf8');
  assert.match(app, /act\('rename', ICON\.pencil, STR\.renameChat/);
  assert.match(app, /e\.key === 'F2'/);
  assert.match(app, /tab\.addEventListener\('dblclick'/);
  assert.match(app, /\$\('#title'\)\.addEventListener\('dblclick', renameTitle\)/);
  assert.match(app, /type: 'threadAction', action: 'rename', threadId: id, name/);
  assert.match(app, /if \(ev\.action === 'rename'\) \{ onRenamed\(ev\); return; \}/);
  // re-renders wait while the input is open, so a host event does not drop what is being typed
  assert.match(app, /if \(renaming && renaming\.where === 'hist'\) return;/);
  assert.match(app, /if \(renaming && renaming\.where === 'tab' && show\) return;/);
  assert.match(panel, /a === 'rename' && id/);
  assert.match(css, /input\.rename \{/);
});
