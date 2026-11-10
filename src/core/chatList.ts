// Unread marks (a reply finished while the chat was not open; kept 3 days) and today's chats of the project (the tabs).
// No VS Code imports (unit tested).

export const UNREAD_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

/** chat id -> when its reply finished unseen (ms) */
export type UnreadMap = Record<string, number>;

/** The chats used in this project today (oldest first: tab order stays put). */
export interface TodayChats { day: string; chats: { id: string; title: string }[] }

export interface Tab { id: string; title: string; unread: boolean; running: boolean }

/** Marks older than UNREAD_MAX_AGE_MS go away by themselves. */
export function pruneUnread(m: UnreadMap | undefined, now: number): UnreadMap {
  const out: UnreadMap = {};
  for (const [id, at] of Object.entries(m ?? {})) if (typeof at === 'number' && now - at < UNREAD_MAX_AGE_MS) out[id] = at;
  return out;
}

/** Local calendar day (YYYY-MM-DD): "today" is the user's day, not UTC. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Today's list (an older day's list counts as empty). */
export function todayOf(t: TodayChats | undefined, today: string): TodayChats {
  return t && t.day === today && Array.isArray(t.chats) ? { day: today, chats: t.chats.filter((c) => c && typeof c.id === 'string') } : { day: today, chats: [] };
}

/** Adds a chat (kept in place when it is there already; a known title replaces an empty one). */
export function addToday(t: TodayChats, id: string, title: string): TodayChats {
  const at = t.chats.findIndex((c) => c.id === id);
  if (at >= 0) {
    if (!title || t.chats[at].title === title) return t;
    const chats = t.chats.slice();
    chats[at] = { id, title };
    return { day: t.day, chats };
  }
  return { day: t.day, chats: [...t.chats, { id, title }] };
}

export function removeToday(t: TodayChats, id: string): TodayChats {
  return { day: t.day, chats: t.chats.filter((c) => c.id !== id) };
}

/** The tabs: today's chats with their marks; titles fall back to what the session knows, then "Chat". */
export function tabsOf(t: TodayChats, unread: UnreadMap, running: string[], titleOf: (id: string) => string | null): Tab[] {
  return t.chats.map((c) => ({ id: c.id, title: c.title || titleOf(c.id) || 'Chat', unread: c.id in unread, running: running.includes(c.id) }));
}
