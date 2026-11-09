// Last used chat per git branch (0.5.6): the decisions only, no VS Code imports (unit tested). Kept in workspaceState by src/branchChats.ts.
// A chat belongs to a branch once a message was sent in it while that branch was checked out. Entries unused for 30 days are dropped.

export interface BranchEntry { thread: string; at: number }
export type BranchMap = Record<string, BranchEntry>;

export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Map key of a branch in a repository (the root is compared case-insensitively with / separators, as Windows paths are). */
export function branchKey(root: string, branch: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() + '|' + branch;
}

/** Drops entries that were not used for MAX_AGE_MS. */
export function prune(map: BranchMap, now: number): BranchMap {
  const out: BranchMap = {};
  for (const [k, e] of Object.entries(map)) if (e && typeof e.thread === 'string' && typeof e.at === 'number' && now - e.at <= MAX_AGE_MS) out[k] = e;
  return out;
}

/** The chat was used (a message sent) on this branch. */
export function record(map: BranchMap, root: string, branch: string, thread: string, now: number): BranchMap {
  return { ...map, [branchKey(root, branch)]: { thread, at: now } };
}

export function forget(map: BranchMap, root: string, branch: string): BranchMap {
  const out = { ...map };
  delete out[branchKey(root, branch)];
  return out;
}

export interface SwitchDecision {
  /** chat to open now, null = leave the open chat alone */
  open: string | null;
  map: BranchMap;
}

/**
 * HEAD of a repository moved from one branch to another.
 * - The new branch has a chat: open it (unless it is the open one).
 * - Else, when the branch was just created (same commit as before) and the open chat is the one used on the old branch, the chat moves to
 *   the new branch: work often starts on master and gets its branch only at the end.
 * - Else nothing changes; the open chat joins the branch with its next message.
 */
export function onSwitch(map: BranchMap, root: string, from: string | null, to: string, openThread: string | null, sameCommit: boolean, now: number): SwitchDecision {
  const target = map[branchKey(root, to)];
  if (target) return { open: target.thread === openThread ? null : target.thread, map };
  if (from && openThread && sameCommit && map[branchKey(root, from)]?.thread === openThread) {
    return { open: null, map: record(forget(map, root, from), root, to, openThread, now) };
  }
  return { open: null, map };
}
