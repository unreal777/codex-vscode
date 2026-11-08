// Newline-delimited JSON-RPC over a child process's stdin/stdout (port of JsonRpcConnection.java).
// Codex omits the "jsonrpc" member, so none is sent.
import { ChildProcess, spawn } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export class RpcError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

interface Pending {
  resolve: (v: Json) => void;
  reject: (e: Error) => void;
}

export class JsonRpcConnection {
  private proc?: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closed = false;
  private buffer = '';

  onNotification: (msg: Json) => void = () => {};
  /** Requests from the server (objects with id, method, params). */
  onServerRequest: (msg: Json) => void = () => {};
  /** Every inbound message before dispatch (for recording). */
  onRaw: (msg: Json) => void = () => {};
  onClose: (reason: string) => void = () => {};

  constructor(
    private readonly command: string[],
    private readonly cwd: string | undefined,
    private readonly log: (line: string) => void = () => {},
    private readonly env?: NodeJS.ProcessEnv,
  ) {}

  /** Resolves when the process is spawned, rejects when it cannot be started. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const [exe, ...args] = this.command;
      const p = spawn(exe, args, { cwd: this.cwd, env: this.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.proc = p;
      p.once('spawn', () => resolve());
      p.once('error', (e) => {
        reject(e);
        this.failAll('cannot start: ' + e.message);
      });
      p.stdout!.setEncoding('utf8');
      p.stdout!.on('data', (chunk: string) => this.onData(chunk));
      p.stderr!.setEncoding('utf8');
      let errBuf = '';
      p.stderr!.on('data', (chunk: string) => {
        errBuf += chunk;
        let i: number;
        while ((i = errBuf.indexOf('\n')) >= 0) {
          this.log(errBuf.slice(0, i).replace(/\r$/, ''));
          errBuf = errBuf.slice(i + 1);
        }
      });
      p.stdin!.on('error', () => { /* process gone: reported through close */ });
      p.once('close', (code, signal) =>
        this.failAll('app-server process ended' + (code != null ? ' (exit ' + code + ')' : signal ? ' (' + signal + ')' : '')));
    });
  }

  isAlive(): boolean {
    return !this.closed && !!this.proc && this.proc.exitCode === null && !this.proc.killed;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let i: number;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 1);
      if (!line.trim()) continue;
      try {
        this.dispatch(JSON.parse(line));
      } catch (e) {
        this.log('bad message: ' + e + ' :: ' + (line.length > 300 ? line.slice(0, 300) + '...' : line));
      }
    }
  }

  private dispatch(msg: Json): void {
    this.onRaw(msg);
    const hasId = msg.id !== undefined && msg.id !== null;
    const hasMethod = typeof msg.method === 'string';
    if (hasMethod && hasId) {
      this.onServerRequest(msg);
    } else if (hasMethod) {
      this.onNotification(msg);
    } else if (hasId) {
      const p = this.pending.get(Number(msg.id));
      if (!p) return;
      this.pending.delete(Number(msg.id));
      if (msg.error && typeof msg.error === 'object') {
        p.reject(new RpcError(typeof msg.error.code === 'number' ? msg.error.code : -1, String(msg.error.message ?? 'error')));
      } else {
        p.resolve(msg.result ?? null);
      }
    }
  }

  private failAll(reason: string): void {
    const wasOpen = !this.closed;
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    if (wasOpen) this.onClose(reason);
  }

  request(method: string, params?: Json): Promise<Json> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const m: Json = { id, method };
      if (params !== undefined && params !== null) m.params = params;
      try {
        this.write(m);
      } catch (e) {
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  notify(method: string, params?: Json): void {
    const m: Json = { method };
    if (params !== undefined && params !== null) m.params = params;
    this.write(m);
  }

  respond(id: Json, result: Json): void {
    this.safeWrite({ id, result });
  }

  respondError(id: Json, code: number, message: string): void {
    this.safeWrite({ id, error: { code, message } });
  }

  private safeWrite(m: Json): void {
    try {
      this.write(m);
    } catch (e) {
      this.log('write failed: ' + (e as Error).message);
    }
  }

  private write(m: Json): void {
    if (!this.proc || this.closed || !this.proc.stdin || this.proc.stdin.destroyed) throw new Error('connection closed');
    this.proc.stdin.write(JSON.stringify(m) + '\n');
  }

  close(): void {
    this.closed = true;
    const p = this.proc;
    if (p && p.exitCode === null) {
      try { p.stdin?.end(); } catch { /* ignore */ }
      p.kill();
      // like destroyForcibly after 2 s
      const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 2000);
      t.unref();
    }
    for (const pend of this.pending.values()) pend.reject(new Error('connection closed'));
    this.pending.clear();
  }
}
