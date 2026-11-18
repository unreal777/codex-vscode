// Chat names written by AI: what the chat is about (it may have moved on from the first message). No VS Code imports (unit tested).
import { Json } from './jsonrpc';
import { stripPreamble } from './threadRows';

/** codexPanel.autoChatNames: off | first (once, after the first answer) | auto (then again every AUTO_NAME_EVERY answers). */
export type AutoNameMode = 'off' | 'first' | 'auto';
export const AUTO_NAME_EVERY = 5;
export const MAX_TITLE_CHARS = 80;
/** Per message and in total: what the prompt gets of the chat. */
const MAX_MSG_CHARS = 800;
const MAX_PROMPT_MSGS = 8;

export function autoNameMode(v: unknown): AutoNameMode {
  return v === 'off' || v === 'first' ? v : 'auto';
}

/** Is the chat named again after its n-th finished answer? */
export function shouldAutoName(mode: AutoNameMode, answers: number): boolean {
  if (mode === 'off' || answers < 1) return false;
  return answers === 1 || (mode === 'auto' && answers % AUTO_NAME_EVERY === 0);
}

export interface ChatMessage { role: 'user' | 'assistant'; text: string }

/** The chat's messages from thread/read turns: the user's text (without the extension's context lines) and the last answer of each turn. */
export function transcriptOf(turns: Json[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of Array.isArray(turns) ? turns : []) {
    let answer = '';
    for (const it of Array.isArray(t?.items) ? t.items : []) {
      if (it?.type === 'userMessage') {
        const raw = (Array.isArray(it.content) ? it.content : []).filter((c: Json) => c?.type === 'text' && typeof c.text === 'string').map((c: Json) => c.text).join('\n');
        const text = stripPreamble(raw).trim();
        if (text) out.push({ role: 'user', text });
      } else if (it?.type === 'agentMessage' && typeof it.text === 'string' && it.text.trim()) {
        answer = it.text.trim();
      }
    }
    if (answer) out.push({ role: 'assistant', text: answer });
  }
  return out;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** The question for the quick model: the first message and the latest ones, the current name if there is one. */
export function buildTitlePrompt(msgs: ChatMessage[], current: string | null): string {
  const picked = msgs.length <= MAX_PROMPT_MSGS ? msgs : [msgs[0], ...msgs.slice(-(MAX_PROMPT_MSGS - 1))];
  const lines = [
    'Give this chat between a user and a coding assistant a short name for a chat list.',
    'Rules:',
    '- Do not run commands or read files; everything you need is in this message.',
    '- 2 to 7 words, at most 60 characters, no quotes, no period at the end, no emoji.',
    "- Name what the chat is about now: if the topic changed, the newer topic wins over the first message.",
    "- Use the language of the user's messages.",
    '- Answer with the name only.',
  ];
  if (current) lines.push('', 'Current name (keep it if it still fits): ' + current);
  lines.push('', 'Chat' + (picked.length < msgs.length ? ' (first message and the latest ones)' : '') + ':');
  for (const m of picked) lines.push('', (m.role === 'user' ? 'User: ' : 'Assistant: ') + cut(m.text.replace(/\r\n?/g, '\n'), MAX_MSG_CHARS));
  return lines.join('\n');
}

/** The answer as a name: first line, without labels, quotes, markdown and the final period; '' when nothing is left. */
export function cleanTitle(raw: string): string {
  const line = (raw || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';
  let s = line.replace(/^(?:chat\s*)?(?:name|title)\s*:\s*/i, '').replace(/^[*_`#>\s-]+|[*_`\s]+$/g, '');
  for (let i = 0; i < 2 && s.length > 1 && /^["'“„«‘]/.test(s) && /["'”“»’]$/.test(s); i++) s = s.slice(1, -1).trim();
  s = s.replace(/[.。]+$/, '').replace(/\s+/g, ' ').trim();
  return cut(s, MAX_TITLE_CHARS);
}
