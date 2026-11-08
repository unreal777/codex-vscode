// One "permissions" choice replaces the former pair (access mode x approvals reviewer). Port of core/Permissions.java.
//   ask    "Ask for approval": workspace-write, approval policy on-request, the user approves
//   auto   "Approve for me":   workspace-write, on-request, approvalsReviewer auto_review (only unsafe actions are asked)
//   full   "Full access":      danger-full-access, never ask
//   custom "Custom (config.toml)": no sandbox / approval overrides at all, Codex uses config.toml
export type Permissions = 'ask' | 'auto' | 'full' | 'custom';

export const PERMISSIONS: readonly Permissions[] = ['ask', 'auto', 'full', 'custom'];

export interface PermissionSettings {
  /** thread/start + thread/resume `sandbox` (read-only | workspace-write | danger-full-access), null = no override */
  sandbox: string | null;
  /** turn/start `sandboxPolicy.type` (readOnly | workspaceWrite | dangerFullAccess), null = no override */
  sandboxPolicy: string | null;
  /** `approvalPolicy`, null = no override */
  approvalPolicy: string | null;
  /** `approvalsReviewer` (user | auto_review), null = no override */
  reviewer: string | null;
}

export function normalizePermissions(v: string | null | undefined): Permissions {
  return (PERMISSIONS as readonly string[]).includes(v ?? '') ? (v as Permissions) : 'ask';
}

export function permissionSettings(p: string | null | undefined): PermissionSettings {
  switch (normalizePermissions(p)) {
    case 'auto': return { sandbox: 'workspace-write', sandboxPolicy: 'workspaceWrite', approvalPolicy: 'on-request', reviewer: 'auto_review' };
    case 'full': return { sandbox: 'danger-full-access', sandboxPolicy: 'dangerFullAccess', approvalPolicy: 'never', reviewer: 'user' };
    case 'custom': return { sandbox: null, sandboxPolicy: null, approvalPolicy: null, reviewer: null };
    default: return { sandbox: 'workspace-write', sandboxPolicy: 'workspaceWrite', approvalPolicy: 'on-request', reviewer: 'user' };
  }
}

/**
 * Stored preferences before 0.2.0 had two values: mode (read-only | auto | full) and approvals (user | auto_review).
 * full stays full, read-only becomes "Ask for approval" (that mode no longer exists), auto + auto_review becomes "Approve for me",
 * everything else "Ask for approval". A stored `permissions` value wins.
 */
export function migratePermissions(stored: { permissions?: string | null; mode?: string | null; approvals?: string | null }): Permissions {
  if (stored.permissions && (PERMISSIONS as readonly string[]).includes(stored.permissions)) return stored.permissions as Permissions;
  if (stored.mode === 'full') return 'full';
  if (stored.mode === 'auto' && stored.approvals === 'auto_review') return 'auto';
  return 'ask';
}
