// Installed plugins for the "+" menu, from a plugin/installed response (PluginInstalledResponse: marketplaces[].plugins[] = PluginSummary).
// Port of core/Plugins.java. The mention path of a plugin is "plugin://" + PluginSummary.id (what the official Codex extension sends).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Json } from './jsonrpc';

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  brandColor: string | null;
  icon: string | null;
  marketplace: string;
}

const ICON_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const MAX_ICON_BYTES = 150 * 1024;
export const MAX_PLUGINS = 100;

/** A local icon file as a data URI (the page can not read local files); null when missing, too big or not an image. */
export function iconDataUri(file: unknown): string | null {
  if (typeof file !== 'string' || !file) return null;
  const mime = ICON_MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_ICON_BYTES) return null;
    return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
  } catch {
    return null;
  }
}

const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Installed AND enabled plugins, each id once, in the order Codex lists them. */
export function mapPlugins(response: Json, readIcon: (file: unknown) => string | null = iconDataUri): PluginItem[] {
  const out: PluginItem[] = [];
  const seen = new Set<string>();
  const markets: Json[] = Array.isArray(response?.marketplaces) ? response.marketplaces : [];
  for (const m of markets) {
    const plugins: Json[] = Array.isArray(m?.plugins) ? m.plugins : [];
    for (const p of plugins) {
      if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
      if (p.installed === false || p.enabled === false) continue;
      seen.add(p.id);
      const ui = p.interface && typeof p.interface === 'object' ? p.interface : {};
      const name = (typeof ui.displayName === 'string' && ui.displayName.trim()) || (typeof p.name === 'string' && p.name) || p.id;
      out.push({
        id: p.id,
        name,
        description: typeof ui.shortDescription === 'string' ? ui.shortDescription : '',
        brandColor: typeof ui.brandColor === 'string' && COLOR.test(ui.brandColor) ? ui.brandColor : null,
        icon: readIcon(ui.composerIcon) ?? readIcon(ui.logo),
        marketplace: typeof m.name === 'string' ? m.name : '',
      });
      if (out.length >= MAX_PLUGINS) return out;
    }
  }
  return out;
}
