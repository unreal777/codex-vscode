// vsce package without prompts; output dist/codex-panel-<version>.vsix
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
mkdirSync('dist', { recursive: true });
const r = spawnSync('npx', ['vsce', 'package', '--no-dependencies', '--allow-missing-repository', '--skip-license', '--out', `dist/codex-panel-${version}.vsix`],
  { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
