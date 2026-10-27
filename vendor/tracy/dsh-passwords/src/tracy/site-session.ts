/** A server-signed allocation for one site's owner; browser session/create keeps its existing fence. */
import type { NativeSessionRequest } from './native-session.js';

export interface SiteSessionRequest {
  folder: string;
  session: NativeSessionRequest;
}

export function siteSessionRequest(payload: Record<string, unknown>): SiteSessionRequest | null {
  if (payload.siteSession === undefined) return null;
  const raw = payload.siteSession;
  const folder = Array.isArray(payload.folders) && payload.folders.length === 1 ? payload.folders[0] : null;
  const label = typeof folder === 'string' ? /^\/site\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/.exec(folder)?.[1] : null;
  if (payload.nativeSession !== undefined || payload.role !== 'owner' || payload.home !== undefined ||
      payload.toolsets !== undefined || typeof payload.email !== 'string' || payload.email.trim() === '' ||
      !label || typeof payload.site !== 'string' || !payload.site.startsWith(`${label}.`) ||
      !/^[a-z0-9][a-z0-9.-]{0,251}$/.test(payload.site) ||
      raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_SITE_SESSION');
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== 'sessionId' && key !== 'agentPreset') ||
      typeof value.sessionId !== 'string' ||
      !/^wo-demo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.sessionId) ||
      typeof value.agentPreset !== 'string' ||
      !['designer-wordpress', 'designer-joomla', 'designer-emdash'].includes(value.agentPreset)) {
    throw new Error('INVALID_SITE_SESSION');
  }
  return { folder: folder as string, session: { sessionId: value.sessionId, agentPreset: value.agentPreset } };
}
