# Codexter (Codex Panel for VS Code): handoff

Visible name is **Codexter** since 0.4.0. The extension id stays `codexpanel.codex-panel`, the settings stay `codexPanel.*` and the vsix keeps the name `codex-panel-<version>.vsix`.

Read this first when you continue. Product spec: `CONCEPT.md`. This is a separate project from the Eclipse plugin in `..\codex-panel`:
never edit that folder from here (its Java core is still a useful reference for session, installer and history logic).

## Status (0.5.8)

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

## 0.5.8

- Commit messages were slow: no model setting meant the user's config.toml default (gpt-6.1-terra, effort xhigh), and every
  `codex exec` started all MCP servers of config.toml. Now `codexPanel.commitMessageModel` ('' = defaultModel, else Codex default) and
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
