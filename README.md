# Codexter (Codex Panel for VS Code)

Codexter is the visible name since 0.4.0. The extension id stays `codexpanel.codex-panel`, the settings stay `codexPanel.*` and the vsix keeps the name `codex-panel-<version>.vsix`.

A Codex chat panel for VS Code (it started as a port of the Codex Panel plugin for Eclipse; the two are separate projects now): streaming answers, reasoning
accordion, command and file-change cards, approval buttons, plan checklist, diffs, clickable file links, history search across all projects,
`@` file mentions, drag and drop, "Add to Codexter chat", goals, plan mode, images and plugins. It talks to `codex app-server` (JSON-RPC over stdio).
The page lives in `web/` (`app.js`, `app.css`, `filelinks.js`, `dropdata.js`); design notes are in `CONCEPT.md`.

Codex itself is downloaded from the npm registry and kept up to date by the extension, into `%LOCALAPPDATA%\CodexPanel\codex`
(the same folder and format as the Eclipse plugin, so both IDEs share one copy). You sign in from the panel.

## Install (users)

See `INSTALL.md` (English) or `INSTALL.de.md` (German): install the `.vsix` with Extensions > ... > Install from VSIX.

## Usage

- **Ctrl+Alt+C** opens the panel (secondary side bar on VS Code 1.106+, activity bar before that). Enter sends, Shift+Enter inserts a newline.
- Context chip above the input: the active editor file. Right-click selected code > **Codexter: Ask / Explain / Fix selection**.
- **@** in the input picks files and folders of the chat's folder (recently opened files first, then ranked matches).
- Source Control: the Codexter button in the view title (sparkle in a box, or *Codexter: Generate commit message*) lets Codex write the commit
  message from the staged changes (all changes when nothing is staged), in a temporary read-only run that does not show up in the history.
- Opening a project reopens the chat that was open there when VS Code was closed (New chat starts a fresh one).
- Every git branch remembers the chat last used on it (a message sent while it was checked out) for 30 days; checking the branch out
  opens that chat. A branch created from where you were working (e.g. at the end, from master) takes the open chat with it.
- Drag files, folders or editor tabs onto **Attach files** (the small area under the chat, or click *Choose files...* there; VS Code never passes its own drags to the chat
  webview). Files from the Windows Explorer can be dropped onto the chat itself. Pasting file paths into the input (VS Code *Copy Path*,
  Windows Explorer *Copy as path*, file: URIs) also turns them into chips.
  Right-click > **Add to Codexter chat** (Explorer, also multi-select and folders; editor; editor tab) always works.
- History (clock button) lists chats of all projects; type to search, pick a project to filter; archive, unarchive and delete chats.
  The AI switch next to the search box finds chats by meaning: describe the chat and press Enter (a temporary read-only Codex run
  over the titles and first messages of the newest 300 chats of the selection).
- Gear button: in-panel settings (default model, default reasoning effort, models shown in the picker).
- Commands: Codexter: Open panel, New chat, Open settings, Check for Codex updates, Ask/Explain/Fix selection, Add to Codexter chat. The view title has + (new chat) and a gear (settings, toggles).
- Several chats at once: opening another chat or New chat no longer stops a running reply; it goes on in the background. When it
  ends, VS Code shows a notification ("Open" shows the start of the last answer) and the chat gets a blue dot (History, tabs) until
  it is opened, at most 3 days. The chats opened or used today in this project are tabs in the top bar (a spinner while a reply
  runs; a new chat is the "New chat" tab; x or a middle click closes a tab, the open one passes to its neighbour).
- Lists in the input: "- " or "* " at the start of a line becomes "• ", "1. " starts a numbered list; Enter (or Shift+Enter) continues
  the list, Enter on an empty item ends it, Tab / Shift+Tab indent, Ctrl+Enter sends from anywhere.
- Code references: a symbol copied in an editor and pasted into the input becomes `#sym:name` (marked, the file shows on hover);
  Codex gets its file and line, and the name in the sent message opens the file.
- MCP servers (gear > MCP servers): switch the servers of the Codex config on and off, check that one starts (it lists its tools),
  remove one, copy servers of VS Code's mcp.json (Copilot) to Codex, or add one by name (Codex searches the web for the setup and
  you confirm the command first). Written to ~/.codex/config.toml, which the Codex CLI and the Eclipse plugin share.
- Settings (`codexPanel.*`): `codexPath`, `codexSource` (managed | own), `updateIntervalDays`, `autosave`, `defaultModel`, `defaultReasoningEffort`, `defaultPermissions`, `hiddenModels`, `fontSize`, `commitMessageModel`, `commitMessageEffort`.
  Model, reasoning effort and permissions (Ask for approval / Approve for me / Full access / Custom) are chosen in the panel and remembered per user (globalState).
- **+** button in the input: files and folders, goal, plan mode, sketch (and pasted images), installed plugins.
- Proxy: `http.proxy` / `http.proxyStrictSSL` (or `HTTPS_PROXY`) for the download; the proxy is handed to the Codex process as well.
- Log: Output > **Codexter**.

## Build (developers)

```
npm install
npm run compile     # copies web\ into media\web, then tsc -> out\
npm test            # node:test, no VS Code needed
npm run smoke       # real codex app-server, read-only (account/read, model/list, thread/list); creates, archives and deletes nothing
npm run package     # dist\codex-panel-0.4.0.vsix
```

Run it from source: open this folder in VS Code and press F5 (Extension Development Host).
For an isolated test instance use `code --user-data-dir <tmp> --extensions-dir <tmp> --extensionDevelopmentPath D:\CodexPanel\codex-vscode`.

## Layout

- `src/core/` no vscode imports: `jsonrpc`, `appServer`, `locator`, `installer`, `tar`, `http` (proxy tunnelling), `fileLinks`, `fileIndex`, `threadRows`,
  `droppedPaths`, `unifiedDiff`. Ports of the Java classes of the same name.
- `src/session.ts`, `src/updater.ts` (no vscode imports): port of `CodexSession` / `CodexUpdater`.
- `src/extension.ts`, `panel.ts` (webview view), `dropTarget.ts` (Attach files drop target), `workspace.ts`, `mentions.ts`, `diff.ts`, `proxy.ts`: the VS Code glue.
- `media/vscode-bridge.js`, `media/vscode.css`, `media/codex.svg`; `media/web/` is generated by `scripts/sync-web.mjs` (do not edit).
