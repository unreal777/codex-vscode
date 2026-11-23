// 0.9.0: dictation (mic button): the extension records, Codex's voice mode (thread/realtime, text output) writes the user's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppServerClient } from '../core/appServer';
import { DEFAULT_LANGUAGES, dictationPrompt, isForeign, LANGUAGES, parseLanguages } from '../core/dictationLanguages';
import { micSupported, pcmLevel, recorderError, RecorderEvents, splitLines } from '../core/micRecorder';
import { CodexSession, SessionHost } from '../session';
import { tmpDir } from './helpers';

const root = path.resolve(__dirname, '..', '..');

test('level of a chunk: silence 0, room noise near 0, speech in the upper half, loud 1', () => {
  const pcm = (amp: number) => { const b = Buffer.alloc(4800); for (let i = 0; i < 2400; i++) b.writeInt16LE(Math.round(amp * Math.sin(i / 3)), i * 2); return b.toString('base64'); };
  assert.equal(pcmLevel(''), 0);
  assert.equal(pcmLevel(pcm(0)), 0);
  assert.ok(pcmLevel(pcm(80)) < 0.1, 'room noise: ' + pcmLevel(pcm(80)));
  const speech = pcmLevel(pcm(3000));
  assert.ok(speech > 0.5 && speech < 0.9, 'speech: ' + speech);
  assert.equal(pcmLevel(pcm(32000)), 1);
});

test('dictation languages: a fixed list of codes, foreign phrases, the hint for the voice model', () => {
  const ru = parseLanguages(['ru', 'de', 'EN', 'xx', 'ru']);
  assert.deepEqual([ru.codes, ru.names], [['en', 'de', 'ru'], ['English', 'German', 'Russian']], 'list order (by name), known codes once');
  assert.deepEqual(LANGUAGES.map((l) => l.name), LANGUAGES.map((l) => l.name).sort(), 'the list is sorted by name');
  assert.deepEqual([...ru.scripts!].sort(), ['cyrillic', 'latin']);
  assert.equal(isForeign('你好，请修复登录错误。', ru), true, 'Chinese while speaking Russian');
  assert.equal(isForeign('Исправь ошибку в OrderService.', ru), false);
  assert.equal(isForeign('Fix the login bug.', ru), false);
  assert.equal(isForeign('Исправь ошибку 你', ru), false, 'one stray sign does not drop a phrase');
  assert.equal(isForeign('...', ru), false);
  // English only (the default): Cyrillic is foreign, Latin passes
  assert.equal(isForeign('Привет', parseLanguages(DEFAULT_LANGUAGES)), true);
  assert.deepEqual([...parseLanguages(['ja']).scripts!].sort(), ['han', 'kana', 'latin']);
  // empty list or not a list: any language, no hint
  for (const v of [[], 'Russian', undefined]) { assert.equal(parseLanguages(v).scripts, null); assert.equal(isForeign('你好', parseLanguages(v)), false); }
  assert.equal(dictationPrompt('Base.', parseLanguages([])), 'Base.');
  assert.match(dictationPrompt('Base.', ru), /^Base\. The user speaks only English, German, Russian\. .*never transcribe or translate/);
  // package.json offers exactly this list, English by default
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const prop = pkg.contributes.configuration.properties['codexPanel.dictationLanguages'];
  assert.deepEqual([prop.type, prop.default, prop.items.enum], ['array', ['en'], LANGUAGES.map((l) => l.code)]);
  assert.deepEqual(prop.items.enumItemLabels, LANGUAGES.map((l) => l.name + ' (' + l.code + ')'));
});

test('recorder helpers: platform, lines, errors', () => {
  assert.equal(micSupported('win32'), true);
  assert.equal(micSupported('darwin'), false);
  assert.deepEqual(splitLines('', 'READY\nAAAA\nBB'), { lines: ['READY', 'AAAA'], rest: 'BB' });
  assert.deepEqual(splitLines('BB', 'CC\r\n\n'), { lines: ['BBCC'], rest: '' });
  assert.equal(recorderError('ERR 2 no microphone found\r\n'), 'no microphone found (code 2)');
  assert.equal(recorderError('Add-Type : boom\nline 2\n'), 'line 2');
});

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const note = (method, params) => send({ method, params });
const calls = []; let audio = 0; let prompt = null;
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  const p = m.params || {};
  calls.push(m.method);
  if (m.method === 'test/get') return send({ id: m.id, result: { calls, audio, prompt } });
  if (m.method === 'thread/start') return send({ id: m.id, result: { thread: { id: 'dict1' } } });
  if (m.method === 'thread/realtime/start') {
    prompt = p.prompt;
    send({ id: m.id, result: { params: p } });
    if (process.env.RT_FAIL) return note('thread/realtime/error', { threadId: 'dict1', message: 'realtime is not available for this account' });
    return setTimeout(() => note('thread/realtime/started', { threadId: 'dict1', version: 'v2' }), 50);
  }
  if (m.method === 'thread/realtime/appendAudio') {
    audio++;
    send({ id: m.id, result: {} });
    if (audio === 2) {
      note('thread/realtime/itemAdded', { threadId: 'dict1', item: { type: 'input_audio_buffer.speech_started' } });
      note('thread/realtime/transcript/done', { threadId: 'dict1', role: 'assistant', text: 'Hi! How can I help?' });
      note('turn/started', { threadId: 'dict1', turn: { id: 'turnX' } });
      note('turn/completed', { threadId: 'dict1', turn: { id: 'turnX', status: 'interrupted' } });
    }
    if (audio === 4 && process.env.RT_ZH) note('thread/realtime/transcript/done', { threadId: 'dict1', role: 'user', text: '\u4f60\u597d\u4e16\u754c' });
    if (audio === 6) note('thread/realtime/transcript/done', { threadId: 'dict1', role: 'user', text: ' Fix the login bug. ' });
    return;
  }
  if (m.method === 'thread/realtime/stop') { send({ id: m.id, result: {} }); return note('thread/realtime/closed', { threadId: 'dict1', reason: 'requested' }); }
  send({ id: m.id, result: {} });
});
`;

async function setup(env: NodeJS.ProcessEnv = {}, langs: string[] = []) {
  const dir = tmpDir('dict-server-');
  const script = path.join(dir, 'server.js');
  fs.writeFileSync(script, SERVER);
  const c = new AppServerClient([process.execPath, script], dir, undefined, { ...process.env, ...env });
  await c.start();
  let rec: RecorderEvents | null = null;
  let stopped = 0;
  const host = {
    log: () => {}, projectName: () => '', version: '0', codexBase: '', refreshHook: () => {},
    dictationLanguages: () => langs,
    startRecorder: (ev: RecorderEvents) => {
      rec = ev;
      setTimeout(() => ev.onReady(), 10);
      return { stop: () => { stopped++; setTimeout(() => ev.onEnd(null), 10); } };
    },
  } as unknown as SessionHost;
  const s = new CodexSession(host);
  const priv = s as any;
  priv.client = c;
  priv.connected = true;
  c.setEventListener({ onNotification: (m: string, p: any) => priv.handleNotification(m, p), onClosed: () => {} });
  const events: any[] = [];
  s.addSink((e) => events.push(e));
  const wait = async (f: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };
  return { c, s, priv, events, wait, chunk: (n = 4800) => rec!.onChunk(Buffer.alloc(n).toString('base64'), n), stopped: () => stopped };
}

test('session dictation: audio goes to the voice mode, only the user\'s words come back, tasks of the voice model are interrupted', async () => {
  const t = await setup();
  try {
    t.s.startDictation('view1');
    assert.equal(t.events[0].state, 'starting');
    assert.equal(t.events[0].owner, 'view1', 'only the view that started it gets the events');
    await t.wait(() => t.events.some((e) => e.state === 'listening'));
    t.chunk(); t.chunk();   // recorded before the voice mode is up: kept and sent once it is
    const levels = t.events.filter((e) => e.kind === 'dictationLevel');
    assert.equal(levels.length, 2, 'every chunk gives a level for the bars');
    assert.deepEqual([levels[0].level, levels[0].owner], [0, 'view1']);
    await t.wait(() => t.priv.dict?.live === true);
    for (let i = 0; i < 4; i++) t.chunk();
    await t.wait(() => t.events.some((e) => e.kind === 'dictationText'));
    assert.deepEqual(t.events.filter((e) => e.kind === 'dictationText').map((e) => e.text), ['Fix the login bug.'], "the assistant's answer is not used");
    const got = await t.c.call('test/get', {});
    assert.ok(got.calls.includes('turn/interrupt'), 'the task handed to Codex is interrupted');
    const rt = got.calls.indexOf('thread/realtime/start');
    assert.ok(rt > got.calls.indexOf('thread/start'));
    assert.ok(!t.events.some((e) => e.kind === 'notification'), 'nothing of the hidden chat reaches the page');

    t.s.stopDictation();
    assert.ok(t.events.some((e) => e.state === 'stopping'));
    assert.equal(t.stopped(), 1);
    await t.wait(() => t.events.some((e) => e.kind === 'dictation' && e.state === 'off'));
    const off = t.events.find((e) => e.kind === 'dictation' && e.state === 'off');
    assert.equal(off.error, undefined);
    const end = await t.c.call('test/get', {});
    assert.ok(end.audio >= 6 + 12, 'the recorded audio and a second of silence: ' + end.audio);
    assert.ok(end.calls.includes('thread/realtime/stop'));
    assert.equal(t.priv.dict, null);

    // a late event of the hidden chat is still swallowed
    t.events.length = 0;
    t.priv.handleNotification('turn/started', { threadId: 'dict1', turn: { id: 'late' } });
    assert.deepEqual(t.events, []);
  } finally {
    t.c.close();
  }
});

test('session dictation: with languages set, the voice model is told and a phrase in another script is left out', async () => {
  const t = await setup({ RT_ZH: '1' }, ['ru', 'en']);
  try {
    t.s.startDictation('v');
    await t.wait(() => t.priv.dict?.live === true);
    for (let i = 0; i < 6; i++) t.chunk();
    await t.wait(() => t.events.some((e) => e.kind === 'dictationText'));
    assert.deepEqual(t.events.filter((e) => e.kind === 'dictationText').map((e) => e.text), ['Fix the login bug.']);
    const dropped = t.events.filter((e) => e.kind === 'dictationDropped');
    assert.deepEqual(dropped.map((e) => [e.text, e.owner]), [['\u4f60\u597d\u4e16\u754c', 'v']]);
    const got = await t.c.call('test/get', {});
    assert.match(got.prompt, /silent dictation microphone.*The user speaks only English, Russian\./);
    t.s.stopDictation();
    await t.wait(() => t.events.some((e) => e.kind === 'dictation' && e.state === 'off'));
  } finally {
    t.c.close();
  }
});

test('session dictation: a voice mode error ends it with the reason; no recorder = not available', async () => {
  const t = await setup({ RT_FAIL: '1' });
  try {
    t.s.startDictation('v');
    await t.wait(() => t.events.some((e) => e.kind === 'dictation' && e.state === 'off'));
    const off = t.events.find((e) => e.kind === 'dictation' && e.state === 'off');
    assert.match(off.error, /realtime is not available for this account/);
    assert.equal(t.stopped(), 1, 'the microphone is closed');
  } finally {
    t.c.close();
  }
  const bare = new CodexSession({ log: () => {}, projectName: () => '', version: '0', codexBase: '' } as unknown as SessionHost);
  const ev: any[] = [];
  bare.addSink((e) => ev.push(e));
  assert.equal(bare.dictationAvailable, false);
  bare.startDictation('v');
  assert.match(ev[0].error, /Windows only/);
});

test('dictation: setting, recorder script, page and panel are wired', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.contributes.configuration.properties['codexPanel.dictation'].default, true);
  const ps = fs.readFileSync(path.join(root, 'media', 'mic-win.ps1'), 'utf8');
  assert.ok(ps.includes('waveInOpen') && ps.includes('READY') && ps.includes('RATE = 24000'));
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes('<button id="mic"') && app.includes("bridge.post({ type: 'dictation', action: 'start' })"));
  assert.ok(app.includes("case 'dictationText': onDictationText(ev); break;"));
  assert.ok(app.includes("case 'dictationLevel': onDictationLevel(ev); break;") && app.includes('<span id="micwave"'));
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.ok(panel.includes("case 'dictation':") && panel.includes('e.owner !== this.viewId'));
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert.ok(ext.includes("startRecorder: micSupported() ?"));
  // the panel's own settings (gear) show it too, with the warning; off hides the button
  assert.ok(panel.includes("dictation: o?.dictation !== false") && panel.includes("'autoCompactTokens', 'dictation', 'autoChatNames', 'dictationLanguages', 'openOnStartup', 'followActiveProject'];"));
  assert.ok(app.includes("saveSettings({ dictation: cbD.checked })") && app.includes("class: 'hint warn', id: 'set-dict-hint'"));
  assert.ok(app.includes("!(state.dictation && state.settings.dictation)") && app.includes("saveSettings({ autoChatNames: selN.value })"));
  assert.ok(app.includes("'<i></i>'.repeat(21)"), 'the meter: 21 bars');
  assert.ok(app.includes("case 'dictationDropped':") && app.includes("saveSettings({ dictationLanguages: cb.checked ? rest.concat(l.code) : rest })"));
  assert.ok(app.includes("saveSettings({ dictationLanguages: anyCb.checked ? [] : ['en'] })"), 'any language = an empty list');
  assert.ok(ext.includes("dictationLanguages: () => cfg().get<unknown>('dictationLanguages', DEFAULT_LANGUAGES)"));
  assert.ok(panel.includes("dictationLangs: LANGUAGES.map((l) => ({ code: l.code, name: l.name }))"));
  assert.ok(panel.includes("'autoChatNames', 'dictationLanguages', 'openOnStartup', 'followActiveProject'];"));
});
