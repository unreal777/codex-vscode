// The microphone for dictation. The chat page can not use it (VS Code's webviews are not allowed to), so the extension records:
// on Windows media/mic-win.ps1 (winmm, nothing to install). Audio: 16-bit mono PCM, 24 kHz, base64 chunks of 100 ms.
import { spawn } from 'node:child_process';

export const MIC_RATE = 24000;

export interface Recorder {
  /** Ends the recording; the chunks recorded so far still arrive, then onEnd. */
  stop(): void;
}

export interface RecorderEvents {
  /** the microphone is open */
  onReady(): void;
  onChunk(base64: string, bytes: number): void;
  /** the recording is over; error when it failed */
  onEnd(error: string | null): void;
}

/**
 * Loudness of a chunk (base64 16-bit PCM) for the level bars: 0 (silence, below -55 dBFS) .. 1 (-10 dBFS and louder), from the
 * RMS on a dB scale, so normal speech lands in the upper half and room noise near 0.
 */
export function pcmLevel(base64: string): number {
  const b = Buffer.from(base64, 'base64');
  const n = Math.floor(b.length / 2);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = b.readInt16LE(i * 2); sum += v * v; }
  const rms = Math.sqrt(sum / n) / 32768;
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 55) / 45));
}

/** Whether this platform can record (Windows only for now). */
export function micSupported(platform = process.platform): boolean {
  return platform === 'win32';
}

/** Splits recorder output into lines, keeping a partial last line for the next call. */
export function splitLines(rest: string, data: string): { lines: string[]; rest: string } {
  const all = (rest + data).split('\n');
  const tail = all.pop() ?? '';
  return { lines: all.map((l) => l.trim()).filter((l) => l !== ''), rest: tail };
}

/** The recorder's error line ("ERR <code> <text>") as a sentence; '' when there is none. */
export function recorderError(stderr: string): string {
  const m = /ERR\s+(\d+)\s+([^\r\n]*)/.exec(stderr);
  if (m) return m[2].trim() + ' (code ' + m[1] + ')';
  const last = stderr.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
  return last.slice(0, 300);
}

/** Starts media/mic-win.ps1 (script: its path). */
export function startWindowsRecorder(script: string, ev: RecorderEvents, log?: (line: string) => void): Recorder {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let rest = '', stderr = '', ended = false, stopped = false;
  const end = (err: string | null) => { if (!ended) { ended = true; ev.onEnd(err); } };
  p.stdout.setEncoding('ascii');
  p.stdout.on('data', (d: string) => {
    const r = splitLines(rest, d);
    rest = r.rest;
    for (const l of r.lines) {
      if (l === 'READY') ev.onReady();
      else if (l === 'END') { /* close follows */ }
      else ev.onChunk(l, Math.floor(l.length * 3 / 4) - (l.endsWith('==') ? 2 : l.endsWith('=') ? 1 : 0));
    }
  });
  p.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString('utf8')).slice(-4000); });
  p.on('error', (e) => end('the recorder could not start: ' + e.message));
  p.on('close', (code) => {
    log?.('[dictation] recorder ended, exit code ' + code);
    end(code === 0 || stopped ? null : recorderError(stderr) || 'the recorder stopped (exit code ' + code + ')');
  });
  p.stdin.on('error', () => { /* already gone */ });
  // a recorder that does not stop on its own within 5 s after "stop" is ended
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      p.stdin.end('stop\n');
      setTimeout(() => { if (!ended) p.kill(); }, 5000).unref();
    },
  };
}
