// The code review instructions of a project: REVIEW_INSTRUCTIONS.md. Looked up from the chat's folder up to the repository root
// (a file there serves its subfolders too); a new one goes into the chat's folder.
import * as fs from 'node:fs';
import * as path from 'node:path';

export const REVIEW_FILE = 'REVIEW_INSTRUCTIONS.md';

const isFile = (p: string): boolean => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** The folders that belong to the project of `start`: itself, and with a repository its parents up to the repository root. */
function projectFolders(start: string): string[] {
  const chain = [start];
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return chain;
    if (dir === path.dirname(dir)) return [start];
    chain.push(path.dirname(dir));
  }
}

/** The file that applies to the folder; when there is none, `path` is where a new one goes. */
export function findReviewFile(cwd: string): { path: string; exists: boolean } {
  const start = path.resolve(cwd);
  const found = projectFolders(start).map((d) => path.join(d, REVIEW_FILE)).find(isFile);
  return found ? { path: found, exists: true } : { path: path.join(start, REVIEW_FILE), exists: false };
}

/** The text sent to Codex: no BOM, no surrounding blank lines ('' = an empty file). */
export const reviewText = (raw: string): string => raw.replace(/^﻿/, '').trim();

/** Writes a new file; an existing one is never overwritten. False = it was already there. */
export function createReviewFile(file: string, text: string): boolean {
  try {
    fs.writeFileSync(file, text, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}
