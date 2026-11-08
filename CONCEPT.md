# Codex Panel for VS Code: concept

Goal: a Codex chat panel for VS Code. It started as a one-to-one port of the Eclipse plugin (`..\codex-panel`); the Java code is still
a useful reference for the core (session, installer, history), but the two are separate projects now and VS Code gets its own features.

## Principles

- **Own web UI, separate project.** Since 0.3.0 the page lives in this project's `web/` (`app.js`, `app.css`, `filelinks.js`, `dropdata.js`,
  `vendor\`, plus `dev.html` / `dev-bridge.js` / `fixtures\` for a plain browser). It started as a copy of the Eclipse plugin's page, but the two
  projects are developed separately now: never change `..\codex-panel` from here. `scripts/sync-web.mjs` copies `web/` into `media/web/`
  before every build. The page still accepts `init.host` (`"vscode"`) from its Eclipse origins.
- **Same bridge contract.** Host to page: `window.codexUi.receive([event, ...])`. Page to host: `window.__codexPost(JSON.stringify(msg))`.
  In VS Code a small shim (`media/vscode-bridge.js`, loaded before `app.js`) maps these to `acquireVsCodeApi().postMessage` and the
  webview `message` event. All message types of `CodexView.java` (`ready`, `send`, `interrupt`, `newChat`, `listThreads`,
  `mentionSearch`, `dropText`, `resumeThread`, `approval`, `openFile`, `retryDownload`, `openDiff`, `openTurnDiff`, `openUrl`,
  `openSettings`, `retry`, `login`, `loginCancel`, `sandboxSetup`, `prefs`, ...) are handled.
- **Shared managed Codex.** Same folder and format as Eclipse: `%LOCALAPPDATA%\CodexPanel\codex\<version>\` with `current.json`.
  Both IDEs use one copy per Windows user and must not break each other (atomic install, same file layout, same locking rules
  as `CodexInstaller.java`). Fetched only from `registry.npmjs.org`, stable tags only, sha512 checked, zip-slip safe, only
  `codex.exe --version` is executed from the download. Weekly background check, applied on New chat or window reload.
- **No runtime dependencies.** TypeScript compiled with `tsc` to `out/`. Dev dependencies only: `typescript`, `@types/vscode`,
  `@types/node`, `@vscode/vsce`. Tar/gzip handled with `zlib` and a small tar reader (port of `TarExtractor.java`).
- **Backend developers need no npm.** They install a `.vsix` (Extensions view > ... > Install from VSIX).

## VS Code mapping

| Eclipse | VS Code |
|---|---|
| `CodexView` (SWT Browser, WebView2) | `WebviewViewProvider`, views `codexPanel.chatSecondary` in the secondary side bar container `codexPanel.secondary` (VS Code 1.106+) or, before that, `codexPanel.chat` in an activity bar container (`when` on the context key `codexPanel.noSecondarySidebar`, set from `vscode.version`); one provider class serves both ids; `retainContextWhenHidden`; strict CSP with nonce, `localResourceRoots` = `media/` |
| Eclipse theme colours | CSS variables `--vscode-*` mapped to the page's `--bg`, `--fg`, `--accent`, `--font`; `data-theme` from `activeColorTheme.kind`; update on theme change |
| `CodexSession`, `AppServerClient`, `JsonRpcConnection` | ported 1:1 (`src/core/`, `src/session.ts`): one `codex app-server` per window, cwd fixed per thread with the banner, approvals `approvalsReviewer`, history via `thread/list` with the same params |
| `WorkspaceBridge.resolveTarget` | workspace folder of the active editor, else the first workspace folder; project name = folder name |
| file links (`openFile`) | `vscode.window.showTextDocument` at line/column; paths resolved like `FileLinks.java` |
| `CompareHelper` diffs | `vscode.diff` with virtual documents (`codexpanel-diff:` scheme) built from the unified diff like `UnifiedDiff.java` |
| `MentionSearch` / `FileIndex` | `vscode.workspace.findFiles` + `FileSystemWatcher`; ranking ported from `FileIndex.java` |
| `PanelDrop` (SWT overlay) | two drop targets. Drags from outside VS Code (Windows Explorer) reach the webview: the page reads them with `dropdata.js` and posts `dropText`. Drags from inside VS Code (editor tabs, VS Code Explorer) never reach a webview view (VS Code blocks the iframe during a workbench drag), so a small native tree view **Attach files** (`codexPanel.drop` / `codexPanel.dropSecondary`, `TreeDragAndDropController`) sits under the chat in both view containers; it reads `text/uri-list`, `application/vnd.code.uri-list`, `resourceurls`, `codeeditors`, `files` and lists the attached chips (mirrored from the page). Both paths end in `handleDrop`, resolved like `DroppedPaths.java` |
| "Add to Codex chat" menu, `AskSelectionHandler` | commands in `explorer/context`, `editor/context`, `editor/title/context` |
| `Ctrl+Alt+C` | focus the Codex view |
| Preferences page (`Prefs`) | `contributes.configuration` `codexPanel.*` (codex path, source managed/own, update interval days, autosave, and since 0.3.0 `defaultModel`, `defaultReasoningEffort`, `hiddenModels`); the panel's gear opens an in-panel settings view for the last three ("More settings…" opens VS Code's settings); the current model/effort/permissions are kept in `globalState` (0.2.0: permissions replaces mode + approvals, migrated) |
| — (VS Code only) | history actions: archive, unarchive, delete (`thread/archive`, `thread/unarchive`, `thread/delete`), "Show archived" (`thread/list archived:true`) |
| `EclipseProxy` | VS Code `http.proxy` / `http.proxyStrictSSL` and `HTTPS_PROXY` env for the download; passed on to the Codex process like the Java code does |
| Eclipse log | `LogOutputChannel` "Codex Panel" |
| sign-in | `account/login/start` URL opened with `vscode.env.openExternal` |

## Tests

- `npm test`: Node tests (no VS Code needed) porting the Java harness checks: installer security (sha mismatch, zip-slip,
  non-stable tags, links), file links, thread rows, dropped paths, file index ranking, unified diff.
- `npm run smoke`: real `codex app-server`, read-only (`account/read`, `model/list`, `thread/list`). It must not create, archive, unarchive or
  delete threads (those methods are only called with an id that does not exist, to prove they are known).
- Live check in an isolated VS Code (`tools/live-vscode.ps1`: `--user-data-dir` and `--extensions-dir` in a temp folder,
  `--remote-debugging-port=9334`), driven over DevTools with `tools/cdp-vscode.mjs`; drags proven with `tools/drag-probe.mjs`.
  Never touch the user's own VS Code profile.

## Later (not in the first version)

- (done) History filter with checkboxes, preselecting the project(s) open in the IDE (both IDEs).
