/* HTML in Codex answers: a strict allowlist sanitizer on strings (no DOM, so it runs in the page and in the unit tests).
 * Answers may carry text from untrusted pages (prompt injection), and rendered HTML could fake Codexter's own UI (an Allow button,
 * a disguised link). So HTML is never passed through: every tag is rebuilt from this allowlist, everything else loses its tag and keeps
 * its text (escaped).
 *   CodexHtml.create()          -> state for one render (the stack of open tags)
 *   CodexHtml.token(state, raw) -> safe HTML for one html token of marked (a block, or one inline tag such as "<b>" or "</b>")
 *   CodexHtml.finish(state)     -> the closing tags still owed at the end of the render
 *   CodexHtml.sanitize(raw)     -> token + finish in one call
 *   CodexHtml.holdBack(text)    -> the text of a streaming answer without a half-written tag at its end
 * Allowed tags: tables, inline text styles, lists, details/summary, blockquote, headings, pre, span, div, br, hr. Allowed attributes:
 * colspan, rowspan, span (digits), align (left|right|center|justify), open (details). Never a, img, svg, math, form, input, button, iframe,
 * object, embed, style, script, link, meta, base, and never style / class / id / on* / href / src attributes.
 */
(function (root) {
  'use strict';

  const TAGS = new Set(('table thead tbody tfoot tr th td caption colgroup col b strong i em u s del ins mark code kbd samp sub sup br hr p ul ol li dl dt dd ' +
    'details summary blockquote h1 h2 h3 h4 h5 h6 pre span div').split(' '));
  const VOID = new Set(['br', 'hr', 'col']);
  const ALIGN = new Set('td th tr thead tbody tfoot p div h1 h2 h3 h4 h5 h6'.split(' '));
  const ALIGN_VALUES = new Set(['left', 'right', 'center', 'justify']);
  // a tag being opened ends these open tags on top of the stack (the browser would do the same): <li>a<li>b, <td>a<td>b, <tr>...
  const IMPLIED = {
    li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], td: ['td', 'th'], th: ['td', 'th'], tr: ['td', 'th', 'tr'],
    thead: ['td', 'th', 'tr', 'thead', 'tbody', 'tfoot'], tbody: ['td', 'th', 'tr', 'thead', 'tbody', 'tfoot'], tfoot: ['td', 'th', 'tr', 'thead', 'tbody', 'tfoot'],
    p: ['p']
  };
  const MAX_DEPTH = 40;
  // a tag runs to the first ">" outside a pair of quotes (a lone quote is an ordinary character, like in browsers); no ">" yet = still being written.
  // Only the boundary of the tag is decided here: what comes out is rebuilt from the allowlist either way.
  const TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*)(>|$)/y;
  const DECL = /<[!?][^>]*(?:>|$)/y;
  const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—',
    ndash: '–', laquo: '«', raquo: '»', bull: '•', middot: '·', times: '×', divide: '÷', euro: '€', pound: '£',
    yen: '¥', cent: '¢', deg: '°', plusmn: '±', micro: 'µ', para: '¶', sect: '§', larr: '←', rarr: '→',
    uarr: '↑', darr: '↓', harr: '↔', le: '≤', ge: '≥', ne: '≠', infin: '∞', check: '✓'
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // entities of the text -> characters (an unknown name stays as written), so that the escaping afterwards does not show "&amp;lt;"
  function decode(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, g) => {
      if (g[0] === '#') {
        const cp = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
      }
      return Object.prototype.hasOwnProperty.call(NAMED, g.toLowerCase()) ? NAMED[g.toLowerCase()] : m;
    });
  }
  const text = (s) => esc(decode(s));

  function create() { return { stack: [] }; }

  // the attributes of one tag, rebuilt from validated values only
  function attrs(tag, raw) {
    const out = {};
    const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(raw))) {
      const name = m[1].toLowerCase();
      if (Object.prototype.hasOwnProperty.call(out, name)) continue;
      const value = decode(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '').trim();
      if ((name === 'colspan' || name === 'rowspan') && (tag === 'td' || tag === 'th')) { if (/^\d{1,3}$/.test(value) && +value > 0) out[name] = String(+value); }
      else if (name === 'span' && (tag === 'col' || tag === 'colgroup')) { if (/^\d{1,3}$/.test(value) && +value > 0) out[name] = String(+value); }
      else if (name === 'align' && ALIGN.has(tag)) { if (ALIGN_VALUES.has(value.toLowerCase())) out[name] = value.toLowerCase(); }
      else if (name === 'open' && tag === 'details') out[name] = '';
    }
    return Object.keys(out).map((k) => (out[k] === '' ? ' ' + k : ' ' + k + '="' + out[k] + '"')).join('');
  }

  function token(st, src) {
    src = String(src == null ? '' : src);
    let out = '', i = 0;
    const n = src.length;
    while (i < n) {
      const lt = src.indexOf('<', i);
      if (lt < 0) { out += text(src.slice(i)); break; }
      out += text(src.slice(i, lt));
      if (src.startsWith('<!--', lt)) {   // a comment shows nothing in HTML: gone, with what is inside
        const end = src.indexOf('-->', lt + 4);
        i = end < 0 ? n : end + 3;
        continue;
      }
      DECL.lastIndex = lt;
      const decl = DECL.exec(src);   // <!DOCTYPE ...>, <?xml ...?>
      if (decl) { i = lt + decl[0].length; continue; }
      TAG.lastIndex = lt;
      const m = TAG.exec(src);
      if (!m) { out += '&lt;'; i = lt + 1; continue; }   // a lone "<" is text
      i = lt + m[0].length;
      if (m[4] === '') continue;   // a tag still being written (streaming): wait for its end
      const tag = m[2].toLowerCase();
      if (!TAGS.has(tag)) continue;   // not allowed: the tag goes, the text around it stays
      const stack = st.stack;
      if (m[1]) {   // closing tag: only when it matches an open one
        const at = stack.lastIndexOf(tag);
        if (at < 0) continue;
        while (stack.length > at) out += '</' + stack.pop() + '>';
        continue;
      }
      const implied = IMPLIED[tag];
      if (implied) while (stack.length && implied.includes(stack[stack.length - 1])) out += '</' + stack.pop() + '>';
      if (!VOID.has(tag) && stack.length >= MAX_DEPTH) continue;
      out += '<' + tag + attrs(tag, m[3]) + '>';
      if (!VOID.has(tag)) stack.push(tag);
    }
    return out;
  }

  function finish(st) {
    let out = '';
    while (st.stack.length) out += '</' + st.stack.pop() + '>';
    return out;
  }

  // A streaming answer ends mid-tag now and then ("<tab", '<img src=', '<td colspan="'): marked would show that as text for a moment, and then
  // it vanishes. This cuts such an unfinished tag (a tag name alone, or a name with attributes) off the end of the text; the next update
  // has the whole tag, and the finished answer is always rendered whole.
  const DROPPED = new Set('a img svg math form input button iframe object embed style script link meta base textarea select video audio source'.split(' '));
  function holdBack(src) {
    src = String(src == null ? '' : src);
    const m = /<\/?([A-Za-z][A-Za-z0-9-]*)([ \t][^<>\n]*)?$/.exec(src);
    if (!m) return src;
    const name = m[1].toLowerCase();
    return !m[2] || TAGS.has(name) || DROPPED.has(name) ? src.slice(0, m.index) : src;   // "<tab" is cut; "<td colspan=" too; prose like "<Foo bar" stays
  }

  function sanitize(src) { const st = create(); const out = token(st, src); return out + finish(st); }

  const api = { create, token, finish, sanitize, holdBack, decode, esc, TAGS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CodexHtml = api;
})(typeof window !== 'undefined' ? window : globalThis);
