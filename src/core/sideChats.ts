// Clarify side chats (0.9.1): a question about one answer is asked in a fork of the chat made at that answer, read-only, and the
// main chat gets nothing. This file is the link store ("this answer has these side chats") and the small pure helpers around it.
// No VS Code imports (unit tested).
import { Json } from './jsonrpc';
import { stripPreamble } from './threadRows';

/** One side chat of an answer. `base` = how many turns of the fork are the main chat's (copied); the side chat's own turns come after. */
export interface SideEntry { id: string; at: number; title: string; base: number }

/** parent chat id -> answer (turn) id -> its side chats, oldest first. Kept by the host (globalState), never written into the chat. */
export type SideStore = Record<string, Record<string, SideEntry[]>>;

/** What the page needs of an entry. */
export interface SideLink { id: string; at: number; title: string }

/** A side chat's name starts with this, so it is recognisable (and hidden from the History) even without the store. */
export const SIDE_PREFIX = '↳ ';
/** In front of every question of a side chat: keeps Codex on the question and out of the main task. Cut again when the chat is shown. */
export const SIDE_MARK = '[Codexter side question: answer only this question about your answer above, briefly. This side chat is read-only, change no files, and do not carry on the main task.]\n\n';
/** How many parent chats the store remembers (the oldest go first). */
export const SIDE_MAX_PARENTS = 400;

const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** The store as the host handed it back (globalState can hold anything): only well-formed entries are kept. */
export function normalizeStore(raw: unknown): SideStore {
  const out: SideStore = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [parent, turns] of Object.entries(raw as Record<string, unknown>)) {
    if (!turns || typeof turns !== 'object') continue;
    for (const [turn, list] of Object.entries(turns as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const ok = list.filter((e): e is SideEntry => !!e && typeof e.id === 'string' && e.id !== '' && typeof e.base === 'number').map((e) => ({
        id: e.id, at: typeof e.at === 'number' ? e.at : 0, title: typeof e.title === 'string' ? e.title : '', base: Math.max(0, Math.floor(e.base)) }));
      if (ok.length > 0) (out[parent] ??= {})[turn] = ok;
    }
  }
  return out;
}

/** A new store with the side chat linked to that answer. */
export function addSide(store: SideStore, parent: string, turn: string, entry: SideEntry): SideStore {
  const next: SideStore = { ...store };
  const turns = { ...(next[parent] ?? {}) };
  turns[turn] = [...(turns[turn] ?? []).filter((e) => e.id !== entry.id), entry];
  delete next[parent];   // re-added last: the oldest parents go first when the store is full
  next[parent] = turns;
  const parents = Object.keys(next);
  for (const old of parents.slice(0, Math.max(0, parents.length - SIDE_MAX_PARENTS))) delete next[old];
  return next;
}

/** A new store without a chat: a parent chat loses all its links, a side chat only its own. */
export function forgetChat(store: SideStore, id: string): SideStore {
  const next: SideStore = {};
  for (const [parent, turns] of Object.entries(store)) {
    if (parent === id) continue;
    const kept: Record<string, SideEntry[]> = {};
    for (const [turn, list] of Object.entries(turns)) {
      const rest = list.filter((e) => e.id !== id);
      if (rest.length > 0) kept[turn] = rest;
    }
    if (Object.keys(kept).length > 0) next[parent] = kept;
  }
  return next;
}

/** The answers of a chat that have side chats: turn id -> links (what goes to the page). */
export function linksOf(store: SideStore, parent: string): Record<string, SideLink[]> {
  const out: Record<string, SideLink[]> = {};
  for (const [turn, list] of Object.entries(store[parent] ?? {})) out[turn] = list.map((e) => ({ id: e.id, at: e.at, title: e.title }));
  return out;
}

/** Every side chat id of the store. */
export function sideIds(store: SideStore): Set<string> {
  const ids = new Set<string>();
  for (const turns of Object.values(store)) for (const list of Object.values(turns)) for (const e of list) ids.add(e.id);
  return ids;
}

/** The entry of a side chat with where it hangs, or null. */
export function findSide(store: SideStore, id: string): { parent: string; turn: string; entry: SideEntry } | null {
  for (const [parent, turns] of Object.entries(store)) {
    for (const [turn, list] of Object.entries(turns)) {
      const entry = list.find((e) => e.id === id);
      if (entry) return { parent, turn, entry };
    }
  }
  return null;
}

/** A thread/list row that is a side chat: it is not listed in the History (the answer's badge opens it instead). */
export function isSideRow(thread: Json, ids: ReadonlySet<string>): boolean {
  return (typeof thread?.id === 'string' && ids.has(thread.id)) || (typeof thread?.name === 'string' && thread.name.startsWith(SIDE_PREFIX));
}

/** The name of a side chat: the arrow and the first words of the answer it clarifies. */
export function sideTitle(excerpt: string): string {
  const e = excerpt.replace(/\s+/g, ' ').trim();
  return SIDE_PREFIX + 'Clarify: ' + cut(e || 'answer', 60);
}

/** What the question is sent as. */
export function sideQuestion(text: string): string {
  return SIDE_MARK + text;
}

/** One turn of a side chat as the page shows it. */
export interface SideTurn { id: string; user: string; answer: string; status: string }

/** The side chat's own turns (the first `base` turns are the main chat's): the question without the steering mark, the last answer. */
export function sideTurns(turns: Json[], base: number): SideTurn[] {
  const out: SideTurn[] = [];
  for (const t of (Array.isArray(turns) ? turns : []).slice(Math.max(0, base))) {
    let user = '', answer = '';
    for (const it of Array.isArray(t?.items) ? t.items : []) {
      if (it?.type === 'userMessage') {
        const raw = (Array.isArray(it.content) ? it.content : []).filter((c: Json) => c?.type === 'text' && typeof c.text === 'string').map((c: Json) => c.text).join('\n');
        user = stripPreamble(raw.startsWith(SIDE_MARK) ? raw.slice(SIDE_MARK.length) : raw).trim();
      } else if (it?.type === 'agentMessage' && typeof it.text === 'string' && it.text.trim() && it.phase !== 'commentary') {
        answer = it.text.trim();
      }
    }
    out.push({ id: typeof t?.id === 'string' ? t.id : '', user, answer, status: typeof t?.status === 'string' ? t.status : 'completed' });
  }
  return out;
}
