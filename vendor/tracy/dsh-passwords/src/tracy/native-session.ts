/** Optional native onboarding allocation, reachable only through the signed seat door. */
import type { WorkspaceRpc } from './seat-home.js';

export interface NativeSessionRequest {
  sessionId: string;
  agentPreset: string;
}

/** Validate before the seat door creates folders or mutates any permissions. */
export function nativeSessionRequest(payload: Record<string, unknown>): NativeSessionRequest | null {
  if (payload.nativeSession === undefined) return null;
  const raw = payload.nativeSession;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_NATIVE_SESSION');
  const value = raw as Record<string, unknown>;
  if (payload.role !== 'editor' || payload.site !== '~onboarding' ||
      typeof payload.email !== 'string' || payload.email.trim() === '' ||
      typeof payload.home !== 'string' || payload.home.trim() === '' ||
      !Array.isArray(payload.folders) || payload.folders.length !== 0 ||
      !Array.isArray(payload.toolsets) || payload.toolsets.length !== 1 || payload.toolsets[0] !== 'content' ||
      Object.keys(value).some(key => key !== 'sessionId' && key !== 'agentPreset') ||
      typeof value.sessionId !== 'string' ||
      !/^session-widget-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.sessionId) ||
      typeof value.agentPreset !== 'string' ||
      !['designer-wordpress', 'designer-joomla', 'designer-emdash'].includes(value.agentPreset)) {
    throw new Error('INVALID_NATIVE_SESSION');
  }
  return { sessionId: value.sessionId, agentPreset: value.agentPreset };
}

/**
 * The web persists this ID before calling. Native ensureSession checks the persisted identity,
 * exact cwd and preset before attaching to the supplied personal workspace. Retrying after a
 * lost response adopts that same native session; it never starts a turn. Record the grant only
 * after native creation succeeds, using the ordinary exclusive created-session ledger.
 */
export async function ensureNativeSession(
  request: NativeSessionRequest,
  workspaceId: string,
  rpc: WorkspaceRpc,
  record: (sessionId: string) => boolean,
): Promise<{ sessionId: string; workspaceId: string }> {
  if (!workspaceId) throw new Error('NATIVE_WORKSPACE_UNAVAILABLE');
  const result = await rpc('session/create', { request: { workspaceId, ...request } });
  if (!result.ok) throw new Error('NATIVE_SESSION_UNAVAILABLE');
  const value = result.value as { sessionId?: unknown } | null;
  if (value?.sessionId !== request.sessionId) throw new Error('NATIVE_SESSION_ID_MISMATCH');
  if (!record(request.sessionId)) throw new Error('NATIVE_SESSION_GRANT_REFUSED');
  return { sessionId: request.sessionId, workspaceId };
}
