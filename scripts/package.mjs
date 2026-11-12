// vsce package without prompts; output dist/codex-panel-<version>.vsix
// VS Code's extension page shows README images only from https: URLs (relative paths and data: URIs are dropped), so the
// relative links of README.md point to the GitHub repository in the vsix: the GIFs of media/readme load from there once
// they are pushed (they are not in the vsix).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const REPO = 'unreal777/codex-vscode', BRANCH = 'main';
mkdirSync('dist', { recursive: true });
const r = spawnSync('npx', ['vsce', 'package', '--no-dependencies', '--skip-license',
  '--baseImagesUrl', `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`, '--baseContentUrl', `https://github.com/${REPO}/blob/${BRANCH}/`,
  '--out', `dist/codex-panel-${version}.vsix`],
  { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
