/* Codexter UI (vanilla JS, no build step).
 *   Java -> JS : window.codexUi.receive([event, ...])
 *   JS -> Java : window.__codexPost(JSON.stringify({type, ...}))
 * Events: {kind: init|openProjects|status|models|settings|showSettings|threads|threadAction|historyProjects|mentions|thread|newChat|notification|serverRequest|rateLimits|context|error|idle|focus|insertText|theme}
 * "notification"/"serverRequest" carry raw codex app-server messages ({method, params[, id]}).
 */
(function () {
  'use strict';

  // ---------- strings (single place, translate here) ----------
  const STR = {
    appTitle: 'Codex',
    newChat: 'New chat',
    newChatTitle: 'Start a new chat',
    history: 'History',
    noHistory: 'No chats found',
    noHistoryHint: 'Try another word, or choose All projects.',
    historySearch: 'Search chats and projects…',
    historyLoading: 'Loading…',
    historyMore: 'Load more',
    historyError: 'Could not load the history: ',
    allProjects: 'All projects',
    openIn: (ide) => 'Open in ' + ide,
    nProjects: (n) => n + ' projects',
    showAllProjects: 'Show all projects',
    projectFilter: 'Filter chats by project',
    ago: (t) => t + ' ago',
    untitled: '(untitled)',
    mentionHint: 'Type to search files',
    mentionNone: 'No matching files',
    mentionTitle: 'Files of the project (type @ in the message)',
    dropHint: 'Drop files here to add them as context',
    dropNoPaths: 'The browser does not tell Eclipse where dropped files are. Use @ in the input, or right-click a file > Add to Codexter chat.',
    // VS Code only gives a webview the dragged files when Shift is held; the panel itself reads the drop there
    dropHintVscode: 'Drop files here to add them as context',
    dropNoPathsVscode: 'No file path in the drop. Hold Shift while dropping files or editor tabs on the chat, use @ in the input, or right-click a file > Add to Codexter chat.',
    removeChip: 'Remove',
    emptyTitle: 'Ask Codex about your project',
    emptyHint: 'Enter to send, Shift+Enter for a new line.',
    placeholder: 'Ask Codex anything...',
    send: 'Send',
    stop: 'Stop',
    thinking: 'Thinking',
    thought: 'Thought',
    thoughtFor: 'Thought for',
    interrupted: 'Interrupted',
    copy: 'Copy',
    copied: 'Copied',
    show: 'Show all',
    showLines: (n) => 'Show all ' + n + ' lines',
    open: 'Open',
    diff: 'Diff',
    allow: 'Allow',
    allowSession: 'Allow for session',
    deny: 'Deny',
    allowed: 'Allowed',
    allowedSession: 'Allowed for this session',
    denied: 'Denied',
    resolved: 'Resolved',
    approveCommand: 'Codex wants to run a command',
    approveCommandNet: 'Codex wants network access for a command',
    approveFiles: 'Codex wants to change files',
    approvePerms: 'Codex requests additional permissions',
    changedFiles: (n) => 'Changed ' + n + (n === 1 ? ' file' : ' files'),
    openAllDiff: 'Open combined diff',
    workedFor: 'Worked for',
    plan: 'Plan',
    modelDefault: 'Default model',
    effortDefault: 'Default effort',
    hiddenMark: ' (hidden)',
    // history actions
    archive: 'Archive chat', unarchive: 'Unarchive chat', deleteChat: 'Delete chat', deleteAsk: 'Delete chat?', deleteYes: 'Delete', deleteNo: 'Cancel',
    showArchived: 'Show archived', noArchived: 'No archived chats', chatArchived: 'Chat archived', chatUnarchived: 'Chat restored', chatDeleted: 'Chat deleted',
    actionFailed: (what, err) => 'Could not ' + what + ' the chat' + (err ? ': ' + err : ''),
    // in-panel settings
    settings: 'Settings', settingsBack: 'Back', setDefaultModel: 'Default model', setDefaultEffort: 'Default reasoning effort',
    setDefaultModelHint: 'New chats start with this model.', setDefaultEffortHint: 'Only efforts the chosen model supports are listed.',
    codexDefault: 'Codex default', modelDefaultEffort: 'Model default', setModels: 'Models',
    setModelsHint: 'Models shown in the picker below the input. At least one stays visible.', setNoModels: 'The model list is not loaded yet.',
    setMore: 'More settings…',
    permTitle: 'How should Codex actions be approved?',
    permLabels: { ask: 'Ask for approval', auto: 'Approve for me', full: 'Full access', custom: 'Custom (config.toml)' },
    permDescs: {
      ask: 'Always ask to edit external files and use the internet',
      auto: 'Only ask for actions detected as potentially unsafe',
      full: 'Unrestricted access to the internet and any file on your computer',
      custom: 'Uses permissions defined in config.toml'
    },
    permButton: 'Permissions: how Codex actions are approved',
    plusTitle: 'Add context, goals, plans and plugins',
    plusAdd: 'Add',
    plusFiles: 'Files and folders',
    plusFilesOnly: 'Files',
    plusFolder: 'Folder',
    plusFilesHint: 'Attach files or folders as context',
    plusGoal: 'Goal',
    plusGoalHint: 'Set a goal to keep pursuing',
    plusPlan: 'Plan mode',
    plusPlanHint: 'Turn plan mode on',
    plusPlanOn: 'Plan mode is on. Click to turn it off',
    plusSketch: 'Sketch',
    plusSketchHint: 'Draw a sketch',
    plusPlugins: 'Plugins',
    pluginsLoading: 'Loading plugins…',
    pluginsNone: 'No installed plugins',
    pluginsError: 'Could not load the plugins: ',
    goalPlaceholder: 'What should Codex keep working towards?',
    goalSet: 'Set goal',
    goalClear: 'Clear goal',
    goalLabel: 'Goal',
    goalStatus: { active: 'active', paused: 'paused', blocked: 'blocked', usageLimited: 'usage limit', budgetLimited: 'budget used', complete: 'complete' },
    planChip: 'Plan mode',
    planChipOff: 'Turn plan mode off',
    sketchTitle: 'Sketch',
    sketchPen: 'Pen',
    sketchEraser: 'Eraser',
    sketchColor: 'Colour',
    sketchSize: 'Brush size',
    sketchClear: 'Clear',
    sketchDone: 'Attach',
    sketchCancel: 'Cancel',
    imageAdded: 'Image attached',
    imageTooMany: 'At most 8 images per message',
    imageFailed: 'Could not read the image',
    removeImage: 'Remove image',
    pastedImage: 'Pasted image',
    sketchName: 'Sketch',
    today: 'Today',
    yesterday: 'Yesterday',
    expandWork: 'Show the steps of this turn',
    collapseWork: 'Hide the steps of this turn',
    ctxTitle: 'Context',
    tokens: 'Context',
    limit5h: '5h',
    limitWeek: 'week',
    connecting: 'Connecting to Codex...',
    ready: 'Connected',
    closedMsg: 'Codex app-server stopped',
    errorTitle: 'Error',
    retry: 'Retry',
    openSettings: 'Open settings',
    setPath: 'Set codex path',
    compacted: 'Context compacted',
    retrying: 'Retrying...',
    declined: 'declined',
    failed: 'failed',
    mcpCall: 'MCP',
    webSearch: 'Web search',
    toolCall: 'Tool',
    activeIn: 'Active editor is in',
    newChatThere: 'New chat there',
    threadProject: 'Project of this chat: ',
    autoReview: 'Auto-review',
    signinTitle: 'Sign in to use Codex',
    signinText: 'Sign in with your ChatGPT account to get started. Your browser opens for the sign-in.',
    signinBtn: 'Sign in with ChatGPT',
    signinRetry: 'Try again',
    signinWaiting: 'Waiting for the sign-in in your browser...',
    signinOpen: 'Open sign-in page',
    cancel: 'Cancel',
    sandboxTitle: 'One-time Windows sandbox setup',
    sandboxText: 'Codex needs a one-time setup of the Windows sandbox to edit files safely. Windows asks for administrator permission once.',
    sandboxBtn: 'Set up',
    sandboxLater: 'Not now',
    sandboxRunning: 'Setting up the sandbox...',
    sandboxFailed: 'Sandbox setup failed: ',
    sandboxNoAdmin: 'Try without admin rights',
    dlProgress: (v, d, t) => 'Downloading Codex ' + v + '\u2026 ' + mb(d) + (t > 0 ? ' / ' + mb(t) : ''),
    installing: (v) => 'Installing Codex ' + v + '\u2026',
    dlFailed: (m) => 'Codex download failed: ' + m,
    codexUpdated: (v) => 'Codex updated to ' + v + ' \u2014 applies in your next new chat',
    retryDownload: 'Retry',
    dismiss: 'Dismiss',
    reviewVerdict: { approved: 'approved', denied: 'denied', timedOut: 'timed out', aborted: 'aborted', inProgress: 'checking' }
  };

  const EFFORT_LABEL = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max', ultra: 'Ultra', minimal: 'Minimal', none: 'None' };

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r(?!\n)/g, '');
  function fmtDur(ms) {
    if (ms == null || isNaN(ms)) return '';
    const s = Math.max(0, Math.round(ms / 1000));
    if (ms < 1000) return Math.round(ms) + 'ms';
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }
  function fmtNum(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n); }
  function relTime(sec) {
    if (!sec) return '';
    const d = Date.now() / 1000 - sec;
    if (d < 90) return 'now';
    if (d < 3600) return Math.round(d / 60) + 'm';
    if (d < 86400) return Math.round(d / 3600) + 'h';
    if (d < 86400 * 30) return Math.round(d / 86400) + 'd';
    return new Date(sec * 1000).toLocaleDateString();
  }
  function relTimeAgo(sec) {
    const short = relTime(sec);
    return !short ? '' : short === 'now' || /\d{4}|\//.test(short) ? short : STR.ago(short);
  }
  // the plugin prepends "Active file: ..." / "Referenced files ..." / selections to prompts; they are not part of a chat title
  const PREAMBLE_RE = /^(?:(?:Active file: [^\n]*|Referenced files[^\n]*:\n(?:- [^\n]*\n?)+|Selected code in [^\n]*:\n```[\s\S]*?\n```)\n+)+/;
  function cleanTitle(text) {
    const t = String(text || '');
    const rest = t.replace(PREAMBLE_RE, '');
    return (rest.trim() ? rest : t).replace(/\s+/g, ' ').trim();
  }
  function basename(p) { return String(p).split(/[\\/]/).pop(); }
  function dirname(p) { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : ''; }
  function relPath(p) {
    const c = state.cwd;
    if (c && p.toLowerCase().startsWith(c.toLowerCase())) return p.slice(c.length).replace(/^[\\/]+/, '');
    return p;
  }
  // "powershell.exe -Command X" wrappers are noise in a card header
  function innerCommand(cmd) {
    let c = String(cmd || '');
    const m = c.match(/^"?[^"]*?(?:powershell|pwsh|cmd|bash|sh)(?:\.exe)?"?\s+(?:-NoProfile\s+)?(?:-Command|-c|\/c|-lc)\s+([\s\S]*)$/i);
    if (m) {
      c = m[1].trim();
      if (c.length > 1 && c[0] === '"' && c[c.length - 1] === '"') c = c.slice(1, -1);
    }
    return c;
  }

  // ---------- host ----------
  // The host tells who embeds the page in the init event ("vscode" | "eclipse"). No host field = Eclipse (older builds).
  let host = 'eclipse';

  // ---------- bridge ----------
  const bridge = {
    post(msg) {
      try {
        if (typeof window.__codexPost === 'function') window.__codexPost(JSON.stringify(msg));
        else console.warn('no bridge', msg);
      } catch (e) { console.error('bridge', e); }
    }
  };

  // ---------- markdown ----------
  const PATH_RE = /^(?:[A-Za-z]:)?[\w@.\-\\/]*[\\/][\w@.\-\\/ ]*\.[A-Za-z0-9]{1,8}(?::\d+(?:[-:]\d+)?)?$|^[\w@.\-]+\.(?:java|js|ts|tsx|jsx|py|xml|json|md|yml|yaml|properties|gradle|html|css|sql|cs|go|rs|kt|c|cpp|h|txt)(?::\d+(?:[-:]\d+)?)?$/;
  function setupMarkdown() {
    if (!window.marked) return;
    const r = new marked.Renderer();
    r.html = (html) => esc(typeof html === 'string' ? html : (html && html.text) || '');
    r.image = (href, title, text) => esc(text || '');
    r.link = (href, title, text) => {
      if (/^(https?:|mailto:)/i.test(href || '')) return '<a href="' + esc(href) + '" data-url="' + esc(href) + '">' + text + '</a>';
      const ref = window.CodexLinks && CodexLinks.parse(href); // anything else is a file (or folder) link
      return ref ? CodexLinks.anchor(ref, text, state.cwd) : text;
    };
    r.codespan = (text) => {
      const plain = text.replace(/&(amp|lt|gt|quot|#39);/g, (m, g) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[g]));
      return PATH_RE.test(plain) ? '<code class="path" data-path="' + esc(plain) + '">' + text + '</code>' : '<code>' + text + '</code>';
    };
    r.code = (code, info) => {
      const lang = ((info || '').match(/^\S*/) || [''])[0].toLowerCase();
      let body;
      try {
        body = lang && window.hljs && hljs.getLanguage(lang)
          ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
          : esc(code);
      } catch (e) { body = esc(code); }
      return '<div class="codeblock"><div class="head"><span>' + esc(lang || 'text') + '</span><button class="copy" type="button">' +
        STR.copy + '</button></div><pre><code class="hljs">' + body + '</code></pre></div>';
    };
    marked.use({ renderer: r, gfm: true, breaks: false });
  }
  function renderMd(el, text) {
    if (window.marked) el.innerHTML = marked.parse(text || '');
    else el.textContent = text || '';
    if (window.CodexLinks) CodexLinks.linkify(el, state.cwd);
  }

  // ---------- state ----------
  const state = {
    cwd: '', threadId: null, turnId: null, running: false, pending: false,
    items: new Map(), approvals: new Map(),
    models: [], prefs: { model: '', effort: '', permissions: 'ask' },
    // IDE settings (init.settings / event settings): the model and effort a new chat starts with, and the models the picker hides
    settings: { defaultModel: '', defaultReasoningEffort: '', hiddenModels: [] }, defaultsApplied: false, settingsOpen: false,
    turn: null, planMode: false, planUsed: false, images: [], goal: null, plugins: { items: null, loading: false, error: null, at: 0 },
    project: '', active: null, reviews: new Map(),
    contexts: [], dismissedFile: null,
    // History panel: the query and the project selection are kept while the page lives (and by the host for the whole IDE session).
    // cwds = selected projects (empty = all); manual = the user changed it by hand, so the IDE's open projects no longer preselect it.
    hist: { query: '', cwds: [], manual: false, openProjects: [], rows: [], next: null, loading: false, archived: false, confirm: null, busy: new Set(), reqId: 0, projects: [], error: null, sel: 0, autoLoads: 0 },
    mention: { open: false, items: [], sel: 0, reqId: 0, start: 0, query: '', loading: false },
    tokenUsage: null, rateLimits: null,
    turnFiles: new Set(), turnDiff: null, turnStartMs: 0,
    title: STR.newChat, historyOpen: false, hasContent: false,
    auth: { state: 'unknown' }, install: null, updatedVersion: null, sandbox: null, sandboxDismissed: false
  };

  // ---------- skeleton ----------
  const ICON = {
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
    history: '<svg viewBox="0 0 16 16"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v3h3M8 5v3.2l2 1.3"/></svg>',
    send: '<svg viewBox="0 0 16 16"><path d="M2 8.5 14 2 9.5 14 7.5 9z"/></svg>',
    stop: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>',
    file: '<svg viewBox="0 0 16 16"><path d="M4 1.5h5l3.5 3.5V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5zM9 1.5V5h3.5"/></svg>',
    folder: '<svg viewBox="0 0 16 16"><path d="M1.5 3.5h4l1.5 1.5h7.5v8a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5z"/></svg>',
    caret: '<svg viewBox="0 0 16 16"><path d="M4 6.5l4 4 4-4"/></svg>',
    hand: '<svg viewBox="0 0 16 16"><path d="M5.5 8V3.5a1 1 0 0 1 2 0V7M7.5 7V2.5a1 1 0 0 1 2 0V7M9.5 7V3.5a1 1 0 0 1 2 0V9.5c0 2.5-1.5 4-4 4-2 0-3-1-4-2.5L2.5 8.5a1 1 0 0 1 1.7-1L5.5 9"/></svg>',
    shield: '<svg viewBox="0 0 16 16"><path d="M8 1.8 13 3.6v4c0 3-2 5.2-5 6.6-3-1.400-5-3.600-5-6.600v-4z"/><path d="M5.800 8 7.200 9.400 10.200 6.400"/></svg>',
    warn: '<svg viewBox="0 0 16 16"><path d="M8 2 14.500 13.500h-13z"/><path d="M8 6.500v3.200M8 11.500v.1"/></svg>',
    cog: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><circle cx="8" cy="8" r="5.500"/></svg>',
    clip: '<svg viewBox="0 0 16 16"><path d="M10.500 4.500 6 9a1.500 1.500 0 0 0 2.100 2.100l4.700-4.700a3 3 0 0 0-4.200-4.200L3.800 7.100a4.500 4.500 0 0 0 6.400 6.400l3-3"/></svg>',
    target: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><path d="M8 8h.01"/></svg>',
    bulb: '<svg viewBox="0 0 16 16"><path d="M6 12h4M6.500 14h3M8 1.800a4 4 0 0 0-2.400 7.200c.5.400.8 1 .8 1.700v.3h3.200v-.3c0-.7.3-1.300.8-1.700A4 4 0 0 0 8 1.800z"/></svg>',
    pen: '<svg viewBox="0 0 16 16"><path d="M2 14c2-.5 2.500-2 3-3.500M5 10.500 11.500 4a1.400 1.400 0 0 1 2 2L7 12.500 4 13z"/></svg>',
    check: '<svg viewBox="0 0 16 16"><path d="M3 8.500 6.500 12 13 4.500"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    plug: '<svg viewBox="0 0 16 16"><path d="M6 2v3M10 2v3M4.500 5h7v2.500a3.500 3.500 0 0 1-7 0zM8 11v3"/></svg>',
    archive: '<svg viewBox="0 0 16 16"><path d="M2 3.500h12v3H2zM3 6.500V13a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6.500M6.500 9.500h3"/></svg>',
    unarchive: '<svg viewBox="0 0 16 16"><path d="M2 3.500h12v3H2zM3 6.500V13a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6.500M8 12V8.500M6.200 10 8 8.200 9.800 10"/></svg>',
    trash: '<svg viewBox="0 0 16 16"><path d="M2.500 4h11M6 4V2.500h4V4M4 4l.6 9.500h6.800L12 4M6.800 6.500v4.500M9.200 6.500v4.500"/></svg>',
    back: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>'
  };
  const app = $('#app');
  app.innerHTML =
    '<div id="topbar">' +
    '<span id="conn" class="connecting" title=""></span><div id="title"></div><span id="proj" class="hidden"></span>' +
    '<button class="icon-btn" id="btn-new" type="button" title="' + esc(STR.newChatTitle) + '">' + ICON.plus + '</button>' +
    '<button class="icon-btn" id="btn-hist" type="button" title="' + esc(STR.history) + '">' + ICON.history + '</button>' +
    '<button class="icon-btn" id="btn-set" type="button" title="' + esc(STR.settings) + '" aria-label="' + esc(STR.settings) + '" aria-haspopup="dialog" aria-expanded="false">' + ICON.gear + '</button>' +
    '<div id="history" class="hidden"><div class="hist-head">' +
    '<input id="hist-q" type="search" autocomplete="off" spellcheck="false" placeholder="' + esc(STR.historySearch) + '">' +
    '<button id="hist-proj" type="button" aria-haspopup="true" aria-expanded="false" title="' + esc(STR.projectFilter) + '"><span class="lbl"></span>' + ICON.caret + '</button></div>' +
    '<label id="hist-arch"><input type="checkbox" id="hist-archived"><span>' + esc(STR.showArchived) + '</span></label>' +
    '<div id="hist-list"></div></div></div>' +
    '<div id="settings" class="hidden" role="dialog" aria-label="' + esc(STR.settings) + '"><div class="set-head">' +
    '<button class="icon-btn" id="set-back" type="button" title="' + esc(STR.settingsBack) + '" aria-label="' + esc(STR.settingsBack) + '">' + ICON.back + '</button>' +
    '<h2>' + esc(STR.settings) + '</h2></div><div id="set-body"></div></div>' +
    '<div id="cxstatus" class="hidden"></div>' +
    '<div id="feed"></div>' +
    '<div id="dock"><div id="sandbox" class="hidden"></div><div id="signin" class="hidden"></div><div id="plan" class="hidden"></div><div id="xproj" class="hidden"></div><div id="goal" class="hidden"></div><div id="chips"></div>' +
    '<div id="composer"><div id="mention" class="hidden" role="listbox"></div>' +
    '<div id="plus-menu" class="popmenu hidden" role="menu" aria-label="' + esc(STR.plusTitle) + '"></div>' +
    '<div id="perm-menu" class="popmenu hidden" role="menu" aria-label="' + esc(STR.permTitle) + '"></div>' +
    '<div id="cchips" class="hidden"></div>' +
    '<textarea id="input" rows="1" placeholder="' + esc(STR.placeholder) + '"></textarea>' +
    '<div class="row"><button id="plus" type="button" class="tool" aria-haspopup="menu" aria-expanded="false" title="' + esc(STR.plusTitle) + '" aria-label="' + esc(STR.plusTitle) + '">' + ICON.plus + '</button>' +
    '<button id="perm" type="button" class="tool perm" aria-haspopup="menu" aria-expanded="false" title="' + esc(STR.permButton) + '"><span class="pi"></span><span class="pl"></span></button>' +
    '<select id="sel-model" title="Model"></select><select id="sel-effort" title="Reasoning effort"></select><span class="spacer"></span>' +
    '<button id="send" type="button" title="' + esc(STR.send) + '">' + ICON.send + '</button></div></div>' +
    '<div id="footer"><span id="f-tokens"></span><span id="f-limits"></span></div></div>' +
    '<div id="proj-menu" class="hidden" role="group" aria-label="' + esc(STR.projectFilter) + '"></div>' +
    '<div id="sketch" class="hidden" role="dialog" aria-modal="true" aria-label="' + esc(STR.sketchTitle) + '"></div>' +
    '<div id="dropzone" class="hidden"><div>' + esc(STR.dropHint) + '</div></div>';

  const feed = $('#feed'), input = $('#input'), sendBtn = $('#send');
  const selModel = $('#sel-model'), selEffort = $('#sel-effort');

  // ---------- feed ----------
  let stick = true;
  feed.addEventListener('scroll', () => { stick = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 40; });
  function scrollDown() { if (stick) feed.scrollTop = feed.scrollHeight; }
  // A conversation turn is one block in the feed: time stamp, the user's message, then the agent's items. While the turn runs everything
  // stays visible; when it completes, the intermediate steps (reasoning, commands, tool calls, commentary) fold into one "Worked for" line.
  // role 'work' marks an item that may fold; everything else (answer, file changes, approvals, plan, errors) always stays visible.
  function beginTurn(whenSec) {
    if (state.turn && !state.turn.done) endTurn(state.turn, null);
    clearEmpty();
    const when = whenSec ? new Date(whenSec * 1000) : new Date();
    const el = h('div', { class: 'turn' }, h('div', { class: 'stamp', text: fmtStamp(when) }));
    feed.append(el);
    state.hasContent = true;
    state.turn = { el, startMs: Date.now(), started: false, done: false, folded: false };
    return state.turn;
  }
  function append(el, role) {
    clearEmpty();
    const t = state.turn && !state.turn.done ? state.turn : beginTurn();
    if (role === 'work') el.classList.add('wk');
    t.el.append(el);
    state.hasContent = true;
    scrollDown();
    return el;
  }
  function fmtStamp(d) {
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const diff = Math.round((day0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (diff === 0) return STR.today + ' ' + time;
    if (diff === 1) return STR.yesterday + ' ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === day0.getFullYear() ? undefined : 'numeric' }) + ' ' + time;
  }
  // Folds the turn's intermediate items behind a "Worked for X" line (the last answer, file changes, approvals, plan, errors stay).
  function endTurn(t, durationMs) {
    if (!t || t.done) return;
    t.done = true;
    const kids = Array.from(t.el.children);
    let finalMsg = null;
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i];
      if (k.classList.contains('msg') && k.classList.contains('agent') && k.dataset.phase !== 'commentary') { finalMsg = k; break; }
    }
    const work = kids.filter((k) => k.classList.contains('wk') && k !== finalMsg);
    if (!work.length) return;
    const ms = durationMs != null ? durationMs : Date.now() - t.startMs;
    const label = ms >= 1000 ? STR.workedFor + ' ' + fmtDur(ms) : STR.workedFor.replace(/ for$/, '') ;
    const body = h('div', { class: 'work-body hidden' });
    const head = h('button', { class: 'work-head', type: 'button', 'aria-expanded': 'false', title: STR.expandWork },
      h('span', { class: 'wl', text: label }), h('span', { class: 'chev' }));
    const group = h('div', { class: 'work' }, head, body);
    head.addEventListener('click', () => {
      const open = body.classList.toggle('hidden') === false;
      group.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
      head.title = open ? STR.collapseWork : STR.expandWork;
    });
    t.el.insertBefore(group, work[0]);
    work.forEach((k) => body.append(k));
    t.folded = true;
  }
  function showEmpty() {
    feed.innerHTML = '';
    feed.append(h('div', { class: 'empty-state', id: 'empty' }, h('h2', { text: STR.emptyTitle }), h('div', { text: state.cwd || '' }), h('div', { text: STR.emptyHint })));
    state.hasContent = false;
  }
  function clearEmpty() { const e = $('#empty'); if (e) e.remove(); }

  function resetConversation() {
    state.items.clear(); state.approvals.clear(); state.reviews.clear();
    state.turn = null; state.goal = null; state.planUsed = false; renderGoal();
    state.turnId = null; state.running = false; state.pending = false;
    state.turnFiles = new Set(); state.turnDiff = null; state.tokenUsage = null;
    stick = true;
    showEmpty(); renderPlan(null); updateRunning(); renderFooter();
  }

  function addUser(text, contexts, images, whenSec, reuse) {
    if (!reuse) beginTurn(whenSec);
    const chips = (contexts || []).map((c) => chipEl(c, false));
    const pics = (images || []).map((im) => h('img', { class: 'pic', src: im.url, alt: im.name || STR.pastedImage }));
    append(h('div', { class: 'msg user' }, h('div', { class: 'bubble' },
      chips.length ? h('div', { class: 'chips' }, chips) : null, pics.length ? h('div', { class: 'pics' }, pics) : null,
      text ? h('div', { class: 'tx', text }) : null)));
  }

  // ---------- item rendering ----------
  const timers = new Set();   // live reasoning labels
  setInterval(() => { timers.forEach((fn) => fn()); }, 500);

  function itemCounts(change) {
    const lines = String(change.diff || '').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const kind = change.kind && change.kind.type;
    if (kind === 'add') return { p: lines.length, m: 0 };
    if (kind === 'delete') return { p: 0, m: lines.length };
    let p = 0, m = 0;
    for (const l of lines) {
      if (l.startsWith('+') && !l.startsWith('+++')) p++;
      else if (l.startsWith('-') && !l.startsWith('---')) m++;
    }
    return { p, m };
  }

  function statusEl(kind) {
    if (kind === 'run') return h('span', { class: 'status' }, h('span', { class: 'spinner' }));
    if (kind === 'ok') return h('span', { class: 'status ok', text: '✓' });
    if (kind === 'fail') return h('span', { class: 'status fail', text: '✗' });
    return h('span', { class: 'status warn', text: '⊘' });
  }
  function setStatus(card, kind) {
    const old = $('.status', card);
    const nu = statusEl(kind);
    old.replaceWith(nu);
  }

  function toggleCard(card) { card.classList.toggle('open'); const b = $(':scope > .body', card); if (b) b.classList.toggle('hidden'); }

  function makeCard(labelEl, opts) {
    const card = h('div', { class: 'card' + (opts && opts.nochev ? ' nochev' : '') },
      h('div', { class: 'head' }, statusEl('run'), labelEl, h('span', { class: 'meta' }), h('span', { class: 'chev' })),
      h('div', { class: 'body hidden' }));
    $('.head', card).addEventListener('click', () => toggleCard(card));
    return card;
  }

  // -- agent message
  function renderAgent(rec) {
    const d = rec.data;
    if (!rec.el) {
      rec.el = h('div', { class: 'msg agent' }, h('div', { class: 'md' }));
      rec.md = $('.md', rec.el);
      append(rec.el, 'work');
    }
    rec.el.dataset.phase = d.phase || '';
    const draw = () => { rec.timer = null; renderMd(rec.md, d.text); scrollDown(); };
    if (rec.final) { if (rec.timer) clearTimeout(rec.timer); draw(); }
    else if (!rec.timer) rec.timer = setTimeout(draw, 70);
  }

  // -- reasoning
  function renderReasoning(rec) {
    const d = rec.data;
    if (!rec.el) {
      rec.el = h('div', { class: 'reasoning open nobody' },
        h('div', { class: 'head' }, h('span', { class: 'chev' }), h('span', { class: 'lbl shimmer' })),
        h('div', { class: 'body md' }));
      rec.lbl = $('.lbl', rec.el); rec.body = $('.body', rec.el);
      $('.head', rec.el).addEventListener('click', () => {
        if (rec.el.classList.contains('nobody')) return;
        rec.userToggled = true;
        rec.el.classList.toggle('open');
      });
      rec.parts = (d.summary || []).slice();
      rec.raw = (d.content || []).join('\n\n');
      rec.start = d.startedAtMs || Date.now();
      rec.localStart = Date.now();
      rec.tick = () => { rec.lbl.textContent = STR.thinking + '... ' + Math.floor((Date.now() - rec.localStart) / 1000) + 's'; };
      if (!rec.done) timers.add(rec.tick);
      append(rec.el, 'work');
    }
    const text = rec.parts.filter(Boolean).join('\n\n') || rec.raw;
    if (text) { rec.el.classList.remove('nobody'); renderMd(rec.body, text); }
    if (rec.done) {
      timers.delete(rec.tick);
      const ms = d.completedAtMs && d.startedAtMs ? d.completedAtMs - d.startedAtMs : Date.now() - rec.localStart;
      rec.lbl.classList.remove('shimmer');
      rec.lbl.textContent = rec.historical ? STR.thought : STR.thoughtFor + ' ' + fmtDur(Math.max(ms, 1000));
      if (!rec.userToggled) rec.el.classList.remove('open');
    } else {
      rec.tick();
    }
    scrollDown();
  }

  // -- command
  function renderCommand(rec) {
    const d = rec.data;
    const inner = innerCommand(d.command);
    if (!rec.el) {
      const lbl = h('span', { class: 'label mono', title: d.command || '' });
      rec.el = makeCard(lbl);
      rec.lbl = lbl;
      rec.meta = $('.meta', rec.el);
      const body = $('.body', rec.el);
      rec.full = h('div', { class: 'cmd-full' });
      rec.out = h('pre', { class: 'cmd-out' });
      rec.more = h('button', { class: 'cmd-more hidden', type: 'button' });
      rec.more.addEventListener('click', () => { rec.showAll = true; renderCommand(rec); });
      body.append(rec.full, rec.out, rec.more);
      rec.output = d.aggregatedOutput || '';
      append(rec.el, 'work');
    }
    rec.lbl.textContent = '$ ' + inner.split('\n')[0];
    rec.lbl.title = d.command || '';
    rec.full.textContent = (inner.includes('\n') || inner.length > 90 ? inner + '\n' : '') + (d.cwd ? 'cwd: ' + d.cwd : '');
    rec.full.classList.toggle('hidden', !rec.full.textContent);
    if (d.aggregatedOutput != null && (!rec.streamed || d.status !== 'inProgress')) rec.output = d.aggregatedOutput;
    const out = stripAnsi(rec.output).replace(/\r\n/g, '\n').replace(/\s+$/, '');
    const lines = out ? out.split('\n') : [];
    const LIM = 60;
    const shown = rec.showAll || lines.length <= LIM ? lines : lines.slice(-LIM);
    rec.out.textContent = shown.join('\n');
    rec.out.classList.toggle('hidden', !lines.length);
    rec.more.classList.toggle('hidden', rec.showAll || lines.length <= LIM);
    rec.more.textContent = STR.showLines(lines.length);
    let st = 'run', meta = '';
    if (d.status === 'completed') {
      st = d.exitCode ? 'fail' : 'ok';
      meta = (d.exitCode ? 'exit ' + d.exitCode + '  ' : '') + fmtDur(d.durationMs);
    } else if (d.status === 'failed') { st = 'fail'; meta = (d.exitCode != null ? 'exit ' + d.exitCode + '  ' : '') + fmtDur(d.durationMs); }
    else if (d.status === 'declined') { st = 'warn'; meta = STR.declined; }
    setStatus(rec.el, st);
    rec.meta.textContent = meta.trim();
    if (rec.out.classList.contains('hidden') && rec.full.classList.contains('hidden')) rec.el.classList.add('nochev');
    else rec.el.classList.remove('nochev');
    if (!rec.userOpened && d.status !== 'inProgress') { /* stay collapsed */ }
    if (!$('.body', rec.el).classList.contains('hidden')) rec.out.scrollTop = rec.out.scrollHeight;
  }

  // -- file change
  function renderFileChange(rec) {
    const d = rec.data;
    if (!rec.el) {
      rec.lbl = h('span', { class: 'label' });
      rec.meta = h('span', { class: 'meta' });
      rec.list = h('div', { class: 'files' });
      const head = h('div', { class: 'head' }, statusEl('run'), rec.lbl, rec.meta, h('span', { class: 'chev' }));
      head.addEventListener('click', () => { rec.el.classList.toggle('open'); rec.list.classList.toggle('hidden'); });
      rec.el = h('div', { class: 'card open' }, head, rec.list);
      append(rec.el);
    }
    const changes = d.changes || [];
    let tp = 0, tm = 0;
    rec.list.innerHTML = '';
    for (const c of changes) {
      const k = c.kind && c.kind.type;
      const cnt = itemCounts(c);
      tp += cnt.p; tm += cnt.m;
      const kindEl = h('span', { class: 'kind ' + (k === 'add' ? 'add' : k === 'delete' ? 'del' : 'mod'), text: k === 'add' ? 'A' : k === 'delete' ? 'D' : 'M' });
      const rel = relPath(c.path);
      const name = h('span', { class: 'name', title: c.path }, h('b', { text: basename(c.path) }), h('span', { class: 'dir', text: dirname(rel) }));
      name.addEventListener('click', () => bridge.post({ type: 'openFile', path: c.path }));
      const counts = h('span', { class: 'counts' }, h('span', { class: 'p', text: '+' + cnt.p }), ' ', h('span', { class: 'm', text: '−' + cnt.m }));
      const inline = h('div', { class: 'diff-inline hidden' });
      const tog = h('button', { class: 'mini-btn', type: 'button', text: 'Inline', title: 'Show changes inline' });
      tog.addEventListener('click', () => {
        if (!inline.firstChild) {
          String(c.diff || '').split('\n').forEach((l) => {
            const cls = l.startsWith('@@') ? 'h' : (k === 'add' || (l.startsWith('+') && !l.startsWith('+++'))) ? 'a' : (k === 'delete' || (l.startsWith('-') && !l.startsWith('---'))) ? 'd' : '';
            const pre = k === 'add' && !l.startsWith('+') ? '+' : k === 'delete' && !l.startsWith('-') ? '-' : '';
            inline.append(h('div', { class: cls, text: pre + l }));
          });
        }
        inline.classList.toggle('hidden');
      });
      const diffBtn = h('button', { class: 'mini-btn', type: 'button', text: STR.diff });
      diffBtn.addEventListener('click', () => bridge.post({ type: 'openDiff', path: c.path, kind: k, diff: c.diff || '' }));
      const openBtn = h('button', { class: 'mini-btn', type: 'button', text: STR.open });
      openBtn.addEventListener('click', () => bridge.post({ type: 'openFile', path: c.path }));
      rec.list.append(h('div', { class: 'file' }, kindEl, name, counts, tog, diffBtn, openBtn), inline);
    }
    const n = changes.length;
    rec.lbl.textContent = STR.changedFiles(n);
    rec.meta.innerHTML = '<span class="counts"><span class="p">+' + tp + '</span> <span class="m">−' + tm + '</span></span>';
    setStatus(rec.el, d.status === 'completed' ? 'ok' : d.status === 'inProgress' ? 'run' : d.status === 'declined' ? 'warn' : 'fail');
    scrollDown();
  }

  // -- mcp / dynamic / web search / generic
  function renderTool(rec) {
    const d = rec.data;
    let title, detail = '';
    if (d.type === 'mcpToolCall') { title = d.server + ' · ' + d.tool; detail = JSON.stringify(d.arguments, null, 2); }
    else if (d.type === 'dynamicToolCall') { title = (d.namespace ? d.namespace + ' · ' : '') + d.tool; detail = JSON.stringify(d.arguments, null, 2); }
    else if (d.type === 'webSearch') { title = STR.webSearch + ': ' + (d.query || ''); }
    else if (d.type === 'imageView') { title = 'View image · ' + basename(d.path); }
    else if (d.type === 'collabAgentToolCall') { title = 'Agent · ' + d.tool; detail = d.prompt || ''; }
    else if (d.type === 'enteredReviewMode' || d.type === 'exitedReviewMode') { title = d.type === 'enteredReviewMode' ? 'Review started' : 'Review finished'; detail = d.review || ''; }
    else { title = d.type; }
    if (d.type === 'mcpToolCall' && d.result) detail += '\n\n' + JSON.stringify(d.result.structuredContent || d.result.content, null, 2).slice(0, 4000);
    if (d.error && d.error.message) detail += '\n\nError: ' + d.error.message;
    if (!rec.el) {
      const lbl = h('span', { class: 'label' });
      rec.el = makeCard(lbl);
      rec.lbl = lbl; rec.meta = $('.meta', rec.el); rec.det = h('pre', { class: 'cmd-out' });
      $('.body', rec.el).append(rec.det);
      append(rec.el, 'work');
    }
    rec.lbl.textContent = title;
    rec.det.textContent = detail.trim();
    if (!detail.trim()) rec.el.classList.add('nochev'); else rec.el.classList.remove('nochev');
    const s = d.status;
    setStatus(rec.el, s === 'completed' || s === undefined && d.type !== 'webSearch' ? 'ok' : s === 'failed' ? 'fail' : s === 'inProgress' ? 'run' : 'ok');
    rec.meta.textContent = d.durationMs ? fmtDur(d.durationMs) : '';
  }

  // The plan Codex proposes in plan mode: a card of its own that stays visible when the turn folds.
  function renderPlanItem(rec) {
    if (!rec.el) {
      rec.el = h('div', { class: 'card plan-card' }, h('div', { class: 'ttl' }, h('span', { class: 'gl', html: ICON.bulb }), h('span', { text: STR.plan })), h('div', { class: 'md' }));
      append(rec.el);
    }
    renderMd($('.md', rec.el), rec.data.text);
    scrollDown();
  }

  function upsertItem(item, phase, historical) {
    if (!item || !item.id) return;
    if (item.type === 'userMessage') {
      if (historical) {
        const parts = item.content || [];
        const raw = parts.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        const text = raw.replace(PREAMBLE_RE, '').trim() ? raw.replace(PREAMBLE_RE, '') : raw;
        const pics = parts.filter((c) => c.type === 'image' && /^data:image\//.test(c.url || '')).map((c) => ({ url: c.url }));
        addUser(text.trim(), [], pics, null, true);
      }
      return;
    }
    if (item.type === 'hookPrompt' || item.type === 'functionCallOutput') return;
    if (item.type === 'contextCompaction') {
      if (!state.items.has(item.id)) { state.items.set(item.id, { el: append(h('div', { class: 'notice', text: STR.compacted })) }); }
      return;
    }
    let rec = state.items.get(item.id);
    if (!rec) { rec = { id: item.id, type: item.type, data: Object.assign({}, item), historical: !!historical }; state.items.set(item.id, rec); }
    else {
      // keep streamed text if the completed item arrives empty-handed
      const prevText = rec.data.text;
      rec.data = Object.assign(rec.data, item);
      if (item.type === 'agentMessage' && phase === 'started' && !item.text) rec.data.text = prevText || '';
    }
    const done = phase === 'completed' || historical;
    switch (item.type) {
      case 'agentMessage': rec.final = done; renderAgent(rec); break;
      case 'reasoning':
        if (phase === 'completed' || historical) { rec.parts = (item.summary || []).slice(); if ((item.content || []).length) rec.raw = item.content.join('\n\n'); }
        rec.done = done; renderReasoning(rec); break;
      case 'commandExecution': renderCommand(rec); break;
      case 'fileChange':
        renderFileChange(rec);
        if (phase === 'completed' && item.status === 'completed') (item.changes || []).forEach((c) => state.turnFiles.add(c.path));
        break;
      case 'plan': renderPlanItem(rec); break;
      default: renderTool(rec);
    }
  }

  // ---------- plan dock ----------
  function renderPlan(plan) {
    const el = $('#plan');
    if (!plan || !plan.plan || !plan.plan.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '';
    el.append(h('div', { class: 'ttl', text: STR.plan }));
    if (plan.explanation) el.append(h('div', { class: 'notice', style: 'text-align:left;margin-bottom:2px', text: plan.explanation }));
    plan.plan.forEach((s) => el.append(h('div', { class: 'step ' + s.status }, h('span', { class: 'box', text: s.status === 'completed' ? '✓' : '' }), h('span', { class: 'tx', text: s.step }))));
  }

  // ---------- approvals ----------
  function approvalCard(id, method, p) {
    let title, detail = '', reason = p.reason || '';
    if (method === 'item/commandExecution/requestApproval') {
      title = p.networkApprovalContext ? STR.approveCommandNet : STR.approveCommand;
      detail = innerCommand(p.command || '') + (p.cwd ? '\n# cwd: ' + p.cwd : '');
    } else if (method === 'item/fileChange/requestApproval') {
      title = STR.approveFiles;
      const rec = state.items.get(p.itemId);
      if (rec && rec.data.changes) detail = rec.data.changes.map((c) => ((c.kind && c.kind.type) || 'update') + '  ' + relPath(c.path)).join('\n');
      if (p.grantRoot) detail += (detail ? '\n' : '') + 'write access to: ' + p.grantRoot;
    } else {
      title = STR.approvePerms;
      detail = JSON.stringify(p.permissions || {}, null, 2);
    }
    const card = h('div', { class: 'card approval' }, h('div', { class: 'ttl', text: title }),
      reason ? h('div', { class: 'reason', text: reason }) : null,
      detail ? h('div', { class: 'detail', text: detail }) : null);
    const btns = h('div', { class: 'btns' });
    const decide = (decision, label) => {
      bridge.post({ type: 'approval', requestId: id, method, decision });
      btns.replaceWith(h('div', { class: 'result', text: label }));
      card.classList.add('done');
      state.approvals.delete(String(id));
    };
    btns.append(
      h('button', { class: 'btn primary', type: 'button', text: STR.allow, onclick: () => decide('accept', STR.allowed) }),
      h('button', { class: 'btn', type: 'button', text: STR.allowSession, onclick: () => decide('acceptForSession', STR.allowedSession) }),
      h('button', { class: 'btn danger', type: 'button', text: STR.deny, onclick: () => decide('decline', STR.denied) }));
    card.append(btns);
    state.approvals.set(String(id), { card, btns });
    return card;
  }

  // ---------- errors / notices ----------
  function errorCard(title, message, actions) {
    const btns = h('div', { class: 'btns' });
    (actions || []).forEach((a) => btns.append(h('button', {
      class: 'btn', type: 'button', text: a.label,
      onclick: () => bridge.post({ type: a.action })
    })));
    append(h('div', { class: 'card errcard' }, h('div', { class: 'ttl', text: title || STR.errorTitle }),
      h('div', { class: 'txt', text: message || '' }), (actions || []).length ? btns : null));
  }
  const notice = (t) => append(h('div', { class: 'notice', text: t }));

  // ---------- Codex download, sign-in, sandbox, toast ----------
  function mb(n) { return Math.round((n || 0) / 1048576) + ' MB'; }
  function renderCx() {
    const el = $('#cxstatus'), i = state.install;
    el.innerHTML = '';
    el.className = '';
    let text = null, bar = null;
    const btns = [];
    if (i && i.phase === 'downloading') { text = STR.dlProgress(i.version, i.done, i.total); bar = i.total > 0 ? i.done / i.total : -1; }
    else if (i && ['verifying', 'extracting', 'validating'].includes(i.phase)) { text = STR.installing(i.version); bar = -1; }
    else if (i && i.phase === 'failed') {
      text = STR.dlFailed(i.message || '');
      el.classList.add('fail');
      btns.push(h('button', { class: 'btn', type: 'button', text: STR.retryDownload, onclick: () => bridge.post({ type: 'retryDownload' }) }));
      btns.push(h('button', { class: 'x', type: 'button', title: STR.dismiss, text: '\u00d7', onclick: () => { state.install = null; renderCx(); } }));
    } else if (state.updatedVersion) {
      text = STR.codexUpdated(state.updatedVersion);
      btns.push(h('button', { class: 'x', type: 'button', title: STR.dismiss, text: '\u00d7', onclick: () => { state.updatedVersion = null; renderCx(); } }));
    }
    el.classList.toggle('hidden', !text);
    if (!text) return;
    el.append(h('span', { class: 't', text, title: text }), ...btns);
    if (bar != null) el.append(h('div', { class: 'bar' + (bar < 0 ? ' busy' : '') }, h('i', bar >= 0 ? { style: 'width:' + Math.round(bar * 100) + '%' } : null)));
  }

  // Replaces the composer while there is no signed-in account.
  function renderAuth() {
    const box = $('#signin'), a = state.auth || {};
    const show = a.state === 'signedOut' || a.state === 'waiting';
    box.innerHTML = '';
    box.classList.toggle('hidden', !show);
    $('#composer').classList.toggle('hidden', show);
    $('#chips').classList.toggle('hidden', show);
    if (!show) return;
    const btn = (label, cls, fn) => h('button', { class: 'btn ' + cls, type: 'button', text: label, onclick: fn });
    if (a.state === 'waiting') {
      box.append(h('div', { class: 'ttl', text: STR.signinTitle }),
        h('div', { class: 'txt' }, h('span', { class: 'spinner' }), ' ' + STR.signinWaiting),
        h('div', { class: 'btns' }, btn(STR.signinOpen, '', () => bridge.post({ type: 'openUrl', url: a.url })),
          btn(STR.cancel, '', () => bridge.post({ type: 'loginCancel' }))));
    } else {
      box.append(h('div', { class: 'ttl', text: STR.signinTitle }),
        h('div', { class: 'txt', text: STR.signinText }),
        a.error ? h('div', { class: 'err', text: a.error }) : '',
        h('div', { class: 'btns' }, btn(a.error ? STR.signinRetry : STR.signinBtn, 'primary', () => bridge.post({ type: 'login' }))));
    }
  }

  function renderSandbox() {
    const box = $('#sandbox'), s = state.sandbox;
    const signedIn = !state.auth || state.auth.state === 'signedIn' || state.auth.state === 'unknown';
    const show = s && ['needed', 'running', 'failed'].includes(s.state) && !state.sandboxDismissed && signedIn;
    box.innerHTML = '';
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const btn = (label, cls, fn) => h('button', { class: 'btn ' + cls, type: 'button', text: label, onclick: fn });
    box.append(h('div', { class: 'ttl', text: STR.sandboxTitle }));
    if (s.state === 'running') {
      box.append(h('div', { class: 'txt' }, h('span', { class: 'spinner' }), ' ' + STR.sandboxRunning));
      return;
    }
    box.append(h('div', { class: 'txt', text: s.state === 'failed' ? STR.sandboxFailed + (s.error || '') : STR.sandboxText }));
    const btns = h('div', { class: 'btns' });
    if (s.state === 'failed' && s.mode !== 'unelevated') btns.append(btn(STR.sandboxNoAdmin, '', () => bridge.post({ type: 'sandboxSetup', mode: 'unelevated' })));
    btns.append(btn(s.state === 'failed' ? STR.signinRetry : STR.sandboxBtn, 'primary', () => bridge.post({ type: 'sandboxSetup', mode: 'elevated' })),
      btn(STR.sandboxLater, '', () => { state.sandboxDismissed = true; renderSandbox(); }));
    box.append(btns);
  }

  function toast(msg) {
    const t = h('div', { class: 'toast', text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 4500);
  }

  // ---------- chips / contexts ----------
  // Is the path below the folder of the open chat? (files outside it show their project or folder, muted)
  function insideCwd(p) { const c = normPath(state.cwd); return !c || normPath(p).startsWith(c + '/'); }
  function chipEl(c, removable) {
    const isMention = c.kind === 'mention';
    if (c.kind === 'plugin') {   // a plugin mention: no file behind it
      const el = h('span', { class: 'chip mention plugin', title: c.path }, h('span', { class: 'gl', html: ICON.plug }), h('span', { class: 'n', text: c.name }));
      if (removable) {
        const x = h('button', { type: 'button', text: '\u00d7', title: STR.removeChip });
        x.addEventListener('click', (e) => { e.stopPropagation(); state.contexts = state.contexts.filter((o) => o !== c); renderChips(); });
        el.append(x);
      }
      return el;
    }
    const label = c.kind === 'selection' ? basename(c.path) + ':' + c.startLine + (c.endLine && c.endLine !== c.startLine ? '-' + c.endLine : '')
      : isMention ? (c.name || basename(c.path)) + (c.folder ? '/' : '') : basename(c.path);
    const glyph = isMention ? h('span', { class: 'gl', html: c.folder ? ICON.folder : ICON.file }) : h('span', { text: c.kind === 'selection' ? '\u2702' : '\u25a4' });
    const el = h('span', { class: 'chip clickable' + (isMention ? ' mention' : ''), title: c.path }, glyph, h('span', { class: 'n', text: label }));
    if (isMention && !insideCwd(c.path)) el.append(h('span', { class: 'sub', text: c.project || basename(dirname(c.path)) }));
    el.addEventListener('click', () => bridge.post({ type: 'openFile', path: c.path, line: c.startLine }));
    if (removable) {
      const x = h('button', { type: 'button', text: '\u00d7', title: STR.removeChip });
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (c.kind === 'file') state.dismissedFile = c.path;
        state.contexts = state.contexts.filter((o) => o !== c);
        syncActive();   // re-shows the active file chip when its attached copy was removed
      });
      el.append(x);
    }
    return el;
  }
  function renderChips() {
    const box = $('#chips');
    box.innerHTML = '';
    state.contexts.forEach((c) => box.append(chipEl(c, true)));
    state.images.forEach((im) => {
      const x = h('button', { type: 'button', text: '\u00d7', title: STR.removeImage, 'aria-label': STR.removeImage });
      x.addEventListener('click', () => { state.images = state.images.filter((o) => o !== im); renderChips(); updateRunning(); });
      box.append(h('span', { class: 'chip imgchip', title: im.name }, h('img', { src: im.url, alt: '' }), h('span', { class: 'n', text: im.name }), x));
    });
    box.classList.toggle('hidden', !state.contexts.length && !state.images.length);
  }

  // ---------- footer ----------
  function winLabel(mins) { return mins == null ? '' : mins <= 300 ? Math.round(mins / 60) + 'h' : mins >= 10080 ? STR.limitWeek : Math.round(mins / 1440) + 'd'; }
  function renderFooter() {
    const t = state.tokenUsage;
    $('#f-tokens').textContent = t ? STR.tokens + ' ' + fmtNum(t.last.totalTokens) + (t.modelContextWindow ? ' / ' + fmtNum(t.modelContextWindow) + ' (' + Math.round(100 * t.last.totalTokens / t.modelContextWindow) + '%)' : '') : '';
    const r = state.rateLimits, parts = [];
    if (r) for (const w of [r.primary, r.secondary]) if (w) parts.push(winLabel(w.windowDurationMins) + ' ' + Math.round(w.usedPercent) + '%');
    $('#f-limits').textContent = parts.join(' · ');
    $('#f-limits').title = 'Codex usage limits (used)';
  }

  // ---------- header / history ----------
  function setTitle(t) { state.title = t || STR.newChat; $('#title').textContent = state.title; $('#title').title = state.title; }
  function setProject(name, cwd) {
    if (cwd != null) state.cwd = cwd;
    state.project = name || (state.cwd ? basename(state.cwd) : '');
    const el = $('#proj');
    el.textContent = state.project;
    el.title = STR.threadProject + state.cwd;
    el.classList.toggle('hidden', !state.project);
    syncActive();
  }
  const normPath = (p) => String(p || '').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  // The active editor belongs to another project than the running thread (only once a thread exists).
  function foreignActive() {
    const a = state.active;
    return !!(state.threadId && a && a.projectPath && normPath(a.projectPath) !== normPath(state.cwd));
  }
  // File chip (only for the thread's project) and the "New chat there" banner.
  function syncActive() {
    const a = state.active;
    state.contexts = state.contexts.filter((c) => c.kind !== 'file');
    // no second chip when the active file is attached already (dropped or picked)
    const attached = a && state.contexts.some((c) => c.kind === 'mention' && normPath(c.path) === normPath(a.path));
    if (a && !attached && a.path !== state.dismissedFile && !foreignActive()) state.contexts.unshift(Object.assign({ kind: 'file' }, a));
    renderChips();
    const b = $('#xproj');
    b.innerHTML = '';
    if (foreignActive()) {
      b.append(h('span', { class: 't', text: STR.activeIn + ' ' + (a.project || basename(a.projectPath)) + '.' }),
        h('button', { class: 'btn', type: 'button', text: STR.newChatThere, onclick: () => bridge.post({ type: 'newChat' }) }));
    }
    b.classList.toggle('hidden', !foreignActive());
  }
  function setConn(s, msg) { const c = $('#conn'); c.className = s; c.title = msg || ''; }
  // ---------- history: all projects, search, project filter, paging ----------
  const hist = state.hist;
  const histQ = $('#hist-q'), histProj = $('#hist-proj'), histList = $('#hist-list');
  let histTimer = null;       // pending debounce of the search box
  const projectLabel = (t) => t.project || basename(t.cwd || '') || '?';

  // Two different folders can carry the same project name; then the badge also names the parent folder.
  function duplicateNames() {
    const seen = new Map(), dup = new Set();
    const note = (cwd, name) => {
      if (!seen.has(name)) seen.set(name, new Set());
      seen.get(name).add(normPath(cwd));
      if (seen.get(name).size > 1) dup.add(name);
    };
    hist.projects.forEach((p) => note(p.cwd, projectLabel(p)));
    hist.rows.forEach((t) => note(t.cwd, projectLabel(t)));
    return dup;
  }
  const badgeText = (t, dup) => (dup.has(projectLabel(t)) ? projectLabel(t) + ' · ' + basename(dirname(t.cwd || '')) : projectLabel(t));

  // The survey of the whole history if it arrived, else the projects of the pages loaded so far.
  function knownProjects() {
    const byKey = new Map();
    hist.projects.forEach((p) => byKey.set(normPath(p.cwd), p));
    hist.rows.forEach((t) => { const k = normPath(t.cwd); if (!byKey.has(k)) byKey.set(k, { cwd: t.cwd, project: t.project, count: 0 }); });
    return Array.from(byKey.values());
  }
  const ideName = () => (host === 'vscode' ? 'VS Code' : 'Eclipse');
  const selectedKeys = () => new Set(hist.cwds.map(normPath));

  // Projects shown in the checklist: the known ones plus selected ones without any chat (e.g. a freshly opened project).
  function projectEntries() {
    const list = knownProjects(), keys = new Set(list.map((p) => normPath(p.cwd)));
    hist.cwds.forEach((c) => {
      const k = normPath(c);
      if (keys.has(k)) return;
      keys.add(k);
      const open = hist.openProjects.find((o) => normPath(o.cwd) === k);
      list.push({ cwd: c, project: (open && open.name) || basename(c), count: 0 });
    });
    return list;
  }

  // The IDE's open projects that have chats (case-insensitive); if none has, the open projects themselves, so the list is empty.
  function pickOpenProjects() {
    const byKey = new Map(knownProjects().map((p) => [normPath(p.cwd), p.cwd]));
    const open = [], seen = new Set();
    hist.openProjects.forEach((o) => {
      const k = normPath(o && o.cwd);
      if (!k || seen.has(k)) return;
      seen.add(k); open.push({ k, cwd: o.cwd });
    });
    const matched = open.filter((o) => byKey.has(o.k)).map((o) => byKey.get(o.k));
    return matched.length ? matched : open.map((o) => o.cwd);
  }
  // Preselects the IDE's open projects unless the user chose by hand; true if the selection changed.
  function autoSelect() {
    if (hist.manual) return false;
    const before = selectedKeys(), next = pickOpenProjects();
    hist.cwds = next;
    return next.length !== before.size || next.some((c) => !before.has(normPath(c)));
  }
  function setSelection(cwds, manual) {
    hist.cwds = cwds; hist.manual = manual; hist.autoLoads = 0;
    refreshProjectUi();
    requestHistory(false);
  }

  function projectButtonText() {
    const n = hist.cwds.length;
    if (!n) return STR.allProjects;
    if (n > 1) return STR.nProjects(n);
    const k = normPath(hist.cwds[0]), p = projectEntries().find((e) => normPath(e.cwd) === k);
    return p ? badgeText(p, duplicateNames()) : basename(hist.cwds[0]);
  }
  const projMenu = $('#proj-menu');
  const projMenuOpen = () => !projMenu.classList.contains('hidden');
  function refreshProjectUi() {
    histProj.querySelector('.lbl').textContent = projectButtonText();
    if (projMenuOpen()) buildProjMenu();
  }
  function buildProjMenu() {
    const active = document.activeElement, keep = active && projMenu.contains(active) ? active.getAttribute('data-k') : null;
    const keys = selectedKeys(), dup = duplicateNames();
    projMenu.innerHTML = '';
    const check = (k, checked, label, title, count, onChange) => {
      const cb = h('input', { type: 'checkbox', 'data-k': k });
      cb.checked = checked;
      cb.addEventListener('change', onChange);
      return h('label', { class: 'pm-row', title: title || null }, cb, h('span', { class: 'pm-name', text: label }), count ? h('span', { class: 'pm-count', text: String(count) }) : null);
    };
    projMenu.append(check('all', !hist.cwds.length, STR.allProjects, null, 0, (e) => {
      if (e.target.checked) setSelection([], true); else e.target.checked = true;   // "All" is what an empty selection means
    }));
    if (hist.openProjects.length) {
      projMenu.append(h('button', { class: 'pm-row pm-open', type: 'button', 'data-k': 'open', text: STR.openIn(ideName()),
        onclick: () => { hist.manual = false; autoSelect(); setSelection(hist.cwds, false); } }));
    }
    const entries = projectEntries();
    if (entries.length) projMenu.append(h('div', { class: 'pm-sep' }));
    entries.forEach((p) => {
      const k = normPath(p.cwd);
      projMenu.append(check('p:' + k, keys.has(k), badgeText(p, dup), p.cwd, p.count, (e) => {
        const rest = hist.cwds.filter((c) => normPath(c) !== k);
        setSelection(e.target.checked ? rest.concat([p.cwd]) : rest, true);
      }));
    });
    if (keep) { const again = Array.from(projMenu.querySelectorAll('[data-k]')).find((x) => x.getAttribute('data-k') === keep); if (again) again.focus(); }
  }
  function placeProjMenu() {
    const a = app.getBoundingClientRect(), b = histProj.getBoundingClientRect();
    const w = Math.min(320, a.width - 16);
    projMenu.style.width = w + 'px';
    projMenu.style.left = Math.max(8, Math.min(b.left - a.left, a.width - w - 8)) + 'px';
    projMenu.style.top = (b.bottom - a.top + 4) + 'px';
    projMenu.style.maxHeight = Math.max(120, a.height - (b.bottom - a.top) - 12) + 'px';
  }
  function openProjMenu() {
    projMenu.classList.remove('hidden');
    histProj.setAttribute('aria-expanded', 'true');
    buildProjMenu(); placeProjMenu();
    const first = projMenu.querySelector('input:checked') || projMenu.querySelector('input,button');
    if (first) first.focus();
  }
  function closeProjMenu(refocus) {
    if (!projMenuOpen()) return;
    projMenu.classList.add('hidden');
    histProj.setAttribute('aria-expanded', 'false');
    if (refocus) histProj.focus();
  }
  histProj.addEventListener('click', (e) => { e.stopPropagation(); if (projMenuOpen()) closeProjMenu(false); else openProjMenu(); });
  projMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeProjMenu(true); return; }
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const items = Array.from(projMenu.querySelectorAll('input,button')), i = items.indexOf(document.activeElement);
    const next = items[Math.max(0, Math.min(items.length - 1, i + step))];
    if (next) next.focus();
  });
  projMenu.addEventListener('focusout', (e) => {   // Tab out of the checklist closes it
    const to = e.relatedTarget;
    if (to && !projMenu.contains(to) && to !== histProj) closeProjMenu(false);
  });
  window.addEventListener('resize', () => { if (projMenuOpen()) placeProjMenu(); });
  refreshProjectUi();

  function highlight(text, words) {
    if (!words.length) return [text];
    const lower = text.toLowerCase(), marks = [];
    words.forEach((w) => { for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + w.length)) marks.push([i, i + w.length]); });
    marks.sort((a, b) => a[0] - b[0]);
    const out = [];
    let pos = 0;
    for (const [from, to] of marks) {
      if (to <= pos) continue;
      const start = Math.max(from, pos);
      out.push(text.slice(pos, start), h('mark', { text: text.slice(start, to) }));
      pos = to;
    }
    out.push(text.slice(pos));
    return out;
  }

  function renderHistory() {
    // a re-render (e.g. the next page arriving) must not drop the focus of a row button (confirm row, archive, delete)
    const ae = document.activeElement;
    const keep = ae && histList.contains(ae) && ae.dataset.act ? { id: ae.closest('.row') && ae.closest('.row').dataset.id, act: ae.dataset.act } : null;
    histList.innerHTML = '';
    const words = hist.query.toLowerCase().split(/\s+/).filter(Boolean);
    const dup = duplicateNames();
    if (hist.error) histList.append(h('div', { class: 'empty', text: STR.historyError + hist.error }));
    else if (!hist.rows.length && !hist.loading) {
      histList.append(h('div', { class: 'empty' }, h('div', { text: hist.archived ? STR.noArchived : STR.noHistory }), h('div', { class: 'hint', text: STR.noHistoryHint }),
        hist.cwds.length ? h('button', { class: 'more', type: 'button', text: STR.showAllProjects, onclick: () => setSelection([], true) }) : null));
    }
    hist.sel = Math.max(0, Math.min(hist.sel, hist.rows.length - 1));
    hist.rows.forEach((t, i) => {
      const asking = hist.confirm === t.id, busy = hist.busy.has(t.id);
      const row = h('div', { class: 'row' + (t.id === state.threadId ? ' current' : '') + (i === hist.sel ? ' sel' : '') + (asking ? ' asking' : '') + (busy ? ' busy' : ''), title: t.cwd || '', role: 'option', 'data-id': t.id, 'aria-busy': busy ? 'true' : null },
        h('span', { class: 'proj' }, highlight(badgeText(t, dup), words)),
        h('span', { class: 't' }, highlight(t.title || STR.untitled, words)),
        h('span', { class: 'when', text: relTimeAgo(t.updatedAt) }));
      if (asking) {
        // inline confirmation: deleting cannot be undone
        const no = h('button', { class: 'btn', type: 'button', 'data-act': 'cancel', text: STR.deleteNo, onclick: (e) => { e.stopPropagation(); askDelete(null, t.id); } });
        const yes = h('button', { class: 'btn danger', type: 'button', 'data-act': 'confirm', text: STR.deleteYes, onclick: (e) => { e.stopPropagation(); threadAction('delete', t); } });
        row.append(h('span', { class: 'confirm', role: 'alertdialog', 'aria-label': STR.deleteAsk }, h('span', { class: 'q', text: STR.deleteAsk }), yes, no));
        row.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); askDelete(null, t.id); } });
      } else if (!busy) {
        const act = (kind, icon, label, fn) => h('button', { class: 'ract', type: 'button', 'data-act': kind, title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn(); } }, h('span', { html: icon }));
        row.append(h('span', { class: 'ractions' },
          hist.archived ? act('unarchive', ICON.unarchive, STR.unarchive, () => threadAction('unarchive', t)) : act('archive', ICON.archive, STR.archive, () => threadAction('archive', t)),
          act('delete', ICON.trash, STR.deleteChat, () => askDelete(t.id))));
      }
      row.addEventListener('click', () => { if (!asking && !busy) openHistoryRow(t); });
      row.addEventListener('mousemove', () => { if (hist.sel !== i) selectHistoryRow(i, false); });
      histList.append(row);
    });
    if (hist.loading) histList.append(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ' ' + STR.historyLoading));
    else if (hist.next) histList.append(h('button', { class: 'more', type: 'button', text: STR.historyMore, onclick: () => requestHistory(true) }));
    if (keep && keep.id) {
      const b = histList.querySelector('.row[data-id="' + CSS.escape(keep.id) + '"] [data-act="' + keep.act + '"]');
      if (b) b.focus({ preventScroll: true });
    }
  }
  // Archive / unarchive / delete: the host answers with a "threadAction" event (ok or error); the row stays dimmed meanwhile.
  // id = row to ask about (null: cancel; back = the row whose delete button gets the focus back)
  function askDelete(id, back) {
    if (id && hist.busy.has(id)) return;
    hist.confirm = id;
    renderHistory();
    if (id) { const b = histList.querySelector('.row.asking [data-act="cancel"]'); if (b) b.focus(); }
    else refocusHistory(back);
  }
  function refocusHistory(id) {
    const b = id && histList.querySelector('.row[data-id="' + CSS.escape(id) + '"] [data-act="delete"]');
    (b || histQ).focus();
  }
  function threadAction(action, t) {
    hist.confirm = null; hist.busy.add(t.id);
    renderHistory();
    refocusHistory(null);   // the buttons of the row are gone: keep the focus in the panel
    bridge.post({ type: 'threadAction', action, threadId: t.id });
  }
  const ACTION_VERB = { archive: 'archive', unarchive: 'unarchive', delete: 'delete' };
  function onThreadAction(ev) {
    hist.busy.delete(ev.threadId);
    if (!ev.ok) { toast(STR.actionFailed(ACTION_VERB[ev.action] || ev.action, ev.error)); renderHistory(); return; }
    const gone = hist.rows.find((t) => t.id === ev.threadId);
    hist.rows = hist.rows.filter((t) => t.id !== ev.threadId);
    if (gone) {   // the project checklist counts chats that are not archived: keep it right until the host's fresh survey arrives
      const k = normPath(gone.cwd), p = hist.projects.find((x) => normPath(x.cwd) === k);
      if (p) p.count = Math.max(0, (p.count || 0) + (ev.action === 'unarchive' ? 1 : -1));
    }
    toast(ev.action === 'delete' ? STR.chatDeleted : ev.action === 'archive' ? STR.chatArchived : STR.chatUnarchived);
    refreshProjectUi(); renderHistory();
    // the open chat is gone from the list of chats: start a fresh one
    if (ev.threadId === state.threadId && ev.action !== 'unarchive') bridge.post({ type: 'newChat' });
  }
  function selectHistoryRow(i, scroll) {
    const rows = histList.querySelectorAll('.row');
    rows.forEach((r, k) => r.classList.toggle('sel', k === i));
    hist.sel = i;
    if (scroll && rows[i]) rows[i].scrollIntoView({ block: 'nearest' });
  }
  function openHistoryRow(t) {
    toggleHistory(false);
    bridge.post({ type: 'resumeThread', threadId: t.id });
  }

  // The answer to the newest request replaces (or, for "Load more", extends) the list; answers to older keystrokes are dropped.
  function requestHistory(append, withProjects) {
    hist.reqId++;
    hist.loading = true; hist.error = null;
    if (!append) hist.sel = 0;
    renderHistory();
    bridge.post({ type: 'listThreads', requestId: hist.reqId, query: hist.query, cwds: hist.cwds.slice(), manual: hist.manual, cursor: append ? hist.next : null, projects: !!withProjects, archived: hist.archived });
  }
  function onThreads(ev) {
    if (ev.requestId !== hist.reqId) return;
    hist.loading = false; hist.error = ev.error || null;
    const data = ev.data || [];
    if (ev.append) {
      const have = new Set(hist.rows.map((t) => t.id));
      hist.rows = hist.rows.concat(data.filter((t) => !have.has(t.id)));
    } else { hist.rows = data; hist.sel = 0; }
    hist.next = ev.error ? (ev.append ? hist.next : null) : (ev.nextCursor || null);   // a failed "Load more" can be retried
    refreshProjectUi(); renderHistory();
    // a short page has no scrollbar that could trigger the next load: keep filling the panel (bounded)
    if (hist.next && !hist.error && histList.scrollHeight <= histList.clientHeight + 4 && hist.autoLoads < 6) { hist.autoLoads++; requestHistory(true); }
    else hist.autoLoads = 0;
  }
  function toggleHistory(open) {
    state.historyOpen = open == null ? !state.historyOpen : open;
    $('#history').classList.toggle('hidden', !state.historyOpen);
    if (!state.historyOpen) { closeProjMenu(false); if (hist.confirm) { hist.confirm = null; renderHistory(); } return; }
    if (state.settingsOpen) toggleSettings(false, true);
    histQ.value = hist.query;
    $('#hist-archived').checked = hist.archived;
    hist.autoLoads = 0;
    autoSelect();           // the IDE's open projects (no-op once the user chose by hand)
    refreshProjectUi();
    requestHistory(false, true);
    histQ.focus(); histQ.select();
  }
  function closeHistory() { toggleHistory(false); input.focus(); }

  histQ.addEventListener('input', () => {
    clearTimeout(histTimer);
    histTimer = setTimeout(applyHistoryQuery, 200);
  });
  $('#hist-archived').addEventListener('change', (e) => { hist.archived = e.target.checked; hist.confirm = null; hist.autoLoads = 0; hist.rows = []; hist.next = null; requestHistory(false); });
  function applyHistoryQuery() {
    histTimer = null;
    hist.query = histQ.value.trim(); hist.autoLoads = 0;
    requestHistory(false);
  }
  histList.addEventListener('scroll', () => {
    if (hist.next && !hist.loading && histList.scrollTop + histList.clientHeight >= histList.scrollHeight - 80) requestHistory(true);
  });
  $('#history').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (projMenuOpen()) closeProjMenu(true); else if (hist.confirm) askDelete(null, hist.confirm); else closeHistory();
      return;
    }
    if (e.target === histProj) return;
    if (e.key === 'Delete' && !hist.confirm) {
      // Delete on a focused row button asks about that row, anywhere else about the selected row (in the search box only with Ctrl)
      const inRow = e.target.closest && e.target.closest('.row'), id = inRow ? inRow.dataset.id : hist.rows[hist.sel] && hist.rows[hist.sel].id;
      const typing = e.target === histQ || e.target.id === 'hist-archived';
      if (id && (!typing || (e.target === histQ && e.ctrlKey))) { e.preventDefault(); askDelete(id); return; }
    }
    if (hist.confirm) return;   // the confirmation row handles its own keys
    histList.classList.add('kb');
    const last = hist.rows.length - 1, step = { ArrowDown: 1, ArrowUp: -1, PageDown: 6, PageUp: -6 }[e.key];
    if (step) { e.preventDefault(); if (last >= 0) selectHistoryRow(Math.max(0, Math.min(hist.sel + step, last)), true); }
    else if (e.key === 'Enter' && e.target === histQ) {
      e.preventDefault();
      if (histTimer) { clearTimeout(histTimer); applyHistoryQuery(); return; }   // Enter right after typing: search first, do not open a stale row
      if (hist.rows[hist.sel]) openHistoryRow(hist.rows[hist.sel]);
    }
  });

  // ---------- pickers ----------
  const userHidden = (model) => state.settings.hiddenModels.includes(model);
  function fillModels() {
    selModel.innerHTML = '';
    selModel.append(h('option', { value: '', text: STR.modelDefault }));
    state.models.filter((m) => !m.hidden && !userHidden(m.model)).forEach((m) => selModel.append(h('option', { value: m.model, text: m.displayName || m.model })));
    const cur = state.prefs.model, known = cur && state.models.find((m) => m.model === cur);
    // the model of this chat stays selectable even when it is hidden (by Codex or in the settings) or unknown
    if (cur && (!known || known.hidden || userHidden(cur))) selModel.append(h('option', { value: cur, text: (known && known.displayName || cur) + (known ? STR.hiddenMark : '') }));
    selModel.value = state.prefs.model || '';
    fillEfforts();
  }
  function fillEfforts() {
    selEffort.innerHTML = '';
    selEffort.append(h('option', { value: '', text: STR.effortDefault }));
    const m = state.models.find((x) => x.model === state.prefs.model) || state.models.find((x) => x.isDefault) || state.models[0];
    const efforts = m ? (m.supportedReasoningEfforts || []).map((e) => e.reasoningEffort) : ['low', 'medium', 'high'];
    efforts.forEach((e) => selEffort.append(h('option', { value: e, text: EFFORT_LABEL[e] || e })));
    if (state.prefs.effort && !efforts.includes(state.prefs.effort)) state.prefs.effort = '';
    selEffort.value = state.prefs.effort || '';
  }
  // ---------- permissions (one control: sandbox + approval policy + reviewer, mapped by the host) ----------
  const PERMS = ['ask', 'auto', 'full', 'custom'];
  const PERM_ICON = { ask: ICON.hand, auto: ICON.shield, full: ICON.warn, custom: ICON.cog };
  const normPerm = (p) => (PERMS.includes(p) ? p : 'ask');
  // Older hosts / stored values: mode (read-only | auto | full) x approvals (user | auto_review)
  function migratePerm(pr) {
    if (PERMS.includes(pr.permissions)) return;
    pr.permissions = pr.mode === 'full' ? 'full' : pr.mode === 'auto' && pr.approvals === 'auto_review' ? 'auto' : 'ask';
  }
  function fillPerm() {
    migratePerm(state.prefs);
    const k = normPerm(state.prefs.permissions), b = $('#perm');
    $('.pi', b).innerHTML = PERM_ICON[k];
    $('.pl', b).textContent = STR.permLabels[k];
    b.classList.toggle('danger', k === 'full');
    b.title = STR.permButton + ' (' + STR.permLabels[k] + '): ' + STR.permDescs[k];
  }
  function postPrefs() { bridge.post({ type: 'prefs', model: state.prefs.model, effort: state.prefs.effort, permissions: normPerm(state.prefs.permissions) }); }
  selModel.addEventListener('change', () => { state.prefs.model = selModel.value; fillEfforts(); postPrefs(); });
  selEffort.addEventListener('change', () => { state.prefs.effort = selEffort.value; postPrefs(); });
  // ---------- defaults for new chats (IDE settings) ----------
  const normSettings = (o) => ({ defaultModel: String((o && o.defaultModel) || ''), defaultReasoningEffort: String((o && o.defaultReasoningEffort) || ''),
    hiddenModels: Array.isArray(o && o.hiddenModels) ? o.hiddenModels.map(String) : [] });
  function resolvedDefaultModel() {
    const dm = state.settings.defaultModel;
    if (!dm) return '';
    if (!state.models.length) return dm;   // not loaded yet: trust the setting
    const m = state.models.find((x) => x.model === dm);
    return m && !m.hidden && !userHidden(dm) ? dm : '';
  }
  // model whose efforts apply: the given one, else the default model of Codex, else the first
  function modelFor(id) { return state.models.find((x) => x.model === id) || state.models.find((x) => x.isDefault) || state.models[0] || null; }
  function applyDefaults() {
    state.prefs.model = resolvedDefaultModel();
    const eff = state.settings.defaultReasoningEffort, m = modelFor(state.prefs.model);
    state.prefs.effort = eff && (!m || (m.supportedReasoningEfforts || []).some((e) => e.reasoningEffort === eff)) ? eff : '';
    if (state.models.length) state.defaultsApplied = true;
    fillModels(); postPrefs();
  }
  const chatIsEmpty = () => !state.threadId && !state.hasContent && !state.pending;
  // The model Codex would use now (the plan mode settings need a concrete one).
  function effectiveModel() {
    if (state.prefs.model) return state.prefs.model;
    const m = state.models.find((x) => x.isDefault) || state.models[0];
    return m ? m.model : '';
  }

  // ---------- in-panel settings: default model / effort, models of the picker ----------
  const setBox = $('#settings'), setBody = $('#set-body'), gearBtn = $('#btn-set');
  const listedModels = () => state.models.filter((m) => !m.hidden);   // everything Codex does not hide itself
  function saveSettings(patch) {
    state.settings = normSettings(Object.assign({}, state.settings, patch));
    const st = state.settings;
    bridge.post({ type: 'settingsSave', defaultModel: st.defaultModel, defaultReasoningEffort: st.defaultReasoningEffort, hiddenModels: st.hiddenModels.slice() });
    if (chatIsEmpty()) applyDefaults(); else fillModels();   // an open chat keeps its model
    renderSettings();
  }
  function renderSettings() {
    if (!state.settingsOpen) return;
    const ae = document.activeElement, keep = ae && ae.id && setBody.contains(ae) ? ae.id : null;
    const st = state.settings, models = listedModels();
    setBody.innerHTML = '';
    const field = (id, label, hint, control) => h('div', { class: 'set-field' }, h('label', { for: id, text: label }), control,
      h('div', { class: 'hint', id: id + '-hint', text: hint }));
    // 1. default model
    const selM = h('select', { id: 'set-model', 'aria-describedby': 'set-model-hint' }, h('option', { value: '', text: STR.codexDefault }));
    models.forEach((m) => selM.append(h('option', { value: m.model, text: (m.displayName || m.model) + (userHidden(m.model) ? STR.hiddenMark : '') })));
    if (st.defaultModel && !models.some((m) => m.model === st.defaultModel)) selM.append(h('option', { value: st.defaultModel, text: st.defaultModel }));
    selM.value = st.defaultModel;
    selM.addEventListener('change', () => {
      const m = modelFor(selM.value), ok = (m ? (m.supportedReasoningEfforts || []).map((e) => e.reasoningEffort) : []).includes(st.defaultReasoningEffort);
      saveSettings({ defaultModel: selM.value, defaultReasoningEffort: ok ? st.defaultReasoningEffort : '' });
    });
    // 2. default effort: only what the model of choice supports
    const m0 = modelFor(st.defaultModel), efforts = m0 ? (m0.supportedReasoningEfforts || []).map((e) => e.reasoningEffort) : [];
    const selE = h('select', { id: 'set-effort', 'aria-describedby': 'set-effort-hint' }, h('option', { value: '', text: STR.modelDefaultEffort }));
    efforts.forEach((e) => selE.append(h('option', { value: e, text: EFFORT_LABEL[e] || e })));
    selE.value = efforts.includes(st.defaultReasoningEffort) ? st.defaultReasoningEffort : '';
    selE.addEventListener('change', () => saveSettings({ defaultReasoningEffort: selE.value }));
    // 3. models of the picker (at least one stays visible)
    const visible = models.filter((m) => !userHidden(m.model));
    const fs = h('fieldset', { class: 'set-models', 'aria-describedby': 'set-models-hint' }, h('legend', { text: STR.setModels }),
      h('div', { class: 'hint', id: 'set-models-hint', text: STR.setModelsHint }));
    if (!models.length) fs.append(h('div', { class: 'hint', text: STR.setNoModels }));
    models.forEach((m, i) => {
      const on = !userHidden(m.model);
      const cb = h('input', { type: 'checkbox', id: 'set-m' + i, disabled: on && visible.length <= 1 });
      cb.checked = on;
      cb.addEventListener('change', () => {
        const rest = st.hiddenModels.filter((x) => x !== m.model);
        saveSettings({ hiddenModels: cb.checked ? rest : rest.concat(m.model) });
      });
      fs.append(h('label', { class: 'set-model', for: 'set-m' + i }, cb,
        h('span', { class: 'mt' }, h('b', { text: m.displayName || m.model }), m.description ? h('span', { class: 'md', text: m.description }) : null)));
    });
    setBody.append(field('set-model', STR.setDefaultModel, STR.setDefaultModelHint, selM), field('set-effort', STR.setDefaultEffort, STR.setDefaultEffortHint, selE), fs,
      h('button', { class: 'set-link', type: 'button', id: 'set-more', text: STR.setMore, onclick: () => bridge.post({ type: 'openSettings' }) }));
    const again = keep && document.getElementById(keep);
    if (again && !again.disabled) again.focus();
  }
  // quiet: the history is opening (the focus must not go back to the gear)
  function toggleSettings(open, quiet) {
    const was = state.settingsOpen;
    state.settingsOpen = open == null ? !was : !!open;
    if (state.settingsOpen === was) return;
    setBox.classList.toggle('hidden', !state.settingsOpen);
    gearBtn.setAttribute('aria-expanded', String(state.settingsOpen));
    ['#topbar', '#feed', '#dock'].forEach((sel) => { $(sel).toggleAttribute('inert', state.settingsOpen); });
    if (state.settingsOpen) {
      if (state.historyOpen) toggleHistory(false);
      closePops(false);
      renderSettings();
      $('#set-back').focus();
    } else if (!quiet) (gearBtn.offsetParent !== null ? gearBtn : input).focus();
  }
  $('#set-back').addEventListener('click', () => toggleSettings(false));
  setBox.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleSettings(false); } });

  // ---------- popup menus above the composer (permissions, "+") ----------
  const popBox = { plus: $('#plus-menu'), perm: $('#perm-menu') };
  const popBtn = { plus: $('#plus'), perm: $('#perm') };
  let popOpen = null;
  const popItems = (box) => Array.from(box.querySelectorAll('.pm-item:not([disabled])'));
  function openPop(name) {
    closePops(false);
    closeMention();
    popOpen = name;
    (name === 'plus' ? buildPlusMenu : buildPermMenu)();
    popBox[name].classList.remove('hidden');
    popBtn[name].setAttribute('aria-expanded', 'true');
    const first = popBox[name].querySelector('[aria-checked="true"]') || popItems(popBox[name])[0];
    if (first) first.focus();
    if (name === 'plus') ensurePlugins(false);
  }
  function closePops(refocus) {
    if (!popOpen) return;
    const name = popOpen;
    popOpen = null;
    popBox[name].classList.add('hidden');
    popBtn[name].setAttribute('aria-expanded', 'false');
    if (refocus) popBtn[name].focus();
  }
  Object.keys(popBox).forEach((name) => {
    popBtn[name].addEventListener('click', (e) => { e.stopPropagation(); if (popOpen === name) closePops(false); else openPop(name); });
    popBox[name].addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePops(true); return; }
      if (e.key === 'Tab') { closePops(false); return; }
      const items = popItems(popBox[name]), i = items.indexOf(document.activeElement);
      let to = null;
      if (e.key === 'ArrowDown') to = items[(i + 1) % items.length];
      else if (e.key === 'ArrowUp') to = items[(i - 1 + items.length) % items.length];
      else if (e.key === 'Home') to = items[0];
      else if (e.key === 'End') to = items[items.length - 1];
      if (to) { e.preventDefault(); to.focus(); to.scrollIntoView({ block: 'nearest' }); }
    });
    popBtn[name].addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popOpen === name) { e.preventDefault(); e.stopPropagation(); closePops(true); }
      else if (e.key === 'ArrowUp' && popOpen !== name) { e.preventDefault(); openPop(name); }
    });
  });
  document.addEventListener('click', (e) => {
    if (!popOpen) return;
    const path = e.composedPath();
    if (!path.includes(popBox[popOpen]) && !path.includes(popBtn[popOpen])) closePops(false);
  });
  function menuItem(opts) {
    const it = h('button', { class: 'pm-item' + (opts.warn ? ' warn' : '') + (opts.inline ? ' inline' : ''), type: 'button', role: opts.role || 'menuitem', title: opts.title || null },
      h('span', opts.iconHtml ? { class: 'ic', html: opts.iconHtml } : { class: 'ic' }, opts.iconEl || null),
      h('span', { class: 'tx' }, h('span', { class: 'nm', text: opts.name }), opts.desc ? h('span', { class: 'ds', text: opts.desc }) : null),
      h('span', { class: 'ck', html: opts.checked ? ICON.check : '' }));
    if (opts.checked != null) it.setAttribute('aria-checked', String(!!opts.checked));
    it.addEventListener('click', opts.onclick);
    return it;
  }
  function buildPermMenu() {
    const box = popBox.perm, cur = normPerm(state.prefs.permissions);
    box.innerHTML = '';
    box.append(h('div', { class: 'pm-title', text: STR.permTitle }));
    PERMS.forEach((k) => box.append(menuItem({
      name: STR.permLabels[k], desc: STR.permDescs[k], iconHtml: PERM_ICON[k], warn: k === 'full', role: 'menuitemradio', checked: k === cur,
      onclick: () => { state.prefs.permissions = k; fillPerm(); postPrefs(); closePops(true); }
    })));
  }

  // ---------- "+" menu: files, goal, plan mode, sketch, plugins ----------
  function buildPlusMenu() {
    const box = popBox.plus, keep = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
    box.innerHTML = '';
    const add = (key, o) => { const it = menuItem(o); it.setAttribute('data-k', key); box.append(it); return it; };
    box.append(h('div', { class: 'pm-title', text: STR.plusAdd }));
    if (host === 'vscode') {
      add('files', { name: STR.plusFiles, desc: STR.plusFilesHint, inline: true, iconHtml: ICON.clip, onclick: () => { closePops(false); bridge.post({ type: 'pickFiles', folder: false }); } });
    } else {   // SWT has separate dialogs for files and for a folder
      add('files', { name: STR.plusFilesOnly, desc: STR.plusFilesHint, inline: true, iconHtml: ICON.clip, onclick: () => { closePops(false); bridge.post({ type: 'pickFiles', folder: false }); } });
      add('folder', { name: STR.plusFolder, desc: STR.plusFilesHint, inline: true, iconHtml: ICON.folder, onclick: () => { closePops(false); bridge.post({ type: 'pickFiles', folder: true }); } });
    }
    add('goal', { name: STR.plusGoal, desc: STR.plusGoalHint, inline: true, iconHtml: ICON.target, onclick: () => { closePops(false); openGoalForm(); } });
    add('plan', { name: STR.plusPlan, desc: state.planMode ? STR.plusPlanOn : STR.plusPlanHint, inline: true, iconHtml: ICON.bulb, role: 'menuitemcheckbox', checked: state.planMode,
      onclick: () => { setPlanMode(!state.planMode); closePops(true); } });
    add('sketch', { name: STR.plusSketch, desc: STR.plusSketchHint, inline: true, iconHtml: ICON.pen, onclick: () => { closePops(false); openSketch(); } });
    box.append(h('div', { class: 'pm-title', text: STR.plusPlugins }));
    const pl = state.plugins;
    if (pl.error) box.append(h('div', { class: 'pm-note', text: STR.pluginsError + pl.error }));
    else if (!pl.items) box.append(h('div', { class: 'pm-note', text: STR.pluginsLoading }));
    else if (!pl.items.length) box.append(h('div', { class: 'pm-note', text: STR.pluginsNone }));
    else pl.items.forEach((p) => {
      const icon = p.icon ? h('img', { src: p.icon, alt: '' }) : h('span', { class: 'lt', style: p.brandColor ? 'background:' + p.brandColor : null, text: (p.name || '?').slice(0, 1).toUpperCase() });
      add('plugin:' + p.id, { name: p.name, desc: p.description || '', inline: true, title: (p.description || p.name), iconEl: icon, onclick: () => { addPluginChip(p); closePops(false); input.focus(); } });
    });
    if (keep) { const again = Array.from(box.querySelectorAll('[data-k]')).find((x) => x.getAttribute('data-k') === keep); if (again) again.focus(); }
  }
  function ensurePlugins(force) {
    const pl = state.plugins;
    if (pl.loading || (!force && pl.items && Date.now() - pl.at < 60000)) return;
    pl.loading = true; pl.error = null;
    bridge.post({ type: 'listPlugins' });
  }
  function onPlugins(ev) {
    const pl = state.plugins;
    pl.loading = false; pl.at = Date.now(); pl.error = ev.error || null;
    pl.items = ev.error ? (pl.items || []) : (ev.items || []);
    if (popOpen === 'plus') buildPlusMenu();
  }
  function addPluginChip(p) {
    const path = 'plugin://' + (p.mention || p.id);
    if (state.contexts.some((c) => c.kind === 'plugin' && c.path === path)) return;
    state.contexts.push({ kind: 'plugin', path, name: p.name, mention: p.mention || p.id });
    renderChips();
  }
  function setPlanMode(on) {
    state.planMode = !!on;
    renderCChips();
  }
  function renderCChips() {
    const box = $('#cchips');
    box.innerHTML = '';
    box.classList.toggle('hidden', !state.planMode);
    if (state.planMode) {
      const chip = h('button', { class: 'cchip', type: 'button', title: STR.planChipOff },
        h('span', { class: 'gl', html: ICON.bulb }), h('span', { text: STR.planChip }), h('span', { class: 'x', html: ICON.close }));
      chip.addEventListener('click', () => { setPlanMode(false); input.focus(); });
      box.append(chip);
    }
  }

  // ---------- goal ----------
  function openGoalForm() {
    state.goalForm = true; renderGoal();
    const f = $('#goal-in'); if (f) f.focus();
  }
  function renderGoal() {
    const box = $('#goal'), g = state.goal;
    box.innerHTML = '';
    if (state.goalForm) {
      const inp = h('input', { id: 'goal-in', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: STR.goalPlaceholder, 'aria-label': STR.plusGoalHint });
      const submit = () => {
        const objective = inp.value.trim();
        if (!objective) return;
        state.goalForm = false; renderGoal();
        bridge.post({ type: 'goalSet', objective, model: state.prefs.model, defaultModel: effectiveModel(), effort: state.prefs.effort, permissions: normPerm(state.prefs.permissions) });
      };
      const cancel = () => { state.goalForm = false; renderGoal(); input.focus(); };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      });
      box.className = 'form';
      box.append(h('span', { class: 'gl', html: ICON.target }), inp,
        h('button', { class: 'btn primary', type: 'button', text: STR.goalSet, onclick: submit }),
        h('button', { class: 'btn', type: 'button', text: STR.cancel, onclick: cancel }));
      return;
    }
    box.classList.toggle('hidden', !g);
    box.className = g ? 'banner ' + (g.status || '') : 'hidden';
    if (!g) return;
    const tok = fmtNum(g.tokensUsed || 0) + (g.tokenBudget ? ' / ' + fmtNum(g.tokenBudget) : '') + ' tokens';
    const info = [STR.goalStatus[g.status] || g.status, tok];
    if (g.timeUsedSeconds) info.push(fmtDur(g.timeUsedSeconds * 1000));
    box.append(h('span', { class: 'gl', html: ICON.target }),
      h('span', { class: 'gt', title: g.objective || '' }, h('b', { text: STR.goalLabel + ': ' }), g.objective || ''),
      h('span', { class: 'gs', text: info.join(' \u00b7 ') }),
      h('button', { class: 'x', type: 'button', title: STR.goalClear, 'aria-label': STR.goalClear, html: ICON.close, onclick: () => bridge.post({ type: 'goalClear' }) }));
  }

  // ---------- images: paste, drop, sketch ----------
  const MAX_IMAGES = 8, MAX_SIDE = 2048;
  function addImageUrl(url, name) {
    if (state.images.length >= MAX_IMAGES) { toast(STR.imageTooMany); return; }
    state.images.push({ url, name: name || STR.pastedImage });
    renderChips(); updateRunning();
  }
  // Any image file or blob: read it, scale it down to MAX_SIDE and keep it as a PNG data URL.
  function addImageFile(file, name) {
    const fr = new FileReader();
    fr.onerror = () => toast(STR.imageFailed);
    fr.onload = () => {
      const src = String(fr.result || '');
      const img = new Image();
      img.onerror = () => toast(STR.imageFailed);
      img.onload = () => {
        const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
        if (k === 1 && /^data:image\/png/.test(src)) { addImageUrl(src, name || file.name); return; }
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        addImageUrl(c.toDataURL('image/png'), name || file.name);
      };
      img.src = src;
    };
    fr.readAsDataURL(file);
  }
  input.addEventListener('paste', (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []).filter((i) => i.kind === 'file' && /^image\//.test(i.type));
    if (!items.length) return;
    e.preventDefault();
    items.forEach((i) => { const f = i.getAsFile(); if (f) addImageFile(f, STR.pastedImage); });
  });

  // Sketch: a white canvas over the view with pen, eraser, colours, clear; "Attach" adds it as a PNG image.
  const SKETCH_COLORS = ['#111111', '#e03131', '#1971c2', '#2f9e44', '#f08c00'];
  function closeSketch(refocus) {
    const box = $('#sketch');
    box.classList.add('hidden'); box.innerHTML = '';
    if (refocus) input.focus();
  }
  function openSketch() {
    const box = $('#sketch');
    box.innerHTML = '';
    box.classList.remove('hidden');
    let color = SKETCH_COLORS[0], size = 4, eraser = false;
    const canvas = h('canvas', { class: 'sk-canvas', 'aria-label': STR.sketchTitle });
    const ctx = canvas.getContext('2d');
    const tool = (label, icon, fn) => h('button', { class: 'tool', type: 'button', title: label, 'aria-label': label, html: icon, onclick: fn });
    const penBtn = tool(STR.sketchPen, ICON.pen, () => setTool(false));
    const eraseBtn = h('button', { class: 'tool txt', type: 'button', text: STR.sketchEraser, title: STR.sketchEraser, onclick: () => setTool(true) });
    function setTool(er) { eraser = er; penBtn.setAttribute('aria-pressed', String(!er)); eraseBtn.setAttribute('aria-pressed', String(er)); }
    const swatches = SKETCH_COLORS.map((c) => {
      const b = h('button', { class: 'sw', type: 'button', style: 'background:' + c, title: STR.sketchColor + ' ' + c, 'aria-label': STR.sketchColor + ' ' + c, 'aria-pressed': String(c === color) });
      b.addEventListener('click', () => { color = c; setTool(false); swatches.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      return b;
    });
    const range = h('input', { type: 'range', min: '1', max: '24', value: String(size), title: STR.sketchSize, 'aria-label': STR.sketchSize });
    range.addEventListener('input', () => { size = parseInt(range.value, 10) || 4; });
    const clear = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); };
    const done = () => { addImageUrl(canvas.toDataURL('image/png'), STR.sketchName); closeSketch(true); };
    const bar = h('div', { class: 'sk-bar' }, penBtn, eraseBtn, h('span', { class: 'sws' }, swatches), range,
      h('button', { class: 'btn', type: 'button', text: STR.sketchClear, onclick: clear }), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: STR.sketchCancel, onclick: () => closeSketch(true) }),
      h('button', { class: 'btn primary', type: 'button', text: STR.sketchDone, onclick: done }));
    const wrap = h('div', { class: 'sk-wrap' }, canvas);
    box.append(h('div', { class: 'sk-title', text: STR.sketchTitle }), bar, wrap);
    setTool(false);
    {   // the overlay is laid out already: size the bitmap to the surface (device pixels) and paint it white
      const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      clear();
    }
    let last = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
    const scale = () => canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ }
      last = pos(e);
      ctx.fillStyle = eraser ? '#ffffff' : color;
      ctx.beginPath(); ctx.arc(last[0], last[1], (eraser ? size * 3 : size) * scale() / 2, 0, Math.PI * 2); ctx.fill();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = pos(e);
      ctx.strokeStyle = eraser ? '#ffffff' : color;
      ctx.lineWidth = (eraser ? size * 3 : size) * scale();
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      last = p;
    });
    const stop = () => { last = null; };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
    box.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSketch(true); return; }
      if (e.key === 'Tab') {   // keep the focus inside the dialog
        const f = Array.from(box.querySelectorAll('button,input')).filter((x) => !x.disabled);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        const to = e.shiftKey ? (i <= 0 ? f[f.length - 1] : f[i - 1]) : (i === f.length - 1 ? f[0] : f[i + 1]);
        e.preventDefault(); to.focus();
      }
    };
    penBtn.focus();
  }

  // ---------- composer ----------
  function updateRunning() {
    const busy = state.running || state.pending;
    sendBtn.classList.toggle('stop', busy);
    sendBtn.innerHTML = busy ? ICON.stop : ICON.send;
    sendBtn.title = busy ? STR.stop : STR.send;
    sendBtn.disabled = !busy && !input.value.trim() && !state.images.length;
  }
  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; input.style.overflowY = input.scrollHeight > 180 ? 'auto' : 'hidden'; }
  input.addEventListener('input', () => { autoGrow(); updateRunning(); });
  input.addEventListener('keydown', (e) => {
    if (mentionKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  sendBtn.addEventListener('click', () => { if (state.running || state.pending) bridge.post({ type: 'interrupt' }); else submit(); });
  function submit() {
    const text = input.value.trim();
    if ((!text && !state.images.length) || state.running || state.pending) return;
    const ctx = state.contexts.map((c) => Object.assign({}, c));
    const images = state.images.slice();
    addUser(text, ctx, images);
    stick = true; scrollDown();
    if (text && state.title === STR.newChat) setTitle(text.split('\n')[0].slice(0, 60));
    const plan = state.planMode ? true : state.planUsed ? false : undefined;   // false: leave plan mode that an earlier turn of this chat switched on
    if (state.planMode) state.planUsed = true; else if (plan === false) state.planUsed = false;
    bridge.post({ type: 'send', text, contexts: ctx, images: images.map((i) => ({ url: i.url, name: i.name })), plan,
      model: state.prefs.model, defaultModel: effectiveModel(), effort: state.prefs.effort, permissions: normPerm(state.prefs.permissions) });
    input.value = ''; autoGrow();
    state.contexts = state.contexts.filter((c) => c.kind === 'file');
    state.images = [];
    renderChips();
    state.pending = true;
    updateRunning();
  }

  // ---------- "@" file mentions ----------
  const mentionBox = $('#mention');
  const mention = state.mention;
  let mentionTimer = null;
  const MAX_CHIPS = 20;

  // Colour of the little extension badge in the popup: one hue per well-known file type, a stable hue for the rest.
  const EXT_HUE = { java: 25, kt: 280, js: 48, mjs: 48, ts: 210, tsx: 195, jsx: 195, json: 95, xml: 15, html: 10, css: 265, scss: 265, md: 0, yml: 330, yaml: 330,
    properties: 160, sql: 200, py: 140, gradle: 175, sh: 120, ps1: 215, cs: 285, go: 190, rs: 20, c: 220, h: 220, cpp: 220, txt: 0 };
  function extOf(name) { const i = name.lastIndexOf('.'); return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : ''; }
  function fileBadge(item) {
    if (item.folder) return h('span', { class: 'fi folder', html: ICON.folder });
    const ext = extOf(item.name);
    let hue = EXT_HUE[ext];
    if (hue == null) { hue = 0; for (const ch of ext) hue = (hue * 31 + ch.charCodeAt(0)) % 360; }
    return h('span', { class: 'fi', style: '--h:' + hue, text: (ext || '·').slice(0, 4) });
  }

  // The "@word" right before the caret (an @ at the start or after whitespace), or null.
  function mentionToken() {
    if (input.selectionStart !== input.selectionEnd) return null;
    const caret = input.selectionStart;
    const m = /(^|\s)@([^\s@]*)$/.exec(input.value.slice(0, caret));
    return m ? { start: caret - m[2].length - 1, end: caret, query: m[2] } : null;
  }
  function updateMention() {
    const tok = mentionToken();
    if (!tok) { closeMention(); return; }
    const changed = !mention.open || tok.query !== mention.query;
    mention.open = true; mention.start = tok.start; mention.query = tok.query;
    if (changed) {
      clearTimeout(mentionTimer);
      mentionTimer = setTimeout(() => {
        mention.reqId++; mention.loading = true;
        bridge.post({ type: 'mentionSearch', query: mention.query, requestId: mention.reqId });
      }, tok.query ? 40 : 0);
    }
    renderMention();
  }
  function closeMention() {
    clearTimeout(mentionTimer);
    mention.open = false; mention.items = []; mention.query = '';
    mentionBox.classList.add('hidden'); mentionBox.innerHTML = '';
  }
  function onMentions(ev) {
    if (ev.requestId !== mention.reqId || !mention.open) return;
    mention.loading = false; mention.items = ev.items || []; mention.sel = 0;
    renderMention();
  }
  function shortDir(dir) { return dir.length > 44 ? '…' + dir.slice(-43) : dir; }
  function renderMention() {
    mentionBox.innerHTML = '';
    mentionBox.classList.toggle('hidden', !mention.open);
    if (!mention.open) return;
    if (!mention.items.length) {
      mentionBox.append(h('div', { class: 'none', text: mention.loading ? STR.historyLoading : mention.query ? STR.mentionNone : STR.mentionHint }));
      return;
    }
    mention.items.forEach((item, i) => {
      const row = h('div', { class: 'mi' + (i === mention.sel ? ' sel' : ''), role: 'option', title: item.path },
        fileBadge(item), h('span', { class: 'mn', text: item.name + (item.folder ? '/' : '') }), h('span', { class: 'md', text: shortDir(item.dir || '') }));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pickMention(i); });   // mousedown: keep the focus in the input
      row.addEventListener('mousemove', () => { if (mention.sel !== i) selectMention(i, false); });
      mentionBox.append(row);
    });
  }
  function selectMention(i, scroll) {
    mention.sel = i;
    const rows = mentionBox.querySelectorAll('.mi');
    rows.forEach((r, k) => r.classList.toggle('sel', k === i));
    if (scroll && rows[i]) rows[i].scrollIntoView({ block: 'nearest' });
  }

  function addContextFile(item) {
    if (state.contexts.some((c) => c.kind === 'mention' && normPath(c.path) === normPath(item.path))) return;
    if (state.contexts.filter((c) => c.kind === 'mention').length >= MAX_CHIPS) return;
    state.contexts.push({ kind: 'mention', path: item.path, name: item.name || basename(item.path), folder: !!item.folder, project: item.project, projectPath: item.projectPath });
  }
  // Takes the picked file out of the text (the "@query" part) and shows it as a chip above the input.
  function pickMention(i) {
    const item = mention.items[i], tok = mentionToken();
    if (!item || !tok) { closeMention(); return; }
    addContextFile(item);
    const before = input.value.slice(0, tok.start), after = input.value.slice(tok.end);
    const tidy = before.endsWith(' ') && (after.startsWith(' ') || after === '') ? before.slice(0, -1) : before;   // no double blank where the @word was
    input.value = tidy + after;
    input.setSelectionRange(tidy.length, tidy.length);
    closeMention(); autoGrow(); updateRunning(); renderChips(); input.focus();
  }
  // Returns true when the key belonged to the popup.
  function mentionKey(e) {
    if (!mention.open) return false;
    const n = mention.items.length;
    if (e.key === 'Escape') { closeMention(); e.preventDefault(); e.stopPropagation(); return true; }
    if (!n) return false;
    if (e.key === 'ArrowDown') { selectMention((mention.sel + 1) % n, true); e.preventDefault(); return true; }
    if (e.key === 'ArrowUp') { selectMention((mention.sel + n - 1) % n, true); e.preventDefault(); return true; }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.isComposing) { pickMention(mention.sel); e.preventDefault(); return true; }
    return false;
  }
  input.addEventListener('input', updateMention);
  input.addEventListener('click', updateMention);
  input.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateMention(); });
  input.addEventListener('blur', () => setTimeout(closeMention, 120));

  // ---------- drag & drop of files onto the panel ----------
  // Inside Eclipse the page only learns that a drag hovers it; the drop itself is taken by an SWT drop target that Java puts on top
  // (see PanelDrop.java: WebView2 keeps the real file paths away from the page). Here: the dashed hint, and the browser's own
  // default (navigating to a dropped file) is switched off.
  let dragDepth = 0, pageDrag = false;
  function setDragState(on) {
    $('#dropzone').classList.toggle('hidden', !on);
    if (!on) dragDepth = 0;
  }
  document.addEventListener('dragstart', () => { pageDrag = true; });   // text or a link dragged inside the page itself
  document.addEventListener('dragend', () => { pageDrag = false; });
  document.addEventListener('dragenter', (e) => {
    if (pageDrag) return;
    e.preventDefault();
    if (dragDepth++ === 0) { setDragState(true); bridge.post({ type: 'dragEnter', types: e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [] }); }
  });
  document.addEventListener('dragover', (e) => {
    if (pageDrag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', () => { if (!pageDrag && --dragDepth <= 0) setDragState(false); });
  // VS Code: the page gets the drop itself. Explorer items and editor tabs arrive in several formats (see dropdata.js); the host logs
  // what arrived ("dropDebug") so a drop that yields nothing can be diagnosed from the "Codexter" output channel.
  document.addEventListener('drop', (e) => {
    if (pageDrag) return;
    e.preventDefault();
    setDragState(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    if (host === 'vscode' && window.CodexDrop) bridge.post({ type: 'dropDebug', info: CodexDrop.debug(dt) });
    const files = Array.from(dt.files || []);
    const text = (host === 'vscode' && window.CodexDrop && CodexDrop.parse(dt).text) || dt.getData('text/plain');
    const pics = files.filter((f) => /^image\//.test(f.type));
    if (text && text.trim()) bridge.post({ type: 'dropText', text });    // host decides: paths become chips, other text goes into the input
    if (pics.length) pics.forEach((f) => addImageFile(f));
    else if (!(text && text.trim()) && files.length) toast(host === 'vscode' ? STR.dropNoPathsVscode : STR.dropNoPaths);   // File objects carry no paths
  });

  // top bar
  $('#btn-new').addEventListener('click', () => { bridge.post({ type: 'newChat' }); });
  $('#btn-hist').addEventListener('click', (e) => { e.stopPropagation(); toggleHistory(); });
  gearBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(); });
  // composedPath is fixed at dispatch time; the clicked row or "Load more" button may already be gone from the DOM (list re-rendered)
  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    if (path.includes(projMenu)) return;
    if (state.historyOpen && !path.includes($('#history'))) toggleHistory(false);
    else if (projMenuOpen() && !path.includes(histProj)) closeProjMenu(false);
  });

  // delegated clicks inside the feed: copy buttons, links, inline paths
  feed.addEventListener('click', (e) => {
    const t = e.target;
    const copy = t.closest && t.closest('button.copy');
    if (copy) {
      const code = $('code', copy.closest('.codeblock'));
      copyText(code ? code.textContent : '');
      copy.textContent = STR.copied;
      setTimeout(() => { copy.textContent = STR.copy; }, 1200);
      return;
    }
    const fl = t.closest && t.closest('a.filelink');
    if (fl) { e.preventDefault(); bridge.post(CodexLinks.message(fl)); return; }
    const a = t.closest && t.closest('a');
    if (a) { e.preventDefault(); const u = a.getAttribute('data-url'); if (u) bridge.post({ type: 'openUrl', url: u }); return; }
    const p = t.closest && t.closest('code.path');
    if (p) {
      const ref = CodexLinks.parse(p.getAttribute('data-path'));
      if (ref) bridge.post(Object.assign({ type: 'openFile' }, ref));
    }
  });
  function copyText(s) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s).catch(() => legacyCopy(s)); return; }
    } catch (e) { /* fall through */ }
    legacyCopy(s);
  }
  function legacyCopy(s) {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = s; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
  }

  // ---------- notifications ----------
  function onNotification(method, p) {
    switch (method) {
      case 'turn/started':
        state.turnId = p.turn && p.turn.id; state.running = true; state.pending = false;
        state.turnFiles = new Set(); state.turnDiff = null; state.turnStartMs = Date.now();
        if (!state.turn || state.turn.done) beginTurn();
        state.turn.started = true; state.turn.startMs = Date.now();
        updateRunning(); break;
      case 'turn/completed': finishTurn(p.turn || {}); break;
      case 'item/started': upsertItem(p.item, 'started'); break;
      case 'item/completed': upsertItem(p.item, 'completed'); break;
      case 'item/agentMessage/delta': {
        let rec = state.items.get(p.itemId);
        if (!rec) { upsertItem({ type: 'agentMessage', id: p.itemId, text: '' }, 'started'); rec = state.items.get(p.itemId); }
        rec.data.text = (rec.data.text || '') + p.delta; renderAgent(rec); break;
      }
      case 'item/reasoning/summaryPartAdded': {
        const rec = ensureReasoning(p.itemId);
        while (rec.parts.length <= p.summaryIndex) rec.parts.push('');
        break;
      }
      case 'item/reasoning/summaryTextDelta': {
        const rec = ensureReasoning(p.itemId);
        while (rec.parts.length <= p.summaryIndex) rec.parts.push('');
        rec.parts[p.summaryIndex] += p.delta; renderReasoning(rec); break;
      }
      case 'item/reasoning/textDelta': {
        const rec = ensureReasoning(p.itemId);
        rec.raw = (rec.raw || '') + p.delta; renderReasoning(rec); break;
      }
      case 'item/commandExecution/outputDelta': {
        const rec = state.items.get(p.itemId);
        if (rec && rec.type === 'commandExecution') { rec.streamed = true; rec.output = (rec.output || '') + p.delta; renderCommand(rec); }
        break;
      }
      case 'turn/plan/updated': renderPlan(p); break;
      case 'item/plan/delta': {
        let rec = state.items.get(p.itemId);
        if (!rec) { upsertItem({ type: 'plan', id: p.itemId, text: '' }, 'started'); rec = state.items.get(p.itemId); }
        rec.data.text = (rec.data.text || '') + p.delta; renderPlanItem(rec); break;
      }
      case 'thread/goal/updated': if (p.goal) { state.goal = p.goal; renderGoal(); } break;
      case 'thread/goal/cleared': state.goal = null; renderGoal(); break;
      case 'turn/diff/updated': state.turnDiff = p.diff; break;
      case 'thread/tokenUsage/updated': state.tokenUsage = p.tokenUsage; renderFooter(); break;
      case 'account/rateLimits/updated': state.rateLimits = p.rateLimits; renderFooter(); break;
      case 'thread/name/updated': if (p.threadName || p.name) setTitle(p.threadName || p.name); break;
      case 'item/autoApprovalReview/started':
      case 'item/autoApprovalReview/completed': renderAutoReview(p); break;
      case 'serverRequest/resolved': {
        const a = state.approvals.get(String(p.requestId));
        if (a) { a.btns.replaceWith(h('div', { class: 'result', text: STR.resolved })); a.card.classList.add('done'); state.approvals.delete(String(p.requestId)); }
        break;
      }
      case 'error': {
        const e = p.error || {};
        if (p.willRetry) notice(STR.retrying + ' ' + (e.message || ''));
        else errorCard(STR.errorTitle, [e.message, e.additionalDetails].filter(Boolean).join('\n'));
        break;
      }
      case 'warning': if (p.message && !/unrecognized configuration/.test(p.message)) notice(p.message); break;
      default: break; // hooks, mcp startup, etc.
    }
  }
  // -- auto-review (approvalsReviewer = auto_review): never silent
  function reviewTarget(a) {
    a = a || {};
    switch (a.type) {
      case 'command': return innerCommand(a.command).split('\n')[0];
      case 'execve': return [a.program].concat((a.argv || []).slice(1)).join(' ');
      case 'applyPatch': return 'apply patch to ' + (a.files || []).map(basename).join(', ');
      case 'networkAccess': return 'network ' + (a.target || a.host);
      case 'mcpToolCall': return STR.mcpCall + ' ' + a.server + '/' + a.toolName;
      case 'writeStdin': return 'write to stdin of process ' + a.processId;
      case 'requestPermissions': return a.reason || 'additional permissions';
      default: return a.type || '';
    }
  }
  function renderAutoReview(p) {
    const r = p.review || {};
    const status = r.status || 'inProgress';
    let el = state.reviews.get(p.reviewId);
    if (!el) { el = append(h('div', { class: 'autoreview' })); state.reviews.set(p.reviewId, el); }
    el.className = 'autoreview ' + status;
    el.textContent = '\u{1F6E1} ' + STR.autoReview + ' ' + (STR.reviewVerdict[status] || status) + ': ' + reviewTarget(p.action);
    el.title = [r.riskLevel ? 'Risk: ' + r.riskLevel : '', r.userAuthorization ? 'User authorization: ' + r.userAuthorization : '', r.rationale || ''].filter(Boolean).join('\n');
  }
  function ensureReasoning(id) {
    let rec = state.items.get(id);
    if (!rec) { upsertItem({ type: 'reasoning', id, summary: [], content: [], startedAtMs: Date.now() }, 'started'); rec = state.items.get(id); }
    return rec;
  }

  function finishTurn(turn) {
    state.running = false; state.pending = false;
    // close anything left spinning
    state.items.forEach((rec) => {
      if (rec.type === 'reasoning' && !rec.done) { rec.done = true; renderReasoning(rec); }
      if (rec.type === 'commandExecution' && rec.data.status === 'inProgress') { rec.data.status = 'failed'; renderCommand(rec); }
    });
    renderPlan(null);
    state.approvals.forEach((a) => { a.btns.replaceWith(h('div', { class: 'result', text: STR.resolved })); a.card.classList.add('done'); });
    state.approvals.clear();
    if (turn.status === 'failed' && turn.error) errorCard(STR.errorTitle, [turn.error.message, turn.error.additionalDetails].filter(Boolean).join('\n'));
    else if (turn.status === 'interrupted') notice(STR.interrupted);
    const n = state.turnFiles.size;
    if (n > 1 || (n && state.turnDiff)) {   // the "Worked for" line is the fold below; this one only offers the combined diff
      const bar = h('div', { class: 'turn-summary' }, h('span', { text: STR.changedFiles(n) }));
      if (state.turnDiff) {
        const diff = state.turnDiff;
        bar.append(h('span', { text: '·' }), h('a', { text: STR.openAllDiff, onclick: () => bridge.post({ type: 'openTurnDiff', diff }) }));
      }
      append(bar);
    }
    if (state.turn && !state.turn.done) endTurn(state.turn, turn.durationMs != null ? turn.durationMs : (state.turn.started ? Date.now() - state.turn.startMs : null));
    updateRunning();
  }

  // ---------- events from Java ----------
  function applyTheme(t) {
    if (!t) return;
    const r = document.documentElement;
    if (t.dark != null) r.setAttribute('data-theme', t.dark ? 'dark' : 'light');
    ['bg', 'fg', 'accent'].forEach((k) => { if (t[k]) r.style.setProperty('--' + k, t[k]); });
    if (t.font) r.style.setProperty('--font', t.font);
    if (t.fontSize) document.body.style.fontSize = t.fontSize + 'px';
  }

  function loadThread(ev) {
    const th = ev.thread || {};
    if (ev.created) { // thread was just created for the message in the feed: keep what is shown
      state.threadId = th.id || null;
      setProject(ev.project, ev.cwd);
      return;
    }
    resetConversation();
    state.threadId = th.id || null;
    state.defaultsApplied = true;   // a loaded chat never gets the defaults over it
    setProject(ev.project, ev.cwd);
    setTitle(cleanTitle(th.name || th.preview) || STR.newChat);
    if (ev.turns && ev.turns.length) {
      stick = true;
      ev.turns.forEach((turn) => {
        beginTurn(turn.startedAt);
        (turn.items || []).forEach((it) => upsertItem(it, 'completed', true));
        endTurn(state.turn, turn.durationMs != null ? turn.durationMs : turn.startedAt && turn.completedAt ? (turn.completedAt - turn.startedAt) * 1000 : null);
      });
      if (ev.goal) { state.goal = ev.goal; renderGoal(); }
      stick = true; feed.scrollTop = feed.scrollHeight;
    }
    updateRunning();
  }

  function handle(ev) {
    switch (ev.kind) {
      case 'init':
        if (ev.host) { host = ev.host; const dz = $('#dropzone > div'); if (dz && host === 'vscode') dz.textContent = STR.dropHintVscode; }
        applyTheme(ev.theme);
        if (ev.prefs) Object.assign(state.prefs, ev.prefs);
        setProject(ev.project, ev.cwd);
        if (ev.openProjects) hist.openProjects = ev.openProjects;
        if (ev.historyQuery != null) hist.query = ev.historyQuery;
        if (ev.historyManual) { hist.manual = true; hist.cwds = ev.historyCwds || []; }   // the user's own selection survives a re-created view
        refreshProjectUi();
        if (ev.settings) state.settings = normSettings(ev.settings);
        fillModels(); fillPerm();
        if (!state.hasContent) showEmpty();
        if (chatIsEmpty()) applyDefaults();
        break;
      case 'theme': applyTheme(ev.theme); break;
      case 'status':
        setConn(ev.state, ev.message);
        break;
      case 'models':
        state.models = ev.data || [];
        if (!state.defaultsApplied && state.models.length && chatIsEmpty()) applyDefaults(); else fillModels();
        renderSettings();
        break;
      case 'settings': {
        const before = JSON.stringify(state.settings);
        state.settings = normSettings(ev.settings);
        if (JSON.stringify(state.settings) !== before && chatIsEmpty()) applyDefaults(); else fillModels();
        renderSettings();
        break;
      }
      case 'showSettings': toggleSettings(); break;
      case 'prefs': Object.assign(state.prefs, ev.prefs); fillModels(); fillPerm(); break;
      case 'plugins': onPlugins(ev); break;
      case 'goal': state.goal = ev.goal || null; renderGoal(); break;
      case 'threads': onThreads(ev); break;
      case 'threadAction': onThreadAction(ev); break;
      case 'historyProjects': {
        hist.projects = ev.data || [];
        const changed = state.historyOpen && autoSelect();   // chats of the open projects are now known: select exactly those
        refreshProjectUi();
        if (changed) requestHistory(false); else if (state.historyOpen) renderHistory();
        break;
      }
      case 'openProjects': {
        hist.openProjects = ev.openProjects || [];
        const changed = autoSelect();
        refreshProjectUi();
        if (changed && state.historyOpen) requestHistory(false);
        break;
      }
      case 'mentions': onMentions(ev); break;
      case 'thread': loadThread(ev); break;
      case 'newChat': resetConversation(); state.planUsed = false; setTitle(STR.newChat); state.threadId = null; setProject(ev.project, ev.cwd); showEmpty(); applyDefaults(); break;
      case 'cwd': setProject(ev.project, ev.cwd || ''); { const e = $('#empty'); if (e) showEmpty(); } break;
      case 'notification': onNotification(ev.method, ev.params || {}); break;
      case 'serverRequest': {
        const p = ev.params || {};
        append(approvalCard(ev.id, ev.method, p));
        break;
      }
      case 'rateLimits': state.rateLimits = ev.data && (ev.data.rateLimits || ev.data); renderFooter(); break;
      case 'context': {
        if (ev.action === 'activeFile') {
          state.active = ev.item || null;
          if (!ev.item) state.dismissedFile = null;
        } else if (ev.action === 'add') {
          state.contexts = state.contexts.filter((c) => c.kind !== 'selection');
          state.contexts.push(Object.assign({ kind: 'selection' }, ev.item));
        } else if (ev.action === 'addPaths') {
          (ev.items || []).forEach(addContextFile);
        } else if (ev.action === 'clear') state.contexts = [];
        syncActive(); break;
      }
      case 'error': errorCard(ev.title, ev.message, ev.actions); state.pending = false; updateRunning(); break;
      case 'idle': state.pending = false; state.running = false; updateRunning(); break;
      case 'install': state.install = ev.phase === 'idle' ? null : ev; renderCx(); break;
      case 'codexUpdated': state.updatedVersion = ev.version || null; renderCx(); break;
      case 'auth': {
        const was = state.auth && state.auth.state;
        state.auth = ev; renderAuth(); renderSandbox();
        if (ev.state === 'signedIn' && was && was !== 'signedIn' && was !== 'unknown') input.focus();
        break;
      }
      case 'sandbox': state.sandbox = ev; renderSandbox(); break;
      case 'toast': toast(ev.message); break;
      case 'insertText': input.focus(); input.setRangeText(ev.text || '', input.selectionStart, input.selectionEnd, 'end'); autoGrow(); updateRunning(); break;
      case 'focus': input.focus(); if (ev.text) { input.value = ev.text; autoGrow(); updateRunning(); } break;
      default: console.debug('unknown event', ev);
    }
  }

  window.codexUi = {
    receive(batch) {
      try {
        const arr = typeof batch === 'string' ? JSON.parse(batch) : batch;
        (Array.isArray(arr) ? arr : [arr]).forEach((ev) => {
          try { handle(ev); } catch (e) { console.error('event failed', ev && (ev.kind || ev.method), e); }
        });
      } catch (e) { console.error('receive failed', e); }
    },
    dragState: setDragState,
    state // exposed for debugging
  };

  // ---------- boot ----------
  setupMarkdown();
  setConn('connecting', STR.connecting);
  setTitle(STR.newChat);
  fillModels(); fillPerm(); renderChips(); renderCChips(); renderGoal(); updateRunning(); showEmpty();
  let tries = 0;
  (function announce() {
    if (typeof window.__codexPost === 'function') bridge.post({ type: 'ready' });
    else if (tries++ < 50) setTimeout(announce, 100);
  })();
})();
