// Copies this extension's web UI source (web/) into media/web/, which is what the extension ships.
// Only app.js, app.css, filelinks.js, dropdata.js and vendor/ - never fixtures or dev files.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'web');
const dst = join(root, 'media', 'web');

if (!existsSync(join(src, 'app.js'))) {
  console.error('sync-web: ' + src + ' not found');
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of ['app.js', 'app.css', 'filelinks.js', 'dropdata.js']) cpSync(join(src, f), join(dst, f));
cpSync(join(src, 'vendor'), join(dst, 'vendor'), { recursive: true });
console.log('sync-web: copied web UI from ' + src);
