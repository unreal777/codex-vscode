// Turns a thread/list row into what the History panel shows (port of ThreadRows.java).

/** Longest title the panel receives; the first user message can be pages long. */
const MAX_TITLE = 160;

/** Context the extension itself prepends to a prompt ("Active file: ...", "Referenced files: ...", selections); not part of the title. */
const PLUGIN_PREAMBLE = /^(?:(?:Active file: [^\n]*|Referenced (?:files|symbols)[^\n]*:\n(?:- [^\n]*\n?)+|Selected code in [^\n]*:\n```[\s\S]*?\n```)\n+)+/;

function shorten(text: string): string {
  const oneLine = text.replace(/[ \t\n\x0B\f\r]+/g, ' ').trim();
  return oneLine.length > MAX_TITLE ? oneLine.substring(0, MAX_TITLE - 1) + '\u2026' : oneLine;
}

/** User-facing title: the chat name if Codex made one, else the first message without the extension's own context lines. */
export function threadTitle(name: string | null | undefined, preview: string | null | undefined): string {
  if (name && name.trim()) return shorten(name);
  if (preview === null || preview === undefined) return '';
  const text = preview.replace(PLUGIN_PREAMBLE, '');
  return shorten(text.trim() === '' ? preview : text);
}

/** Longest first-message text of the History tooltip. */
export const MAX_PREVIEW = 500;

/** Tooltip text of a History row: the first message without the extension's own context lines, line breaks kept (blank runs folded). */
export function threadPreview(preview: string | null | undefined, max = MAX_PREVIEW): string {
  if (!preview) return '';
  const stripped = preview.replace(PLUGIN_PREAMBLE, '');
  const text = (stripped.trim() === '' ? preview : stripped).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > max ? text.substring(0, max - 1).trimEnd() + '…' : text;
}

function normalizeCwd(cwd: string): string {
  let p = cwd.replace(/\\/g, '/');
  if (p.startsWith('//?/')) p = p.substring(4);
  while (p.length > 1 && p.endsWith('/')) p = p.substring(0, p.length - 1);
  return p;
}

/** Folder name of a working directory: last segment, tolerant of '/', '\\', a Windows long-path prefix and trailing separators. */
export function folderName(cwd: string | null | undefined): string {
  if (!cwd) return '';
  const p = normalizeCwd(cwd);
  const slash = p.lastIndexOf('/');
  const last = slash < 0 ? p : p.substring(slash + 1);
  return last === '' ? p : last; // "C:/" -> "C:/" stays recognisable
}

/** Comparable form of a working directory (case-insensitive, one separator style, no long-path prefix, no trailing separator). */
export function cwdKey(cwd: string | null | undefined): string {
  if (!cwd) return '';
  return normalizeCwd(cwd).toLowerCase();
}

/**
 * Codex matches the thread/list cwd filter exactly, but the same folder can be stored in several spellings (drive letter case,
 * slash style, trailing separator, long-path prefix). Returns the selected paths plus every spelling of the same folders in `seen`
 * (cwds of thread rows), without duplicates; the selected spelling comes first.
 */
export function expandCwds(selected: readonly string[], seen: Iterable<string>): string[] {
  const wanted = new Set<string>();
  for (const s of selected) if (s) wanted.add(cwdKey(s));
  const out: string[] = [];
  const have = new Set<string>();
  const add = (p: string) => { if (!have.has(p)) { have.add(p); out.push(p); } };
  for (const s of selected) if (s) add(s);
  for (const c of seen) if (c && wanted.has(cwdKey(c))) add(c);
  return out;
}

/** Search box semantics: every word must occur (case-insensitively) in the title or in the project name. */
export function threadMatches(query: string | null | undefined, title: string, project: string): boolean {
  if (!query || !query.trim()) return true;
  const haystack = (title + '\n' + project).toLowerCase();
  for (const word of query.toLowerCase().trim().split(/\s+/)) if (!haystack.includes(word)) return false;
  return true;
}

/** Archived chats are filtered by the server; this drops the rest that is not worth listing (sub-agent runs, unsaved or empty chats). */
export function isListable(thread: any): boolean {
  if (thread.ephemeral === true) return false;
  if (thread.parentThreadId !== undefined && thread.parentThreadId !== null) return false;
  return threadTitle(str(thread, 'name'), str(thread, 'preview')) !== '';
}

export function str(o: any, key: string): string | null {
  const v = o?.[key];
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
}
