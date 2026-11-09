// Last used chat per git branch (0.5.6): watches HEAD of every repository through VS Code's git extension and opens the branch's chat on a
// switch; the decisions are in core/branchChats.ts. Kept in workspaceState (per folder / workspace), so other projects never see it.
import * as vscode from 'vscode';
import { BranchMap, branchKey, forget, onSwitch, prune, record } from './core/branchChats';

const STATE_KEY = 'codexPanel.branchChats';

// The parts of the git extension API (vscode.git, getAPI(1)) used here
interface Head { readonly name?: string; readonly commit?: string }
interface Repository { readonly rootUri: vscode.Uri; readonly state: { readonly HEAD: Head | undefined; readonly onDidChange: vscode.Event<void> } }
interface GitApi {
  readonly repositories: Repository[];
  getRepository(uri: vscode.Uri): Repository | null;
  readonly onDidOpenRepository: vscode.Event<Repository>;
  readonly onDidCloseRepository: vscode.Event<Repository>;
}

export interface BranchChatDeps {
  openThread(): string | null;
  isRunning(): boolean;
  /** opens the chat in place of the open one; false when it could not be opened (deleted elsewhere, ...) */
  open(threadId: string): Promise<boolean>;
  log(line: string): void;
}

export class BranchChats implements vscode.Disposable {
  private api: GitApi | null = null;
  private ready: Promise<void> | null = null;
  /** last seen branch / commit per repository root */
  private readonly heads = new Map<string, { name: string; commit?: string }>();
  private readonly subs: vscode.Disposable[] = [];
  private readonly repoSubs = new Map<string, vscode.Disposable>();

  constructor(private readonly state: vscode.Memento, private readonly deps: BranchChatDeps) {}

  /** Starts watching; safe to call more than once. Without the git extension nothing happens. */
  start(): Promise<void> {
    if (!this.ready) this.ready = this.connect();
    return this.ready;
  }

  private async connect(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>('vscode.git');
      if (!ext) return;
      const exp = ext.isActive ? ext.exports : await ext.activate();
      const api = exp.getAPI(1);
      this.api = api;
      api.repositories.forEach((r) => this.watch(r));
      this.subs.push(api.onDidOpenRepository((r) => this.watch(r)), api.onDidCloseRepository((r) => {
        const root = r.rootUri.fsPath;
        this.repoSubs.get(root)?.dispose();
        this.repoSubs.delete(root);
        this.heads.delete(root);
      }));
    } catch (e) {
      this.deps.log('[branch] git extension not available: ' + e);
    }
  }

  private watch(r: Repository): void {
    const root = r.rootUri.fsPath;
    if (this.repoSubs.has(root)) return;
    const h = r.state.HEAD;
    if (h?.name) this.heads.set(root, { name: h.name, commit: h.commit });
    this.repoSubs.set(root, r.state.onDidChange(() => this.changed(r)));
  }

  private changed(r: Repository): void {
    const root = r.rootUri.fsPath;
    const h = r.state.HEAD;
    if (!h?.name) return; // detached HEAD (rebase, ...): keep the last branch
    const prev = this.heads.get(root);
    this.heads.set(root, { name: h.name, commit: h.commit });
    if (!prev || prev.name === h.name) return;
    void this.switched(root, prev, { name: h.name, commit: h.commit });
  }

  private load(): BranchMap {
    return prune(this.state.get<BranchMap>(STATE_KEY) ?? {}, Date.now());
  }

  private save(map: BranchMap): void {
    void this.state.update(STATE_KEY, map);
  }

  private async switched(root: string, prev: { name: string; commit?: string }, now: { name: string; commit?: string }): Promise<void> {
    const sameCommit = !!prev.commit && prev.commit === now.commit;
    const d = onSwitch(this.load(), root, prev.name, now.name, this.deps.openThread(), sameCommit, Date.now());
    this.save(d.map);
    this.deps.log('[branch] ' + prev.name + ' -> ' + now.name + (d.open ? ', opening its chat ' + d.open : d.map[branchKey(root, now.name)] ? ', the open chat moves along' : ''));
    if (!d.open) return;
    if (this.deps.isRunning()) {
      void vscode.window.showInformationMessage('Codexter: a reply is still running, so the chat of branch "' + now.name + '" was not opened. Find it in the history.');
      return;
    }
    if (!(await this.deps.open(d.open))) {
      this.deps.log('[branch] the chat of ' + now.name + ' could not be opened, forgetting it');
      this.save(forget(this.load(), root, now.name));
    }
  }

  /** A message was sent in this chat: it becomes the chat of the branch that is checked out in the chat's folder. */
  used(threadId: string, cwd: string | null): void {
    if (!cwd) return;
    void this.start().then(() => {
      const repo = this.api?.getRepository(vscode.Uri.file(cwd));
      const branch = repo?.state.HEAD?.name;
      if (!repo || !branch) return;
      this.save(record(this.load(), repo.rootUri.fsPath, branch, threadId, Date.now()));
    });
  }

  /** At startup: the chat of the branch checked out in cwd. Waits up to waitMs for the git extension to find the repository. */
  async threadAtStartup(cwd: string, waitMs = 5000): Promise<string | null> {
    await this.start();
    if (!this.api) return null;
    const end = Date.now() + waitMs;
    for (;;) {
      const repo = this.api.getRepository(vscode.Uri.file(cwd));
      const branch = repo?.state.HEAD?.name;
      if (repo && branch) return this.load()[branchKey(repo.rootUri.fsPath, branch)]?.thread ?? null;
      if (Date.now() >= end) return null;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  dispose(): void {
    this.subs.forEach((d) => d.dispose());
    this.repoSubs.forEach((d) => d.dispose());
    this.repoSubs.clear();
  }
}
