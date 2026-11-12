// How Codex answers and how much context a chat keeps (0.8.0).
// Instructions: either Codex's own (`developer_instructions` of ~/.codex/config.toml, shared with the Codex CLI and the Eclipse
// plugin; AGENTS.md files always apply too), or instructions of Codexter only, sent as `developerInstructions` when a chat starts.
// Context: `model_auto_compact_token_limit` per chat (thread/start and thread/resume `config`), and "Compact" (thread/compact/start).
import * as os from 'node:os';
import * as path from 'node:path';
import { Json } from './jsonrpc';

export type InstructionsSource = 'codex' | 'codexter';

export interface ContextSettings {
  instructionsSource: InstructionsSource;
  instructions: string;
  /** 0 = Codex's own limit (about 90 % of the model's window) */
  autoCompactTokens: number;
}

/** Choices of the auto-compact limit in tokens (0 = Codex default). */
export const AUTO_COMPACT_CHOICES = [0, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000];

export function sanitizeContextSettings(o: Json | null | undefined): ContextSettings {
  const n = typeof o?.autoCompactTokens === 'number' && Number.isFinite(o.autoCompactTokens) ? Math.round(o.autoCompactTokens) : 0;
  return {
    instructionsSource: o?.instructionsSource === 'codexter' ? 'codexter' : 'codex',
    instructions: typeof o?.instructions === 'string' ? o.instructions.trim() : '',
    autoCompactTokens: n >= 10_000 && n <= 10_000_000 ? n : 0,
  };
}

/** Extra params of thread/start (forResume false) or thread/resume (forResume true). Instructions are only given to a new chat. */
export function threadExtras(s: ContextSettings, forResume: boolean): Json {
  const p: Json = {};
  if (!forResume && s.instructionsSource === 'codexter' && s.instructions) p.developerInstructions = s.instructions;
  if (s.autoCompactTokens > 0) p.config = { model_auto_compact_token_limit: s.autoCompactTokens };
  return p;
}

/** Codex's own instructions: `developer_instructions` of the effective config (config/read), '' when there are none. */
export function codexInstructionsOf(readResult: Json | null | undefined): string {
  const v = readResult?.config?.developer_instructions;
  return typeof v === 'string' ? v : '';
}

/** The global AGENTS.md of Codex: $CODEX_HOME/AGENTS.md, else ~/.codex/AGENTS.md. */
export function agentsFile(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CODEX_HOME && env.CODEX_HOME.trim() ? env.CODEX_HOME : path.join(os.homedir(), '.codex');
  return path.join(home, 'AGENTS.md');
}
