// AI search in the History panel: the chats in question (title, project, date, start of the first message) go to a temporary
// read-only `codex exec` run with the user's description; the answer is the numbers of the matching chats. No VS Code imports (unit tested).

/** Most chats sent to Codex (newest first) and how much of each first message. */
export const AI_MAX_CHATS = 300;
export const AI_PREVIEW_CHARS = 300;
/** Upper bound of the whole chat list in the prompt (characters). */
export const AI_MAX_LIST_CHARS = 90_000;
/** Most matches shown. */
export const AI_MAX_RESULTS = 30;

export interface AiCandidate {
  title: string;
  project: string;
  /** seconds since 1970 (thread updatedAt) or null */
  updatedAt: number | null;
  /** start of the first message */
  preview: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const day = (sec: number | null) => (typeof sec === 'number' && Number.isFinite(sec) ? new Date(sec * 1000).toISOString().slice(0, 10) : '?');

/** The prompt; the chats are numbered from 1. Chats that do not fit into AI_MAX_LIST_CHARS are left out (the oldest, as the list is newest first). */
export function buildSearchPrompt(query: string, chats: AiCandidate[], now = new Date()): { prompt: string; count: number } {
  const lines: string[] = [];
  let size = 0;
  for (let i = 0; i < chats.length && i < AI_MAX_CHATS; i++) {
    const c = chats[i];
    const first = oneLine(c.preview).slice(0, AI_PREVIEW_CHARS);
    const line = '[' + (i + 1) + '] ' + day(c.updatedAt) + ' | ' + oneLine(c.project || '?') + ' | ' + oneLine(c.title || '(untitled)') + (first ? '\n    ' + first : '');
    if (size + line.length > AI_MAX_LIST_CHARS) break;
    lines.push(line);
    size += line.length + 1;
  }
  const prompt = [
    'Find chats in a list of past coding chats that match what the user is looking for.',
    'Rules:',
    '- Do not run commands or read files; everything you need is in this message.',
    '- Each chat shows its number, last change (YYYY-MM-DD), project, title and the start of its first message. Today is ' + now.toISOString().slice(0, 10) + '.',
    '- Match by meaning, not only by words: other languages, synonyms and vague descriptions count.',
    '- Answer with the numbers of the matching chats only, best match first, separated by commas (for example: 12, 3, 40). At most ' + AI_MAX_RESULTS + '.',
    '- If no chat matches, answer: none',
    '',
    'The user is looking for:',
    oneLine(query),
    '',
    'Chats:',
    ...lines,
  ].join('\n');
  return { prompt, count: lines.length };
}

/** Indexes (0-based) of the chats named in the answer, in the answer's order, without duplicates or numbers outside 1..count. */
export function parseSearchAnswer(answer: string, count: number): number[] {
  const out: number[] = [];
  const text = answer.replace(/\d{4}-\d{2}-\d{2}/g, ' '); // a date the model may repeat is not a chat number
  for (const m of text.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n >= 1 && n <= count && !out.includes(n - 1)) out.push(n - 1);
    if (out.length >= AI_MAX_RESULTS) break;
  }
  return out;
}
