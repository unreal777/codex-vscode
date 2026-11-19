// Codex usage limit alerts (0.14.1): a message at 80% and at 90% of a limit window. Pure logic, no VS Code imports (unit tested).
// The snapshot is the app-server's RateLimitSnapshot (account/rateLimits/read and account/rateLimits/updated): primary and secondary
// windows with usedPercent and windowDurationMins.

export const LIMIT_LEVELS = [80, 90];

export interface LimitWindow { usedPercent: number; windowDurationMins?: number | null; resetsAt?: number | null }
export interface LimitSnapshot { limitId?: string | null; primary?: LimitWindow | null; secondary?: LimitWindow | null }

/** Levels already announced, per window key ("<limitId>|<duration>"). */
export type LimitFired = Record<string, number[]>;

export interface LimitAlert { level: number; text: string }

const MAX_KEYS = 20;

/** "5h", "weekly", "3d": how the window is named in the message. */
export function windowName(mins: number | null | undefined): string {
  if (mins == null) return 'usage';
  if (mins <= 300) return Math.round(mins / 60) + 'h window';
  if (mins >= 10080) return 'weekly window';
  return Math.round(mins / 1440) + 'd window';
}

/**
 * The alerts for a new snapshot. Each level fires once per window until usage falls below it again (a reset). Crossing several levels
 * at once (80 -> 95) sends only the highest one; the lower ones count as sent.
 */
export function limitAlerts(snap: LimitSnapshot | null | undefined, fired: LimitFired): { alerts: LimitAlert[]; fired: LimitFired } {
  const out: LimitFired = { ...fired };
  const alerts: LimitAlert[] = [];
  if (!snap) return { alerts, fired: out };
  for (const w of [snap.primary, snap.secondary]) {
    if (!w || typeof w.usedPercent !== 'number') continue;
    const key = (snap.limitId || 'codex') + '|' + (w.windowDurationMins ?? 'x');
    const used = Math.max(0, Math.min(100, w.usedPercent));
    const sent = (out[key] || []).filter((l) => used >= l);   // below a level again: it may fire again next time
    const crossed = LIMIT_LEVELS.filter((l) => used >= l && !sent.includes(l));
    if (crossed.length) {
      const top = crossed[crossed.length - 1];
      alerts.push({ level: top, text: 'Codex limit: ' + Math.floor(used) + '% of the ' + windowName(w.windowDurationMins) + ' used.' });
      sent.push(...crossed);
    }
    out[key] = sent;
  }
  const keys = Object.keys(out);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_KEYS))) delete out[k];
  return { alerts, fired: out };
}
