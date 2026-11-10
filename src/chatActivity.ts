// Chats beside the open one: a reply that finishes while its chat is not open gets an unread mark (History, tabs; gone when the chat
// is opened, or after 3 days) and a VS Code notification whose "Open" button opens the chat at the start of its last answer.
// Today's chats of this project (opened or used today) are the tabs in the top bar (workspaceState: per project, reset each day).
import * as vscode from 'vscode';
import { addToday, dayKey, pruneUnread, removeToday, tabsOf, todayOf, TodayChats, UnreadMap } from './core/chatList';
import { osNotify } from './core/osNotify';
import { CodexSession } from './session';

const UNREAD_KEY = 'codexPanel.unread';
const TODAY_KEY = 'codexPanel.todayChats';

export class ChatActivity {
  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly session: CodexSession,
    /** brings the Codexter view up */
    private readonly reveal: () => Promise<unknown>,
    private readonly log: (line: string) => void,
  ) {}

  private unread(): UnreadMap { return pruneUnread(this.ctx.globalState.get<UnreadMap>(UNREAD_KEY), Date.now()); }
  private setUnread(m: UnreadMap): void { void this.ctx.globalState.update(UNREAD_KEY, m); }
  private today(): TodayChats { return todayOf(this.ctx.workspaceState.get<TodayChats>(TODAY_KEY), dayKey(new Date())); }
  private setToday(t: TodayChats): void { void this.ctx.workspaceState.update(TODAY_KEY, t); }

  isUnread(id: string): boolean { return id in this.unread(); }

  /** Sends unread marks and tabs to every view (sticky: a re-created view gets them too). */
  publish(): void {
    const unread = this.unread();
    this.session.broadcast({
      kind: 'chats', unread: Object.keys(unread),
      tabs: tabsOf(this.today(), unread, this.session.runningChats(), (id) => this.session.titleOf(id)),
    });
  }

  /** A message was sent in this chat: it is one of today's tabs. */
  used(threadId: string): void {
    this.setToday(addToday(this.today(), threadId, this.session.titleOf(threadId) ?? ''));
    this.publish();
  }

  /** The page's title of a chat (first message, later the name Codex gives it). */
  title(threadId: string, title: string): void {
    const t = this.today();
    if (!title || !t.chats.some((c) => c.id === threadId)) return;
    const next = addToday(t, threadId, title.slice(0, 120));
    if (next !== t) { this.setToday(next); this.publish(); }
  }

  closeTab(threadId: string): void {
    this.setToday(removeToday(this.today(), threadId));
    this.publish();
  }

  /** A chat was opened (or started): it is one of today's tabs, and its mark goes away. */
  opened(threadId: string | null): void {
    if (threadId !== null) {
      const u = this.unread();
      if (threadId in u) { delete u[threadId]; this.setUnread(u); }
      const t = this.today();
      const next = addToday(t, threadId, this.session.titleOf(threadId) ?? '');
      if (next !== t) this.setToday(next);
    }
    this.publish();
  }

  /** A reply ended. Not open: unread mark + notification. Open but VS Code is in the background: notification only. */
  turnDone(threadId: string, background: boolean, status: string): void {
    if (background) {
      const u = this.unread();
      u[threadId] = Date.now();
      this.setUnread(u);
      this.publish();
    } else if (vscode.window.state.focused) {
      return;
    }
    const verb = status === 'failed' ? 'failed' : status === 'interrupted' ? 'was stopped' : 'is done';
    this.notify('"' + this.name(threadId) + '" ' + verb + '.', threadId, status === 'failed');
  }

  needsApproval(threadId: string): void {
    this.notify('"' + this.name(threadId) + '" waits for your approval.', threadId, true);
  }

  private name(id: string): string {
    const t = this.today().chats.find((c) => c.id === id)?.title || this.session.titleOf(id) || 'A chat';
    return t.length > 60 ? t.slice(0, 59) + '…' : t;
  }

  /** VS Code in the background: a notification of the system (seen over any program; a click opens the chat through a
   *  vscode:// link, see extension.ts registerUriHandler). Else, or when that fails, VS Code's own. */
  private notify(text: string, threadId: string, warn: boolean): void {
    const vsCode = () => {
      const show = warn ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
      void show('Codexter: ' + text, 'Open').then((b) => { if (b === 'Open') void this.open(threadId, true); });
    };
    if (vscode.window.state.focused || !vscode.workspace.getConfiguration('codexPanel').get<boolean>('systemNotifications', true)) return vsCode();
    const link = vscode.env.uriScheme + '://' + this.ctx.extension.id + '/open?thread=' + encodeURIComponent(threadId);
    void osNotify('Codexter', text, link).then((err) => {
      if (!err) return;
      this.log('[notify] system notification failed, showing it in VS Code: ' + err);
      vsCode();
    });
  }

  /** Opens a chat (tab, History, notification). An unread one (or toAnswer) is shown from the start of its last answer. */
  async open(threadId: string, toAnswer = false): Promise<void> {
    const jump = toAnswer || this.isUnread(threadId);
    if (toAnswer) await this.reveal();
    const ok = await this.session.resume(threadId);
    if (ok && jump) this.session.broadcast({ kind: 'scrollToLastAnswer', threadId });
    else if (!ok) this.log('[chats] could not open ' + threadId);
  }
}
