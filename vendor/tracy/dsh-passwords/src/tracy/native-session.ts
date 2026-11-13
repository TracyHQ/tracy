/** Optional native onboarding allocation, reachable only through the signed seat door. */
import type { WorkspaceRpc } from './seat-home.js';
import { BUILD_AGENT_PRESET } from './build-agent.js';

export interface NativeSessionRequest {
  sessionId: string;
  agentPreset: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * The native sessions the creation workspace may hold, each with its own ID prefix and the ONLY
 * presets that prefix may run. The pairing is the grant: a widget session never runs the build
 * agent, and the build chat never runs a site agent (whose tools reach files and a shell).
 *
 * - `session-widget-` — the landing page widget's handoff (2.7.7-tracy.11), one of three designers.
 * - `session-build-` — the creation workspace's build chat (TracyHQ/tracy#602), the build agent
 *   only, and whatever it runs it dispatches only the build tools (`build-agent.ts`). The seat
 *   itself stays the creation seat below, so the chat gains no folder, toolset or site.
 */
const NATIVE_SESSIONS: readonly { id: RegExp; presets: readonly string[] }[] = [
  { id: new RegExp(`^session-widget-${UUID}$`, 'i'), presets: ['designer-wordpress', 'designer-joomla', 'designer-emdash'] },
  { id: new RegExp(`^session-build-${UUID}$`, 'i'), presets: [BUILD_AGENT_PRESET] },
];

/** Validate before the seat door creates folders or mutates any permissions. */
export function nativeSessionRequest(payload: Record<string, unknown>): NativeSessionRequest | null {
  if (payload.nativeSession === undefined) return null;
  const raw = payload.nativeSession;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_NATIVE_SESSION');
  const value = raw as Record<string, unknown>;
  const kind = typeof value.sessionId === 'string'
    ? NATIVE_SESSIONS.find((entry) => entry.id.test(value.sessionId as string))
    : undefined;
  if (payload.role !== 'editor' || payload.site !== '~onboarding' ||
      typeof payload.email !== 'string' || payload.email.trim() === '' ||
      typeof payload.home !== 'string' || payload.home.trim() === '' ||
      !Array.isArray(payload.folders) || payload.folders.length !== 0 ||
      !Array.isArray(payload.toolsets) || payload.toolsets.length !== 1 || payload.toolsets[0] !== 'content' ||
      Object.keys(value).some(key => key !== 'sessionId' && key !== 'agentPreset') ||
      kind === undefined ||
      typeof value.agentPreset !== 'string' || !kind.presets.includes(value.agentPreset)) {
    throw new Error('INVALID_NATIVE_SESSION');
  }
  return { sessionId: value.sessionId as string, agentPreset: value.agentPreset };
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
