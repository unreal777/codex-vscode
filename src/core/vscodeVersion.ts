// VS Code 1.106 added the secondary side bar to the extension API (viewsContainers.secondarySidebar). Older versions get the
// activity bar container instead. The extension sets the context key codexPanel.noSecondarySidebar from vscode.version.
export const SECONDARY_SIDEBAR_MIN = { major: 1, minor: 106 };

/** "1.106.0", "1.107.0-insider" ... -> [major, minor]; null when it does not look like a version. */
export function parseVersion(v: string): [number, number] | null {
  const m = /^(\d+)\.(\d+)/.exec(v.trim());
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

export function supportsSecondarySidebar(version: string): boolean {
  const p = parseVersion(version);
  if (!p) return true; // unknown (a fork with its own numbering): assume a current one
  return p[0] > SECONDARY_SIDEBAR_MIN.major || (p[0] === SECONDARY_SIDEBAR_MIN.major && p[1] >= SECONDARY_SIDEBAR_MIN.minor);
}
