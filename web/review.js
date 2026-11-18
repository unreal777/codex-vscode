/* Code review triage: the review request, the findings block of Codex's answer, the answers and the summary sent back.
 * Pure functions (no DOM); app.js draws the cards. Also loaded by the Node tests (module.exports).
 *
 *   request(prompt, extra, file) -> the message text: the project's review instructions + the format Codexter needs (FORMAT_MARK starts it)
 *   isRequest(text) / displayText(text) -> whether a user message is a review request / its text without the format part
 *   parse(answer)            -> null (no findings block) | {findings, text (answer without the block)} | {error, text}
 *   hideBlock(answer)        -> the answer while it streams: the (maybe unfinished) block cut off; {text, hidden}
 *   triage state: start(findings), decide(st, n, action, note), back(st), goTo(st, i), complete(st, findings)
 *   summary(findings, decisions) -> the next message ("Codexter review answers ..."); isSummary(text), parseSummary(text)
 */
(function (root) {
  'use strict';

  const FENCE = 'codexter-findings';
  const FORMAT_MARK = '---\nCodexter review format';
  const SUMMARY_HEAD = 'Codexter review answers';
  const FILE_HEAD = 'Code review instructions of this project, from ';
  const EXTRA_HEAD = '\n\nFor this review: ';

  const DEFAULT_PROMPT = [
    'Review the changes of this repository like a careful senior reviewer of a pull request:',
    'the uncommitted changes, and the commits of the current branch that are not in its base branch (main or master).',
    'Look for bugs, security problems, data loss, race conditions, wrong error handling, missing tests and code that is hard to maintain.',
    'Read the surrounding code where needed. Report only real problems, not taste.'
  ].join('\n');

  const FORMAT = [
    FORMAT_MARK + ' (Codexter shows your findings as cards, one at a time):',
    '- Do the review only. Do not change any files now.',
    '- End your answer with exactly one fenced code block with the info string ' + FENCE + ' that holds JSON like this:',
    '```' + FENCE,
    '{"findings": [{"severity": "critical", "file": "src/app.ts", "line": 42, "title": "Short title",',
    '  "problem": "What is wrong and why it matters.", "fix": "The change you suggest."}]}',
    '```',
    '- severity: "critical" = bugs, security, data loss, broken behaviour; "medium" = style, maintainability, missing tests, risky code;',
    '  "suggestion" = optional improvements.',
    '- file: path relative to the workspace root; line: 1-based line in the current file (0 if there is none).',
    '- One entry per finding, the most severe first. An empty list when you found nothing.',
    '- Before the block write at most a short overview; the details belong in the block. Markdown is allowed inside "problem" and "fix".'
  ].join('\n');

  // what "Create REVIEW_INSTRUCTIONS.md" of the settings writes
  const TEMPLATE = [
    '# Code review instructions',
    '',
    'How Codex should review this project. Codexter sends this file with every Code review and adds the format of the finding cards itself.',
    '',
    '## What to review and look for',
    '',
    DEFAULT_PROMPT,
    '',
    '## Rules of this project',
    '',
    '<!-- For example: the architecture to respect, what not to report, which tests a change needs. -->',
    ''
  ].join('\n');

  /** prompt: the text of the project's file ('' = DEFAULT_PROMPT); file: its name, the chat then shows the name instead of the text */
  function request(prompt, extra, file) {
    const p = String(prompt || '').trim(), f = String(file || '').trim();
    const x = String(extra || '').trim();
    return (p && f ? FILE_HEAD + f + ':\n\n' + p : p || DEFAULT_PROMPT) + (x ? EXTRA_HEAD + x : '') + '\n\n' + FORMAT;
  }
  const isRequest = (text) => String(text || '').indexOf(FORMAT_MARK) >= 0;
  function displayText(text) {
    const s = String(text || ''), i = s.lastIndexOf(FORMAT_MARK);   // the last one: the project's file may quote the mark
    if (i < 0) return s;
    const body = s.slice(0, i).replace(/\s+$/, '');
    const end = body.startsWith(FILE_HEAD) ? body.indexOf(':\n', FILE_HEAD.length) : -1;
    if (end < 0) return body;
    const x = body.lastIndexOf(EXTRA_HEAD);
    return body.slice(FILE_HEAD.length, end) + (x > end ? body.slice(x) : '');
  }

  // ---- the findings block of the answer ----
  const OPEN_RE = new RegExp('(^|\\n)[ \\t]*(`{3,}|~{3,})[ \\t]*' + FENCE + '[^\\n]*\\n', 'g');

  /** Where the block starts and ends in the answer: {start, end, body, closed} or null. The last block wins. */
  function findBlock(text) {
    const s = String(text || '');
    let m, last = null;
    OPEN_RE.lastIndex = 0;
    while ((m = OPEN_RE.exec(s))) last = { start: m.index + m[1].length, bodyStart: m.index + m[0].length, fence: m[2] };
    if (!last) return null;
    const close = new RegExp('\\n[ \\t]*' + last.fence[0] + '{' + last.fence.length + ',}[ \\t]*(?=\\n|$)', 'g');
    close.lastIndex = last.bodyStart - 1;
    const c = close.exec(s);
    if (!c) return { start: last.start, end: s.length, body: s.slice(last.bodyStart), closed: false };
    return { start: last.start, end: c.index + c[0].length, body: s.slice(last.bodyStart, c.index), closed: true };
  }

  /** every findings block cut out (the last one may be unfinished while the answer streams) */
  function hideBlock(text) {
    let s = String(text || ''), b, hidden = false;
    while ((b = findBlock(s))) { s = s.slice(0, b.start) + s.slice(b.end); hidden = true; }
    return hidden ? { text: s.replace(/\s+$/, ''), hidden } : { text: s, hidden };
  }

  const SEVERITY = {
    critical: ['critical', 'hard', 'high', 'error', 'bug', 'blocker', 'major', 'severe', 'security', 'p0', 'p1'],
    medium: ['medium', 'style', 'warning', 'warn', 'moderate', 'normal', 'p2'],
    suggestion: ['suggestion', 'low', 'info', 'nit', 'nitpick', 'minor', 'optional', 'idea', 'p3', 'p4']
  };
  function severityOf(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    for (const k of Object.keys(SEVERITY)) if (SEVERITY[k].includes(s)) return k;
    return 'medium';
  }
  const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const first = (o, keys) => { for (const k of keys) { const v = str(o[k]); if (v) return v; } return ''; };
  function lineOf(v) {
    const n = typeof v === 'number' ? v : parseInt(String(v == null ? '' : v), 10);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  /** "src/a.ts:12" in a file field: the line goes to the line */
  function splitLine(file, line) {
    const m = /^(.+?):(\d+)(?:[:-]\d+)?$/.exec(file);
    return m && !/^[A-Za-z]$/.test(m[1]) ? { file: m[1], line: line || lineOf(m[2]) } : { file, line };
  }
  function location(o) {
    const loc = splitLine(first(o, ['file', 'filePath', 'path', 'location']), lineOf(o.line != null ? o.line : o.startLine));
    return loc.file ? { file: loc.file, line: loc.line } : null;
  }
  function finding(o, i) {
    if (!o || typeof o !== 'object') return null;
    const problem = first(o, ['problem', 'description', 'message', 'details', 'body', 'text']);
    const title = first(o, ['title', 'summary', 'name', 'rule']);
    if (!problem && !title) return null;
    const locs = [];
    const add = (l) => { if (l && !locs.some((x) => x.file === l.file && x.line === l.line)) locs.push(l); };
    add(location(o));
    (Array.isArray(o.locations) ? o.locations : []).forEach((l) => add(l && typeof l === 'object' ? location(l) : null));
    return { n: i + 1, severity: severityOf(o.severity != null ? o.severity : o.priority), title, problem: problem || title,
      fix: first(o, ['fix', 'suggestedFix', 'suggestion', 'recommendation', 'solution']), locations: locs };
  }

  function parse(answer) {
    const s = String(answer || ''), b = findBlock(s);
    if (!b) return null;
    const text = hideBlock(s).text;
    let data;
    try { data = JSON.parse(b.body.trim()); } catch (e) { return { error: 'The findings block is not valid JSON: ' + e.message, text }; }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.findings) ? data.findings : null;
    if (!list) return { error: 'The findings block has no "findings" list.', text };
    const findings = [];
    list.forEach((o) => { const f = finding(o, findings.length); if (f) findings.push(f); });
    return { findings, text };
  }

  // ---- triage state: one answer per finding (n = 1-based number), index = the card shown, index === length = the overview ----
  const ACTIONS = ['fix', 'skip', 'own'];
  function start(findings) { return { index: 0, total: findings.length, decisions: {}, sent: false }; }
  const answered = (st) => Object.keys(st.decisions).length;
  const complete = (st) => st.total > 0 && answered(st) >= st.total;
  /** the next card without an answer after index i (wrapping), else the overview */
  function nextOpen(st, i) {
    for (let k = 1; k <= st.total; k++) {
      const j = (i + k) % st.total;
      if (!st.decisions[j + 1]) return j;
    }
    return st.total;
  }
  function decide(st, n, action, note) {
    if (st.sent || n < 1 || n > st.total || !ACTIONS.includes(action)) return st;
    const text = String(note || '').trim();
    if (action === 'own' && !text) return st;
    const decisions = Object.assign({}, st.decisions);
    decisions[n] = action === 'own' ? { action, note: text } : { action };
    const nx = Object.assign({}, st, { decisions });
    // a changed answer after the overview was reached goes back to the overview; otherwise on to the next open card
    nx.index = complete(st) ? st.total : nextOpen(nx, n - 1);
    return nx;
  }
  function back(st) { return st.sent || st.index <= 0 ? st : Object.assign({}, st, { index: st.index - 1 }); }
  function goTo(st, i) { return st.sent || i < 0 || i > st.total ? st : Object.assign({}, st, { index: i }); }

  // ---- the answers as the next message, and read back from it (a chat loaded again) ----
  const LABEL = { fix: 'Fix', skip: 'Skip', own: 'Own answer' };
  const where = (f) => (f.locations[0] ? f.locations[0].file + (f.locations[0].line ? ':' + f.locations[0].line : '') : '');
  const oneLine = (s, max) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
  function summary(findings, decisions) {
    const lines = [SUMMARY_HEAD + ' (' + findings.length + ' finding' + (findings.length === 1 ? '' : 's') + '):', ''];
    const count = { fix: 0, skip: 0, own: 0 };
    findings.forEach((f) => {
      const d = decisions[f.n] || { action: 'skip' };
      count[d.action]++;
      const loc = where(f);
      lines.push(f.n + '. [' + LABEL[d.action] + '] ' + (loc ? loc + ' - ' : '') + oneLine(f.title || f.problem, 120));
      if (d.action === 'own') String(d.note).split(/\r?\n/).forEach((l, i) => lines.push('   ' + (i === 0 ? 'Answer: ' : '        ') + l));
    });
    lines.push('');
    if (count.fix || count.own) {
      lines.push('Now fix the findings marked Fix as you suggested. For the findings with my own answer, do what the answer says ' +
        '(it may change the fix or tell you to leave the code as it is). Leave the skipped findings alone.');
      lines.push('When you are done, list per finding number what you changed.');
    } else {
      lines.push('I skip all findings: change nothing.');
    }
    return lines.join('\n');
  }
  const isSummary = (text) => String(text || '').trim().indexOf(SUMMARY_HEAD) === 0;
  function parseSummary(text) {
    if (!isSummary(text)) return null;
    const out = {}, lines = String(text).split(/\r?\n/);
    let own = null;
    const back = { 'fix': 'fix', 'skip': 'skip', 'own answer': 'own' };
    for (const l of lines) {
      const m = /^(\d+)\. \[(Fix|Skip|Own answer)\]/i.exec(l);
      if (m) { own = null; const a = back[m[2].toLowerCase()]; out[m[1]] = { action: a }; if (a === 'own') { own = out[m[1]]; own.note = ''; } continue; }
      const a = own && /^ {3}(?:Answer: | {8})(.*)$/.exec(l);
      if (a) { own.note += (own.note ? '\n' : '') + a[1]; continue; }
      own = null;
    }
    return out;
  }

  const api = { FENCE, FORMAT_MARK, SUMMARY_HEAD, DEFAULT_PROMPT, TEMPLATE, FORMAT, request, isRequest, displayText, findBlock, hideBlock, parse, severityOf,
    start, decide, back, goTo, complete, answered, nextOpen, summary, isSummary, parseSummary, LABEL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CodexReview = api;
})(typeof window !== 'undefined' ? window : globalThis);
