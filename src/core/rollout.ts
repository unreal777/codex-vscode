// The context usage of a chat that is opened again: Codex sends thread/tokenUsage/updated only while a turn runs, but its session
// file (thread.path, JSONL) has a "token_count" event after each turn. Only the end of the file is read. No VS Code imports.
import * as fs from 'node:fs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const breakdown = (b: Json | null | undefined) => b && typeof b === 'object' ? {
  inputTokens: Number(b.input_tokens) || 0, cachedInputTokens: Number(b.cached_input_tokens) || 0, outputTokens: Number(b.output_tokens) || 0,
  reasoningOutputTokens: Number(b.reasoning_output_tokens) || 0, totalTokens: Number(b.total_tokens) || 0,
} : null;

/** The last token_count event of the lines, in the shape of thread/tokenUsage/updated's tokenUsage; null when there is none. */
export function tokenUsageFromLines(text: string): Json | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.includes('"token_count"')) continue;
    let o: Json;
    try { o = JSON.parse(l); } catch { continue; }   // the first line of a tail may be cut
    const info = o?.payload?.type === 'token_count' ? o.payload.info : null;
    const last = breakdown(info?.last_token_usage), total = breakdown(info?.total_token_usage);
    if (!last || !total) continue;
    const w = Number(info.model_context_window);
    return { last, total, modelContextWindow: Number.isFinite(w) && w > 0 ? w : null };
  }
  return null;
}

/** The last token usage of a session file: the end of it first (256 KB), then up to 4 MB. Null when unreadable or none. */
export function lastTokenUsage(file: string | null | undefined): Json | null {
  if (!file) return null;
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    for (const want of [256 * 1024, 4 * 1024 * 1024]) {
      const len = Math.min(size, want);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const u = tokenUsageFromLines(buf.toString('utf8'));
      if (u || len === size) return u;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) try { fs.closeSync(fd); } catch { /* closed */ }
  }
}
