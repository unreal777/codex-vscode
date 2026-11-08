// Candidate paths / URIs inside the data of a VS Code tree drop (no vscode imports, unit tested).

/** A URI as a string from what VS Code serialises: a string, or UriComponents ({scheme, path, fsPath, external}). */
export function uriOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  if (typeof o.external === 'string') return o.external;
  if (typeof o.fsPath === 'string' && o.fsPath) return o.fsPath;
  if (o.scheme === 'file' && typeof o.path === 'string') return 'file://' + (o.path[0] === '/' ? '' : '/') + o.path;
  return typeof o.path === 'string' ? o.path : '';
}

const lines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
function jsonList(text: string): unknown[] {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [v];
  } catch { return []; }
}

/** Path / URI strings found in the values of a drop (keys: lower-cased mime types). text/plain only counts when nothing else was found. */
export function candidatesOf(values: Map<string, string>): string[] {
  const get = (k: string) => values.get(k) ?? '';
  const out = [
    ...lines(get('application/vnd.code.uri-list')), ...lines(get('text/uri-list')),
    ...jsonList(get('resourceurls')).map(uriOf),
    ...jsonList(get('codeeditors')).map((e) => uriOf(e && typeof e === 'object' && 'resource' in e ? (e as { resource: unknown }).resource : e)),
  ];
  if (out.length === 0) out.push(...lines(get('text/plain')));
  return [...new Set(out.filter((s) => s !== ''))];
}
