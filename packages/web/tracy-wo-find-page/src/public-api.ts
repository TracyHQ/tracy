/**
 * The Find view's `Api`, reaching only the sign-in-free doors (`/find/api/*`). Every method answers
 * an `Answer` and never throws: Find calls some of them on its own (polls, refresh, the place box), and a
 * refusal is how it learns to stop. The two polls stop on exactly `CHECKS_UNAVAILABLE` and
 * `SOCIAL_STATS_UNAVAILABLE` (`poll.ts`); everything else a stranger may not do is `UNSUPPORTED`,
 * answered here without a request. Research (`/find/api/research`) sends place ids and receipts only;
 * Research again (`/find/api/research-again`) one place id.
 */
import type { Answer, Api, Capabilities, SearchResponse } from '@tracy/dsh-website-opportunities/find'

export const PUBLIC_API = '/find/api'

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const refused =
  (code: string) =>
  async (..._args: unknown[]): Promise<Answer<never>> => ({ ok: false, status: 404, code })

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** What the public search door takes: a point wins over a name; `radiusM` rides along; nothing else. */
export function publicSearchBody(body: Record<string, unknown>): Record<string, unknown> {
  const radiusM = body.radiusM
  if (finite(body.lat) && finite(body.lon)) return { lat: body.lat, lon: body.lon, radiusM }
  return { query: typeof body.query === 'string' ? body.query : '', radiusM }
}

export function createPublicApi(fetchImpl: FetchLike = (url, init) => fetch(url, init)): Api {
  async function call<T>(path: string, init: RequestInit = {}): Promise<Answer<T>> {
    let res: Response
    try {
      res = await fetchImpl(`${PUBLIC_API}${path}`, { credentials: 'same-origin', ...init })
    } catch {
      return { ok: false, status: 0, code: 'NETWORK' }
    }
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const code =
        typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
          ? body.code
          : `HTTP_${res.status}`
      return { ok: false, status: res.status, code }
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the door's JSON is read by the view's own guards (`searchAnswer`, optional Capabilities fields).
    return { ok: true, status: res.status, body: body as T }
  }
  const unsupported = refused('UNSUPPORTED')
  return {
    capabilities: () => call<Capabilities>('/capabilities', { headers: { accept: 'application/json' } }),
    search: (body) =>
      call<SearchResponse>('/search', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(publicSearchBody(body))
      }),
    siteChecks: refused('CHECKS_UNAVAILABLE'),
    socialStats: refused('SOCIAL_STATS_UNAVAILABLE'),
    demoAction: unsupported,
    prepareDemoChat: unsupported,
    reserveDemoChatSend: unsupported,
    demoUsage: unsupported,
    buildDemo: unsupported,
    buildDemos: unsupported,
    outreach: unsupported,
    settings: unsupported,
    saveSettings: unsupported,
    refreshFind: unsupported,
    approxLocation: unsupported,
    suggestPlaces: (q, session, lang) =>
      call(
        `/places/suggest?q=${encodeURIComponent(q)}&session=${encodeURIComponent(session)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`
      ),
    resolvePlace: (placeId, session, lang) =>
      call(
        `/places/suggest/${encodeURIComponent(placeId)}?session=${encodeURIComponent(session)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`
      ),
    publicResearch: (placeIds) =>
      Array.isArray(placeIds) && placeIds.length > 0
        ? call('/research', {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({ placeIds: [...placeIds] })
          })
        : refused('INVALID_RESEARCH')(),
    publicResearchStatus: async (query) => {
      const ids = Array.isArray(query?.placeIds) ? query.placeIds : []
      const receipts = Array.isArray(query?.receipts) ? query.receipts : []
      if (ids.length === 0 && receipts.length === 0)
        return { ok: true, status: 200, body: { places: [], receipts: {} } }
      const params = new URLSearchParams()
      if (ids.length) params.set('placeIds', ids.join(','))
      if (receipts.length) params.set('receipts', receipts.join(','))
      return call(`/research?${params}`, { headers: { accept: 'application/json' } })
    },
    publicAgainPreview: (placeId) =>
      call(`/research-again?${new URLSearchParams({ placeId })}`, {
        headers: { accept: 'application/json' }
      }),
    // Exactly `{placeId}`: the door refuses anything more.
    publicResearchAgain: (placeId) =>
      call('/research-again', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ placeId })
      }),
    researchAgainPreview: unsupported,
    researchAgain: unsupported,
    create: unsupported,
    list: unsupported,
    listPage: unsupported,
    bulk: unsupported,
    detail: unsupported,
    research: unsupported,
    cancel: unsupported,
    resume: unsupported,
    createRevision: unsupported,
    revision: unsupported,
    revisionMarkdown: unsupported,
    build: unsupported,
    buildStatus: unsupported,
    handOff: unsupported,
    handOffState: unsupported,
    demo: unsupported,
    rebuildDemo: unsupported
  }
}
