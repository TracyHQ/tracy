/**
 * Talking to `/api/ops/cms`, and being honest about every way it can fail.
 *
 * 🔒 A FAILED FETCH IS NOT AN EMPTY SCREEN. Four things can go wrong and they mean different
 * things: the session expired (the server answers the sign-in redirect), this viewer is not staff
 * (403, no body), the build shipped no snapshot (200 with `status: 'unavailable'`), or the network
 * dropped. Collapsing them into `catch { setRows([]) }` is how a page ends up telling an operator
 * that a CMS has no configuration when in fact nobody is signed in.
 *
 * 🔒 AND A SLOW ANSWER MUST NOT OVERWRITE A NEW QUESTION. Every screen here can change `env` or
 * `cms` faster than a request returns, so `request()` takes an `AbortSignal` and every caller
 * passes one tied to its effect. Without it the classic bug appears: pick Main, pick Dev, and the
 * Main response lands last and paints Main's numbers under Dev's heading.
 *
 * Refusal reasons this file words come from the dictionary; a reason the server sent is kept as sent.
 */
import { tr } from '../i18n'

export type Status = 'ok' | 'missing' | 'unsupported' | 'unavailable' | 'error' | 'unknown'

export interface Provenance {
  env: string
  label?: string
  ref: string
  sha: string
  shortSha?: string
  committedAt?: string | null
  generatedAt: string
  digest?: string
  note?: string
}

export interface Section<T = unknown> {
  status: Status
  reason: string | null
  data: T
  sources: { path: string; sha256: string; bytes: number }[]
}

export interface Snapshot {
  status: 'ok'
  schemaVersion: string
  source: Provenance
  sections: Record<string, Section<any>>
  observations: unknown[]
  notes: string[]
}

export interface EnvironmentRow {
  id: string
  label: string
  available: boolean
  sha: string | null
  shortSha: string | null
  bytes: number | null
}

/** What the UI gets instead of a value when a request could not produce one. */
export interface Refusal {
  kind: 'signed-out' | 'not-staff' | 'unavailable' | 'error' | 'aborted'
  reason: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; refusal: Refusal }

async function request<T>(path: string, signal?: AbortSignal): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetch(path, { signal, credentials: 'same-origin', redirect: 'manual' })
  } catch (e) {
    if (signal?.aborted) return { ok: false, refusal: { kind: 'aborted', reason: 'superseded' } }
    return {
      ok: false,
      refusal: {
        kind: 'error',
        reason: tr('cms-screens.api.requestFailed', { reason: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  /**
   * 🔒 A REDIRECT IS A SIGN-IN, NOT DATA. With `redirect: 'manual'` the browser reports an opaque
   * response (`type: 'opaqueredirect'`, status 0) rather than following `/login` and handing us an
   * HTML page — which is the whole trap: parsed as JSON it throws, and a `catch` turns "your
   * session expired" into "there is no configuration".
   */
  if (res.type === 'opaqueredirect' || res.status === 0 || (res.status >= 300 && res.status < 400))
    return {
      ok: false,
      refusal: { kind: 'signed-out', reason: tr('cms-screens.api.signedOut') }
    }
  if (res.status === 403)
    return {
      ok: false,
      refusal: { kind: 'not-staff', reason: tr('cms-screens.api.notStaff') }
    }

  let body: any
  try {
    body = await res.json()
  } catch {
    return {
      ok: false,
      refusal: { kind: 'error', reason: tr('cms-screens.api.notJson', { status: res.status }) }
    }
  }
  if (body?.status === 'unavailable')
    return {
      ok: false,
      refusal: { kind: 'unavailable', reason: body.reason ?? tr('cms-screens.api.unavailable') }
    }
  if (!res.ok || body?.status === 'error')
    return {
      ok: false,
      refusal: { kind: 'error', reason: body?.reason ?? tr('cms-screens.api.status', { status: res.status }) }
    }
  return { ok: true, value: body as T }
}

export function fetchEnvironments(signal?: AbortSignal) {
  return request<{ status: 'ok'; generatedAt: string; environments: EnvironmentRow[] }>(
    '/api/ops/cms/environments',
    signal
  )
}

export function fetchSnapshot(env: string, signal?: AbortSignal) {
  return request<Snapshot>(`/api/ops/cms/snapshot?env=${encodeURIComponent(env)}`, signal)
}

export interface DesignPage {
  status: Status
  cms: string
  total: number
  matched: number
  offset: number
  limit: number
  /** `design-system` for a theme's catalogue, `template` for a CMS whose quickstarts ARE the choice. */
  kind?: 'design-system' | 'template' | null
  systems: {
    id: string
    name: string
    category: string | null
    dark: boolean | null
    quickstart?: string
    version?: string | null
  }[]
  reason?: string
}

export function fetchDesigns(
  env: string,
  cms: string,
  { q = '', offset = 0, limit = 50 }: { q?: string; offset?: number; limit?: number },
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ env, cms, offset: String(offset), limit: String(limit) })
  if (q) params.set('q', q)
  return request<DesignPage>(`/api/ops/cms/designs?${params.toString()}`, signal)
}

export interface Runtime {
  status: Status
  observedAt: string
  reason?: string
  hosts?: { id: string; status?: string; [k: string]: unknown }[]
}

export function fetchRuntime(signal?: AbortSignal) {
  return request<Runtime>('/api/ops/cms/runtime', signal)
}

/** One card customers on this server are offered — a TEMPLATE, however many CMSes build it. */
export interface InspirationShown {
  id: string
  label: string
  card: {
    provider: string | null
    category: string | null
    blurb: string | null
    image: string | null
    layouts: number
  }
  design: { id: string; source: string } | null
  platforms: {
    platform: string
    tag: string
    version: string
    demo: { url: string; version: string | null } | null
  }[]
  /** What the card lacks on this server. Never a reason it is off the shelf. */
  warnings: string[]
  local?: boolean
}

/** A release, on the two tabs whose unit is the release rather than the template. */
export interface InspirationRelease {
  tag: string
  platform: string | null
  version: string | null
  label: string
  template: string | null
  /** Why customers do not get this card (Not shown only). */
  why?: string
  /** The held-back card's thumbnail address and category (Not shown only); null when it has none. */
  image?: string | null
  category?: string | null
}

/** `GET /api/ops/inspiration` — live database state of the server answering, not a ref. */
export interface Inspiration {
  readAt: string | null
  origin: string
  writable: boolean
  canRefresh: boolean
  cannotRefreshReason: string | null
  designSystemsShown: boolean
  shown: InspirationShown[]
  notShown: InspirationRelease[]
  noCard: InspirationRelease[]
  counts: {
    shown: number
    joomla: number
    wordpress: number
    emdash: number
    notShown: number
    noCard: number
  }
}

export function fetchInspiration(signal?: AbortSignal) {
  return request<Inspiration>('/api/ops/inspiration', signal)
}
