/* Reads what a drag and drop carries when the IDE is VS Code (the page gets the drop itself there).
 * VS Code fills the dataTransfer of Explorer items and editor tabs with several formats; which of them reach a webview depends on the
 * VS Code version and on the drag source, so every known one is read:
 *   CodeEditors                    JSON array of editors: [{resource: "file:///c%3A/x/a.ts" | {scheme, path, fsPath, external}, ...}]
 *   application/vnd.code.uri-list  URIs, one per line (VS Code's internal list)
 *   text/uri-list                  URIs, one per line, "#" lines are comments
 *   ResourceURLs                   JSON array of URI strings
 *   CodeFiles                      JSON array of file paths
 * Browsers lower-case custom format names, so names are compared case-insensitively.
 * Pure functions on a DataTransfer-like object {types, getData(type), files}; also loaded by the Node tests (module.exports).
 */
(function (root) {
  'use strict';

  // only things that can be files: a file: URI, a drive path, a UNC path or an absolute POSIX path
  const FILEISH = /^(?:file:|[A-Za-z]:[\\/]|\\\\|\/)/;

  function lines(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#');
  }

  function uriOf(v) {
    if (typeof v === 'string') return v;
    if (!v || typeof v !== 'object') return '';
    if (typeof v.external === 'string') return v.external;                 // UriComponents as VS Code serialises them
    if (typeof v.fsPath === 'string' && v.fsPath) return v.fsPath;
    if (v.scheme === 'file' && typeof v.path === 'string') return 'file://' + (v.path[0] === '/' ? '' : '/') + v.path;
    return typeof v.path === 'string' ? v.path : '';
  }

  function jsonList(text) {
    try {
      const v = JSON.parse(text || '[]');
      return Array.isArray(v) ? v : [v];
    } catch (e) { return []; }
  }

  function typeMap(dt) {
    const m = new Map();
    Array.from((dt && dt.types) || []).forEach((t) => m.set(String(t).toLowerCase(), t));
    return m;
  }

  function read(dt, name) {
    const real = typeMap(dt).get(name.toLowerCase());
    if (real === undefined) return '';
    try { return dt.getData(real) || ''; } catch (e) { return ''; }
  }

  /** @returns {{text: string, lines: string[], from: string[]}} the file URIs / paths found, one per line in text, and the formats they came from */
  function parse(dt) {
    const found = [], from = [];
    const take = (name, list) => {
      const ok = list.filter((l) => FILEISH.test(l));
      if (ok.length) { found.push(...ok); from.push(name); }
    };
    take('CodeEditors', jsonList(read(dt, 'CodeEditors')).map((e) => uriOf(e && typeof e === 'object' && 'resource' in e ? e.resource : e)));
    take('application/vnd.code.uri-list', lines(read(dt, 'application/vnd.code.uri-list')));
    take('text/uri-list', lines(read(dt, 'text/uri-list')));
    take('ResourceURLs', jsonList(read(dt, 'ResourceURLs')).map(uriOf));
    take('CodeFiles', jsonList(read(dt, 'CodeFiles')).map(uriOf));
    const uniq = Array.from(new Set(found));
    return { text: uniq.join('\n'), lines: uniq, from };
  }

  /** What arrived, for the host's log: every format with its first 300 characters, plus the File objects. */
  function debug(dt) {
    const types = Array.from((dt && dt.types) || []).map(String);
    const data = {};
    types.forEach((t) => {
      if (t.toLowerCase() === 'files') return;
      let v = '';
      try { v = dt.getData(t) || ''; } catch (e) { v = '(unreadable)'; }
      data[t] = String(v).slice(0, 300);
    });
    const files = Array.from((dt && dt.files) || []).slice(0, 20).map((f) => ({ name: f.name, type: f.type, size: f.size }));
    return { types, data, files };
  }

  const api = { parse, debug, FILEISH };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CodexDrop = api;
})(typeof window !== 'undefined' ? window : globalThis);
