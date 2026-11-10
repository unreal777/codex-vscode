# Codexter (Codex Panel for VS Code): handoff

Visible name is **Codexter** since 0.4.0. The extension id stays `codexpanel.codex-panel`, the settings stay `codexPanel.*` and the vsix keeps the name `codex-panel-<version>.vsix`.

Read this first when you continue. Product spec: `CONCEPT.md`. This is a separate project from the Eclipse plugin in `..\codex-panel`:
never edit that folder from here (its Java core is still a useful reference for session, installer and history logic).

## Status (0.7.4)

- 0.7.4: system notifications, image preview, drawing and text on an attached image. See "0.7.4".

- 0.7.3: the Diff button of a changed file opens VS Code's git change view. See "0.7.3".

- 0.7.2: fast tab switch (built chats are kept), blue #sym references with their own tooltip. See "0.7.2".

- 0.7.1: tabs in the top bar (in place of the title), every opened chat and the new chat are tabs. See "0.7.1".

- 0.7.0: replies go on in the background, unread marks, notifications, today's chats as tabs. See "0.7.0".

- 0.6.1: lists in the input, pasted symbols as #sym: references, "Add MCP by name with AI". See "0.6.1".

- 0.6.0: MCP servers in the in-panel settings (on/off, check, remove, copy from VS Code mcp.json, add by name with AI). See "0.6.0".

- 0.5.9: AI search in the History panel; the quick model (commit messages, AI search) defaults to GPT-6-Luna. See "0.5.9".

- 0.5.8: faster commit messages (own model / effort, MCP servers off), new icon, input keeps 3 lines and stays open on Alt+Tab. See "0.5.8".

- 0.5.7: History rows show the first message (up to 500 characters) as tooltip.

- 0.5.6: last used chat per git branch. See "0.5.6".

- 0.5.5: Source Control button "Generate commit message" with Codex. See "0.5.5".

- 0.5.4: input grows while focused, compact models multi-select, default permissions, font size. See "0.5.4".

- 0.5.3: opening a project reopens the chat that was open there last. See "0.5.3".

- 0.5.2: **Attach files** shows two fixed rows (drop hint, "Choose files...") so it reads as a drop area. See "0.5.2".

- 0.5.1: back to the 0.4.0 layout (chips in the chat, message-only **Attach files** under it) plus pasted paths become chips. See "0.5.1".

- 0.4.0 = 0.3.0 (own web UI, history archive/delete, drop target, in-panel settings) + the Codexter rename and UI cleanup below.
  `npm run compile` 0 errors, `npm test` 46 tests, `npm run package` gives `dist\codex-panel-0.4.0.vsix`. 0.3.0 was verified live in the
  isolated VS Code; 0.4.0 is tested by the user in their own VS Code (they asked to test manually instead of the isolated instance).
- Git: this folder is its own repository (branch `main`), separate from the Eclipse plugin.
- Answered: Shift + drag onto the chat does NOT work on the user's Windows VS Code (no `[drop]` line from the page at all, only `[drop-tree]`).
- The web UI is this project's own: `web/` is the source, `scripts/sync-web.mjs` copies it to `media/web/` (generated, do not edit).
  `web/dev.html` + `dev-bridge.js` + `fixtures/` run the page in a plain browser (`python -m http.server` in `web/`), URL params
  `&settings=1` (open the settings view), `&fail=1` (thread actions answer an error), `&nosettings=1`.

## 0.7.4

- System notifications (core/osNotify.ts): VS Code's own notifications stay inside its window, so while VS Code is not focused
  ChatActivity.notify shows one of the system instead (setting `codexPanel.systemNotifications`, default on, also in the gear).
  Windows: a toast through `powershell.exe -Command -` (script on stdin, toast XML and PowerShell's app id in environment
  variables, so no user text is in the script); activationType protocol, launch = `<uriScheme>://codexpanel.codex-panel/open?thread=<id>`,
  handled by `registerUriHandler` in extension.ts (opens the chat at its last answer; activation event onUri). macOS osascript,
  Linux notify-send (no click action there). When it fails, VS Code's own notification. A test toast was shown on the dev machine;
  the click through the vscode:// link was not tested.
- Image preview (#imgview): click on an attached picture chip (or a picture of a sent message, preview only).
- openSketch(opts) is now a two-layer editor: base canvas (white, or opts.image at its own pixels, fitted into the surface) and the
  drawing canvas; the eraser uses destination-out on the drawing only. Text tool: an input at the click, Enter draws it (size from
  the brush slider). Undo (button, Ctrl+Z) keeps 30 drawing states. Save merges both layers into a PNG that replaces the image's
  url; a new sketch is attached as before. Checked in the isolated VS Code with a pasted 400x200 picture and synthetic pointer events.

## 0.7.3

- Diff of one file (DiffProvider.openFileDiff): when the file is in a git repository (git extension API getRepository) and is in
  its working tree, index or untracked changes, `git.openChange` opens VS Code's own change view (whole file, "a.ts (Working
  Tree)"). Otherwise (no git, change already committed) the before/after rebuilt from Codex's diff as before; the raw .diff text
  only when that fails too. A relative item path is resolved against the chat's folder. Checked in the isolated VS Code with a
  temporary repository.

## 0.7.2

- Tab switch: leaving a finished chat moves its feed nodes and item maps into `chatCache` (app.js stashChat, at most 12).
  openChat(id) (tabs, History) puts a kept chat back at once (restoreChat) and still asks the host to resume. The host's
  "thread" event is compared by turnSig(count, last turn id, last status) with the live signature (turn/started and
  turn/completed keep it current): unchanged -> the shown nodes stay; changed or in progress -> normal rebuild. Chats with a
  running reply are not kept. The page now drops notifications and approvals of another thread (the one just left, until the
  host switched); the session replays a left chat's approvals when it is opened again.
- Session resume asks thread/goal/get in parallel with thread/read and logs "[resume] id: n turns, resume x ms, total y ms".
- References: #input-hl now lies above the textarea (pointer-events only on the marks); with references the textarea text is
  transparent and the overlay draws it, the marks in textLink blue. Hover shows #sym-tip (name + file:line), placed with offsets
  (the old client-rect hit test broke with the page zoom of the font size setting); a click on a mark puts the caret behind it.

## 0.7.1

- Tabs: #tabs moved into #topbar; from two tabs on the bar gets `with-tabs`, which hides #title and #proj. VS Code's own view
  header ("Codexter | Chat") can not hold extension content, so this is the highest place.
- A chat becomes a tab when it is opened (threadChanged -> ChatActivity.opened adds it), not only when a message is sent. A new chat
  without a thread is a page-only "New chat" tab (no x). Closing the open tab (x, middle click, Delete) opens its neighbour, else a
  new chat. Tabs shrink to 64px before the strip scrolls.

## 0.7.0

- Session: leaving a chat (New chat, resume of another) no longer calls interrupt(); `leaveOpenThread()` moves {turnId, cwd} into
  `background`. Notifications of a background thread go to `backgroundNotification` (turn/started updates the turn, turn/completed
  removes it and calls host.turnDone(id, true, status)); nothing of it reaches the page. Approval requests of a background thread
  stay in pendingApprovals (host.needsApproval) and are re-emitted when the chat is opened again. resume() of a background chat
  takes it back: turnId restored, a synthetic turn/started after the thread event. A failed resume undoes the leave.
  newChat() reconnects for a Codex update only when nothing runs in the background. app-server close clears the map.
- Page loadThread keeps the last turn open when its status is inProgress (running = true), so the streamed rest lands in it.
- chatActivity.ts (host): unread marks in globalState `codexPanel.unread` (id -> ms, pruned after 3 days, core/chatList.ts),
  removed when the chat is opened (threadChanged). Today's chats in workspaceState `codexPanel.todayChats` {day (local), chats}:
  added on chatUsed (a sent message), titles from the page (`chatTitle`), hidden with the tab's x (`tabClose`). Event `chats`
  {unread, tabs: [{id, title, unread, running}]} is sticky. Notifications: a background reply that ends (info / warning when
  failed), an approval asked in the background, and the open chat's end while VS Code is not focused. "Open" reveals the view,
  resumes and sends `scrollToLastAnswer` (also when an unread chat is opened from a tab or the History).
- Page: #tabs below the top bar (shown from two tabs on, or one that is not open), blue dot `.udot` for unread (tabs and History
  rows), spinner while running; arrows / Enter / Delete on a focused tab; the wheel scrolls the strip.
- Not checked against the real Codex: a reply running in the background, its notification and taking it back (tests use a fake
  app-server; the tabs were checked in the isolated VS Code with a faked `chats` event).

## 0.6.1

- Lists (app.js listKey): LIST_RE = indent + "•" or "n." / "n)" + spaces. "- " / "* " typed at a line start (input event with
  inputType insertText and data " ") becomes "• ". Enter / Shift+Enter in an item inserts the next marker; on an empty item it
  outdents (2 spaces) or ends the list; Backspace right after the marker removes it; Tab / Shift+Tab indent by 2. Ctrl+Enter always
  sends. Changes go through execCommand("insertText") so Ctrl+Z works. The text keeps "•" (Codex reads it as a list).
- Symbol references: paste of one identifier-like line (SYM_TEXT, <= 120 chars) whose clipboard has "vscode-editor-data" asks the
  host (`pasteRef`); panel.pastedRef finds an editor selection with exactly that text (active, then visible editors) and answers
  {path, rel, startLine, endLine}. The page replaces the pasted text with `#sym:name` (a second, different "name" gets _n).
  #input-hl is a copy of the text behind the transparent textarea with <mark> for the tokens (synced on input, scroll, autoGrow);
  the tooltip hit-tests the marks. On send the live refs become contexts kind "symbol"; the host puts
  "Referenced symbols (#sym:name = file:line):" lines before the text (stripped from titles and from the history bubble, where
  symbolsOf() reads them back to make the tokens clickable). Copilot's own paste provider is not available to a webview, hence the
  selection match.
- Settings: "Add by name" is now "Add MCP by name with AI".
- Checked in the isolated VS Code with synthetic key / paste events and a faked pasteRef answer (no real editor selection).

## 0.6.0

- Settings > MCP servers (VS Code host only). All writes go through the app-server (`config/batchWrite`, mergeStrategy replace,
  reloadUserConfig true) into the user config.toml, then `config/mcpServer/reload`. Codex keeps comments and layout of the file.
  Verified against the real codex 0.166 with a temporary CODEX_HOME: add a table, `mcp_servers.<n>.enabled = false`, value null
  removes the table. `config/read` gives mcp_servers with env / headers: only name, on/off and command line or URL go to the page.
- Check = `mcpServerStatus/list {serverName, detail: toolsAndAuthOnly}`: starts the server, answers tools or toolsError.
- From VS Code: User/mcp.json (globalStorage/../..) and each folder's .vscode/mcp.json, JSONC with BOM. Names: last segment of the
  key ("oraios/serena" > serena). ${input:x} is asked with an input box, ${env:X} and ${userHome} are replaced; SSE, envFile and
  other variables (${workspaceFolder}) can not be copied. "In Codex" = same name, URL, or command + args.
- Add by name: `codex exec` with the quick model and `-c web_search="live"`, prompt asks for one JSON object (parseFindAnswer).
  VS Code shows a modal with the command, notes and source; only "Add" writes. Env variables of the proposal are asked one by one.
- A bare command that is not on PATH but in ~/.local/bin, ~/.cargo/bin, ~/scoop/shims or %APPDATA%\npm is written as full path
  (resolveCommand): serena.exe of uv was in ~/.local/bin, which is not on PATH, so Codex said "program not found" while Copilot ran it.
- Checked in the isolated VS Code with CODEX_HOME = a temp folder and a test mcp.json: list, off/on, Check (error and "23 tools"
  for serena), copy from VS Code. Not checked live: Remove (native modal) and Add by name (real Codex run).

## 0.5.9

- AI search (History, VS Code only: the "AI" toggle is shown for host vscode). With AI on, typing does not search; Enter posts
  `aiSearch {requestId, query, cwds, archived}`. `CodexSession.aiSearch` lists the newest chats of the selection (up to AI_MAX_CHATS = 300,
  first message cut to 300 characters, list at most 90 000 characters, src/core/aiSearch.ts), asks `host.ask(prompt)` once and answers
  with a normal `threads` event plus `ai: true` (no paging), rows in the order of the answer. The answer is the chat numbers
  ("12, 3, 40" or "none"); `parseSearchAnswer` ignores dates, duplicates and numbers out of range, max 30.
  `host.ask` (extension.ts) is a `codex exec` in os.tmpdir() (no project AGENTS.md) with the commit message model / effort and MCP
  servers off, log tag `[search]`. The page keeps the last AI answer for the same query + projects + archived switch, so AI off/on or
  reopening the History costs no new run.
- `codexPanel.commitMessageModel` now defaults to `gpt-6-luna` (DEFAULT_QUICK_MODEL); '' = the Codex default (config.toml), no longer the
  chat's default model. The in-panel field is "Model for commit messages and AI search".
- Checked in the isolated VS Code with the aiSearch request answered by fake rows (window.__codexPost wrapped): toggle, placeholder,
  "Press Enter" hint, loading text, result rows, answer reused after AI off/on. A real AI search run was not made.

## 0.5.8

- Commit messages were slow: no model setting meant the user's config.toml default (gpt-6.1-terra, effort xhigh), and every
  `codex exec` started all MCP servers of config.toml. Now `codexPanel.commitMessageModel` ('' = defaultModel, else Codex default; changed in 0.5.9) and
  `codexPanel.commitMessageEffort` (default low), also in the in-panel settings; each server of config.toml gets
  `-c mcp_servers.<name>.enabled=false` (`mcpServerNames()` reads `[mcp_servers.<name>]` tables of $CODEX_HOME or ~/.codex config.toml).
  `-c mcp_servers={}` does NOT work (merged, not replaced), and servers from elsewhere (a plugin, e.g. postman-mcp) must not be named:
  "failed to load bootstrap configuration". The log shows how long the run took.
- Icon: media/commit-light.svg / commit-dark.svg (sparkle in a rounded box), instead of `$(terminal)`.
- Input: closed it shows up to 3 lines (empty: 1). Collapse waits 400 ms and is skipped when the host reports that VS Code lost the
  OS focus (`windowFocus` event from `onDidChangeWindowState`); back in VS Code with the focus elsewhere it collapses then.
  Checked in the isolated VS Code with synthetic focus events (open 512 / app switch 512 / back elsewhere 69 / click elsewhere 69).

## 0.5.7

- `threadPreview()` in core/threadRows.ts: thread/list `preview` without the extension's context lines, line breaks kept, cut at 500
  (`MAX_PREVIEW`). Sent as `preview` in every `threads` row; the page uses it plus the cwd as the row's `title` tooltip.
- How long Codex's own `preview` is was not checked; if Codex shortens it, the tooltip is shorter too.

## 0.5.6

- `src/core/branchChats.ts` (decisions, unit tested in branch.test.ts) and `src/branchChats.ts` (git extension API: HEAD of every
  repository, `state.onDidChange`). Map in workspaceState `codexPanel.branchChats`: `<root lowercased, />|<branch>` -> `{ thread, at }`,
  entries older than 30 days pruned on every load.
- A chat is recorded for a branch when a message was sent in it (`SessionHost.chatUsed` after turn/start), not when it was only opened.
- HEAD moved to another branch: that branch has a chat -> `session.resume(id, 'switch')` (replaces the open chat; skipped with a message
  while a reply runs; on failure the entry is forgotten). No chat, the branch is new (same commit as before) and the open chat is the one
  of the old branch -> the entry moves to the new branch (start on master, branch at the end). Detached HEAD is ignored.
- Startup: `takeLastThread(cwd)` waits up to 5 s for the git extension and prefers the branch's chat over `codexPanel.lastThread`.
- `session.resume(id, mode)`: user | restore | switch (was a quiet flag), returns whether the chat is open.
- Not checked live (needs real chats and branch switches); the user tests it.

## 0.5.5

- Copilot's sparkle sits in the commit box through the proposed `scm/inputBox` menu (`contribSourceControlInputBoxMenu`); a published
  extension can not use it, so Codexter's button is in `scm/title` (codicon `$(terminal)`, looks like the >_ logo).
- `src/commitMessage.ts` (VS Code glue, git extension API v1: diff(staged), state, log, inputBox) and `src/core/commitMessage.ts`
  (prompt, `execArgs`, `cleanMessage`, `runCodexExec`; unit tested with a fake codex in commit.test.ts). The run is
  `codex exec --ephemeral --skip-git-repo-check -s read-only -o <tmp file> [-m model] [-c model_reasoning_effort=...] -` with the prompt
  on stdin, cwd = repository root, 180 s timeout, one run per repository at a time. Model/effort = `codexPanel.defaultModel` / `defaultReasoningEffort`.
- Not run against the real Codex here (it would use the subscription); the user tests it.
- Reminder: never put backtick text into a Bash tool heredoc, even a quoted one; it gets executed (this happened again in 0.5.5 and
  started a stray `codex exec`). Write scripts and commit messages to files.

## 0.5.4

- Input (`autoGrow` in web/app.js): while the focus is in `#dock` it grows with its text up to half the panel (min 180 px); when the focus
  leaves `#dock` (focusout with relatedTarget outside, also when VS Code takes the focus) it shrinks to one line and scrolls. The CSS
  max-height of `#input` is gone.
- Settings view: the models list is a compact multi-select (button with the visible names + n/m, checkbox list below; Escape or a click
  outside closes it; descriptions are tooltips). New `codexPanel.defaultPermissions` ('' = keep the last used, else ask | auto | full |
  custom, applied by `applyDefaults` like the default model) and `codexPanel.fontSize` (0 = VS Code's `--vscode-font-size`, else 8..32 px).
- Font size zooms the whole page (`document.documentElement.style.zoom = size / --vscode-font-size`) because app.css has many px sizes;
  `autoGrow` divides innerHeight by the zoom. Checked in the isolated VS Code (input 309 px focused / 31 px blurred at 618 px, zoom 1.23 at 16).
- package-lock.json: `mkdirp-classic` is also 0.5.3, so version bumps must only change the two project entries (lines 3 and 9).

## 0.5.3

- The id of the open chat is kept in `workspaceState` (`codexPanel.lastThread`, so per folder / workspace). `SessionHost.threadChanged(id|null)`
  is called on thread/start, on a successful resume and on New chat (also archive / delete of the open chat, which go through newChat).
- The first page of a window with a workspace folder asks `takeLastThread()` (once per window; any chat change before it wins) and calls
  `session.resume(id, quiet=true)`. Quiet: skipped if a chat is already open, and on failure (deleted elsewhere, ...) it only logs a warning
  and forgets the id instead of showing an error. Not checked live against the real Codex (resume of a real thread); unit test in history.test.ts.

## 0.5.2

- The user wanted Attach files to look like a drop area when empty (and chips there instead of in the chat if possible). Native views take
  no custom CSS and can not draw chips, so the chips stay in the chat.
- Tried `viewsWelcome` (centred column, codicons): VS Code hides the tree (`.pane-body.welcome > :not(.welcome-view) { display: none }`)
  and a drop on the welcome content reaches nobody (proven with `tools/drag-probe.mjs`, no `[drop-tree]` line). Do not use it.
- Now the tree has two fixed rows: `$(cloud-upload)` "Drop files, folders or editor tabs here" and `$(folder-opened)` "Choose files..."
  (command `codexPanel.attachFiles`, `showOpenDialog` with files only, then `addFiles`). Drops on a row and on the empty space below both
  work (proven with drag-probe, chip appeared). `TreeView.message` is plain text in the 1.90 API, so it was dropped.
- Fixed `package-lock.json`: the 0.5.1 version bump had also changed `asynckit` to 0.5.1; it is 0.4.0 again.

## 0.5.1

- 0.5.0 (commit 8122a61, reverted) turned Attach files into the list of attached files; the user wants the chips in the chat and only a small drop area,
  so 0.5.1 restores the 0.4.0 layout. Attach files can not be smaller: VS Code gives every extension view a minimum body of ~120 px
  (`ViewPane` default `minimumBodySize`). Its message no longer mentions Shift.
- Why the chat (incl. the chip row) can not take the drop while the tree below it can: the chat is a webview; during a drag that starts inside
  VS Code the workbench sets the webview iframe to `pointer-events:none` (`WebviewWindowDragMonitor`, unblocks only for drag/dragover with
  shiftKey, which did not work here). The tree is native workbench UI. Copilot Chat works because it is native too. The data format does not
  matter (links instead of files would not help): the page receives no event at all.
- Workaround in the page: pasting text whose lines are all file paths / file: URIs (quotes stripped, max 50) posts `dropText`; the host makes
  chips of existing files/folders and puts anything else back into the input (`insertText`).

## 0.4.0

- Rename (visible names only): package.json titles `Codexter: ...`, "Add to Codexter chat", output channel "Codexter".
- The page's `#btn-new` / `#btn-set` are hidden in VS Code (`media/vscode.css`; the view title has + and a gear). `showSettings` TOGGLES the settings view; closing it focuses the gear if visible, else the input.
- Drops: VS Code blocks webview views during workbench drags unless Shift is held (webview iframe gets pointer-events:none on drag/dragover without shiftKey), so Shift+drop on the chat is the main way. The `Attach files` tree (`dropTarget.ts`) shows no items any more (message only), `initialSize` 1 vs chat 12. Chip mirroring (`chips` message, `onChips`, `removeAttachment`, page `removePath`) was removed.

## 0.3.0

- **History actions.** Row buttons Archive (Unarchive when "Show archived" is on) and Delete, visible on hover / focus / keyboard selection.
  Delete asks inline in the row (Escape or Cancel = back; Delete key asks too). Page posts `threadAction {action, threadId}`; `CodexSession.threadAction`
  calls `thread/archive|unarchive|delete` (30 s), answers `threadAction {action, threadId, ok, error?}`, drops the survey cache and re-sends
  `historyProjects`. Archiving/deleting the open chat starts a new one (session and page). `listThreads.archived` → `thread/list archived`.
  `renderHistory()` keeps the focus of a row button across re-renders (the next history page arriving used to drop the focus of Cancel).
- **Settings.** `codexPanel.defaultModel`, `codexPanel.defaultReasoningEffort`, `codexPanel.hiddenModels` (`contributes.configuration`). The page gets
  them as `init.settings` and `settings` events (also after edits in settings.json) and saves with `settingsSave` (Global target, only changed values).
  The gear (page) and the view title gear command (`showSettings` event) open the in-panel settings view; "More settings…" posts `openSettings`
  (VS Code settings `@ext:codexpanel.codex-panel`). Defaults are applied on New chat, at startup while no chat is open and when settings change while
  the chat is still empty; a loaded thread is never overridden. A hidden or unknown default model falls back to Codex's default. The picker shows only
  visible models plus the current one if hidden.
- **Drops.** (1) `dropdata.js` was never loaded by `panel.ts` → `window.CodexDrop` undefined → Windows Explorer drops posted nothing. The script list
  is now `core/webScripts.ts` `WEB_SCRIPTS`, tested against `web/index.html`. (2) VS Code never delivers workbench drags (editor tabs, its own
  Explorer) to a webview view, with or without Shift. So `src/dropTarget.ts` adds a tree view **Attach files** (`codexPanel.drop` /
  `codexPanel.dropSecondary`, `initialSize` 1 vs 4 for the chat) with a `TreeDragAndDropController`; candidates parsed by `core/dropUris.ts`
  (`text/uri-list`, `application/vnd.code.uri-list`, `resourceurls`, `codeeditors`, `files`, `text/plain` as last resort), logged as `[drop-tree] ...`,
  then `handleDrop` like every other drop. The page posts `chips` (attached files/folders) → the tree lists them; its inline × (`codexPanel.removeAttachment`)
  posts `context removePath`. The active-file chip is hidden while the same file is attached.
- **Proven live** (isolated VS Code, `tools/drag-probe.mjs`): editor tab → Attach files (`resourceurls`, `codeeditors`, `application/vnd.code.uri-list`
  arrive; tree gets `text/uri-list`), VS Code Explorer → Attach files, external (Windows Explorer-like) drop → chat webview, × removes, settings view
  saves to settings.json and follows manual settings.json edits, history row actions + inline confirm + Escape, Show archived (listing only; no real
  chat was archived or deleted). Not proven: a synthetic external drop onto the tree view did not arrive (CDP limitation or VS Code; the chat itself
  takes Windows Explorer drops), a real archive/delete round trip in the UI (covered by unit tests against a fake server and the smoke method checks).

## Architecture

- `src/core/*`: no vscode imports, ports of the Java core (`JsonRpcConnection`, `AppServerClient`, `CodexLocator`, `CodexInstaller`, `TarExtractor`,
  `FileLinks`, `FileIndex`, `ThreadRows`, `DroppedPaths`, `UnifiedDiff`). `http.ts` is the proxy-aware HTTPS GET (CONNECT tunnelling via `http`/`https`/`tls`).
- `src/session.ts` (port of `CodexSession`) and `src/updater.ts` (port of `CodexUpdater`) take their settings through the `SessionHost` /
  `UpdaterHost` interfaces, so they have no vscode imports either. One session (= one `codex app-server`) per window; work that the Java
  code runs on its executor is chained with `submit()`, history requests run beside it.
- `src/panel.ts`: `WebviewViewProvider` (`codexPanel.chat`), CSP with nonce, `asWebviewUri`, `localResourceRoots` = `media/`, `retainContextWhenHidden`.
  Host to page: batches (arrays) via `postMessage`, flushed every 50 ms once the page said `ready`. Page to host: JSON strings. Handles all message
  types of `CodexView.handleMessage`; `dragEnter` is ignored (it only exists for the Eclipse SWT drop overlay).
- `src/workspace.ts` (`WorkspaceBridge`): target = workspace folder of the active editor, else the first folder, else the home directory.
  `openFile` resolves like `FileLinks.resolve`, selects line/range, reveals folders in the Explorer.
- `src/mentions.ts`: `findFiles` + `FileSystemWatcher` (created/deleted only), `files.exclude` + `search.exclude` + the Java ignore list,
  30 s max age; folders outside the workspace are scanned from disk. `src/diff.ts`: `codexpanel-diff:` content provider, `vscode.diff`, `vscode.changes`
  for several files (falls back to one diff per file).
- `media/vscode-bridge.js` (loaded before `app.js`) and `media/vscode.css` (maps `--vscode-*` to the page variables with `html:root.vscode`
  specificity). `media/web/` is generated, ignored by git.
- Managed Codex: `%LOCALAPPDATA%\CodexPanel\codex\<version>\` + `current.json` `{version, exePath, previous, installedAt, lastCheck}`, written with the same keys,
  order, temp file (`current.json.tmp`, atomic rename), temp folders (`.tmp-<version>`, `.dl-<version>.tgz`) and cleanup rules as `CodexInstaller.java`.
  The "lock" is the same as in Java: one install at a time per process (`synchronized` / promise chain); there is no cross-process file lock.

## Web UI (`web/`, this project's own)

- `host` variable from `init.host` (the panel sends `vscode`; the `eclipse` branch is a leftover of the shared origin).
- The page's own `drop` handler reads `text/uri-list` / `application/vnd.code.uri-list` (and `ResourceURLs`/`CodeFiles`/`CodeEditors`) via `dropdata.js`
  and posts them as `dropText`; the host resolves them like `DroppedPaths`. Only drags from outside VS Code reach it (see 0.3.0 Drops).

## 0.2.0 host specifics

- **Secondary side bar.** `package.json` contributes `viewsContainers.secondarySidebar` (`codexPanel.secondary`, view `codexPanel.chatSecondary`, `when: !codexPanel.noSecondarySidebar`) and the
  activity bar fallback (`codexPanel`, view `codexPanel.chat`, `when: codexPanel.noSecondarySidebar`). `extension.ts` sets the context key from `vscode.version` (`core/vscodeVersion.ts`,
  secondary side bar from 1.106) and needs `activationEvents: ["onStartupFinished"]` so the key exists on old versions. engines stays `^1.90.0` (the unknown contribution point is ignored there).
  Two `CodexViewProvider` instances (one per view id, same class, same session); `current()` in `extension.ts` picks the visible/last opened one, and every command (open, Ctrl+Alt+C,
  add to chat, new chat, ask/explain/fix, settings) goes through `showView()`/`current()`. `post()` drops events while a provider has no view.
- **Drops.** The page's `document` listeners cover the whole view and call `preventDefault` on dragenter/dragover for every type. Official extension (read only): its webview does not parse VS Code's
  CodeEditors/ResourceURLs formats at all; it only uses `dataTransfer.files` (File objects, plus Electron `getPathForFile`) and text/uri-list in libraries (ProseMirror, a URL-list helper). So our parsing of
  CodeEditors etc. goes beyond it. The debug output of the next real test: View > Output > "Codexter", lines `[drop] dragenter, formats: ...`, `[drop] dataTransfer types ...`, `[drop]   <type> = "<first 300 chars>"`, `[drop] files (...)`.
- **"+" > Files and folders** (`pickFiles`): `showOpenDialog` can not combine files and folders on Windows/Linux (falls back to folders), so there a quick pick "Files / Folders" comes first; macOS gets one dialog with both.
- Prefs: `globalState` `codexPanel.permissions` (`Prefs.permissions()` migrates the old `mode`/`approvals` keys when it was never set; they are not deleted).
- Images folder for the `localImage` fallback: `<globalStorage>/images`.

## Settings and state

- `contributes.configuration`: `codexPanel.codexPath`, `codexSource` (managed|own), `updateIntervalDays` (7), `autosave` (true),
  `defaultModel` (''), `defaultReasoningEffort` ('', enum), `hiddenModels` ([]).
- `globalState`: `codexPanel.model|effort|permissions` (defaults `''`, `''`, `ask`; legacy `mode`/`approvals` only read to migrate), `codexPanel.lastUpdateCheck`
  (bookkeeping only; the authority for "is a check due" is `lastCheck` in the shared `current.json`, so a check by Eclipse counts too).
- Changing `codexPath`/`codexSource` reconnects the app-server unless a turn is running.

## Tests

- `npm test`: `src/test/installer.test.ts` (urls, manifest, tar security incl. zip-slip, symlinks, pax, truncation, sha512, full install into a temp base with
  a faked `codex.exe` = node.exe, `current.json` format, CONNECT proxy against the real registry) and `src/test/core.test.ts` (links, thread rows,
  dropped paths with umlauts/spaces/file URIs, file index, unified diff, JSON-RPC against a fake app-server, proxy resolution).
  Tests clean their temp folders on exit.
- `npm run smoke`: real app-server, read-only methods only. Do not extend it with `thread/start` or `turn/start` (real quota and history).
- `src/test/history.test.ts` (0.3.0): archive/unarchive/delete request shapes, `thread/list archived`, `threadAction` ok/error/open-chat/survey reload
  against a fake server, the new settings and drop views in package.json, `WEB_SCRIPTS` vs `web/index.html`, `candidatesOf` (drop-tree parsing).
  The smoke test calls archive/unarchive/delete only with the id `00000000-0000-4000-8000-000000000000` (method known, thread missing).
- Live test in an isolated instance (never the user's profile): `tools/live-vscode.ps1 [-Vsix] -ProfileName <name> -Workspace <folder>` (profile under
  `%TEMP%\codexpanel-vscode-live`, DevTools port 9334), `node tools/cdp-vscode.mjs list | eval "<js in the page>" | workbench "<js>" | shot <png>`,
  `node tools/drag-probe.mjs "<label>" noshift tab|explorer|external` (env `DST=x,y` aims the drop, e.g. at the Attach files pane body;
  `DRAGOVERS=n`). Close it with `CloseMainWindow` on the Code.exe whose command line contains `codexpanel-vscode-live`.
  Careful: never pass text with backticks through a bash heredoc in this environment (they ran as commands once); write scripts to a file first.

## Not verified / open items

- Seen in a real (isolated) VS Code since 0.3.0: secondary side bar placement, webview rendering (dark theme), history, settings, drops.
  Still not: image turns, plan mode, goals, plugin icons, light/high-contrast themes, `vscode.changes` for multi-file diffs, context menu placement,
  `Ctrl+Alt+C`, sign-in round trip, sandbox setup card, the activity bar fallback (VS Code < 1.106) incl. its Attach files view.
- Workspace Trust: the extension does not declare a trust policy (Codex asks before commands in "Ask me" mode). Decide if untrusted workspaces should be blocked.
- `.cmd` wrappers for `codexPath` are started through `cmd.exe /c` like the Java code; not tested.
- `Instant` strings written by Java have nanoseconds; JavaScript writes milliseconds. Both parse in both directions (tested for the read direction here).
- Like Java, an install start deletes `.tmp-*` / `.dl-*` leftovers of the shared folder. If Eclipse and VS Code download at the very same moment, one can remove
  the other's temp files and that install fails with an error (the next check retries). Not fixed on purpose: Eclipse behaves the same.
- History project checklist (both IDEs, see `..\codex-panel\HANDOFF.md` 0.4.0): `init.openProjects` / event `openProjects` come from all workspace folders
  (`WorkspaceBridge.openProjects`, `onDidChangeWorkspaceFolders`); `listThreads.cwds` is expanded to all known spellings in `CodexSession.listThreads`
  (`expandCwds`, survey in `loadSurvey`). Not seen in a real VS Code yet.
- Windows drive letter: every path to Codex or the page goes through `core/winPath.normalizeDrive` (`fsPathOf(uri)` in `workspace.ts` wraps `Uri.fsPath`;
  do not use `Uri.fsPath` directly). `media/vscode.css` zeroes the body padding VS Code adds to webviews; the composer row wraps at ~280 px (app.css).
- `npm test` has 46 tests (0.2.0 added `src/test/ui.test.ts`: permissions mapping + migration, turn input, collaborationMode/goal/plugin request params against an echo server, plugin mapping, drop payloads incl. CodeEditors
  read from the shipped `media/web/dropdata.js`, version switch, package.json contributions). `npm run smoke` also checks that `thread/list` takes `cwd` as an array, calls `plugin/installed`, and validates the
  turn/start input shapes (text + mention + image data URL, localImage, collaborationMode) and `thread/goal/get` against a thread id that does not exist ("thread not found" = shape accepted); it still creates no thread, turn or goal.
