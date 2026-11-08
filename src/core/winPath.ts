// Windows drive letters: VS Code's Uri.fsPath gives "d:\x" while Codex and Eclipse store "D:\x". Codex matches thread cwds
// exactly, so every path the extension hands to Codex or to the page goes through normalizeDrive.

/** Uppercases a leading Windows drive letter ("d:\a" -> "D:\a", "d:/a" -> "D:/a", "d:" -> "D:"). Other paths, and every path off Windows, stay unchanged. */
export function normalizeDrive(p: string, platform?: string): string;
export function normalizeDrive(p: null | undefined, platform?: string): null;
export function normalizeDrive(p: string | null | undefined, platform?: string): string | null;
export function normalizeDrive(p: string | null | undefined, platform: string = process.platform): string | null {
  if (p === null || p === undefined) return null;
  if (platform !== 'win32') return p;
  return /^[a-z]:(?:[\\/]|$)/.test(p) ? p.charAt(0).toUpperCase() + p.substring(1) : p;
}
