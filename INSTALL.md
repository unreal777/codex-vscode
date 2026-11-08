# Codex in VS Code

A chat panel for the OpenAI Codex agent inside VS Code, the same panel as the Eclipse plugin.
You only need **VS Code 1.90 or newer** on Windows. No Node.js, no npm, no `codex login`:
the extension downloads Codex and lets you sign in.

## Install

1. Get `codex-panel-0.4.0.vsix`.
2. In VS Code open the Extensions view, click the **...** menu (top right) > **Install from VSIX...**, pick the file.
   (Or in a terminal: `code --install-extension codex-panel-0.4.0.vsix`.) Updating works the same way.
3. Open the panel with **Ctrl+Alt+C**. It lives in the **secondary side bar** on the right, next to other chats such as Copilot
   (VS Code 1.106 or newer; older versions show a **Codex** icon in the activity bar instead). Drag the view elsewhere if you prefer.
4. Click **Sign in with ChatGPT**. On the first start the extension also downloads Codex (about 170 MB).
5. If you see **One-time Windows sandbox setup**, click **Set up** (Windows asks for admin rights once).

## Good to know

- **Updates are automatic.** About once a week the extension checks the official npm registry for a new Codex
  version and installs it in the background. It applies at **New chat** or after a window reload,
  never in the middle of an answer. Command Palette > **Codexter: Check for Codex updates** checks right now.
  Change the interval or switch to your own Codex installation in Settings > Codexter.
- **File links are clickable.** A link in an answer opens the file at that line. Links to folders select them in the Explorer.
- **History finds old chats.** The clock button lists the chats of all projects with the project name in front.
  Type to search, or pick one project in the list; the choice is kept until you close the window.
  Hover a chat (or select it with the arrow keys) for **Archive** and **Delete**. Delete asks once more in the row, because it cannot be undone
  (the Delete key does the same). **Show archived** lists archived chats with **Unarchive** and **Delete**.
- **Settings (gear button in the panel):** the *Default model* and *Default reasoning effort* a new chat starts with, and which *Models*
  appear in the model list under the input (at least one stays). *More settings…* opens the VS Code settings of the extension.
- **Add files to the chat.** Type **@** in the message and pick a file, or use the **+** button > *Files and folders*.
  Or drag files, folders or editor tabs from VS Code onto **Attach files**, the small area under the chat, or click *Choose files...* there
  (VS Code does not let a
  drag from its own Explorer or tabs reach the chat itself). Files from the Windows Explorer can be dropped right onto the chat.
  Or paste a file path into the input: right-click a tab or file > *Copy Path* (Shift+Alt+C), or *Copy as path* in the Windows Explorer.
  They show as chips above the input.
  If a drop does nothing, open View > Output > **Codexter**: every drop writes the formats it carried (`[drop] ...` lines); send them to us.
- **Add to Codexter chat:** right-click files or folders in the Explorer (several at once work), an editor, or an editor tab >
  **Add to Codexter chat**. Use this if dragging does not work for you.
- **A chat belongs to one folder.** If you switch to a file from another workspace folder, a banner offers **New chat there**.
- **Editor context menu:** right-click selected code > **Codexter: Ask / Explain / Fix selection**.
- **Permissions (one list under the input field).** *Ask for approval* (Codex asks before it edits files outside the project or uses the
  internet), *Approve for me* (Codex only asks for actions it finds potentially unsafe), *Full access* (no sandbox, no questions; shown in
  a warning colour) or *Custom (config.toml)* (the panel sends no overrides; Codex uses your `config.toml`). Settings of older versions
  are converted: Full access stays, everything else becomes *Ask for approval*, and Auto + Auto-review becomes *Approve for me*.
- **The + button** next to it: attach *Files and folders*, set a *Goal* Codex keeps pursuing (a banner above the input shows its progress),
  turn *Plan mode* on (Codex then proposes a plan instead of changing files), draw a *Sketch* that is sent as an image, or pick one of
  your installed *Plugins*. You can also paste images with Ctrl+V.
- **Long answers read top to bottom.** Your message is a wide block, the answer uses the full width. When Codex is done, its steps
  (thinking, commands, file reads) fold into one **Worked for 1m 17s** line; click it to see them. Changed files and approvals stay visible.
- **`AGENTS.md`** in your repository is read by Codex automatically (new chats only).
- Codex is stored once per Windows user in `%LOCALAPPDATA%\CodexPanel` (about 500 MB). The Eclipse plugin uses the same folder,
  so a Codex downloaded by one is used by the other.
- Corporate proxy: the download uses VS Code's `http.proxy` setting (or `HTTPS_PROXY`) and is also handed to Codex.
- Log: View > Output > **Codexter**.

## Problems

| Problem | Fix |
|---|---|
| Codex download fails | Check `http.proxy` in Settings (`https://registry.npmjs.org` must be reachable). Or install Codex yourself and set Codexter > Codex Source to "own" and the path to `codex.exe`. |
| Dropped file does nothing | Drop it on **Attach files** under the chat, paste its path, or use **Add to Codexter chat** / `@`. |
| Sign-in does not finish | Click Cancel, then sign in again. Port 1455 on localhost must be free. |
| Panel is blank | Run **Developer: Reload Window**; check the Output channel **Codexter**. |
| Anything else | Send the last lines of the Output channel **Codexter**. |
