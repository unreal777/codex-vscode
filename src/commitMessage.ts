// Source Control button "Generate commit message (Codexter)": reads the changes through VS Code's git extension, asks Codex in a temporary
// read-only `codex exec` run (not in the chat history) and puts the answer into the commit message box.
// The sparkle inside the commit box (Copilot) uses the proposed scm/inputBox menu, which a published extension can not use, so the
// button sits in the view title (scm/title) instead.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildPrompt, runCodexExec } from './core/commitMessage';
import { Located } from './core/locator';

// The parts of the git extension API (vscode.git, getAPI(1)) used here
interface Change { readonly uri: vscode.Uri; readonly status: number }
interface Repository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: { value: string };
  readonly state: { readonly indexChanges: Change[]; readonly workingTreeChanges: Change[]; readonly untrackedChanges?: Change[] };
  diff(cached?: boolean): Promise<string>;
  log(options?: { maxEntries?: number }): Promise<{ message: string }[]>;
}
interface GitApi { readonly repositories: Repository[]; getRepository(uri: vscode.Uri): Repository | null }

const UNTRACKED = 7; // git extension Status.UNTRACKED

export interface CommitDeps {
  locateCodex(): Located;
  env(): NodeJS.ProcessEnv;
  /** model / effort for commit messages ('' = Codex default) */
  model(): string;
  effort(): string;
  /** MCP servers to switch off for the run */
  mcpOff(): string[];
  log(line: string): void;
}

async function gitApi(): Promise<GitApi> {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>('vscode.git');
  if (!ext) throw new Error('The built-in Git extension is not available.');
  const exp = ext.isActive ? ext.exports : await ext.activate();
  return exp.getAPI(1);
}

/** The repository of the clicked Source Control title (its rootUri), else the only one, else the one of the active editor, else ask. */
async function pickRepository(api: GitApi, arg: unknown): Promise<Repository | undefined> {
  const root = (arg as { rootUri?: unknown } | undefined)?.rootUri;
  if (root instanceof vscode.Uri) {
    const r = api.getRepository(root);
    if (r) return r;
  }
  if (api.repositories.length === 1) return api.repositories[0];
  const ed = vscode.window.activeTextEditor?.document.uri;
  const byEditor = ed ? api.getRepository(ed) : null;
  if (byEditor) return byEditor;
  if (api.repositories.length === 0) return undefined;
  const pick = await vscode.window.showQuickPick(api.repositories.map((r) => ({ label: path.basename(r.rootUri.fsPath), description: r.rootUri.fsPath, r })),
    { placeHolder: 'Repository for the commit message' });
  return pick?.r;
}

const running = new Set<string>();

export async function generateCommitMessage(deps: CommitDeps, arg?: unknown): Promise<void> {
  let repo: Repository | undefined;
  try {
    repo = await pickRepository(await gitApi(), arg);
  } catch (e) {
    void vscode.window.showErrorMessage('Codexter: ' + (e as Error).message);
    return;
  }
  if (!repo) {
    void vscode.window.showInformationMessage('Codexter: no Git repository is open.');
    return;
  }
  const root = repo.rootUri.fsPath;
  if (running.has(root)) return;
  const staged = repo.state.indexChanges.length > 0;
  const untrackedChanges = repo.state.untrackedChanges ?? repo.state.workingTreeChanges.filter((c) => c.status === UNTRACKED);
  const untracked = staged ? [] : untrackedChanges.map((c) => path.relative(root, c.uri.fsPath).replace(/\\/g, '/'));
  if (!staged && repo.state.workingTreeChanges.length === 0 && untracked.length === 0) {
    void vscode.window.showInformationMessage('Codexter: there are no changes to describe.');
    return;
  }
  running.add(root);
  const r = repo;
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl, title: 'Codexter: writing commit message' }, () =>
      vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: '$(sync~spin) Codexter: writing commit message' }, async () => {
        const diff = await r.diff(staged);
        let recent: string[] = [];
        try { recent = (await r.log({ maxEntries: 10 })).map((c) => c.message.split('\n')[0]).filter(Boolean); } catch { /* new repository */ }
        const located = deps.locateCodex();
        const msg = await runCodexExec({
          command: located.command(), cwd: root, env: deps.env(), prompt: buildPrompt({ diff, staged, untracked, recentSubjects: recent }),
          model: deps.model(), effort: deps.effort(), mcpOff: deps.mcpOff(), timeoutMs: 180_000, log: deps.log,
        });
        r.inputBox.value = msg;
      }));
  } catch (e) {
    const m = (e as Error)?.message ?? String(e);
    deps.log('[commit] failed: ' + m);
    void vscode.window.showErrorMessage('Codexter: could not write the commit message. ' + m);
  } finally {
    running.delete(root);
  }
}
