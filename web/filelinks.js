/* File links in Codex answers: parsing of link targets and a conservative linker for plain-text paths.
 *   CodexLinks.parse(href)      -> {path, line, column, endLine, endColumn} or null (not a file reference)
 *   CodexLinks.anchor(ref, html, cwd) -> '<a class="filelink" ...>html</a>'
 *   CodexLinks.linkify(rootEl, cwd)   -> wraps paths found in prose text nodes (never in code, pre, links)
 * The Java side (core/FileLinks.java) understands the same forms; keep the two in sync.
 */
(function (root) {
  'use strict';

  const EXT = 'java|js|mjs|cjs|ts|tsx|jsx|py|xml|json|jsonc|md|yml|yaml|properties|gradle|kts|html|htm|xhtml|jsp|css|scss|sql|cs|go|rs|kt|c|cc|cpp|h|hpp|txt|sh|bat|cmd|ps1|toml|ini|cfg|conf|csv|php|rb|swift|scala|groovy|vue|proto|log|xsd|wsdl|ftl|svg';
  const LINE = String.raw`(?::\d+(?::\d+)?(?:-\d+(?::\d+)?)?|#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)?`;
  // A: has a directory part (optionally with drive or leading slash); B: bare file name, only with :line
  const A = String.raw`\/?(?:[A-Za-z]:[\\/])?(?:[\w.@~+-]+[\\/])+[\w.@+-]+\.(?:${EXT})\b` + LINE;
  const B = String.raw`[\w.@+-]+\.(?:${EXT}):\d+(?::\d+)?(?:-\d+(?::\d+)?)?`;
  const PROSE = new RegExp(String.raw`(?<![\w@.\-/\\:~%#=])(?:${A}|${B})(?![\w/\\])`, 'gi');
  const DOMAIN = /^[\w-]+\.(?:com|org|net|io|dev|ru|app|co|ai|de|uk|eu|info)$/i;
  const SKIP = new Set(['A', 'CODE', 'PRE', 'BUTTON', 'SCRIPT', 'STYLE', 'TEXTAREA']);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (v == null || v === '' ? undefined : parseInt(v, 10));

  function parse(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s || s[0] === '#') return null;
    const scheme = s.match(/^([a-z][a-z0-9+.-]*):(?!\d)/i); // "Foo.java:42" is a path with a line, not a scheme
    const isFileUri = /^file:/i.test(s);
    if (scheme && scheme[1].length > 1 && !isFileUri) return null; // http:, mailto:, javascript: ... are not files
    let line, column, endLine, endColumn;
    const frag = s.match(/#L(\d+)(?:C(\d+))?(?:-L?(\d+)(?:C(\d+))?)?$/i);
    if (frag) {
      s = s.slice(0, frag.index);
      [line, column, endLine, endColumn] = [num(frag[1]), num(frag[2]), num(frag[3]), num(frag[4])];
    } else {
      const q = s.match(/:(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
      if (q && q.index > 1) { // index 1 would be a drive letter followed by digits
        s = s.slice(0, q.index);
        [line, column, endLine, endColumn] = [num(q[1]), num(q[2]), num(q[3]), num(q[4])];
      }
    }
    if (isFileUri) {
      s = s.replace(/^file:/i, '');
      if (/^\/\/\/?[A-Za-z]:/.test(s)) s = s.replace(/^\/+/, '');                  // file:///C:/x
      else if (/^\/\/\//.test(s)) s = s.slice(2);                                    // file:///home/x
      else if (/^\/\/[^/]/.test(s)) s = '\\\\' + s.slice(2).replace(/\//g, '\\');   // file://server/share/x
    }
    if (/%[0-9a-f]{2}/i.test(s)) { try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ } }
    s = s.replace(/^\/([A-Za-z]:[\\/])/, '$1'); // "/C:/x/Foo.java" as written by VS Code style links
    if (!s) return null;
    const ref = { path: s };
    if (line) ref.line = line;
    if (column) ref.column = column;
    if (endLine) ref.endLine = endLine;
    if (endColumn) ref.endColumn = endColumn;
    return ref;
  }

  /** Path as it will be looked up (relative paths are shown below the chat's cwd), with :line for the tooltip. */
  function display(ref, cwd) {
    let p = ref.path;
    if (cwd && !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(p)) p = cwd.replace(/[\\/]+$/, '') + '\\' + p.replace(/\//g, '\\');
    return p + (ref.line ? ':' + ref.line + (ref.column ? ':' + ref.column : '') + (ref.endLine ? '-' + ref.endLine : '') : '');
  }

  function anchor(ref, innerHtml, cwd) {
    return '<a class="filelink" href="#" data-path="' + esc(ref.path) + '"' +
      (ref.line ? ' data-line="' + ref.line + '"' : '') + (ref.column ? ' data-col="' + ref.column + '"' : '') +
      (ref.endLine ? ' data-end="' + ref.endLine + '"' : '') + ' title="' + esc(display(ref, cwd)) + '">' + innerHtml + '</a>';
  }

  /** Message for the bridge when a .filelink is clicked. */
  function message(a) {
    const m = { type: 'openFile', path: a.getAttribute('data-path') };
    [['data-line', 'line'], ['data-col', 'column'], ['data-end', 'endLine']].forEach(([attr, key]) => {
      const v = a.getAttribute(attr);
      if (v) m[key] = parseInt(v, 10);
    });
    return m;
  }

  function linkify(rootEl, cwd) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        for (let p = n.parentNode; p && p !== rootEl; p = p.parentNode) {
          if (SKIP.has(p.nodeName) || (p.classList && p.classList.contains('codeblock'))) return NodeFilter.FILTER_REJECT;
        }
        return n.nodeValue.length > 4 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const text = node.nodeValue;
      PROSE.lastIndex = 0;
      let last = 0, m, frag = null;
      while ((m = PROSE.exec(text))) {
        const ref = parse(m[0]);
        const first = m[0].split(/[\\/]/)[0];
        if (!ref || (/[\\/]/.test(m[0]) && DOMAIN.test(first))) continue; // github.com/x/y.java is a web address
        if (!frag) frag = document.createDocumentFragment();
        if (m.index > last) frag.append(text.slice(last, m.index));
        const holder = document.createElement('span');
        holder.innerHTML = anchor(ref, esc(m[0]), cwd);
        frag.append(holder.firstChild);
        last = m.index + m[0].length;
      }
      if (frag) {
        if (last < text.length) frag.append(text.slice(last));
        node.replaceWith(frag);
      }
    });
  }

  root.CodexLinks = { parse, anchor, linkify, message, display };
})(window);
