// HTML in answers (0.12.0): the allowlist sanitizer web/htmlsafe.js (the copy that ships in media/web), how marked hands HTML to it,
// and the static preview document of an html code block.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PREVIEW_CSP, MAX_PREVIEW, previewDocument } from '../core/htmlPreview';
import { WEB_SCRIPTS } from '../core/webScripts';

const root = path.resolve(__dirname, '..', '..');
type Safe = { holdBack(text: string): string; create(): object; token(st: object, raw: string): string; finish(st: object): string; sanitize(raw: string): string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Html = require(path.join(root, 'media', 'web', 'htmlsafe.js')) as Safe;
const clean = (s: string) => Html.sanitize(s);

// what must never come out, whatever went in
const FORBIDDEN_TAG = /<\s*\/?\s*(a|img|svg|math|form|input|button|iframe|object|embed|style|script|link|meta|base|textarea|select|video|audio|source|template|noscript|frame|frameset|applet|portal)\b/i;
const FORBIDDEN_ATTR = /<[^>]*\s(style|class|id|href|src|srcdoc|action|formaction|xlink:href|data|on\w+)\s*=/i;
function assertSafe(out: string, input: string): void {
  assert.ok(!FORBIDDEN_TAG.test(out), 'tag leaked: ' + input + ' -> ' + out);
  assert.ok(!FORBIDDEN_ATTR.test(out), 'attribute leaked: ' + input + ' -> ' + out);
}

test('html: the allowed tags pass, attributes only colspan / rowspan / span / align / open', () => {
  assert.equal(clean('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>'),
    '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>', 'a whole table on one line');
  assert.equal(clean('<td colspan="2" rowspan=3 align=Center onclick="x()" style="color:red" class="a" id="b">x</td>'), '<td colspan="2" rowspan="3" align="center">x</td>');
  assert.equal(clean('<td colspan="2junk" rowspan="0" align="evil">x</td>'), '<td>x</td>', 'numbers and the align words only');
  assert.equal(clean('<p align="left" colspan="2">x</p>'), '<p align="left">x</p>', 'colspan only on cells');
  assert.equal(clean('<details open><summary>s</summary>t</details>'), '<details open><summary>s</summary>t</details>');
  assert.equal(clean('<col span="2"><b>x</b> <i>y</i><br/><hr>'), '<col span="2"><b>x</b> <i>y</i><br><hr>');
  assert.equal(clean('<h1>T</h1><blockquote>q</blockquote><pre>a  b</pre><span>s</span><div>d</div><sup>2</sup><kbd>K</kbd>'),
    '<h1>T</h1><blockquote>q</blockquote><pre>a  b</pre><span>s</span><div>d</div><sup>2</sup><kbd>K</kbd>');
  assert.equal(clean('<TABLE><TR><TD>x</TD></TR></TABLE>'), '<table><tr><td>x</td></tr></table>', 'case does not matter');
});

test('html: text is escaped, entities are decoded once, comments disappear', () => {
  assert.equal(clean('a &amp; b &lt;i&gt; &copy; &#65;&#x42; &nosuch; 1 < 2 > 0'), 'a &amp; b &lt;i&gt; \u00a9 AB &amp;nosuch; 1 &lt; 2 &gt; 0');
  assert.equal(clean('<p>x</p><!-- <script>alert(1)</script> -->y'), '<p>x</p>y');
  assert.equal(clean('<!DOCTYPE html><?xml version="1"?>ok'), 'ok');
  assert.equal(clean('&#0;&#xD800;&#1114112;'), '\ufffd\ufffd\ufffd');
});

test('html: hostile input loses its tags, keeps its text, never gains an attribute', () => {
  const hostile = [
    '<img src=x onerror=alert(1)>',
    '<img/src="x"onerror="alert(1)">',
    '<a href="javascript:alert(1)">click</a>',
    '<A HREF=javascript:alert(1)>click</A>',
    '<a href="data:text/html,x" onclick="y">z</a>',
    '<style>body{display:none}</style>',
    '<svg><script>alert(1)</script></svg>',
    '<svg onload=alert(1)><circle/></svg>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '<form action="https://evil.example"><input name=pw><button>Allow</button></form>',
    '<button class="copy" onclick="x">Allow</button>',
    '<iframe src="https://evil.example"></iframe>',
    '<object data="x"></object><embed src="x">',
    '<link rel=stylesheet href=x><meta http-equiv=refresh content="0;url=x"><base href=x>',
    '<script>alert(1)</script>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<div style="position:fixed;inset:0" class="approval" id="allow">Click Allow</div>',
    '<td onclick="x" style="x" class="y" id="z" colspan="2" data-url="https://evil.example">x</td>',
    '<span class="path" data-path="C:\\x">f</span><code class="path" data-path="x">y</code>',
    '<details ontoggle=alert(1) open>x</details>',
    '<b onmouseover="alert(1)"">x</b>',
    '<b\nonmouseover\n=\nalert(1)>x</b>',
    '<table background="javascript:x"><td background=x>y</td></table>',
    '<input type="image" src=x onerror=y>',
  ];
  for (const h of hostile) assertSafe(clean(h), h);
  assert.equal(clean('<a href="javascript:alert(1)">click</a>'), 'click', 'the link text stays, the link goes');
  assert.equal(clean('<img src=x onerror=alert(1)>'), '', 'an image has no text');
  assert.equal(clean('<svg><script>alert(1)</script></svg>'), 'alert(1)', 'text of a dropped tag is shown (escaped), not run');
  assert.equal(clean('<scr<script>ipt>alert(1)'), 'ipt&gt;alert(1)', 'a split tag name does not reassemble');
  assert.equal(clean('<b onmouseover="alert(1)"">x</b>'), '<b>x</b>', 'a stray quote ends nothing early');
});

test('html: structure survives bad input (unclosed, stray closers, nested tables, implied ends, depth)', () => {
  assert.equal(clean('<table><tr><td>a'), '<table><tr><td>a</td></tr></table>', 'unclosed tags are closed at the end');
  assert.equal(clean('a</b></p>b'), 'ab', 'a stray closing tag is dropped');
  assert.equal(clean('<b>x</i>y</b>'), '<b>xy</b>');
  assert.equal(clean('<table><tr><td><table><tr><td>in</td></tr></table></td></tr></table>'),
    '<table><tr><td><table><tr><td>in</td></tr></table></td></tr></table>', 'nested tables');
  assert.equal(clean('<ul><li>a<li>b</ul>'), '<ul><li>a</li><li>b</li></ul>', 'an <li> ends the previous one');
  assert.equal(clean('<table><tr><td>a<td>b<tr><td>c</table>'), '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>');
  assert.equal(clean('<b><i>x</b>y'), '<b><i>x</i></b>y', 'a closer ends what is open inside it');
  const deep = clean('<div>'.repeat(500) + 'x');
  assert.ok((deep.match(/<div>/g) || []).length <= 40 && (deep.match(/<\/div>/g) || []).length === (deep.match(/<div>/g) || []).length, 'depth is capped and balanced');
  // the dangling start of a tag (streaming) shows nothing, the finished tag then appears
  assert.equal(clean('x<tab'), 'x');
  assert.equal(clean('<table><tr><td colspan="'), '<table><tr></tr></table>');
  assert.equal(clean('<table><tr><td colspan="2'), '<table><tr></tr></table>');
  assert.equal(clean('<table><tr><td colspan="2">'), '<table><tr><td colspan="2"></td></tr></table>');
});

test('html: one render across several tokens keeps the tags balanced (state shared, closers at the end)', () => {
  const st = Html.create();
  const out = Html.token(st, '<b>') + 'text' + Html.token(st, '</b>') + Html.token(st, '<table>') + Html.token(st, '<tr><td>x') + Html.finish(st);
  assert.equal(out, '<b>text</b><table><tr><td>x</td></tr></table>');
});

// ---- through marked, wired like web/app.js (r.html) ----

type Marked = { Renderer: new () => { html: (h: unknown) => string }; Marked: new (o?: object) => { use(o: object): void; parse(s: string): string } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const markedLib = require(path.join(root, 'media', 'web', 'vendor', 'marked.min.js')) as Marked;
function md(text: string, streaming = false): string {
  if (streaming) text = Html.holdBack(text);
  const st = Html.create();
  const r = new markedLib.Renderer();
  r.html = (h: unknown) => Html.token(st, typeof h === 'string' ? h : ((h as { text?: string }).text ?? ''));
  const m = new markedLib.Marked({ gfm: true, breaks: false });
  m.use({ renderer: r });
  return m.parse(text) + Html.finish(st);
}

test('html through marked: a table on one line, split by blank lines, inline tags, mixed with markdown', () => {
  assert.equal(md('<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apple</td><td>3</td></tr></table>').trim(),
    '<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apple</td><td>3</td></tr></table>');
  assert.match(md('Intro\n\n<table>\n<tr><th>A</th></tr>\n\n<tr><td>1</td></tr>\n</table>\n\nOutro'), /<p>Intro<\/p>\s*<table>[\s\S]*<th>A<\/th>[\s\S]*<td>1<\/td>[\s\S]*<\/table>\s*<p>Outro<\/p>/);
  assert.equal(md('x <b>bold</b> and **md** and <kbd>Ctrl</kbd>').trim(), '<p>x <b>bold</b> and <strong>md</strong> and <kbd>Ctrl</kbd></p>');
  assert.match(md('- item <i>one</i>\n- item `<b>code</b>`'), /<li>item <i>one<\/i><\/li>\s*<li>item <code>&lt;b&gt;<\/code>?|<code>&lt;b&gt;code&lt;\/b&gt;<\/code>/);
  assert.match(md('```html\n<b>x</b>\n```'), /&lt;b&gt;x&lt;\/b&gt;/, 'a code block still shows its html as text');
  assert.equal(md('a<br>b').trim(), '<p>a<br>b</p>');
  assert.equal(md('<br>').trim(), '<br>');
  // an unclosed inline tag cannot leak past the end of the answer
  assert.match(md('x <b>bold'), /^<p>x <b>bold<\/p>\s*<\/b>$/);
});

test('html through marked: hostile answers', () => {
  const inputs = [
    '<img src=x onerror=alert(1)> text',
    'see <a href="javascript:alert(1)">this</a>',
    '<script>alert(1)</script>\n\nafter',
    '<div style="position:fixed">fake</div><button onclick=x>Allow</button>',
    '<svg><script>alert(1)</script></svg>',
    '<table><tr><td onclick=x>a</td></tr></table><iframe src=x></iframe>',
    'text <a href=x>y</a> and <input value=z> <meta charset=x>',
  ];
  for (const t of inputs) {
    const out = md(t).replace(/<a class="filelink"[^>]*>|<\/a>/g, '');   // marked's own links are not under test here
    assertSafe(out.replace(/<a href="[^"]*" data-url="[^"]*">/g, ''), t);
  }
});

test('html: the page loads the sanitizer before app.js, in the web page, the dev page and the panel script list', () => {
  const idx = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  const dev = fs.readFileSync(path.join(root, 'web', 'dev.html'), 'utf8');
  for (const html of [idx, dev]) assert.ok(html.indexOf('htmlsafe.js') > 0 && html.indexOf('htmlsafe.js') < html.indexOf('app.js'));
  assert.ok(WEB_SCRIPTS.indexOf('htmlsafe.js') >= 0 && WEB_SCRIPTS.indexOf('htmlsafe.js') < WEB_SCRIPTS.indexOf('app.js'));
  assert.ok(fs.existsSync(path.join(root, 'media', 'web', 'htmlsafe.js')), 'sync-web ships it');
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes('CodexHtml.token(htmlState'), 'marked hands its html tokens to the sanitizer');
  assert.ok(!/r\.html = \(html\) => esc\(/.test(app), 'no more pass-through of raw html as text only');
});

test('html preview: a static document, no scripts anywhere, the CSP first', () => {
  assert.equal(PREVIEW_CSP, "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'");
  assert.ok(!/script-src|unsafe-eval/.test(PREVIEW_CSP), 'scripts stay forbidden by default-src');
  const doc = previewDocument('<h1>Hi</h1><script>alert(1)</script>');
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<h1>Hi</h1>'), 'the CSP comes before the block');
  assert.ok(doc.includes('<h1>Hi</h1>'));
  assert.equal(previewDocument('x'.repeat(MAX_PREVIEW + 100)).includes('x'.repeat(MAX_PREVIEW + 1)), false, 'a huge block is cut');
  const src = fs.readFileSync(path.join(root, 'src', 'htmlPreview.ts'), 'utf8');
  assert.ok(src.includes('enableScripts: false') && src.includes('enableCommandUris: false') && src.includes('localResourceRoots: []'));
  const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  assert.ok(app.includes("host === 'vscode' && (lang === 'html'"), 'the button is offered for html blocks in VS Code only');
});

test('html through marked: every prefix of a streaming answer renders safely, a half-written tag never shows', () => {
  const full = 'Here:\n\n<table><tr><th>Name</th></tr><tr><td colspan="2" align="center">Total: <b>3</b></td></tr></table>\n\nMixed **md** <kbd>Ctrl</kbd> a<br>b <img src=x onerror=y> <a href="javascript:z">l</a> end.';
  for (let n = 0; n <= full.length; n++) {
    const part = full.slice(0, n);
    const out = md(part, true);
    assertSafe(out, part);
    assert.ok(!/&lt;\/?(table|tr|td|th|kbd|b|br|img|a)\b/i.test(out), 'half tag shown at ' + n + ': ' + out);
  }
  // the unfinished tag is simply absent until it is complete
  assert.equal(Html.holdBack('x <kb'), 'x ');
  assert.equal(Html.holdBack('x <td colspan="2'), 'x ');
  assert.equal(Html.holdBack('x <td colspan="2">'), 'x <td colspan="2">');
  assert.equal(Html.holdBack('x <img src='), 'x ', 'also the start of a tag that is dropped later');
  assert.equal(Html.holdBack('if a <Foo then it goes on'), 'if a <Foo then it goes on', 'prose after a "<Foo" stays');
  assert.equal(Html.holdBack('a < b'), 'a < b');
});
