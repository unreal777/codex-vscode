// Smoke test against the REAL codex app-server of the managed copy (%LOCALAPPDATA%\CodexPanel\codex\current.json).
// Read-only on purpose: initialize, account/read, model/list, thread/list, plugin/installed. It never creates a thread, never starts a turn
// and never sets a goal, because the user's Codex quota and history are real. Chat titles are not printed.
// The turn/start input and collaborationMode shapes are checked against a thread id that does not exist: the server validates the
// params first, so "thread not found" proves the shape is accepted (a refused shape fails with invalid params instead) and nothing starts.
import * as os from 'node:os';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { locate } from '../core/locator';
import { readState } from '../core/installer';
import { RpcError } from '../core/jsonrpc';
import { mapPlugins } from '../core/plugins';
import { CodexSession } from '../session';
import { permissionSettings } from '../core/permissions';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
  if (!ok) failures++;
}

const timeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what + ' timed out after ' + ms + ' ms')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

async function main(): Promise<void> {
  const local = process.env.LOCALAPPDATA;
  if (!local) throw new Error('LOCALAPPDATA is not set');
  const base = path.join(local, 'CodexPanel');
  const state = readState(base);
  console.log('current.json: version=' + state.version + ' exe=' + state.exe);
  const codex = locate(null, base, true);
  check('managed codex located', codex.version !== null, codex.toString());

  const c = new AppServerClient(codex.command(), os.tmpdir(), (l) => { if (/ERROR|panic/i.test(l)) console.log('[stderr] ' + l.substring(0, 200)); });
  const notifications: string[] = [];
  c.setEventListener({ onNotification: (m) => notifications.push(m), onClosed: (r) => console.log('closed: ' + r) });
  await c.start();
  try {
    const init = await timeout(c.initialize('codex-panel-smoke', 'Codex Panel Smoke', '0.1.0'), 60_000, 'initialize');
    check('initialize', typeof init === 'object', Object.keys(init).join(','));

    const acc = await timeout(c.call('account/read', {}), 30_000, 'account/read');
    const signedIn = acc.account !== null && typeof acc.account === 'object';
    check('account/read answers', 'account' in acc, 'signedIn=' + signedIn + ' requiresOpenaiAuth=' + acc.requiresOpenaiAuth + ' type=' + (acc.account?.type ?? '-'));

    const models = await timeout(c.listModels(), 60_000, 'model/list');
    check('model/list returns a data array', Array.isArray(models.data), 'models=' + (models.data?.length ?? 0));

    let threads;
    try {
      threads = await timeout(c.listThreads(null, null, 5, true), 60_000, 'thread/list');
    } catch (e) {
      console.log('thread/list with useStateDbOnly failed (' + (e as Error).message + '), trying the default listing');
      threads = await timeout(c.listThreads(null, null, 5, false), 60_000, 'thread/list');
    }
    check('thread/list returns a data array', Array.isArray(threads.data), 'rows=' + (threads.data?.length ?? 0) + ' hasNextCursor=' + (threads.nextCursor != null));
    if (threads.data?.length) {
      const t = threads.data[0];
      check('thread rows carry id, cwd and updatedAt', typeof t.id === 'string' && typeof t.cwd === 'string' && t.updatedAt !== undefined, Object.keys(t).join(','));
      // cwd as an array (History project checklist): every entry is matched exactly, so the rows all lie in the listed folders
      const filtered = await timeout(c.listThreads([t.cwd, t.cwd + '\\no-such-subfolder'], null, 5, true), 60_000, 'thread/list cwd[]');
      const keys = new Set([t.cwd, t.cwd + '\\no-such-subfolder']);
      check('thread/list accepts cwd as an array and returns only those folders',
        Array.isArray(filtered.data) && filtered.data.length > 0 && filtered.data.every((r: any) => keys.has(r.cwd)), 'rows=' + (filtered.data?.length ?? 0));
    }
    // ---- plugins of the "+" menu ----
    const pl = await timeout(c.listInstalledPlugins([os.tmpdir()]), 60_000, 'plugin/installed');
    check('plugin/installed answers with marketplaces', Array.isArray(pl.marketplaces), 'marketplaces=' + (pl.marketplaces?.length ?? '-'));
    const items = mapPlugins(pl);
    const idShape = items.every((i) => /^[^@\s]+@[^@\s]+$/.test(i.id));
    check('installed+enabled plugins map to id/name/description', items.every((i) => i.id && i.name), 'plugins=' + items.length + (items.length ? ' first id=' + items[0].id : ''));
    check('plugin ids look like name@marketplace (mention path = "plugin://" + id)', idShape, items.slice(0, 3).map((i) => i.id).join(', '));

    // ---- input shapes of turn/start, validated against a thread id that does not exist ----
    const ghost = '00000000-0000-4000-8000-000000000000';
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const ps = permissionSettings('ask');
    const req = { text: 'schema check', cwd: os.tmpdir(), model: '', defaultModel: 'x', effort: '', permissions: 'ask', images: [{ url: png }], mentions: [{ name: 'Demo', path: 'plugin://demo@marketplace' }] };
    const shapeCheck = async (name: string, input: any[], collab: any): Promise<void> => {
      try {
        await timeout(c.startTurn(ghost, input, null, null, null, ps.approvalPolicy, ps.sandboxPolicy, ps.reviewer, collab), 30_000, 'turn/start');
        check(name, false, 'the server STARTED a turn for a thread id that does not exist');
      } catch (e) {
        const msg = e instanceof RpcError ? e.message : String(e);
        check(name, e instanceof RpcError && !/invalid (params|request)|unknown variant|missing field|experimental/i.test(msg), msg.slice(0, 140));
      }
    };
    await shapeCheck('turn/start accepts text + mention + image (data URL) input', CodexSession.buildInput(req), null);
    await shapeCheck('turn/start accepts a localImage input', CodexSession.buildInput(req, ['C:/no/such/file.png']), null);
    await shapeCheck('turn/start accepts collaborationMode plan (experimentalApi on)', CodexSession.buildInput({ ...req, images: [], mentions: [] }), AppServerClient.collaborationMode('plan', 'x', null));
    try {
      await timeout(c.getGoal(ghost), 30_000, 'thread/goal/get');
      check('thread/goal/get is known to this Codex', true, 'no error');
    } catch (e) {
      const msg = e instanceof RpcError ? e.message : String(e);
      check('thread/goal/get is known to this Codex (method exists, thread is missing)', e instanceof RpcError && !/method not found|unknown method/i.test(msg), msg.slice(0, 140));
    }
    // History actions: only against the id that does not exist, so no real chat is archived, restored or deleted
    for (const [name, call] of [['thread/archive', () => c.archiveThread(ghost)], ['thread/unarchive', () => c.unarchiveThread(ghost)],
      ['thread/delete', () => c.deleteThread(ghost)], ['thread/name/set', () => c.renameThread(ghost, 'smoke')]] as const) {
      try {
        await timeout(call(), 30_000, name);
        check(name + ' is known to this Codex', true, 'no error for a missing thread');
      } catch (e) {
        const msg = e instanceof RpcError ? e.message : String(e);
        check(name + ' is known to this Codex (method exists, thread is missing)', e instanceof RpcError && !/method not found|unknown method|unknown variant|invalid (params|request)/i.test(msg), msg.slice(0, 140));
      }
    }
    const arch = await timeout(c.listThreads(null, null, 5, true, true), 60_000, 'thread/list archived');
    check('thread/list archived:true returns a data array', Array.isArray(arch.data), 'rows=' + (arch.data?.length ?? 0));
    console.log('notifications seen: ' + (notifications.length ? [...new Set(notifications)].join(', ') : '(none)'));
    check('no thread or turn notifications (nothing was created)', !notifications.some((m) => m.startsWith('turn/') || m === 'thread/started'));
  } finally {
    c.close();
  }
}

main().then(
  () => {
    console.log(failures === 0 ? 'SMOKE OK' : failures + ' FAILURE(S)');
    process.exit(failures === 0 ? 0 : 1);
  },
  (e) => {
    console.error('SMOKE FAILED: ' + (e as Error).message);
    process.exit(1);
  },
);
