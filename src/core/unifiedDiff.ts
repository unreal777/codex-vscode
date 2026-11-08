// Minimal unified-diff helpers (port of UnifiedDiff.java): split a git-style multi-file diff and reverse-apply hunks to the
// current file content to rebuild the "before" text (Codex's fileChange items only carry the diff, and the file on disk already
// has the change).

export interface FileDiff {
  oldPath?: string;
  newPath?: string;
  isNew: boolean;
  isDelete: boolean;
  /** Hunks only, starting at the first "@@" line. */
  hunks: string;
}

/** The path to show/resolve (new path unless the file was deleted). */
export function diffPath(f: FileDiff): string | undefined {
  return f.isDelete ? f.oldPath : f.newPath;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(p: string, prefix: string): string {
  p = p.trim();
  return p.startsWith(prefix) ? p.substring(prefix.length) : p;
}

/** Parses "diff --git" output (as in turn/diff/updated). */
export function parseGitDiff(diff: string): FileDiff[] {
  const out: FileDiff[] = [];
  let cur: FileDiff | null = null;
  let hunks = '';
  const finish = () => {
    if (cur) cur.hunks = hunks.replace(/\n+$/, '\n');
  };
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish();
      cur = { isNew: false, isDelete: false, hunks: '' };
      hunks = '';
      out.push(cur);
    } else if (cur && hunks.length === 0 && !line.startsWith('@@')) {
      if (line.startsWith('--- ')) {
        cur.oldPath = stripPrefix(line.substring(4), 'a/');
        if (line.substring(4).trim() === '/dev/null') cur.isNew = true;
      } else if (line.startsWith('+++ ')) {
        cur.newPath = stripPrefix(line.substring(4), 'b/');
        if (line.substring(4).trim() === '/dev/null') cur.isDelete = true;
      } else if (line.startsWith('new file mode')) {
        cur.isNew = true;
      } else if (line.startsWith('deleted file mode')) {
        cur.isDelete = true;
      }
    } else if (cur) {
      hunks += line + '\n';
    }
  }
  finish();
  return out.filter((f) => {
    const p = diffPath(f);
    return p !== undefined && p !== '/dev/null';
  });
}

/** Text of a deleted file: all '-' lines of its hunks (or the raw text if it has no hunk header). */
export function deletedContent(hunks: string): string {
  let sb = '';
  const hasHeader = hunks.startsWith('@@');
  for (const l of hunks.split('\n')) {
    if (!hasHeader) sb += l + '\n';
    else if (l.startsWith('-')) sb += l.substring(1) + '\n';
  }
  return hasHeader || sb === '' ? sb : sb.substring(0, sb.length - 1);
}

function matchesAt(lines: string[], pos: number, sub: string[]): boolean {
  if (pos + sub.length > lines.length) return false;
  for (let i = 0; i < sub.length; i++) if (lines[pos + i] !== sub[i]) return false;
  return true;
}

function findNear(lines: string[], sub: string[], near: number): number {
  let best = -1;
  for (let p = 0; p + sub.length <= lines.length; p++) {
    if (matchesAt(lines, p, sub) && (best < 0 || Math.abs(p - near) < Math.abs(best - near))) best = p;
  }
  return best;
}

/**
 * Reverse-applies hunks to current (the file after the change).
 * @returns the "before" text, or null when the hunks do not match the current content
 */
export function reverseApply(current: string, hunks: string): string | null {
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const endsWithEol = current.endsWith('\n');
  const lines = current.replace(/\r\n/g, '\n').split('\n');
  if (endsWithEol && lines.length > 0) lines.pop();

  // collect hunks: new start + old/new line lists
  const starts: number[] = [];
  const olds: string[][] = [];
  const news: string[][] = [];
  let o: string[] | null = null;
  let n: string[] | null = null;
  for (const l of hunks.split('\n')) {
    const hm = HUNK.exec(l);
    if (hm) {
      const ns = parseInt(hm[1], 10);
      const zero = hm[2] === '0';
      starts.push(zero ? ns : ns - 1);
      o = [];
      n = [];
      olds.push(o);
      news.push(n);
    } else if (o && n) {
      if (l.startsWith('+')) n.push(l.substring(1));
      else if (l.startsWith('-')) o.push(l.substring(1));
      else if (l.startsWith(' ')) {
        o.push(l.substring(1));
        n.push(l.substring(1));
      }
      // "\ No newline at end of file" and trailing empties are ignored
    }
  }
  for (let i = starts.length - 1; i >= 0; i--) {
    const nw = news[i];
    let pos = Math.max(0, Math.min(starts[i], lines.length));
    if (!matchesAt(lines, pos, nw)) {
      pos = findNear(lines, nw, pos);
      if (pos < 0) return null;
    }
    lines.splice(pos, nw.length, ...olds[i]);
  }
  const text = lines.join(eol);
  return endsWithEol && lines.length > 0 ? text + eol : text;
}
