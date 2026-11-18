// Code review triage (web/review.js, the copy that ships in media/web): the request, the findings block, the answers
// (Fix / Skip / Own answer, Back, change after the overview) and the summary message with its round trip; plus the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createReviewFile, findReviewFile, REVIEW_FILE, reviewText } from '../core/reviewFile';

const root = path.resolve(__dirname, '..', '..');

interface Loc { file: string; line: number }
interface Finding { n: number; severity: string; title: string; problem: string; fix: string; locations: Loc[] }
interface Decision { action: string; note?: string }
interface St { index: number; total: number; decisions: Record<string, Decision>; sent: boolean }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require(path.join(root, 'media', 'web', 'review.js')) as {
  FENCE: string; FORMAT_MARK: string; DEFAULT_PROMPT: string; TEMPLATE: string;
  request(prompt: string, extra?: string, file?: string): string; isRequest(t: string): boolean; displayText(t: string): string;
  hideBlock(t: string): { text: string; hidden: boolean };
  parse(t: string): null | { findings: Finding[]; text: string } | { error: string; text: string };
  severityOf(v: unknown): string;
  start(f: Finding[]): St; decide(st: St, n: number, action: string, note?: string): St; back(st: St): St; goTo(st: St, i: number): St;
  complete(st: St): boolean; answered(st: St): number;
  summary(f: Finding[], d: Record<string, Decision>): string; isSummary(t: string): boolean; parseSummary(t: string): Record<string, Decision> | null;
};

const block = (json: unknown, fence = '```') => fence + R.FENCE + '\n' + JSON.stringify(json, null, 1) + '\n' + fence;
const ANSWER = 'I reviewed 3 files.\n\n' + block({ findings: [
  { severity: 'critical', file: 'src/a.ts', line: 12, title: 'Null check', problem: 'x may be null', fix: 'Guard it' },
  { severity: 'style', filePath: 'src/b.ts:40', problem: 'Long function', suggestedFix: 'Split it' },
  { severity: 'nit', path: 'README.md', line: '0', description: 'Typo', locations: [{ file: 'docs/x.md', line: 3 }, { file: 'README.md' }] },
  { severity: 'high' },   // neither problem nor title: dropped
] }) + '\n';

function findingsOf(text: string): Finding[] {
  const r = R.parse(text);
  assert.ok(r && 'findings' in r, 'parsed');
  return (r as { findings: Finding[] }).findings;
}

test('review request: the prompt (or the default) plus the format; shown without the format', () => {
  const t = R.request('Review against develop.', 'only src/');
  assert.ok(t.startsWith('Review against develop.\n\nFor this review: only src/\n\n' + R.FORMAT_MARK));
  assert.ok(t.includes('```' + R.FENCE));
  assert.ok(R.isRequest(t));
  assert.equal(R.displayText(t), 'Review against develop.\n\nFor this review: only src/');
  const d = R.request('  ', '');
  assert.ok(d.startsWith(R.DEFAULT_PROMPT + '\n\n' + R.FORMAT_MARK));
  assert.ok(!R.isRequest('Review this please'));
  assert.equal(R.displayText('plain text'), 'plain text');
});

test('review request from the project\'s file: the text goes to Codex, the chat shows the file name', () => {
  const t = R.request('# Rules\n\nCheck totals.', 'only src/', REVIEW_FILE);
  assert.ok(t.includes(REVIEW_FILE + ':\n\n# Rules\n\nCheck totals.\n\nFor this review: only src/\n\n' + R.FORMAT_MARK));
  assert.equal(R.displayText(t), REVIEW_FILE + '\n\nFor this review: only src/');
  assert.equal(R.displayText(R.request('Check totals.', '', REVIEW_FILE)), REVIEW_FILE);
  assert.equal(R.displayText(R.request('Quotes\n' + R.FORMAT_MARK + '\nhere', '', REVIEW_FILE)), REVIEW_FILE, 'the file may quote the mark');
  assert.ok(R.request('', '', REVIEW_FILE).startsWith(R.DEFAULT_PROMPT + '\n\n' + R.FORMAT_MARK), 'no text: the default');
  assert.ok(R.TEMPLATE.includes(R.DEFAULT_PROMPT));
});

test('REVIEW_INSTRUCTIONS.md: found up to the repository root, created once, never overwritten', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codexter-review-'));
  try {
    const repo = path.join(tmp, 'repo'), sub = path.join(repo, 'packages', 'a');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(tmp, REVIEW_FILE), 'outside the repository');
    assert.deepEqual(findReviewFile(sub), { path: path.join(sub, REVIEW_FILE), exists: false }, 'not above the repository root');
    assert.equal(createReviewFile(path.join(repo, REVIEW_FILE), 'root'), true);
    assert.deepEqual(findReviewFile(sub), { path: path.join(repo, REVIEW_FILE), exists: true });
    assert.equal(createReviewFile(path.join(repo, REVIEW_FILE), 'other'), false);
    assert.equal(fs.readFileSync(path.join(repo, REVIEW_FILE), 'utf8'), 'root');
    fs.writeFileSync(path.join(sub, REVIEW_FILE), 'nearest');
    assert.equal(findReviewFile(sub).path, path.join(sub, REVIEW_FILE), 'the nearest wins');
    const plain = path.join(tmp, 'plain', 'x');
    fs.mkdirSync(plain, { recursive: true });
    assert.equal(findReviewFile(plain).exists, false, 'no repository: only the folder itself');
    assert.equal(reviewText('﻿\n  text \n'), 'text');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('findings block: fields normalized, numbered, the block cut from the text', () => {
  const r = R.parse(ANSWER) as { findings: Finding[]; text: string };
  assert.equal(r.text, 'I reviewed 3 files.');
  assert.equal(r.findings.length, 3);
  const [a, b, c] = r.findings;
  assert.deepEqual(a, { n: 1, severity: 'critical', title: 'Null check', problem: 'x may be null', fix: 'Guard it', locations: [{ file: 'src/a.ts', line: 12 }] });
  assert.deepEqual(b, { n: 2, severity: 'medium', title: '', problem: 'Long function', fix: 'Split it', locations: [{ file: 'src/b.ts', line: 40 }] });
  assert.equal(c.severity, 'suggestion');
  assert.equal(c.problem, 'Typo');
  assert.deepEqual(c.locations, [{ file: 'README.md', line: 0 }, { file: 'docs/x.md', line: 3 }]);
});

test('findings block: a bare array, ~~~ fences, the last block wins, an empty list', () => {
  assert.equal(findingsOf(block([{ problem: 'p', file: 'C:\\x\\y.ts', line: 2 }], '~~~'))[0].locations[0].file, 'C:\\x\\y.ts');
  const two = block({ findings: [{ problem: 'old' }] }) + '\n\nOn second thought:\n\n' + block({ findings: [{ problem: 'new' }, { problem: 'newer' }] });
  assert.deepEqual(findingsOf(two).map((f) => f.problem), ['new', 'newer']);
  assert.deepEqual(findingsOf('Nothing found.\n' + block({ findings: [] })), []);
  assert.equal(findingsOf(block({ findings: [{ problem: 'p', file: 'C:\\a.ts' }] }))[0].locations[0].file, 'C:\\a.ts');   // a drive letter is no line
});

test('findings block: missing or broken gives null / an error, the normal answer stays', () => {
  assert.equal(R.parse('Just a normal answer with ```js\ncode\n```'), null);
  const bad = R.parse('Text\n```' + R.FENCE + '\n{"findings": [\n```') as { error: string; text: string };
  assert.match(bad.error, /not valid JSON/);
  assert.equal(bad.text, 'Text');
  assert.match((R.parse(block({ items: [] })) as { error: string }).error, /no "findings" list/);
});

test('streaming: an unfinished block is hidden, text after a closed block stays', () => {
  assert.deepEqual(R.hideBlock('Overview\n\n```' + R.FENCE + '\n{"findings": [{"pro'), { text: 'Overview', hidden: true });
  assert.deepEqual(R.hideBlock('A\n' + block({ findings: [] }) + '\nB'), { text: 'A\n\nB', hidden: true });
  assert.deepEqual(R.hideBlock('no block'), { text: 'no block', hidden: false });
});

test('severity words map to the three colours', () => {
  for (const w of ['critical', 'HARD', 'high', 'bug', 'P1']) assert.equal(R.severityOf(w), 'critical', w);
  for (const w of ['medium', 'style', 'warning', 'p2', 'unknown', undefined]) assert.equal(R.severityOf(w), 'medium', String(w));
  for (const w of ['suggestion', 'low', 'nit', 'info', 'p3']) assert.equal(R.severityOf(w), 'suggestion', w);
});

test('triage: answers move on to the next open card, Back, change after the overview', () => {
  const f = findingsOf(ANSWER);
  let st = R.start(f);
  assert.deepEqual(st, { index: 0, total: 3, decisions: {}, sent: false });
  st = R.back(st);
  assert.equal(st.index, 0, 'no Back from the first card');
  st = R.decide(st, 1, 'fix');
  assert.equal(st.index, 1);
  assert.equal(R.decide(st, 2, 'own', '   '), st, 'an own answer needs text');
  assert.equal(R.decide(st, 2, 'maybe'), st, 'unknown action');
  st = R.back(st);
  assert.equal(st.index, 0);
  st = R.decide(st, 1, 'skip');   // changed on the way back: on to the next open one (2)
  assert.equal(st.index, 1);
  assert.deepEqual(st.decisions[1], { action: 'skip' });
  st = R.goTo(st, 2);
  st = R.decide(st, 3, 'own', '  Keep it, it is intended. ');
  assert.equal(st.index, 1, 'wraps to the open card 2');
  assert.deepEqual(st.decisions[3], { action: 'own', note: 'Keep it, it is intended.' });
  assert.ok(!R.complete(st));
  st = R.decide(st, 2, 'fix');
  assert.ok(R.complete(st));
  assert.equal(st.index, 3, 'overview');
  st = R.goTo(st, 0);
  st = R.decide(st, 1, 'fix');
  assert.equal(st.index, 3, 'a change after the overview goes back to it');
  assert.equal(R.answered(st), 3);
  const sent = Object.assign({}, st, { sent: true });
  assert.equal(R.decide(sent, 1, 'skip'), sent, 'sent answers are final');
  assert.equal(R.goTo(sent, 0), sent);
});

test('summary: one line per finding, own answers indented, read back the same', () => {
  const f = findingsOf(ANSWER);
  const d = { 1: { action: 'fix' }, 2: { action: 'skip' }, 3: { action: 'own', note: 'Rename it.\nAnd add a test.' } };
  const s = R.summary(f, d);
  assert.equal(s.split('\n').slice(0, 7).join('\n'), [
    'Codexter review answers (3 findings):', '',
    '1. [Fix] src/a.ts:12 - Null check',
    '2. [Skip] src/b.ts:40 - Long function',
    '3. [Own answer] README.md - Typo',
    '   Answer: Rename it.',
    '           And add a test.'].join('\n'));
  assert.match(s, /Now fix the findings marked Fix/);
  assert.ok(R.isSummary(s));
  assert.deepEqual(R.parseSummary(s), { 1: { action: 'fix' }, 2: { action: 'skip' }, 3: { action: 'own', note: 'Rename it.\nAnd add a test.' } });
  assert.equal(R.parseSummary('hello'), null);
  const skipped = R.summary(f.slice(0, 1), { 1: { action: 'skip' } });
  assert.match(skipped, /^Codexter review answers \(1 finding\):/);
  assert.match(skipped, /I skip all findings: change nothing\./);
});

test('wiring: script list, setting, command, page hooks', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.contributes.configuration.properties['codexPanel.reviewPrompt'], undefined, 'the instructions live in the project');
  assert.ok(pkg.contributes.commands.some((c: { command: string }) => c.command === 'codexPanel.review'));
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  assert.ok(html.indexOf('review.js') > html.indexOf('dropdata.js') && html.indexOf('review.js') < html.indexOf('app.js'));
  assert.ok(fs.existsSync(path.join(root, 'media', 'web', 'review.js')), 'sync-web copies it');
  const panel = fs.readFileSync(path.join(root, 'src', 'panel.ts'), 'utf8');
  assert.ok(panel.includes("case 'reviewPrompt':") && panel.includes("case 'reviewFileCreate':") && panel.includes("kind: 'startReview'"));
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert.ok(ext.includes("registerCommand('codexPanel.review'"));
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes("case 'startReview':") && app.includes('attachReview(t, finalMsg)') && app.includes('settleReview(rv.parseSummary(text))'));
  assert.ok(app.includes("case 'reviewPrompt': onReviewPrompt(ev)") && app.includes("case 'reviewFile': onReviewFile(ev)"));
});
