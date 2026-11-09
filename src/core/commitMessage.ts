// "Generate commit message" with Codex: the prompt, the `codex exec` call and the cleanup of the answer. No VS Code imports (unit tested).
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Longest diff sent to Codex; the rest is cut (the file list still names every file). */
export const MAX_DIFF_CHARS = 60_000;

export interface CommitInput {
  /** unified diff of the changes that will be committed */
  diff: string;
  /** true: the staged changes; false: nothing is staged, so all changes */
  staged: boolean;
  /** new files git does not track yet (not in the diff) */
  untracked: string[];
  /** subjects of the latest commits, newest first (to copy the project's style and language) */
  recentSubjects: string[];
}

export function buildPrompt(i: CommitInput): string {
  const diff = i.diff.length > MAX_DIFF_CHARS ? i.diff.slice(0, MAX_DIFF_CHARS) + '\n[... diff cut, ' + (i.diff.length - MAX_DIFF_CHARS) + ' more characters]' : i.diff;
  const parts = [
    'Write a git commit message for the ' + (i.staged ? 'staged changes' : 'changes (nothing is staged, so all changes are committed)') + ' below.',
    'Rules:',
    '- Do not run commands or change files; everything you need is in this message.',
    '- First line: a short summary in the imperative mood, at most 72 characters.',
    '- If the change needs more explanation, add a blank line and a short body (plain text or "- " bullets, lines up to 72 characters).',
    '- Follow the style and language of the recent commit subjects if there are any.',
    '- Answer with the commit message only: no code fences, no quotes, no preamble.',
  ];
  if (i.recentSubjects.length) parts.push('', 'Recent commit subjects:', ...i.recentSubjects.map((s) => '- ' + s));
  if (i.untracked.length) parts.push('', 'New untracked files (content not shown):', ...i.untracked.map((f) => '- ' + f));
  parts.push('', 'Diff:', diff.trim() === '' ? '(empty)' : diff);
  return parts.join('\n');
}

/** Strips what models like to wrap around the message: code fences, surrounding quotes, "Commit message:" labels, trailing spaces. */
export function cleanMessage(raw: string): string {
  let s = raw.replace(/\r\n/g, '\n').trim();
  const fence = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(s);
  if (fence) s = fence[1].trim();
  s = s.replace(/^(?:commit message|message)\s*:\s*/i, '');
  if (s.length > 1 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) s = s.slice(1, -1).trim();
  return s.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
}

/** Arguments of `codex exec`: a temporary (ephemeral) read-only run whose last message goes to outFile; the prompt comes on stdin. */
export function execArgs(outFile: string, model: string, effort: string): string[] {
  const a = ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-o', outFile];
  if (model) a.push('-m', model);
  if (effort) a.push('-c', 'model_reasoning_effort="' + effort + '"');
  a.push('-');
  return a;
}

export interface ExecOptions {
  /** command prefix of the codex executable (Located.command()) */
  command: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  model: string;
  effort: string;
  timeoutMs: number;
  log?: (line: string) => void;
}

/** Runs `codex exec` and returns the cleaned last message. Rejects with the end of stderr when Codex fails or writes nothing. */
export function runCodexExec(o: ExecOptions): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexter-commit-'));
  const out = path.join(dir, 'message.txt');
  const [exe, ...pre] = o.command;
  const args = [...pre, ...execArgs(out, o.model, o.effort)];
  o.log?.('[commit] ' + exe + ' ' + args.join(' ') + ' (cwd ' + o.cwd + ')');
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp folder */ } };
  return new Promise<string>((resolve, reject) => {
    let stderr = '';
    let done = false;
    const p = spawn(exe, args, { cwd: o.cwd, env: o.env, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const timer = setTimeout(() => { if (!done) { p.kill(); finish(new Error('Codex did not answer within ' + Math.round(o.timeoutMs / 1000) + ' s')); } }, o.timeoutMs);
    const finish = (err: Error | null, text?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      if (err) reject(err); else resolve(text as string);
    };
    p.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString('utf8')).slice(-4000); });
    p.on('error', (e) => finish(e));
    p.on('close', (code) => {
      let text = '';
      try { text = fs.readFileSync(out, 'utf8'); } catch { /* no answer */ }
      const msg = cleanMessage(text);
      if (msg) return finish(null, msg);
      const tail = stderr.trim().split('\n').slice(-3).join(' ').trim();
      finish(new Error('Codex wrote no message (exit code ' + code + ')' + (tail ? ': ' + tail : '')));
    });
    p.stdin.on('error', () => { /* the process may exit before reading everything */ });
    p.stdin.end(o.prompt, 'utf8');
  });
}
