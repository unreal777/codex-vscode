// Runs the managed-Codex download/update in the background and reports it to the panel
// ({"kind":"install"} progress events, {"kind":"codexUpdated"} when a newer build is ready). Port of CodexUpdater.java.
// No vscode imports: the extension supplies the settings through UpdaterHost.
import { Json } from './core/jsonrpc';
import { checkDue, CodexInstaller, readState, Result, installed } from './core/installer';
import { ProxyConfig } from './core/http';

export interface UpdaterHost {
  managedEnabled(): boolean;
  codexPath(): string;
  updateDays(): number;
  proxy(): ProxyConfig;
  warn(line: string): void;
  /** Called after every completed check (also "up to date"), for bookkeeping in globalState. */
  checked?(when: Date): void;
}

const FIRST_CHECK_DELAY_MS = 30_000;
/** Re-evaluates "is a check due" this often; a VS Code window can stay open for weeks. The interval setting still decides. */
const RECHECK_EVERY_MS = 6 * 3600_000;

export function errorMessage(e: unknown): string {
  const m = (e as Error)?.message;
  return !m || !m.trim() ? ((e as Error)?.name ?? 'error') : m;
}

export class CodexUpdater {
  private readonly installer: CodexInstaller;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly base: string,
    private readonly host: UpdaterHost,
    private readonly emit: (e: Json) => void,
    private readonly onInstalled: (r: Result) => void,
  ) {
    this.installer = new CodexInstaller(base, () => host.proxy());
  }

  private install(phase: string, version: string | null, done: number, total: number, message?: string): Json {
    const e: Json = { kind: 'install', phase };
    if (version) e.version = version;
    e.done = done;
    e.total = total;
    if (message) e.message = message;
    return e;
  }

  /** Check the registry and install if newer (or if nothing is installed). Emits progress. */
  async run(): Promise<Result> {
    try {
      const r = await this.installer.checkAndInstall((phase, version, done, total) => this.emit(this.install(phase, version, done, total)));
      this.emit(this.install('idle', r.version, 0, 0));
      this.host.checked?.(new Date());
      if (r.status === 'INSTALLED') this.onInstalled(r);
      return r;
    } catch (e) {
      this.emit(this.install('failed', null, 0, 0, errorMessage(e)));
      throw e;
    }
  }

  /** "Check for Codex updates": reports one line like "Up to date (0.166.0)". */
  async checkNow(): Promise<string> {
    try {
      const r = await this.run();
      return r.status === 'INSTALLED' ? 'Updated to ' + r.version : 'Up to date (' + r.version + ')';
    } catch (e) {
      return 'Failed: ' + errorMessage(e);
    }
  }

  /**
   * Low-priority background check (armed once per session after the first connect). Downloads when the managed copy is
   * missing, otherwise only when the configured interval has passed. Failures only show up in the log and the panel.
   */
  scheduleBackgroundCheck(): void {
    const tick = () => {
      if (!this.host.managedEnabled() || this.host.codexPath().trim()) return;
      if (installed(readState(this.base)) && !checkDue(this.base, this.host.updateDays())) return;
      this.run().catch((e) => this.host.warn('Codex background update failed: ' + errorMessage(e)));
    };
    const first = setTimeout(tick, FIRST_CHECK_DELAY_MS);
    const again = setInterval(tick, RECHECK_EVERY_MS);
    first.unref();
    again.unref();
    this.timers.push(first, again);
  }

  dispose(): void {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers = [];
  }

  /** "Installed: 0.166.0 · last check: 2026-11-04 12:20" */
  summary(): string {
    const s = readState(this.base);
    const v = installed(s) ? s.version : 'not downloaded yet';
    const last = s.lastCheck ? fmt(s.lastCheck) : 'never';
    return 'Installed: ' + v + ' · last check: ' + last;
  }
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
