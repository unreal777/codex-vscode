// "Your browser" in the MCP settings (0.15.0): let Codex use the browser the user already has open (tabs, sign-ins), through one of two
// official MCP servers. No VS Code imports (unit tested).
//   chrome:     Chrome DevTools MCP with --autoConnect: attaches to the running Chrome (144+) after "remote debugging" is switched on at
//               chrome://inspect/#remote-debugging; Chrome asks before every connection.
//               https://developer.chrome.com/docs/devtools/agents/use-cases/auto-connect
//   playwright: Playwright MCP with --extension: the "Playwright MCP Bridge" extension in Chrome or Edge hands over the tabs you pick.
//               https://playwright.dev/mcp/configuration/browser-extension
import { Json } from './mcpServers';

export type BrowserKind = 'chrome' | 'playwright';

export interface BrowserPreset {
  kind: BrowserKind;
  /** name of the server in config.toml when Codexter adds it */
  name: string;
  /** npm package that identifies the server in any config (also one the user wrote) */
  pkg: string;
  /** the argument that makes it use the open browser */
  flag: string;
  command: string;
  args: string[];
  /** where the one-time browser side of the setup happens */
  setupUrl: string;
}

export const BROWSER_PRESETS: Record<BrowserKind, BrowserPreset> = {
  chrome: {
    kind: 'chrome', name: 'chrome-devtools', pkg: 'chrome-devtools-mcp', flag: '--autoConnect',
    command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest', '--autoConnect'],
    setupUrl: 'chrome://inspect/#remote-debugging',
  },
  playwright: {
    kind: 'playwright', name: 'playwright', pkg: '@playwright/mcp', flag: '--extension',
    command: 'npx', args: ['-y', '@playwright/mcp@latest', '--extension'],
    setupUrl: 'https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm',
  },
};

/** missing: no such server; plain: the server is there but starts its own browser; ready: it uses the open one. */
export interface BrowserState { kind: BrowserKind; state: 'missing' | 'plain' | 'ready'; name: string; enabled: boolean }

const argsOf = (v: Json): string[] => (Array.isArray(v?.args) ? v.args.filter((a: unknown) => typeof a === 'string') : []);
// "chrome-devtools-mcp", "chrome-devtools-mcp@latest", "chrome-devtools-mcp@0.12.1", a path ending in the package
const usesPkg = (v: Json, pkg: string): boolean => [typeof v?.command === 'string' ? v.command : '', ...argsOf(v)]
  .some((a) => { const s = a.replace(/\\/g, '/').toLowerCase(); return s === pkg || s.startsWith(pkg + '@') || s.endsWith('/' + pkg) || s.includes('/' + pkg + '/'); });

/** For each kind: is a server of that package in the Codex config (mcp_servers), and does it use the open browser. */
export function browserStates(servers: Json | null | undefined): BrowserState[] {
  const all = servers && typeof servers === 'object' ? servers : {};
  return (Object.keys(BROWSER_PRESETS) as BrowserKind[]).map((kind) => {
    const p = BROWSER_PRESETS[kind];
    const names = Object.keys(all).filter((n) => usesPkg(all[n], p.pkg));
    const ready = names.find((n) => argsOf(all[n]).includes(p.flag));
    const name = ready ?? names[0];
    if (!name) return { kind, state: 'missing' as const, name: p.name, enabled: false };
    return { kind, state: ready ? 'ready' as const : 'plain' as const, name, enabled: all[name]?.enabled !== false };
  });
}

/** The args of an existing server with the flag added (after the package, before nothing else is needed: the servers take it anywhere). */
export function argsWithFlag(value: Json, kind: BrowserKind): string[] {
  const a = argsOf(value);
  const flag = BROWSER_PRESETS[kind].flag;
  return a.includes(flag) ? a : [...a, flag];
}
