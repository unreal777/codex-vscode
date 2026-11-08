// The page's scripts in load order, relative to media/web. Must equal the <script src> list of web/index.html (a unit test checks it);
// the panel adds media/vscode-bridge.js in front of them.
export const WEB_SCRIPTS = ['vendor/marked.min.js', 'vendor/highlight.min.js', 'filelinks.js', 'dropdata.js', 'app.js'];
