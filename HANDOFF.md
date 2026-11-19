# Codexter (Codex Panel for VS Code): handoff

Visible name is **Codexter** since 0.4.0. The extension id is `UnrealDeveloper.codex-panel` since 0.9.0 (Marketplace publisher UnrealDeveloper; 0.8.x and older were `codexpanel.codex-panel`, a different extension for VS Code: uninstall it before installing 0.9.0), the settings stay `codexPanel.*` and the vsix keeps the name `codex-panel-<version>.vsix`.

Read this first when you continue. Product spec: `CONCEPT.md`. This is a separate project from the Eclipse plugin in `..\codex-panel`:
never edit that folder from here (its Java core is still a useful reference for session, installer and history logic).

## Status (0.15.0)

- 0.15.0: MCP settings > Your browser: Codex uses the open Chrome (DevTools MCP --autoConnect) or picked tabs (Playwright MCP --extension). See "0.15.0".

- 0.14.1: a message at 80% and at 90% of a Codex limit window (once per level, again after a reset). See "0.14.1".

- 0.14.0: a turn's steps fold while it runs (last 3 in view) and answered approvals / auto-review checks fold too. See "0.14.0".

- 0.13.1: a chat that moved to another folder or branch tells the model so with its next message. See "0.13.0".

- 0.13.0: branch chats work across copies of one repository (copied folder, second clone, worktree). See "0.13.0".


- 0.12.1: Generate commit message with nothing staged: new untracked files go into the diff with their text (`newFilesDiff`,
  text files up to 512 KB, 8000 characters each, at most 50), the prompt no longer says "nothing is staged" (the model echoed it
  as the message), and an answer like "nothing staged to commit" is shown as an error, not put into the box (`isNoChangesAnswer`).

- 0.12.0: HTML in answers is rendered through an allowlist sanitizer; **Preview** button on html code blocks. See "0.12.0".

- 0.11.0: the panel's settings in collapsible groups with a search field. See "0.11.0".

- 0.10.0: code review triage, MCP tool approvals, Clarify side chats (also under plans), README GIFs for review and Clarify.
  Their notes are the last entries of "0.9.0".

- 0.9.0: the managed Codex install works on macOS and Linux too (not tried on real machines); MIT licence, icon,
  "unofficial" wording and PUBLISHING.md for the Marketplace. See "0.9.0".

- 0.8.4: rename a chat (History pencil, F2, double click on a tab or the title). See "0.8.4".

- 0.8.3: README highlights only what Codexter adds to a Codex chat. See "0.8.3".

- 0.8.2: README: section on the chat of the last session and of each git branch; drag and drop moved up. See "0.8.2".

- 0.8.1: README section on drag and drop with media/readme/dnd.gif. See "0.8.1".

- 0.8.0: instructions (Codex's own or Codexter's), Compact and the auto-compact limit; README: commit messages GIF. See "0.8.0".

- 0.7.9: README with the features and GIFs; a list ended on the last line keeps the caret on the new line. See "0.7.9".

- 0.7.8: an opened chat keeps its own model / effort and shows its context usage at once. See "0.7.8".

- 0.7.7: the closed input shows up to 7 lines, the end of the text in view. See "0.7.7".

- 0.7.6: plan mode follows the thread (chip shown for a chat in plan mode, removing it always switches it off). See "0.7.6".

- 0.7.5: pictures in an editor tab of their own, input focus back after Alt+Tab. See "0.7.5".

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

## 0.15.0

- MCP settings > **Your browser** (`core/browserMcp.ts`, `McpSettings.browser`, page `renderBrowserMcp`): two official servers that use the
  browser the user has open instead of a fresh one. Checked against the docs 2026-11-19:
  - Chrome DevTools MCP `npx -y chrome-devtools-mcp@latest --autoConnect` (developer.chrome.com/docs/devtools/agents/use-cases/auto-connect):
    Chrome 144+ (sources differ: 144-146), remote debugging switched on once at `chrome://inspect/#remote-debugging`, Chrome asks to allow
    each connection. Fallback not offered: `--remote-debugging-port` + `--browserUrl`.
  - Playwright MCP `npx -y @playwright/mcp@latest --extension` (playwright.dev/mcp/configuration/browser-extension) with the
    Playwright MCP Bridge extension (Chrome Web Store id mmlmfjhmonkocbjadbfplnigmagldckm), Chrome or Edge; the user picks the tab.
- `browserStates(mcp_servers)`: per kind missing | plain (a server of that package, any name or version, without the flag) | ready.
  Missing: a modal confirmation (what Codex gets, the prompt-injection risk, the command) then `add` (name `chrome-devtools` /
  `playwright`, `-browser` suffix when taken). Plain: the flag is added to that server's args (and it is switched on). Then the
  browser step: the chrome:// address goes to the clipboard (openExternal can not open chrome://), the extension's store page opens.
  Ready: the button only repeats that step.
- Checked: the block on the dev page with an injected `mcp` event. NOT checked: a real connection (needs Chrome 144+ with remote
  debugging on, or the extension), what Chrome's permission prompt looks like, npx on a machine without Node. Tests: `src/test/browser.test.ts`.

## 0.14.1

- Limit alerts (`core/limits.ts limitAlerts`, pure, tested in `src/test/limits.test.ts`). The app-server's rate limit snapshot
  (`account/rateLimits/read` on connect and `refreshRateLimits`, `account/rateLimits/updated`) goes to the host through
  `SessionHost.limitsChanged`; the page's footer already showed the same numbers. Per window (`limitId|windowDurationMins`) a level
  fires once: 80 and 90. A jump past both sends only 90; a level counts again once the usage falls below it (a reset).
  Memory: globalState `codexPanel.limitAlerts`, at most 20 windows. Shown as a VS Code warning, or a system notification when VS Code
  is in the background (`osNotify`, falls back to the VS Code warning). Not yet seen on a real account near the limit.

## 0.14.0

- Long turns (30 tool calls in a row) stayed in the way. The `Worked for` fold (`endTurn`) took only `wk` items, and approval cards
  (MCP tool approvals of 0.10.0 every call) and auto-review lines were never `wk`, so they stayed in the feed after the turn.
  Now both are appended as `work`; `foldable(k)` keeps out an approval still waiting (`.approval:not(.done)`) and a refused check
  (`.autoreview.denied` / `.timedOut`).
- While a turn runs, `append(el, 'work')` -> `liveFold`: only the last `LIVE_KEEP` (3) foldable steps stay, older ones go into the turn's
  fold at once (`workGroup`, one per turn, `t.group`; label `Working · N steps`). Not during a chat load (`state.loadingThread`).
  `endTurn` reuses the group, moves the rest in, finds the answer in the fold too (it comes back out after the fold) and labels it
  `Worked for 1m 5s · 13 steps`. File changes, the plan, errors, notices and the answer stay in view.
- Checked on the dev page (synthetic-autoreview; 12 commands + an approval injected through `codexUi.receive`). Not yet with a real
  long turn. Tests: `src/test/fold.test.ts`.

## 0.13.0

- Branch chats (`branchChats.ts`) moved from workspaceState (per folder) to globalState (all windows), keyed by the repository instead
  of its folder: `core/repoIdentity.ts repoIdOf` reads `.git/config` (a worktree's `.git` file -> its git dir -> `commondir`) and gives
  `remote:<address>` (origin, else the first remote; `normalizeRemote` drops protocol, user, port, `.git`, case) or `path:<root>`
  without a remote. So a copied folder of the project finds the chats of its branches used in the other copy. The old entries of a
  root move over once (`migrateLegacy`, a newer shared entry wins) when the repository is first seen.
- A chat whose folder is in another copy of a repository open here would have run its turns in that other folder (the thread keeps its
  cwd). `SessionHost.adjustCwd` -> `cwdForWorkspace`: on resume (any way: branch, restore, History) a chat outside this window's
  folders whose repository has the same remote as one of them gets the same sub folder of this copy (or its root) as `_threadCwd`;
  `turn/start` passes it (`cwd`: "Override the working directory for this turn and subsequent turns", codex 0.167.2 schema), the page
  shows it for links. Logged as `[cwd] chat of another copy ...`.
- 0.13.1: the model was not told about the move (earlier messages name the old folder's paths; Codexter never sent the branch).
  The places are remembered per chat (globalState `codexPanel.chatPlaces`: {cwd, branch} at the last message, newest 2000; host
  `lastPlace` / `rememberPlace`, `branchAt` from the git extension). In `send`, when the chat's folder or branch differs from that
  (no record: the folder Codex has for it, `threadOriginCwd`), `moveNote` puts one line `Chat moved: this chat now works in folder ...
  on git branch ... (before: ...)` in front of the message. A branch is compared only when both are known. The page, the History
  and the AI names hide it (`Chat moved: ` added to `PLUGIN_PREAMBLE` / `PREAMBLE_RE`).
- Not handled: copies without a remote (each folder is its own repository), the same branch checked out in two copies at once (both
  windows open the same chat), the History's project filter still lists such a chat under the folder it was started in.
  Not yet checked in two real VS Code windows. Tests: `src/test/repo.test.ts`.

## 0.12.0

- Raw HTML in an answer used to be shown as text (`r.html = esc(...)` in `setupMarkdown`) on purpose: answers can carry text of untrusted pages
  (prompt injection) and rendered HTML could fake Codexter's UI (a fake Allow button, a disguised link). Now `web/htmlsafe.js` (`window.CodexHtml`,
  loaded before `app.js`; listed in `index.html`, `dev.html`, `src/core/webScripts.ts`, `scripts/sync-web.mjs`) rebuilds every html token of marked from an
  allowlist, on strings, with no DOM (so `src/test/html.test.ts` runs it in node):
  - allowed tags: `table thead tbody tfoot tr th td caption colgroup col b strong i em u s del ins mark code kbd samp sub sup br hr p ul ol li dl dt dd details
    summary blockquote h1-h6 pre span div`. Attributes: `colspan`/`rowspan` (1-3 digits, only td/th), `span` (col/colgroup), `align` (left|right|center|justify),
    `open` (details); every attribute is rebuilt from a validated value, nothing else is copied (no style / class / id / on* / href / src).
  - any other tag (`a img svg math form input button iframe object embed style script link meta base`...) loses its tag and keeps its text, escaped;
    comments and `<!DOCTYPE>` vanish; text entities are decoded once, then escaped (`&amp;lt;` is not shown).
  - marked hands block html as one token and inline html tag by tag, so one render shares a stack of open tags (`CodexHtml.create/token/finish`): stray closers are
    dropped, `<li>`/`<td>`/`<tr>` end the previous one, depth is capped at 40, what is still open at the end is closed. Safety does not depend on nesting.
  - streaming: `renderMd(el, text, streaming)` first cuts a half-written tag off the end (`CodexHtml.holdBack`: `<tab`, `<td colspan="`), so no `<tab` flashes;
    the finished answer is always rendered whole. Used by the agent message (`!rec.final`) and the Clarify side chat; review cards and the rest use the same `renderMd`.
  - Tables look like markdown tables (the `.md table / th / td` CSS applies to both).
  - markdown links and images still go through `r.link` / `r.image` (unchanged).
- **Preview** button on ```` ```html ```` / ```` ```htm ```` code blocks (VS Code host only): posts `htmlPreview`, `panel.ts` hands it to `src/htmlPreview.ts`, an editor-area
  webview (one tab, replaced by the next preview) with `enableScripts: false`, no forms, no command URIs, no local resource roots and the CSP of `src/core/htmlPreview.ts`
  (`default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'`, the first thing in the document). Longer than 500 000 characters is cut.
  Never inside the chat feed. A link clicked in the preview is VS Code's normal external link handling.
- Dev page: `?fixture=synthetic-html&host=vscode` (table, inline tags, hostile bits, an html block with Preview). Checked: dark and light, the Clarify side chat (the question and the
  mock answer with inline html), the review cards.
- Tests: `src/test/html.test.ts` (allowed tags and attributes, hostile input, structure repair, marked integration, every prefix of a streaming answer, preview CSP).

## 0.11.0

- Settings view (`renderSettings` in `web/app.js`): the long list is now thematic groups, each a header button that folds its body
  (Model, Quick model, Chat, Instructions, Code review, MCP servers, Dictation, System; Dictation only when the dictation feature is there,
  the VS Code-only ones only with host `vscode`). A search field `#set-q` sits above `#set-body` (outside it, so typing is not interrupted by the
  re-render): every word must occur in the group title or in the label / hint of a setting; matching groups show open, the others hide,
  "No setting matches" when nothing is left; Esc clears the search first, opening the settings clears it. Keys and behaviour of the settings are unchanged.
- Which groups are open is remembered (only what the user toggled; "Model" starts open, the rest closed): `uiStore` in `web/app.js`, VS Code webview
  state through `window.__codexState` (`media/vscode-bridge.js`: `getState/setState`), localStorage on the dev page, both wrapped in try/catch.
- The section titles inside Instructions / Code review / MCP / Context were dropped (the group header is the title).
- Checked on `web/dev.html?host=vscode&settings=1`: dark and light, 320 px and 520 px wide.

## 0.9.0

- Managed Codex install on macOS and Linux (x64, arm64), until now Windows only:
  - `installer.ts`: `platformTag(platform, arch)` gives the npm dist-tag (`win32|linux|darwin`-`x64|arm64`; anything else throws
    "there is no managed Codex install for ..."), the STABLE regex accepts those six, `exeName()` is `codex.exe` on Windows and
    `codex` elsewhere, `findExe` looks for it in `vendor/<triple>/bin`. The npm packages have the same layout on every platform
    (checked for 0.167.2: `vendor/x86_64-unknown-linux-musl/bin/codex`, `vendor/aarch64-apple-darwin/bin/codex`, no links).
  - `tar.ts`: a file that is executable in the archive gets mode 755, everything else 644 (`headerMode`, `fileModeFor`; setuid and
    write bits for others are never kept); chmod after writing on macOS and Linux. Without it `codex --version` could not start.
  - `locator.ts`: `codex` on the PATH that is npm's link to `.../@openai/codex/bin/codex.js` is replaced by the native executable
    of the package behind it (`nativeBehindShim`), so no `node` is needed on VS Code's PATH. `globVendor` uses `exeName()`.
  - The copy lives in the extension's global storage there (`extension.ts codexBase`: no LOCALAPPDATA); on Windows nothing changed,
    it is still `%LOCALAPPDATA%\CodexPanel`, shared with the Eclipse plugin.
  - NOT tried on a real macOS or Linux machine (no WSL or Docker here). Checked on Windows: the real `linux-x64` and `darwin-arm64`
    packages pass the manifest check, the sha512 check and the tar reader, and `findExe` finds `bin/codex`. Open points there:
    the first start of the downloaded binary (Gatekeeper on macOS), the sign-in round trip, the Linux sandbox (bwrap).
    The full install test (`installer.test.ts`) runs on every platform now and would show a mode problem.
  - Texts: README (platform note, where Codex is stored), INSTALL.md, INSTALL.de.md, the `codexPath` setting and the two error
    messages no longer say Windows or `codex.exe` only.
- For the Marketplace (made by the publishing session, see `PUBLISHING.md`): `LICENSE` is MIT with a note on the bundled
  licences, `package.json` has `license`, `icon` (`media/icon.png`, 256x256, drawn from `media/readme/icon.svg`: two chat bubbles, `</>` and "..."; the side bar icon `media/codex.svg` is its outline), `keywords` (codex, openai, chatgpt, gpt, ai chat, ...), the
  `displayName` "Codexter: chat for OpenAI Codex (unofficial)" (no "GPT" in the name: OpenAI's brand rules) and a new `description`;
  `scripts/package.mjs` no longer passes `--skip-license`; the README intro says "unofficial", where Codex is downloaded from,
  and that the project is not affiliated with OpenAI. 0.9.0 is on the Marketplace.
- Tests: `src/test/platforms.test.ts`.
- Draw on an attached image file: a file chip of a png/jpg/jpeg/gif/webp/bmp (dropped, picked, @) opens in the drawing editor tab
  instead of VS Code's image viewer (`imageFileOpen`; the host reads it with `core/imageFile.ts imageFileUrl`, max 25 MB). Save
  sends `imageEdited` with key `file:<path>`; the page attaches the drawn-on picture (scaled to 2048 px like a pasted one,
  `addImageSrc`) and removes the file chip (`replaceFileWithImage`). The file on disk is never changed. Test in `chats.test.ts`.
- Chat names by AI (`core/chatTitle.ts`, `session.autoName`, setting `codexPanel.autoChatNames` auto | first | off, default auto):
  after a `turn/completed` with status completed (open or background chat) the answers are counted per chat (`answerCounts`; read
  once with `thread/read`, then counted). After the 1st and every 5th answer: `thread/read` with turns, `transcriptOf` (user text
  without the extension's context lines, last answer of each turn), `buildTitlePrompt` (first message + the latest 7, 800 chars
  each, the current name) to `host.ask` (the quick model), `cleanTitle`, `renameThread(id, title, auto = true)`.
  Named by hand = the chat's name differs from the one the AI gave it (`host.autoNameOf`, globalState `codexPanel.autoNames`,
  the newest 2000); a manual rename deletes the entry. `host.renamed` updates the tab (the panel no longer does).
  The sparkle in the rename input (`suggestTitle` -> `titleSuggested`) only fills the input; Enter on the unchanged suggestion
  renames with `auto: true`. Not yet seen with a real turn: whether `thread/read` right after `turn/completed` already counts that
  turn (if not, the first name comes one answer later). Tests: `src/test/chatTitle.test.ts`.
- Dictation (mic button, Windows; setting `codexPanel.dictation`, default on). Findings first:
  - VS Code webviews can not use the microphone (the webview iframe `allow` has no `microphone`; getUserMedia gives
    NotAllowedError, checked in VS Code 1.146), so the extension records: `media/mic-win.ps1` (PowerShell + C# over winmm waveIn
    through the wave mapper, 24 kHz 16-bit mono, one base64 line per 100 ms, READY first, "stop" on stdin; ~0.8 s to READY).
    `core/micRecorder.ts` starts it. macOS/Linux have no recorder yet (`micSupported`), the button is hidden there.
  - No Codex model takes audio (model/list: text and image only; a `localAudio` input is ignored: "I can't access the audio").
    What works with the ChatGPT sign-in is the experimental voice mode `thread/realtime/*` (only with `--experimental` in the
    schema; text output needs `version: "v2"`): it transcribes the user well (Russian checked), but the voice model answers and
    hands tasks to Codex (`background_agent` -> a turn); the prompt does not stop that.
  - So `session.startDictation(owner)`: recorder starts at once (audio queued), `thread/start` ephemeral read-only in the temp
    folder (never in the History), `thread/realtime/start` {outputModality text, v2, websocket, includeStartupContext false};
    on `thread/realtime/started` the queue is sent (`appendAudio`), then live. Only `thread/realtime/transcript/done` with role
    user is used (`dictationText`, put in at the caret by the page); assistant text is dropped; `turn/started` there is
    interrupted at once. Every notification of a dictation chat is swallowed (`dictThreads`), even after it ended.
  - Stop (button, Esc, 10 min, recorder end): recorder stops, 1.2 s of silence ends the last segment, waits for the open
    segments' text (`speaking`, at most 8 s), `thread/realtime/stop`. Events carry `owner` (the view id); the panel's sink drops
    other views' ones.
  - Checked against the real Codex with a synthesized Russian WAV through `CodexSession` (text in ~1-2 s per phrase, stop 1.6 s),
    and the recorder alone on the real microphone (counts only). Not yet: a real voice through the whole thing, and how much of
    the plan's usage it costs. Tests: `src/test/dictation.test.ts`.
  - Level meter: every recorded 100 ms chunk gives a `dictationLevel` event (`pcmLevel`: RMS in dBFS, -55..-10 dB -> 0..1); the
    page draws 21 bars left of the mic button (`#micwave`, newest on the right) while listening.
  - The panel's own settings (gear) have the dictation switch with the warning (experimental, its own voice model, tokens)
    and the AI chat names choice, under the quick model; both are `PanelSettings` keys. `init.dictation` is only whether
    the host can record; the button shows when that and `settings.dictation` are true, and turning it off stops a dictation.
  - Languages (`codexPanel.dictationLanguages`: an array of codes from the fixed list `LANGUAGES` of
    `core/dictationLanguages.ts`, default `["en"]`, `[]` = any; the panel shows a checkbox multi-select, list sent in
    `init.dictationLangs`; no free text on purpose). `thread/realtime/start` has no language option (only voice, model,
    prompt and instructions), and the user once got a Chinese phrase for noise. The names go into the voice model's prompt
    (effect on the transcription not measured), and a user phrase whose letters are at least a third in a script none of the
    languages uses is dropped (`dictationDropped` -> toast "say it again"). Latin always passes (code names).
- Open on startup (`codexPanel.openOnStartup`, off; gear checkbox under System notifications): at activation
  (`onStartupFinished`) `showView()` reveals the view of this VS Code's side bar, which replaces the container shown last there
  (Copilot Chat); then the keyboard goes back to the active editor. Checked in the isolated VS Code: secondary side bar closed,
  restart with the setting on, Codexter is shown (that profile has no Copilot, so the swap from Copilot Chat itself was not seen).
- Edit the last message / Fork from an answer. Checked on throwaway chats in a temp folder (deleted afterwards): new chats are
  `historyMode: "paginated"` (the user's recent ones too); `thread/revert {threadId, beforeTurnId}` drops that turn and all later
  ones (history only, files stay), the next `turn/start` goes on from there; `thread/fork {threadId, lastTurnId}` copies the
  turns through that one. A source chat can NOT be deleted while a fork of it exists ("forked history still references it").
  - Page: every `.turn` has `data-turn` (turn id from `thread` turns and `turn/started`). The pencil (`.uedit`, last turn only,
    CSS `#feed > .turn:last-child`) puts the message's text and pictures into the input (`state.edit`, `#editbar`, Esc/Cancel
    restore the draft) and interrupts a running reply. Sending posts `replaceTurnId`, removes that turn from the feed
    (`dropEditedTurn`) and ignores late events of it (`droppedTurns`). Context chips of the old message are not restored.
  - Host: `SendRequest.replaceTurnId` -> `session.cutTurn` (waits up to 15 s for an interrupted reply, `thread/revert`); on
    failure: toast, the typed text back into the input (`focus` event), the chat resumed, nothing sent.
  - Fork (`.afork` under the final answer of each finished turn, added in `endTurn`): `session.forkFrom(turnId, permissions)`
    -> `thread/fork` (lastTurnId, cwd and permissions of the chat, excludeTurns), name "<title> (fork)" (AI may rename it later),
    `resume(fork)` opens it. Tests: `src/test/editfork.test.ts`.
  - Deleting a chat that has forks: `thread/delete` fails with "forked history still references it" (`FORK_REFUSAL`); the
    session then finds the forks (`forksOf`: thread/list rows carry `forkedFromId`, live and archived chats, forks of forks,
    ordered so a fork's forks come first) and answers the failed delete with `forks: [{id, title}]`. The History row asks
    "N forks use this chat. Delete them too?" (`hist.forkAsk`); "Delete all" sends `deleteWithForks`: each fork is deleted
    (a `threadAction` with `quiet: true` per fork, no toast), then the chat.
- Code review triage (port of the user's old Copilot review tool): **+ > Code review** (VS Code host) or the command `codexPanel.review` (-> `startReview` event) asks the host for the project's
  `REVIEW_INSTRUCTIONS.md` (`core/reviewFile.ts`: from the chat's folder up to the repository root; an open editor counts, unsaved text
  too; gear > Code review links to it or creates it from `TEMPLATE`; no file or an empty one = `DEFAULT_PROMPT` and a toast) and sends it plus a format part (`FORMAT_MARK` "---\nCodexter review
  format ...") as a normal turn in the open chat; text in the input is added as "For this review: ...". Codex ends its answer with
  a fenced block ` ```codexter-findings ` holding `{"findings": [{severity, file, line, title, problem, fix, locations?}]}`.
  - All logic is in `web/review.js` (`window.CodexReview`, pure, loaded by the Node tests from media/web): request / isRequest /
    displayText, findBlock / hideBlock / parse (lenient: filePath, "a.ts:12", suggestedFix, description, ...; severity words map to
    critical | medium | suggestion = red / yellow / green), the triage state (start, decide, back, goTo: an answer moves to the next
    open card, wrapping; all answered = the overview; a change after that returns to it), summary / isSummary / parseSummary.
  - app.js: `addUser` shows a review request without the format part (tag "Code review", no Edit pencil, `turn.dataset.review`);
    `renderAgent` never shows the block (a spinner "Preparing the findings..." while it streams); `endTurn` -> `attachReview` puts
    the cards (`.review`, `renderTriage`, `rvCard`, `rvOverview`) into the final answer. No block in a review turn that completed:
    toast, the answer stays. Broken JSON: toast, the raw answer is shown. "Send answers to Codex" -> `sendText(summary)` (same chat,
    no context chips, refused while a reply runs). The answers live in `reviewMem` (turn id -> state) for the page's life; a loaded
    chat whose next message is "Codexter review answers ..." shows the review as sent with those answers (`settleReview`).
  - Not used: the app-server's own `review/start` (Codex 0.167 schema): its target is uncommittedChanges | baseBranch | commit |
    custom instructions, and the result is an `exitedReviewMode` item with the review as plain text, no structured findings, and
    Codex's own review prompt; dynamic tools were not needed since all findings come at once at the end.
  - dev page: `fixture=synthetic-review&host=vscode&autoplay=0` (+ > Code review; 5 findings; the answers get a short reply).
    Tests: `src/test/review.test.ts`.
- MCP tool approvals (found in the live check of the code review, 2026-11-17): Codex asks before an MCP tool call (e.g.
  serena `replace_content`) with the server request `mcpServer/elicitation/request`; until now `appServer.ts` answered
  "Unsupported by Codex Panel" and Codex reported "user rejected MCP tool call" (no file changed through such tools).
  - Shape (codex 0.167.2 schema, `McpServerElicitationRequestParams` / `...Response`): params `{threadId, turnId?, serverName,
    mode: form | openai/form | openaiForm | url, message, requestedSchema?, url?, elicitationId?, _meta?}`; response
    `{action: accept | decline | cancel, content?, _meta?}`. Codex's own tool approval is a form with an empty schema and
    `_meta.codex_approval_kind: "mcp_tool_call"`, `persist` (offered: "session" / "always"), `tool_title`, `tool_params`
    (key names seen in the codex binary; `tool_params_display` handled as text or a list of {name|display_name, value}).
  - `core/elicitation.ts elicitationResponse(params, decision)`: decline -> `{action: decline, content: null}`, accept ->
    `{action: accept, content: <schema defaults, {} for the tool approval>}` (url mode: content null), acceptForSession ->
    plus `_meta: {persist: "session"}` when Codex offers it. `session.ts` registers the method beside the other approvals
    (same pendingApprovals / background replay), `approve()` answers through it.
  - Page: `approvalCard` -> `elicitationCard`: "Codex wants to use the MCP tool <tool> (<server>)", the message, the arguments;
    Allow / Allow for session (only if `persist` has "session") / Deny (`decisionCard`, shared with the other approvals).
    Any other elicitation: "The MCP server <name> asks", the message, a URL link (`data-url` -> openUrl) for url mode, Allow / Deny.
  - Not done: a form for elicitations with real fields (accept sends only the schema defaults); "always" persistence is not
    offered. Not yet seen with a real turn (only the fake app-server and the dev page with injected events).
    Tests: `src/test/elicitation.test.ts`.
- Clarify side chats (a question about one answer without touching the main chat; built after 0.9.0's fork, verified live 2026-11-17):
  - A side chat is a `thread/fork {lastTurnId}` of the open chat at that answer's turn, made with the FIRST question (an opened
    pane that is closed unasked leaves nothing behind): `session.sideAsk` -> `sideCreate` (reads the parent with `thread/read` to
    get `base` = number of the main chat's turns in the fork, forks with `sandbox: 'read-only'`, `approvalPolicy: 'never'`,
    names it "↳ Clarify: <first words of the answer>"). Every turn is `turn/start` with `approvalPolicy never` and
    `sandboxPolicy readOnly`; the question text gets `SIDE_MARK` in front (keeps Codex on the question, cut again when shown).
    After a restart of the app-server the side chat is `thread/resume`d read-only first (`sideLoaded`). Checked in the rollout
    files of a real run: the side chat has `sandbox_policy read-only`, `approval_policy never`, `forked_from_id` = the main chat;
    the main chat's rollout has no trace of the questions (one turn, workspace-write as before).
  - The link store `core/sideChats.ts`: parent chat -> answer (turn id) -> [{id, at, title, base}], in globalState
    `codexPanel.sideChats` (host `sideLinks` / `saveSideLinks`; the session keeps a copy and re-reads on every change, since another
    window shares globalState; at most 400 parent chats). Nothing is written into the chats. Codex has no free metadata field on
    a thread, so this is the only link; losing it only loses the badge (the side chats stay in Codex, named with the arrow).
  - Hidden from the History: `listThreads` and `aiSearch` skip rows whose id is in the store or whose name starts with
    `SIDE_PREFIX` ("↳ ", survives a lost store). Not hidden from `forksOf`, so deleting the parent chat offers "N forks ... delete
    them too" with the side chats listed, and a delete (or delete with forks) also forgets their links (`forgetSide`).
    Never counted as a chat: no tab, no unread mark, no notification, no AI name, no `chatUsed` / `threadChanged`.
  - Events: a notification whose threadId is a side chat goes to `sideNotification` -> `sideEvent {id, method, params}` (turn and
    item events, deltas, errors) and never to the main feed; approvals / MCP elicitations of a side chat are declined at once
    (`sideEvent sideDenied` -> a note). `sideOpen {parent, turnId, side, turns, running, created?, error?}` (turns = the side chat's own,
    `sideTurns`), `sideLinks {threadId, links}` (sent after a chat is opened when it has links, and after a change).
    Failures come as `sideEvent sideFailed`. Page -> host: `sideAsk`, `sideShow`, `sideInterrupt` (panel.ts).
  - Page (app.js "Clarify"): `.aside` button after `.afork` under the final answer of a finished turn (also in a review answer: the triage cards stay
    above the buttons, checked on the dev page); "Clarify" or "N clarifications" (blue, always visible). The pane
    `#side` slides in over the chat from the right (`#side-backdrop` closes it, Esc, back arrow), header "↳ Clarifying" + the
    first words of the answer, the source answer gets a blue bar (`.side-src`), tabs 1..n and "+ New", a note (read-only, what is
    known, cost), own feed with its own small renderer (user bubble, markdown answer streaming, status line with the running
    command), own input (Enter sends, Shift+Enter newline, the send button is Stop while a reply runs). Leaving the chat
    (`stashChat`, `resetConversation`) closes the pane. dev page: mock `sideAsk` / `sideShow` (`&sidefail=1`).
  - Not done: removing one side chat from the pane (delete the parent chat to clean up), model / effort are the chat bar's, a reply
    that was running when the pane was reopened shows its end only (no partial text), no pane while another overlay (History,
    settings) is open on purpose (it covers them). Tests: `src/test/side.test.ts`.
  - Throwaway chats of the live check (isolated VS Code, folder %TEMP%\codexter-clarify-demo): main
    01a1e9bc-e918-7fa3-bf4a-6a0a16e2fafd ("Explaining Shop Total and Discount Functions") and its hidden side chat
    01a1e9bd-b307-7961-ade8-3a74d0c099bb.
- Opening a chat that is not kept in the page (History, tab): `openChat(id, title)` shows `#chatload` (spinner, "Opening
  chat...", the title) over the dimmed feed (`#feed.dim`) after 150 ms, until the `thread` event, an `error`, `newChat` or 90 s.
  A kept chat (chatCache) opens at once without it.

## 0.8.4

- Rename a chat: the pencil of a History row (or F2 on the selected row, also from the search box), a double click or F2 on a tab,
  a double click on the title (shown while there are no tabs). An input takes the place of the name: Enter or leaving it saves,
  Escape keeps the old name. The new name shows at once in the row, the tab and the title; the host answers threadAction
  "rename" (ok + the cleaned name, or an error: a toast, and the old name comes back).
- Host: panel threadAction rename -> session.renameThread (spaces folded, 160 characters, empty refused) -> thread/name/set
  {threadId, name}; the title is remembered (titleOf) and the tab of today's chats gets it (ChatActivity.title). Codex finds the
  chat by its rollout, so chats that are not loaded can be renamed too (a missing id answers "no rollout found").
- While the input is open, renderHistory / renderTabs / setTitle leave its place alone (host events would drop the typing);
  if the input could not get the focus (drawn anew meanwhile) it closes at once.
- smoke: thread/name/set against the id that does not exist (read-only). Tests: src/test/rename.test.ts. dev page: rename answers
  ok and sets the History title; &fail=1 answers an error.

## 0.8.3

- README: the Highlights keep only what Codexter adds to a plain Codex chat (chats per project and branch, tabs and notifications,
  AI search, commit messages, picture editor, #sym and lists, drag and drop, MCP, instructions and context); the usual chat
  (cards, approvals, Markdown, diffs, pickers) is one short section "The chat itself" with chat.gif. The repository is public now.

## 0.8.2

- README: "Picks up where you left off" (the chat of the last session per project, the chat of each git branch for 30 days,
  a new branch takes the open chat along) as the second highlight; drag and drop right after the tabs; the intro names both.

## 0.8.1

- README: "Drag and drop files, folders and editor tabs" (Attach Files, Windows Explorer, pasted paths, Add to Codexter chat, @,
  the active file) with dnd.gif, recorded in an isolated VS Code (installed vsix, the demo repo mapped to S: with subst so no
  local path shows; the drags went through DevTools Input.setInterceptDrags + dispatchDragEvent; no Codex turn).

## 0.8.0

- Instructions (gear > Instructions, VS Code host): "Codex's own" edits `developer_instructions` of the user config.toml through
  config/read + config/batchWrite (reloadUserConfig; '' removes the key), shared with the Codex CLI and Eclipse; "Only in Codexter"
  keeps the text in `codexPanel.instructions` and sends it as `developerInstructions` of thread/start (new chats only: the
  protocol does not say what a resume would do with it). Four ready-made lines (page STR.instrPresets) are appended to the text.
  "Open AGENTS.md" opens $CODEX_HOME/AGENTS.md (an untitled editor with that path when there is none). core/instructions.ts.
- Context: `codexPanel.autoCompactTokens` (0 = Codex's own, about 90 % of the window) goes as `config.model_auto_compact_token_limit`
  into thread/start and thread/resume (host.threadExtras). "Compact" in the footer calls thread/compact/start; Codex runs it as a
  turn (turn/started, a contextCompaction item = the "Context compacted" notice, turn/completed), the page shows "Compacting..."
  until then. Not tried against a real Codex (no turns in tests): the fake app-server of instructions.test.ts checks the params.
- README: "Commit messages with Codex" with media/readme/commit.gif, recorded in an isolated VS Code (installed vsix, a demo repo
  in the temp folder, `codexPanel.codexPath` = a .cmd stand-in that writes a fixed message: no real Codex run). Breadcrumbs off,
  so no local path shows.
- dev page: mocks for instrRead / instrWriteCodex / openAgents / compact; settingsSave echoes every setting (like the host).

## 0.7.9

- README.md is the extension's description: highlights with six GIFs in `media/readme/` (chat, tabs, history-ai, input, image, mcp),
  then the rest, install, commands, settings, development. VS Code's extension page shows README images only from https:
  URLs: relative paths and data: URIs are dropped by its sanitizer (checked in an isolated VS Code; its CSP is
  `img-src https: data:`, but the src is gone before). So `npm run package` passes `--baseImagesUrl` (raw.githubusercontent.com,
  main) and `--baseContentUrl` (github.com blob/main): the GIFs show once they are pushed and the repository is public.
  They are not in the vsix (`!media/*` and `!media/web/**` instead of `!media/**`; in vsce a negation always wins).
  package.json has `repository` now.
- The GIFs were recorded from `web/dev.html` in headless Edge through DevTools (screencast frames with their timestamps, a drawn
  mouse pointer, mock answers for tabs / AI search / MCP / #sym injected into the page) and put together with ffmpeg
  (palettegen, variable frame delays). The recorder lives outside the repository; to redo one, drive dev.html the same way.
- Input lists: Enter on an empty item at the end of the text ended the list but left the caret before the trailing newline
  (Chromium, execCommand insertText with an empty text), so the next words went onto the line above. typeOver now puts the
  caret behind the inserted text.
- dev page: fixtures replay again. Their notifications carry the recorded threadId, which the page drops since 0.7.0 (another
  chat); dev-bridge.js now gives them the dev thread's id.

## 0.7.8

- Model / effort: a chat opened again (startup restore, History, tab, branch) showed the defaults of new chats, and the next
  message would have switched it to them. session.resume now puts thread/resume's `model` and `reasoningEffort` into the thread
  event; the page sets them in the pickers (applyThreadPlan, also for a kept copy) and posts prefs. fillEfforts keeps an effort it
  does not know while the model list is not loaded yet (after a reload the chat comes first).
- Context usage: Codex sends thread/tokenUsage/updated only while a turn runs. The session file of the thread (thread.path, JSONL)
  has a "token_count" event (payload.info: last_token_usage, total_token_usage, model_context_window) after each turn;
  core/rollout.ts lastTokenUsage reads the end of the file (256 KB, then 4 MB) and maps the last one to the camelCase shape of
  the notification; the thread event carries it as `tokenUsage`.

## 0.7.7

- Closed input: CLOSED_LINES 7 (fewer when less is written, empty = 1 line) and scrolled to the end (autoGrow('bottom')), so a
  click lands where typing goes on. A click into the closed input opens it only on mouseup (growing during the mousedown would
  move the text under the mouse before the caret is placed); opening keeps the distance to the end (autoGrow('keep')).
- Checked in the browser with web/dev.html (python -m http.server in web/, built-in browser at 420x900): the isolated VS Code
  did not start because the installed VS Code had an update pending (updating_version, new_Code.exe in its folder): a second
  instance quits after ~30 s until VS Code is restarted.

## 0.7.6

- Plan mode is kept by the server per thread. The page only sent `plan: false` when it had seen plan mode on in this page life
  (planUsed), so after a reload, the History or a tab a chat stayed in plan mode without a chip ("can not edit in Plan Mode").
  Now: session.resume puts `planMode` (thread/resume collaborationMode.mode, newer servers) into the thread event and the page
  shows the chip for it (applyThreadPlan, also on the kept-copy path); and every message of an existing chat sends plan true /
  false, so a removed chip always switches plan mode off (collaborationMode default needs a model: model or effectiveModel).

## 0.7.5

- Pictures (VS Code host): the chat page posts `imageOpen {key, url, name, editable, blank}`; src/imageEditor.ts shows them in a
  WebviewPanel (one at a time, ViewColumn.Active) with web/imageEditor.js / .css (shipped by sync-web). The page is the same
  two-layer editor as the in-panel sketch (kept for the Eclipse host): picture at its own pixels, fitted (up to 2x), drawing layer,
  text input, undo (40), Ctrl+S / Esc. Save posts the merged PNG; the host answers the chat page with `imageEdited {key, url}`
  (key = the attached picture, "" = a new sketch to attach) and closes the tab. Attached pictures got keys (imageSeq).
  VS Code's own modal image viewer (Copilot) is workbench code, an extension can not open such a dialog; the editor tab is the
  big place there is. tools/cdp-vscode.mjs: CDP_PURPOSE=webviewPanel drives the editor tab instead of the chat view.
- Input focus after Alt+Tab: the page remembers the caret when VS Code loses the OS focus while the input had it (or lost it less
  than 1 s before); when VS Code gives the focus back to the page (window focus event, document.hasFocus) and nothing else in the
  page has it, the input gets the focus and the caret back. Coming back by a click into an editor does not move the focus.
  Checked with synthetic focus events only (a real Alt+Tab in the isolated VS Code would take the focus from the user).

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
