// MCP elicitations: Codex asks the client through the server request `mcpServer/elicitation/request`
// (codex app-server 0.167.2, McpServerElicitationRequestParams / ...Response in its JSON schema).
// Codex uses it for its own approval of an MCP tool call (`_meta.codex_approval_kind: "mcp_tool_call"`, an empty form);
// an MCP server may also ask through it (a form, or a URL to open).
// Request params: { threadId, turnId?, serverName, mode: form | openai/form | openaiForm | url, message, requestedSchema?, url?, _meta? }
// Response: { action: accept | decline | cancel, content?, _meta? }; Codex reads `_meta.persist` ("session" | "always")
// of an accepted tool approval to remember it.
import { Json } from './jsonrpc';

export const ELICITATION_METHOD = 'mcpServer/elicitation/request';

/** The ways of remembering an accepted tool call that Codex offers (`_meta.persist`: a string or a list). */
export function persistOptions(params: Json): string[] {
  const p = params?._meta?.persist;
  const list = Array.isArray(p) ? p : typeof p === 'string' ? [p] : [];
  return list.filter((x: unknown): x is string => typeof x === 'string');
}

/**
 * Form content for an accepted elicitation: the defaults the requested schema gives.
 * Codex's tool approval has no fields, so this is {} there. A form with required fields
 * without a default is not filled in (the panel has no form for those yet).
 */
export function formDefaults(params: Json): Json {
  const props = params?.requestedSchema?.properties;
  const out: Json = {};
  if (props && typeof props === 'object') {
    for (const [k, v] of Object.entries(props as Record<string, Json>)) {
      if (v && typeof v === 'object' && v.default !== undefined) out[k] = v.default;
    }
  }
  return out;
}

/** @param decision accept | acceptForSession | decline | cancel (the panel's approval decisions) */
export function elicitationResponse(params: Json, decision: string): Json {
  if (decision === 'decline' || decision === 'cancel') return { action: decision, content: null };
  const mode = params?.mode;
  const res: Json = { action: 'accept', content: mode === 'url' ? null : formDefaults(params) };
  if (decision === 'acceptForSession' && persistOptions(params).includes('session')) res._meta = { persist: 'session' };
  return res;
}
