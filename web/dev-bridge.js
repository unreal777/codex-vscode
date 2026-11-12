/* Dev mock of the Java side: replays a recorded fixture through window.codexUi.receive.
 * Query: ?fixture=recorded-edit|recorded-hello|recorded-think|synthetic-approval|synthetic-autoreview
 *        &other=1 (after the first message the active editor moves to another project: banner)
 *        &speed=2 (faster)  &autoplay=0 (wait for you to press Send)  &theme=dark|light
 *        &state=signin|signinerror|waiting|downloading|installing|failed|updated|sandbox  (no autoplay; &autologin=1 completes the sign-in)
 *        &host=vscode (init.host: "Open in VS Code", Shift-drop hint)  &open=shop,billing|ghost|none (the IDE's open projects sent as init.openProjects;
 *        default shop; "ghost" = an open project without chats)  &lc=1 (open projects spelled in lower case, like VS Code's lower-case drive)
 *        &openlater=billing (openProjects event after 3 s)
 *        &autoplay=0 &latency=300 (slow answers for the History and "@" mocks)  &histerror=1 (History fails)
 *        &perm=ask|auto|full|custom (init.prefs.permissions)  &menu=perm|plus (opens that composer menu after init)  &goal=1 (an active goal banner)
 *        &plan=1 (plan mode chip on at start; fixture=synthetic-plan shows a plan item)  &plugins=none|slow|error  &resume=1 (loads a finished history chat)
 *        &settings=1 (opens the in-panel settings after init, like the title-bar gear)  &fail=1 (archive/unarchive/delete answer an error)
 *        &nosettings=1 (init without settings: Codex defaults, nothing hidden)
 * Settings: init.settings has a default model, an effort and one hidden model; "settingsSave" is echoed as a "settings" event.
 * Archive/delete: threadAction moves a chat to the archived list (unarchive back, delete removes), answers ok and re-sends historyProjects; rename sets the title.
 * "+" menu: plugins come from PLUGINS below; "Files" answers pickFiles with two chips; "Goal" answers goalSet with a goal event (tokens grow);
 * the sketch and pasted images need no host.
 * History: 40 synthetic chats in 4 projects, newest first, 12 per page ("Load more"), search matches title + project like the Java side.
 * "@" popup: 43 synthetic files/folders of the project "shop" (type @ in the input). Drops: window.codexUi.dragState(true) shows the hint;
 * the mock answers "dropText" like Eclipse would (paths become chips).
 * Every message the page posts to Java is listed in the grey box at the right (window.__posted).
 * Fixtures are .js twins of the JSON files (file:// pages can not fetch JSON).
 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const fixtureName = q.get('fixture') || 'recorded-edit';
  const speed = parseFloat(q.get('speed') || '1') || 1;
  const stateParam = q.get('state') || '';
  const autoplay = q.get('autoplay') !== '0' && !stateParam;
  const AUTH_URL = 'https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_demo&state=dev';
  const themeParam = q.get('theme');
  const CWD = 'C:\\work\\shop';
  const SHOP = { project: 'shop', projectPath: CWD };
  // The IDE's open projects (init.openProjects / event openProjects): [{name, cwd}]
  const ALL_OPEN = { shop: 'C:\\work\\shop', billing: 'C:\\work\\billing', task_conceptpeople: 'C:\\work\\task_conceptPeople', 'data-platform': 'D:\\repos\\data-platform', ghost: 'C:\\work\\ghost' };
  const openProjects = (names) => String(names || '').split(',').filter((n) => ALL_OPEN[n.trim().toLowerCase()]).map((n) => {
    const key = n.trim().toLowerCase(), cwd = ALL_OPEN[key];
    return { name: key === 'task_conceptpeople' ? 'task_conceptPeople' : key, cwd: q.get('lc') ? cwd.toLowerCase() : cwd };
  });
  const OTHER = { project: 'billing', projectPath: 'C:\\work\\billing' };

  // ---- synthetic history: 40 chats in 4 projects, German and English titles, some titles shared between projects ----
  const PROJECTS = [
    { project: 'shop', cwd: 'C:\\work\\shop' },
    { project: 'billing', cwd: 'C:\\work\\billing' },
    { project: 'task_conceptPeople', cwd: 'C:\\work\\task_conceptPeople' },
    { project: 'data-platform', cwd: 'D:\\repos\\data-platform' }
  ];
  // [project index, title] newest first
  const HISTORY_SEED = [
    [0, 'Fix NPE in OrderService'], [1, 'Fix NPE in OrderService'], [2, 'Konzept: Personenverwaltung Datenmodell'], [3, 'Airflow DAG für den Nightly Load'],
    [0, 'Bestellung stornieren: Fehler beim Rückbuchen'], [1, 'Rechnung als PDF exportieren'], [2, 'Rollen und Rechte für Sachbearbeiter'],
    [0, 'Refactor invoice export to streaming'], [3, 'Fix schema drift in the ingestion job'], [1, 'Refactor invoice export to streaming'],
    [2, 'Suche nach Personen mit Fuzzy-Matching'], [0, 'Add pagination to product list'], [1, 'Mahnlauf: Zinsberechnung prüfen'],
    [3, 'Partitionierung der Events-Tabelle'], [2, 'Add audit log for person changes'], [0, 'Warum schlägt der Checkout-Test fehl?'],
    [1, 'Add retry for payment gateway'], [2, 'Dublettenprüfung beim Import'], [3, 'Explain the retry policy of the Kafka consumer'],
    [0, 'Migrate to Spring Boot 3'], [1, 'Steuerberechnung für Österreich'], [2, 'Explain the caching strategy'], [0, 'Rabatt-Logik vereinfachen'],
    [3, 'Backfill für März starten'], [1, 'Review the SEPA mandate flow'], [2, 'Datenschutz: Löschkonzept entwerfen'], [0, 'Explain the caching strategy'],
    [3, 'Optimize slow Spark join'], [1, 'Fehler bei Gutschrift-Storno'], [2, 'Fix NPE in PersonService'], [0, 'Unit tests für OrderValidator'],
    [3, 'Monitoring: Alert bei Lag > 5 Minuten'], [1, 'Write migration for invoice_lines'], [2, 'Export nach CSV mit Umlauten'],
    [0, 'Fix flaky CartServiceTest'], [3, 'Write dbt tests for orders'], [1, 'Explain the caching strategy'], [2, 'Wie funktioniert der Merge von Personen?'],
    [3, 'Datenqualität: Nullwerte in customer_id'], [0, 'Logging vereinheitlichen']
  ].map((r, i) => ({
    id: 'thr-' + String(i + 1).padStart(2, '0'), title: r[1], cwd: PROJECTS[r[0]].cwd, project: PROJECTS[r[0]].project,
    updatedAt: Math.floor(Date.now() / 1000 - 300 * Math.pow(1.3, i))
  }));

  // ---- synthetic file index of the project "shop" for the "@" popup ----
  const FILES = [
    'pom.xml', 'README.md', 'build.gradle', '.gitignore', 'docs/order-flow.md', 'docs/Ordering.txt', 'docs/architecture.md',
    'src/main/java/shop/Order.java', 'src/main/java/shop/OrderService.java', 'src/main/java/shop/OrderRepository.java',
    'src/main/java/shop/OrderValidator.java', 'src/main/java/shop/ShippingOrderValidator.java', 'src/main/java/shop/InvoiceExporter.java',
    'src/main/java/shop/CartService.java', 'src/main/java/shop/Customer.java', 'src/main/java/shop/CustomerRepository.java',
    'src/main/java/shop/PricingEngine.java', 'src/main/java/shop/DiscountPolicy.java', 'src/main/java/shop/util/StringUtils.java',
    'src/main/java/shop/util/DateUtils.java', 'src/main/java/shop/web/OrderController.java', 'src/main/java/shop/web/CartController.java',
    'src/main/resources/application.properties', 'src/main/resources/messages_de.properties', 'src/main/resources/messages_en.properties',
    'src/main/resources/db/migration/V1__init.sql', 'src/main/resources/db/migration/V2__orders.sql', 'src/main/webapp/index.html',
    'src/main/webapp/js/cart.js', 'src/main/webapp/css/shop.css', 'src/test/java/shop/OrderServiceTest.java', 'src/test/java/shop/CartServiceTest.java',
    'src/test/java/shop/OrderValidatorTest.java', 'src/test/resources/fixtures/orders.json'
  ].map((p) => ({ path: p, folder: false })).concat(
    ['docs', 'src', 'src/main', 'src/main/java', 'src/main/java/shop', 'src/main/java/shop/util', 'src/main/java/shop/web', 'src/main/resources', 'src/test', 'src/test/java/shop']
      .map((p) => ({ path: p, folder: true })));
  const RECENT = ['src/main/java/shop/OrderService.java', 'pom.xml', 'src/test/java/shop/OrderServiceTest.java', 'README.md'];

  const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  function fuzzy(text, q) {
    const low = text.toLowerCase();
    let from = 0, score = 40, prev = -2;
    for (const ch of q) {
      const at = low.indexOf(ch, from);
      if (at < 0) return -1;
      score += at === prev + 1 ? 8 : -Math.min(at - from, 6);
      if (at === 0 || !/[a-z0-9]/i.test(text[at - 1]) || text[at] !== text[at].toLowerCase()) score += 6;
      prev = at; from = at + 1;
    }
    return Math.max(0, Math.min(99, score));
  }
  // same ordering rules as core/FileIndex.java (exact name > prefix > substring > fuzzy name > path)
  function rankFiles(query, limit) {
    const q = query.trim().replace(/\\/g, '/').toLowerCase().replace(/^[@./]+/, '');
    if (!q) {
      const recent = RECENT.map((p) => FILES.find((f) => f.path === p)).filter(Boolean);
      const rest = FILES.filter((f) => !recent.includes(f)).sort((a, b) => (a.folder - b.folder) || (a.path.split('/').length - b.path.split('/').length) || a.path.localeCompare(b.path));
      return recent.concat(rest).slice(0, limit);
    }
    const scored = [];
    FILES.forEach((f) => {
      const name = nameOf(f.path).toLowerCase(), path = f.path.toLowerCase();
      let s;
      if (q.includes('/')) s = path === q ? 1000 : path.endsWith('/' + q) ? 900 : path.startsWith(q) ? 850 : path.includes(q) ? 600 : (fuzzy(f.path, q) < 0 ? -1 : 200 + fuzzy(f.path, q));
      else if (name === q) s = 1000;
      else if (name.startsWith(q)) s = 800 - Math.min(name.length - q.length, 50);
      else if (name.includes(q)) s = 600 - Math.min(name.indexOf(q), 50);
      else if (fuzzy(nameOf(f.path), q) >= 0) s = 400 + fuzzy(nameOf(f.path), q);
      else if (path.includes(q)) s = 300;
      else s = fuzzy(f.path, q) < 0 ? -1 : 200 + fuzzy(f.path, q);
      if (s < 0) return;
      if (f.folder) s -= 30;
      const r = RECENT.indexOf(f.path);
      if (r >= 0) s += Math.max(10, 60 - 5 * r);
      scored.push([s, f]);
    });
    scored.sort((a, b) => b[0] - a[0] || a[1].path.length - b[1].path.length);
    return scored.slice(0, limit).map((x) => x[1]);
  }
  const normKey = (p) => String(p || '').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

  // ---- plugins of the "+" menu (host: plugin/installed, installed and enabled only) ----
  const PLUGINS = [
    { id: 'windsor@openai-curated', name: 'Windsor.ai', description: 'Connect 350+ data sources', brandColor: '#1f4fd8' },
    { id: 'atlassian@openai-curated', name: 'Atlassian', description: 'Jira, Confluence, Loom, & more', brandColor: '#0b66e4' },
    { id: 'google-drive@openai-curated', name: 'Google Drive', description: 'Drive, Docs, Sheets or Slides', brandColor: '#1a9f5c' },
    { id: 'openai-developers@openai-curated', name: 'OpenAI Developers', description: 'Develop AI apps and agents with OpenAI best practices', brandColor: '#111111' },
    { id: 'product-design@openai-curated', name: 'Product Design', description: 'Explore and prototype ideas', brandColor: '#d6336c' },
    { id: 'figma@openai-curated', name: 'Figma', description: 'Create designs, ship to code', brandColor: '#7048e8' }
  ];
  let goalTokens = 0;
  const archived = new Set(['thr-05', 'thr-12', 'thr-21']);   // ids of archived chats
  const deleted = new Set();
  let settings = q.get('nosettings') ? { defaultModel: '', defaultReasoningEffort: '', hiddenModels: [] }
    : { defaultModel: 'gpt-6-sol', defaultReasoningEffort: 'high', hiddenModels: ['gpt-5.6-luna'] };
  const effs = (a) => a.map((reasoningEffort) => ({ reasoningEffort, description: reasoningEffort }));
  const FALLBACK_MODELS = [
    { model: 'gpt-6.1-sol', displayName: 'GPT-6.1-Sol', description: 'Latest workhorse model for coding and everyday work.', hidden: false, isDefault: true, supportedReasoningEfforts: effs(['low', 'medium', 'high', 'xhigh']) },
    { model: 'gpt-6-sol', displayName: 'GPT-6-Sol', description: 'Previous generation workhorse model.', hidden: false, isDefault: false, supportedReasoningEfforts: effs(['low', 'medium', 'high']) },
    { model: 'gpt-6-luna', displayName: 'GPT-6-Luna', description: 'Fast and affordable model for easier tasks.', hidden: false, isDefault: false, supportedReasoningEfforts: effs(['low', 'medium']) },
    { model: 'gpt-5.6-luna', displayName: 'GPT-5.6-Luna', description: 'Older fast and efficient model.', hidden: false, isDefault: false, supportedReasoningEfforts: effs(['low', 'medium']) },
    { model: 'codex-internal', displayName: 'Codex internal', description: 'Hidden by Codex itself.', hidden: true, isDefault: false, supportedReasoningEfforts: effs(['low']) }
  ];

  let fixture = null;
  let threadCounter = 0;

  function push(ev) { setTimeout(() => window.codexUi && window.codexUi.receive([ev]), 0); }
  function pushAll(arr) { window.codexUi.receive(arr); }

  function loadFixture(cb) {
    const s = document.createElement('script');
    s.src = 'fixtures/' + fixtureName + '.js';
    s.onload = () => { fixture = (window.__CODEX_FIXTURES || {})[fixtureName] || []; cb(); };
    s.onerror = () => { console.error('fixture not found', fixtureName); fixture = []; cb(); };
    document.head.append(s);
  }

  function modelsFromFixture() {
    const r = (fixture || []).find((m) => m.result && m.result.data && m.result.data[0] && m.result.data[0].model);
    return r ? r.result.data : FALLBACK_MODELS;
  }

  function firstUserText() {
    for (const m of fixture || []) {
      const it = m.params && m.params.item;
      if (it && it.type === 'userMessage') return ((it.content || [])[0] || {}).text || '';
    }
    return 'Hello';
  }

  function applyState() {
    const MB = 1048576;
    const states = {
      signin: { kind: 'auth', state: 'signedOut' },
      signinerror: { kind: 'auth', state: 'signedOut', error: 'Sign-in was not completed' },
      waiting: { kind: 'auth', state: 'waiting', url: AUTH_URL },
      downloading: { kind: 'install', phase: 'downloading', version: '0.166.0', done: 45 * MB, total: 90 * MB },
      installing: { kind: 'install', phase: 'extracting', version: '0.166.0', done: 0, total: -1 },
      failed: { kind: 'install', phase: 'failed', message: 'registry.npmjs.org: connection timed out' },
      updated: { kind: 'codexUpdated', version: '0.167.0' },
      sandbox: { kind: 'sandbox', state: 'needed' }
    };
    if (states[stateParam]) push(states[stateParam]);
  }

  // debug box: what the page posts to Java
  window.__posted = [];
  const box = document.createElement('pre');
  box.id = 'dev-posts';
  box.style.cssText = 'position:fixed;right:8px;top:8px;width:34vw;max-height:92vh;overflow:auto;margin:0;padding:6px 8px;font:11px/1.35 Consolas,monospace;background:#f4f4f4;color:#111;border:1px solid #999;z-index:99;white-space:pre-wrap';
  box.textContent = 'posted to Java:\n';
  document.addEventListener('DOMContentLoaded', () => document.body.append(box));

  let playing = null;
  let devInstructions = 'Answer briefly.';
  let openThread = 'dev-thread';   // the chat on screen (a resumed history chat or the dev thread)
  const waiting = {}; // requestId -> resume fn

  // the fixtures were recorded in other threads; the page drops notifications of a thread that is not open (0.7.0)
  const ours = (p) => (p && p.threadId ? Object.assign({}, p, { threadId: 'dev-thread' }) : p);

  function replay() {
    const msgs = (fixture || []).filter((m) => m.method && !(m.params && m.params.item && m.params.item.type === 'userMessage'));
    const start = msgs.findIndex((m) => m.method === 'turn/started');
    const seq = msgs.slice(start < 0 ? 0 : start);
    let i = 0, last = seq.length ? seq[0]._recvMs : 0;
    const gen = {};
    playing = gen;
    function step() {
      if (playing !== gen) return;
      if (i >= seq.length) { playing = null; return; }
      const m = seq[i++];
      const gap = Math.min(Math.max(0, (m._recvMs || 0) - last), 1500) / speed;
      last = m._recvMs || last;
      setTimeout(() => {
        if (playing !== gen) return;
        if (m.id != null) {
          // server request: show it and pause until the user decides
          push({ kind: 'serverRequest', id: m.id, method: m.method, params: ours(m.params) });
          waiting[m.id] = () => step();
          return;
        }
        push({ kind: 'notification', method: m.method, params: ours(m.params) });
        step();
      }, gap);
    }
    step();
  }

  function sendProjects() {
    const counts = new Map();
    HISTORY_SEED.filter((t) => !archived.has(t.id) && !deleted.has(t.id)).forEach((t) => {
      const k = normKey(t.cwd), c = counts.get(k) || { cwd: t.cwd, project: t.project, count: 0, updatedAt: t.updatedAt };
      c.count++; counts.set(k, c);
    });
    window.codexUi.receive([{ kind: 'historyProjects', data: Array.from(counts.values()) }]);
  }

  const handlers = {
    ready() {
      loadFixture(() => {
        const theme = themeParam ? { dark: themeParam === 'dark' } : undefined;
        pushAll([
          { kind: 'init', host: q.get('host') || undefined, openProjects: openProjects(q.get('open') == null ? 'shop' : q.get('open')), theme, cwd: CWD, project: 'shop', prefs: { model: '', effort: '', permissions: q.get('perm') || 'ask' }, settings },
          { kind: 'status', state: 'ready', message: 'Connected (dev mock)' },
          { kind: 'models', data: modelsFromFixture() },
          { kind: 'context', action: 'activeFile', item: Object.assign({ path: CWD + '\\src\\main\\java\\shop\\OrderService.java', startLine: 1 }, SHOP) },
          { kind: 'rateLimits', data: { primary: { usedPercent: 40, windowDurationMins: 300 }, secondary: { usedPercent: 39, windowDurationMins: 10080 } } }
        ]);
        applyState();
        if (q.get('settings')) setTimeout(() => window.codexUi.receive([{ kind: 'showSettings' }]), 250);
        if (q.get('goal')) setTimeout(() => window.codexUi.receive([{ kind: 'goal', goal: { threadId: 'dev-thread', objective: 'Make the product list paginated and keep the tests green', status: 'active', tokenBudget: null, tokensUsed: 12400, timeUsedSeconds: 95, createdAt: 1, updatedAt: 2 } }]), 100);
        if (q.get('plan')) setTimeout(() => { const b = document.getElementById('plus'); b.click(); const it = document.querySelector('#plus-menu [data-k="plan"]'); if (it) it.click(); }, 150);
        if (q.get('menu')) setTimeout(() => { const b = document.getElementById(q.get('menu') === 'plus' ? 'plus' : 'perm'); if (b) b.click(); }, 400);
        if (q.get('resume')) setTimeout(() => handlers.resumeThread({ threadId: 'thr-01' }), 200);
        if (q.get('openlater')) setTimeout(() => window.codexUi.receive([{ kind: 'openProjects', openProjects: openProjects(q.get('openlater')) }]), 3000);
        if (autoplay && !q.get('resume')) setTimeout(() => {
          const input = document.getElementById('input');
          input.value = firstUserText();
          input.dispatchEvent(new Event('input'));
          document.getElementById('send').click();
        }, 400);
      });
    },
    send(m) {
      if (!threadCounter) openThread = 'dev-thread';
      if (!threadCounter++) push({ kind: 'thread', created: true, thread: { id: 'dev-thread', name: null, preview: m.text }, cwd: CWD, project: 'shop', turns: [] });
      if (q.get('other')) setTimeout(() => push({ kind: 'context', action: 'activeFile', item: Object.assign({ path: OTHER.projectPath + '\\src\\Invoice.java', startLine: 1 }, OTHER) }), 600);
      push({ kind: 'notification', method: 'thread/status/changed', params: { status: { type: 'active' } } });
      setTimeout(replay, 300 / speed);
    },
    interrupt() {
      playing = null;
      push({ kind: 'notification', method: 'turn/completed', params: { turn: { id: 'x', status: 'interrupted', items: [] } } });
    },
    approval(m) {
      console.log('[dev] approval', m.decision, 'for', m.requestId, m.method);
      const r = waiting[m.requestId];
      delete waiting[m.requestId];
      if (r) setTimeout(r, 250 / speed);
    },
    newChat() { playing = null; threadCounter = 0; push({ kind: 'newChat', cwd: q.get('other') ? OTHER.projectPath : CWD, project: q.get('other') ? OTHER.project : 'shop' }); },
    // History like the Java side: newest first, project filter by cwd, case-insensitive search in title + project, paged with a cursor.
    listThreads(m) {
      const PAGE = 12, WANTED = 30;
      let rows = HISTORY_SEED.filter((t) => !deleted.has(t.id) && archived.has(t.id) === !!m.archived);
      // m.cwds = selected projects (empty = all). The real host expands each path to every spelling stored by Codex; here the keys are compared.
      if (Array.isArray(m.cwds) && m.cwds.length) { const keys = new Set(m.cwds.map(normKey)); rows = rows.filter((t) => keys.has(normKey(t.cwd))); }
      const words = String(m.query || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length) rows = rows.filter((t) => words.every((w) => (t.title + '\n' + t.project).toLowerCase().includes(w)));
      const start = m.cursor ? parseInt(m.cursor, 10) : 0;
      const size = words.length ? WANTED : PAGE;
      const page = rows.slice(start, start + size);
      const next = start + size < rows.length ? String(start + size) : null;
      const delay = parseInt(q.get('latency') || '120', 10);
      setTimeout(() => {
        const ev = { kind: 'threads', requestId: m.requestId, append: !!m.cursor, data: page };
        if (q.get('histerror')) { ev.error = 'app-server is not reachable'; ev.data = []; }   // like Java: an error comes without rows
        if (next) ev.nextCursor = next;
        window.codexUi.receive([ev]);
      }, delay);
      if (m.projects) setTimeout(sendProjects, delay + 60);
    },
    // chats per project (not archived, like the host)
    threadAction(m) {
      const known = HISTORY_SEED.some((t) => t.id === m.threadId) || (m.action === 'rename' && !!m.threadId);   // the open chat can be renamed too
      setTimeout(() => {
        if (q.get('fail') || !known) { push({ kind: 'threadAction', action: m.action, threadId: m.threadId, ok: false, error: known ? 'app-server is not reachable' : 'unknown chat' }); return; }
        if (m.action === 'rename') {   // like Codex: thread/name/set, then the History lists the new name
          const row = HISTORY_SEED.find((t) => t.id === m.threadId);
          if (row) row.title = m.name;
          window.codexUi.receive([{ kind: 'threadAction', action: 'rename', threadId: m.threadId, ok: true, name: m.name }]);
          return;
        }
        if (m.action === 'archive') archived.add(m.threadId);
        else if (m.action === 'unarchive') archived.delete(m.threadId);
        else if (m.action === 'delete') { deleted.add(m.threadId); archived.delete(m.threadId); }
        window.codexUi.receive([{ kind: 'threadAction', action: m.action, threadId: m.threadId, ok: true }]);
        setTimeout(sendProjects, 80);
      }, parseInt(q.get('latency') || '250', 10));
    },
    settingsSave(m) {
      console.log('[dev] settingsSave', JSON.stringify(m));
      settings = Object.assign({}, m); delete settings.type;   // like the host: every setting comes back
      setTimeout(() => window.codexUi.receive([{ kind: 'settings', settings }]), 60);
    },
    mentionSearch(m) {
      const items = rankFiles(m.query || '', 40).map((f) => ({
        path: CWD + '\\' + f.path.replace(/\//g, '\\'), name: nameOf(f.path), dir: f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '', folder: f.folder, project: 'shop'
      }));
      setTimeout(() => window.codexUi.receive([{ kind: 'mentions', requestId: m.requestId, items }]), parseInt(q.get('latency') || '30', 10));
    },
    dragEnter(m) { console.log('[dev] dragEnter (' + (m.types || []).join(', ') + '): Eclipse would put the SWT drop overlay on top now'); },
    // Eclipse resolves dropped text: lines that are existing files/folders become chips, other text goes into the input
    dropText(m) {
      const items = [];
      String(m.text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
        const rel = l.replace(/\\/g, '/').replace(normKey(CWD) + '/', '');
        const hit = FILES.find((f) => f.path.toLowerCase() === rel.toLowerCase());
        if (hit) items.push({ path: CWD + '\\' + hit.path.replace(/\//g, '\\'), name: nameOf(hit.path), folder: hit.folder, project: 'shop', projectPath: CWD });
        else if (/^[a-z]:[\\/]/i.test(l)) items.push({ path: l, name: l.split(/[\\/]/).pop(), folder: false, project: /billing/i.test(l) ? 'billing' : undefined, projectPath: /billing/i.test(l) ? 'C:\\work\\billing' : undefined });
      });
      if (items.length) push({ kind: 'context', action: 'addPaths', items });
      else push({ kind: 'insertText', text: m.text });
    },
    resumeThread(m) {
      openThread = m.threadId;
      const picked = HISTORY_SEED.find((t) => t.id === m.threadId);
      const now = Math.floor(Date.now() / 1000);
      push({ kind: 'thread', thread: { id: m.threadId, name: picked ? picked.title : 'Resumed chat', preview: '' }, cwd: picked ? picked.cwd : CWD, project: picked ? picked.project : 'shop', turns: (function () {
        const items = (fixture || []).filter((x) => x.method === 'item/completed').map((x) => x.params.item);
        const user = { type: 'userMessage', id: 'hu', content: [{ type: 'text', text: firstUserText() }] };
        const second = [{ type: 'userMessage', id: 'hu2', content: [{ type: 'text', text: 'Active file: src/main/java/shop/OrderService.java\n\nThanks. Now the same for the invoices.' }] },
          { type: 'agentMessage', id: 'ha2', text: 'Done: the invoice export uses the same paging now.', phase: 'final_answer' }];
        return [{ id: 'h1', startedAt: now - 7200, durationMs: 77000, items: [user].concat(items) }, { id: 'h2', startedAt: now - 600, durationMs: 4000, items: second }];
      })() });
    },
    pickFiles(m) {
      const pick = m.folder ? [{ path: CWD + '\\docs', name: 'docs', folder: true }] : [{ path: CWD + '\\README.md', name: 'README.md', folder: false }, { path: CWD + '\\pom.xml', name: 'pom.xml', folder: false }];
      push({ kind: 'context', action: 'addPaths', items: pick.map((x) => Object.assign({ project: 'shop', projectPath: CWD }, x)) });
    },
    listPlugins() {
      const mode = q.get('plugins');
      setTimeout(() => {
        if (mode === 'error') push({ kind: 'plugins', error: 'app-server is not reachable', items: [] });
        else push({ kind: 'plugins', items: mode === 'none' ? [] : PLUGINS.map((p) => Object.assign({ mention: p.id }, p)) });
      }, mode === 'slow' ? 2500 : 150);
    },
    goalSet(m) {
      goalTokens = 0;
      const mk = (status) => ({ threadId: 'dev-thread', objective: m.objective, status, tokenBudget: null, tokensUsed: goalTokens, timeUsedSeconds: Math.round(goalTokens / 40), createdAt: 1, updatedAt: 2 });
      push({ kind: 'goal', goal: mk('active') });
      const tick = setInterval(() => {
        goalTokens += 3100;
        push({ kind: 'notification', method: 'thread/goal/updated', params: { threadId: 'dev-thread', turnId: null, goal: mk(goalTokens > 9000 ? 'complete' : 'active') } });
        if (goalTokens > 9000) clearInterval(tick);
      }, 1200);
    },
    goalClear() { push({ kind: 'notification', method: 'thread/goal/cleared', params: { threadId: 'dev-thread' } }); },
    // instructions of the settings (VS Code host): Codex's developer_instructions, kept in memory here
    instrRead() { setTimeout(() => push({ kind: 'codexInstructions', text: devInstructions, agents: 'C:\\Users\\dev\\.codex\\AGENTS.md' }), 300); },
    instrWriteCodex(m) { devInstructions = m.text || ''; setTimeout(() => push({ kind: 'codexInstructions', text: devInstructions, agents: 'C:\\Users\\dev\\.codex\\AGENTS.md', saved: true }), 300); },
    openAgents() { console.log('[dev] openAgents: VS Code would open ~/.codex/AGENTS.md'); },
    // "Compact" in the footer: a turn with a contextCompaction item, the context usage drops
    compact() {
      const n = (method, params) => push({ kind: 'notification', method, params: Object.assign({ threadId: openThread }, params) });
      setTimeout(() => n('turn/started', { turn: { id: 'compact-1', status: 'inProgress', items: [] } }), 200);
      setTimeout(() => n('item/started', { item: { type: 'contextCompaction', id: 'cc-1' } }), 400);
      setTimeout(() => {
        n('item/completed', { item: { type: 'contextCompaction', id: 'cc-1' } });
        n('thread/tokenUsage/updated', { tokenUsage: { last: { totalTokens: 18400 }, total: { totalTokens: 18400 }, modelContextWindow: 258400 } });
        n('turn/completed', { turn: { id: 'compact-1', status: 'completed', items: [] } });
      }, 2200);
    },
    dropDebug(m) { console.log('[dev] dropDebug', JSON.stringify(m.info)); },
    openFile(m) {
      console.log('[dev] openFile', JSON.stringify(m));
      if (/missing/i.test(m.path)) push({ kind: 'toast', message: 'File not found: ' + m.path });
    },
    login() {
      push({ kind: 'auth', state: 'waiting', url: AUTH_URL });
      if (q.get('autologin')) setTimeout(() => push({ kind: 'auth', state: 'signedIn', account: { type: 'chatgpt', email: 'dev@example.com', planType: 'plus' } }), 2500);
    },
    loginCancel() { push({ kind: 'auth', state: 'signedOut' }); },
    retryDownload() { push({ kind: 'install', phase: 'downloading', version: '0.166.0', done: 10 * 1048576, total: 90 * 1048576 }); },
    sandboxSetup(m) {
      push({ kind: 'sandbox', state: 'running', mode: m.mode });
      setTimeout(() => push(m.mode === 'elevated' ? { kind: 'sandbox', state: 'failed', mode: 'elevated', error: 'The operation was canceled by the user' } : { kind: 'sandbox', state: 'ready' }), 1500);
    },
    retry() { console.log('[dev] retry'); },
    openDiff(m) { console.log('[dev] openDiff', m.path, m.kind); alert('Eclipse would open a Compare editor for\n' + m.path + '\n\n' + m.diff); },
    openTurnDiff(m) { alert('Combined diff:\n\n' + m.diff); },
    openUrl(m) { console.log('[dev] openUrl', m.url); },
    openSettings() { console.log('[dev] openSettings: VS Code would open its settings page'); },
    prefs(m) { console.log('[dev] prefs', m); }
  };

  window.__codexPost = function (json) {
    const m = JSON.parse(json);
    window.__posted.push(m);
    if (m.type !== 'ready' && m.type !== 'prefs') box.textContent += JSON.stringify(m) + '\n';
    const h = handlers[m.type];
    if (h) h(m); else console.log('[dev] unhandled', m);
  };
})();
