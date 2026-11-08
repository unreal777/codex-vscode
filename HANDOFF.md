# Codexter (Codex Panel for VS Code): handoff

Visible name is **Codexter** since 0.4.0. The extension id stays `codexpanel.codex-panel`, the settings stay `codexPanel.*` and the vsix keeps the name `codex-panel-<version>.vsix`.

Read this first when you continue. Product spec: `CONCEPT.md`. This is a separate project from the Eclipse plugin in `..\codex-panel`:
never edit that folder from here (its Java core is still a useful reference for session, installer and history logic).

## Status (0.4.0)

- 0.4.0 = 0.3.0 (own web UI, history archive/delete, drop target, in-panel settings) + the Codexter rename and UI cleanup below.
  `npm run compile` 0 errors, `npm test` 46 tests, `npm run package` gives `dist\codex-panel-0.4.0.vsix`. 0.3.0 was verified live in the
  isolated VS Code; 0.4.0 is tested by the user in their own VS Code (they asked to test manually instead of the isolated instance).
- Git: this folder is its own repository (branch `main`), separate from the Eclipse plugin.
- Open: does Shift + drag of editor tabs / VS Code Explorer items onto the chat work with a real mouse (synthetic CDP drags could not prove it)?
- The web UI is this project's own: `web/` is the source, `scripts/sync-web.mjs` copies it to `media/web/` (generated, do not edit).
  `web/dev.html` + `dev-bridge.js` + `fixtures/` run the page in a plain browser (`python -m http.server` in `web/`), URL params
  `&settings=1` (open the settings view), `&fail=1` (thread actions answer an error), `&nosettings=1`.

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
