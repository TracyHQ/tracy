import type { TemplatePick, TemplateRanking } from '@tracy/core/template-picker'
/**
 * tracy-web's `/api/website-opportunities/…` doors (tasks/spec-website-opportunities-contracts.md §4).
 *
 * ROOT-ABSOLUTE, NOT `dshUrl()`: like `/api/notifications` and `/auth/me`, these doors live at the
 * host's bare root, never under a plugin's `<base href>` mount. Every call settles: a refusal is its
 * `code` (`FEATURE_OFF`, `TEMPLATE_UNSELECTED`…), a broken network is `NETWORK`; nothing throws.
 */
import type { Kind, SiteCheck } from '@tracy/wo-views'
import type { ServerLink } from '@tracy/wo-views/link-rows-model'

import type { SettingsAnswer } from './gate.ts'
import type { RequestIds } from './request-ids.ts'
import { type ShownSource, reasonKey } from './status.ts'
import type { DemoUsage, DemoAction, DemoChatPreparation, OutreachDraft } from './outreach-model.ts'

export const BASE = '/api/website-opportunities'

export type Answer<T> =
  | { ok: true; status: number; body: T }
  | {
      ok: false
      status: number
      code: string
      usage?: DemoUsage
      /** When to ask again (`DEMO_LOGO_RESEARCH_PENDING`). */
      retryAt?: string
      /** `GOOGLE_LINK_AMBIGUOUS`: the places the Google link may be (`POST /` with `links`). */
      candidates?: LinkCandidate[]
      /** `GOOGLE_LINK_AMBIGUOUS`, `NO_USABLE_LINKS`: how the server judged each link sent. */
      links?: ServerLink[]
    }

/** One place a Google link may be, as the create door offers it back (409 `GOOGLE_LINK_AMBIGUOUS`). */
export interface LinkCandidate {
  provider: 'google-places'
  providerId: string
  name: string
  address?: string
  rating?: number
  category?: string
}

/** Several links of one business: `name` is the words typed next to them, `place` the candidate picked. */
export interface LinksBody {
  links: string[]
  name?: string
  place?: LinkCandidate
}

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text?(): Promise<string> }>

const id = (value: string): string => encodeURIComponent(value)

export interface BuildChoice {
  design: string
  quickstart: string
}
export type BuildChoices = Record<
  string,
  { pinned: BuildChoice | null; templates: (BuildChoice & { label: string })[] }
>

/** `GET /capabilities`: what this server can search with; `maps.browserKey` null = no Map view. */
export interface Capabilities {
  contract?: unknown
  sources?: Record<string, { available: boolean; reason?: string }>
  discovery?: Partial<Record<'google-places' | 'google-maps' | 'osm', boolean>>
  kinds?: Kind[]
  cuisines?: string[]
  maps?: { browserKey: string | null }
  /** The Build form's choices (absent on an older server): per CMS its templates and the one pinned on /ops/wo. */
  templates?: BuildChoices | { error: string }
  search?: { maxRadiusM?: number; depths?: Partial<Record<'quick' | 'standard', number>> }
  /** Absent on an older server; every provider false = no social stats on this deployment. */
  socialStats?: {
    networks?: string[]
    autoLimit?: number
    dailyCap?: number
    providers?: Partial<Record<'rapidapi' | 'youtube' | 'apify', boolean>>
  }
}

/** `POST /search`'s raw answer (contract §3); `searchAnswer` in flow.ts turns it into rows. */
export interface SearchResponse {
  center?: unknown
  provider?: unknown
  fallbackFrom?: unknown
  pages?: unknown
  hiddenChains?: unknown
  candidates?: unknown[]
}

export interface Api {
  demoAction(actionId: string): Promise<Answer<{ action: DemoAction }>>
  prepareDemoChat(actionId: string): Promise<Answer<DemoChatPreparation>>
  reserveDemoChatSend(
    actionId: string,
    input: { sessionId: string; briefHash: string; nativeRequestId: string }
  ): Promise<Answer<DemoChatPreparation & { submission: { nativeRequestId: string; state: string } }>>
  demoUsage(): Promise<Answer<{ usage: DemoUsage }>>
  buildDemo(
    opportunityId: string,
    requestId: string,
    retryOf?: string,
    selection?: TemplatePick,
    label?: string,
    fromFind?: boolean
  ): Promise<Answer<{ actions: DemoAction[]; usage: DemoUsage }>>
  buildDemos(
    ids: string[],
    requestId: string,
    selection: TemplatePick
  ): Promise<Answer<{ actions: DemoAction[]; usage: DemoUsage }>>
  /**
   * How the template picker groups its cards before a build of these opportunities (their one trade's templates
   * first); `ranking` null when the trade is unknown or not shared. Absent on a surface that builds nothing.
   */
  templateRanking?(ids: string[]): Promise<Answer<{ ranking: TemplateRanking | null }>>
  outreach(opportunityId: string): Promise<Answer<{ outreach: OutreachDraft }>>
  settings(): Promise<Answer<SettingsAnswer>>
  capabilities(): Promise<Answer<Capabilities>>
  siteChecks(urls: string[]): Promise<Answer<{ checks?: Record<string, SiteCheck> }>>
  /** `force` = one row's button: fetched even past the server's auto budget. */
  socialStats(
    handles: ReadonlyArray<{ network: string; url: string }>,
    force?: boolean
  ): Promise<Answer<{ stats?: Record<string, unknown> }>>
  saveSettings(cms: string): Promise<Answer<SettingsAnswer>>
  refreshFind(candidates: unknown[]): Promise<Answer<SearchResponse>>
  search(body: Record<string, unknown>): Promise<Answer<SearchResponse>>
  approxLocation(): Promise<Answer<{ lat?: unknown; lon?: unknown; label?: unknown }>>
  /** The Find box's place suggestions; `session` is the typing session's token. */
  suggestPlaces(q: string, session: string, lang?: string): Promise<Answer<{ suggestions?: unknown[] }>>
  /** A picked suggestion's point, closing the typing session. */
  resolvePlace(
    placeId: string,
    session: string,
    lang?: string
  ): Promise<Answer<{ label?: unknown; lat?: unknown; lon?: unknown }>>
  create(
    body: { candidate: unknown } | { url: string } | LinksBody
  ): Promise<Answer<{ opportunity?: { id?: string }; links?: ServerLink[] }>>
  list(): Promise<Answer<{ opportunities?: unknown[] }>>
  /** One page of My opportunities: `query` from `listParams` (or `ids=…` for the poll). */
  listPage(query: string): Promise<Answer<Record<string, unknown>>>
  /** Resume or cancel many jobs: picked job ids, or the filter on screen. */
  bulk(
    action: 'resume' | 'cancel',
    requestId: string,
    selection: { jobIds: string[] } | { filter: { stage?: string; attention?: boolean; q?: string } }
  ): Promise<Answer<{ results?: unknown[]; done?: number; skipped?: number; failed?: number }>>
  detail(opportunityId: string): Promise<Answer<Record<string, unknown>>>
  /** The place's research as the template-independent place profile (ADR 0037). */
  placeProfile(
    opportunityId: string
  ): Promise<Answer<{ profile?: unknown; decisions?: unknown; siteName?: unknown }>>
  /** One fact on or off for the site, or `null` to let the rule decide again (`PUT …/:id/facts`, #1791). */
  setFact(
    opportunityId: string,
    factId: string,
    onSite: boolean | null
  ): Promise<Answer<{ opportunity?: unknown }>>
  /** The owner's key message picks: ids removed, ids in order, labels retyped (`PUT …/:id/key-messages`, #1791). */
  setKeyMessages(
    opportunityId: string,
    picks: { removed: string[]; order: string[]; labels: Record<string, string> }
  ): Promise<Answer<{ opportunity?: unknown }>>
  /** The name the business's site carries, as the person checked it on the Profile card (`PUT …/:id/name`). */
  setName(opportunityId: string, name: string): Promise<Answer<{ opportunity?: unknown }>>
  /** The opening hours on the site, as the person checked them on the Profile card (`PUT …/:id/hours`). */
  setHours(
    opportunityId: string,
    body: { choice: 'keep' | 'leave' } | { choice: 'edit'; hours: string[] }
  ): Promise<Answer<{ opportunity?: unknown }>>
  /** Google's rating on the site, shown or left off as the person chose on the Profile card (`PUT …/:id/rating`). */
  setRating(opportunityId: string, choice: 'show' | 'leave'): Promise<Answer<{ opportunity?: unknown }>>
  /** A pick on the reading of the Profile card: remove or restore an item, show or hide a person (`PUT …/:id/reading`). */
  setReading(
    opportunityId: string,
    item: string,
    choice: 'remove' | 'restore' | 'show' | 'hide'
  ): Promise<Answer<{ opportunity?: unknown }>>
  research(opportunityId: string, requestId: string, only?: OnlyPart): Promise<Answer<{ job?: unknown }>>
  /** Research again, before the press: what would run, why, the most it may cost (`research-again.ts`). */
  researchAgainPreview(opportunityId: string, parts?: readonly AgainPart[]): Promise<Answer<unknown>>
  /** Research again pressed: only the parts that are due (within `parts` when given), paid by the account. */
  researchAgain(
    opportunityId: string,
    requestId: string,
    parts?: readonly AgainPart[]
  ): Promise<Answer<{ job?: unknown; again?: unknown }>>
  cancel(jobId: string): Promise<Answer<{ job?: unknown }>>
  resume(jobId: string): Promise<Answer<{ job?: unknown }>>
  /** Refresh: the brief of the current research (the latest one when it has not changed). */
  createRevision(opportunityId: string): Promise<Answer<{ revision?: unknown }>>
  revision(
    revisionId: string
  ): Promise<Answer<{ revision?: unknown; builds?: unknown; suggestedLabel?: unknown; usage?: DemoUsage }>>
  revisionMarkdown(revisionId: string): Promise<Answer<string>>
  buildStatus(buildId: string): Promise<Answer<Record<string, unknown>>>
  handOff(
    buildId: string
  ): Promise<Answer<{ handoff?: unknown; site?: { key?: unknown } | null; next?: unknown }>>
  handOffState(buildId: string): Promise<Answer<{ handoff?: unknown; site?: { key?: unknown } | null }>>
  /** The latest demo of an opportunity: a new term (`extend`), or thawed (`reopen`). */
  demo(opportunityId: string, press: 'extend' | 'reopen'): Promise<Answer<{ demo?: unknown }>>
  /** A deleted demo built again from its revision; one request id is one build. */
  rebuildDemo(opportunityId: string, requestId: string): Promise<Answer<{ build?: unknown }>>
  /** The public Find only (`/find/api/research`): Research pressed on rows, by Google place id. */
  publicResearch(placeIds: readonly string[]): Promise<Answer<{ places?: unknown[] }>>
  /** The public Find only: researched/none per place id, and a pressed research's progress by receipt. */
  publicResearchStatus(query: {
    placeIds?: readonly string[]
    receipts?: readonly string[]
  }): Promise<Answer<{ places?: unknown[]; receipts?: Record<string, unknown> }>>
  /** The public Find only (`GET /find/api/research-again`): Research again's plan for a researched place. */
  publicAgainPreview(placeId: string): Promise<Answer<unknown>>
  /** The public Find only (`POST /find/api/research-again`): a run of what is due, paid by Tracy. */
  publicResearchAgain(placeId: string): Promise<Answer<unknown>>
}

export function mediaUrl(mediaId: string): string {
  return `${BASE}/media/${id(mediaId)}`
}

/** A listing's cover photo, by the `photo.name` the search answered. */
export function placePhotoUrl(name: string, width: number): string {
  return `${BASE}/places/photo?name=${id(name)}&w=${Math.round(width)}`
}

/** The same photo looked up again by place id, for when the search's photo name has expired. */
export function placePhotoUrlById(placeId: string, width: number): string {
  return `${BASE}/places/${id(placeId)}/photo?w=${Math.round(width)}`
}

export function createApi(fetchImpl: FetchLike): Api {
  async function call<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    accept = 'application/json'
  ): Promise<Answer<T>> {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchImpl(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? { accept } : { accept, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch {
      return { ok: false, status: 0, code: 'NETWORK' }
    }
    if (accept !== 'application/json') {
      if (!res.ok) return { ok: false, status: res.status, code: `HTTP_${res.status}` }
      const text = typeof res.text === 'function' ? await res.text().catch(() => null) : null
      return text === null
        ? { ok: false, status: res.status, code: 'NETWORK' }
        : { ok: true, status: res.status, body: text as T }
    }
    let parsed: unknown = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    if (!res.ok) {
      const refusal = (parsed ?? {}) as {
        code?: unknown
        usage?: DemoUsage
        candidates?: unknown
        links?: unknown
        retryAt?: unknown
      }
      const code = refusal.code
      return {
        ok: false,
        status: res.status,
        code: typeof code === 'string' && code !== '' ? code : `HTTP_${res.status}`,
        ...(refusal.usage ? { usage: refusal.usage } : {}),
        ...(Array.isArray(refusal.candidates) ? { candidates: refusal.candidates as LinkCandidate[] } : {}),
        ...(Array.isArray(refusal.links) ? { links: refusal.links as ServerLink[] } : {}),
        ...(typeof refusal.retryAt === 'string' ? { retryAt: refusal.retryAt } : {})
      }
    }
    return { ok: true, status: res.status, body: parsed as T }
  }

  // The signed-in tab researches through its own opportunities, never the public doors.
  const publicOnly = async (): Promise<Answer<never>> => ({ ok: false, status: 404, code: 'UNSUPPORTED' })
  return {
    publicResearch: publicOnly,
    publicResearchStatus: publicOnly,
    publicAgainPreview: publicOnly,
    publicResearchAgain: publicOnly,
    demoAction: (actionId) => call(`${BASE}/demo/actions/${id(actionId)}`),
    prepareDemoChat: (actionId) => call(`${BASE}/demo/actions/${id(actionId)}/chat/prepare`, 'POST', {}),
    reserveDemoChatSend: (actionId, input) =>
      call(`${BASE}/demo/actions/${id(actionId)}/chat/send`, 'POST', input),
    demoUsage: () => call(`${BASE}/demo/usage`),
    buildDemo: (opportunityId, requestId, retryOf, selection, label, fromFind) =>
      call(`${BASE}/${id(opportunityId)}/demo/build`, 'POST', {
        requestId,
        ...(retryOf ? { retryOf } : { workflow: 'agent-demo/1', chatMode: 'client-send/1' }),
        ...(selection ? { selection } : {}),
        ...(label === undefined ? {} : { label }),
        ...(fromFind ? { fromFind: true } : {})
      }),
    buildDemos: (ids, requestId, selection) =>
      call(`${BASE}/demo/builds/bulk`, 'POST', {
        ids,
        requestId,
        selection,
        workflow: 'agent-demo/1',
        chatMode: 'client-send/1'
      }),
    templateRanking: (ids) => call(`${BASE}/demo/template-ranking?ids=${ids.map(id).join(',')}`),
    outreach: (opportunityId) => call(`${BASE}/${id(opportunityId)}/outreach`),
    settings: () => call(`${BASE}/settings`),
    capabilities: () => call(`${BASE}/capabilities`),
    siteChecks: (urls) => call(`${BASE}/site-checks`, 'POST', { urls }),
    socialStats: (handles, force = false) =>
      call(`${BASE}/social-stats`, 'POST', force ? { handles, force: true } : { handles }),
    saveSettings: (cms) => call(`${BASE}/settings`, 'PUT', { cms }),
    refreshFind: (candidates) => call(`${BASE}/find/refresh`, 'POST', { candidates }),
    search: (body) => call(`${BASE}/search`, 'POST', body),
    approxLocation: () => call(`${BASE}/approx-location`),
    suggestPlaces: (q, session, lang) =>
      call(`${BASE}/places/suggest?q=${id(q)}&session=${id(session)}${lang ? `&lang=${id(lang)}` : ''}`),
    resolvePlace: (placeId, session, lang) =>
      call(`${BASE}/places/suggest/${id(placeId)}?session=${id(session)}${lang ? `&lang=${id(lang)}` : ''}`),
    create: (body) => call(BASE, 'POST', body),
    list: () => call(BASE),
    listPage: (query) => call(query === '' ? BASE : `${BASE}?${query}`),
    bulk: (action, requestId, selection) =>
      call(`${BASE}/jobs/bulk`, 'POST', { action, requestId, ...selection }),
    detail: (opportunityId) => call(`${BASE}/${id(opportunityId)}`),
    placeProfile: (opportunityId) => call(`${BASE}/${id(opportunityId)}/place-profile`),
    setFact: (opportunityId, factId, onSite) =>
      call(`${BASE}/${id(opportunityId)}/facts`, 'PUT', { factId, onSite }),
    setKeyMessages: (opportunityId, picks) => call(`${BASE}/${id(opportunityId)}/key-messages`, 'PUT', picks),
    setName: (opportunityId, name) => call(`${BASE}/${id(opportunityId)}/name`, 'PUT', { name }),
    setHours: (opportunityId, body) => call(`${BASE}/${id(opportunityId)}/hours`, 'PUT', body),
    setRating: (opportunityId, choice) => call(`${BASE}/${id(opportunityId)}/rating`, 'PUT', { choice }),
    setReading: (opportunityId, item, choice) =>
      call(`${BASE}/${id(opportunityId)}/reading`, 'PUT', { item, choice }),
    research: (opportunityId, requestId, only) =>
      call(`${BASE}/${id(opportunityId)}/research`, 'POST', { requestId, ...(only ? { only } : {}) }),
    researchAgainPreview: (opportunityId, parts) =>
      call(
        `${BASE}/${id(opportunityId)}/research-again${parts?.length ? `?parts=${id(parts.join(','))}` : ''}`
      ),
    researchAgain: (opportunityId, requestId, parts) =>
      call(`${BASE}/${id(opportunityId)}/research`, 'POST', {
        requestId,
        again: true,
        ...(parts?.length ? { parts: [...parts] } : {})
      }),
    cancel: (jobId) => call(`${BASE}/jobs/${id(jobId)}/cancel`, 'POST'),
    resume: (jobId) => call(`${BASE}/jobs/${id(jobId)}/resume`, 'POST'),
    createRevision: (opportunityId) => call(`${BASE}/${id(opportunityId)}/revisions`, 'POST', {}),
    revision: (revisionId) => call(`${BASE}/revisions/${id(revisionId)}`),
    revisionMarkdown: (revisionId) =>
      call(`${BASE}/revisions/${id(revisionId)}?format=md`, 'GET', undefined, 'text/markdown'),
    buildStatus: (buildId) => call(`${BASE}/builds/${id(buildId)}`),
    handOff: (buildId) => call(`${BASE}/builds/${id(buildId)}/handoff`, 'POST'),
    handOffState: (buildId) => call(`${BASE}/builds/${id(buildId)}/handoff`),
    demo: (opportunityId, press) => call(`${BASE}/${id(opportunityId)}/demo/${press}`, 'POST'),
    rebuildDemo: (opportunityId, requestId) =>
      call(`${BASE}/${id(opportunityId)}/demo/rebuild`, 'POST', { requestId })
  }
}

/** What a one-part research refreshes alone: the logo, or one source of the place's research card. */
export type OnlyPart = 'logo' | ShownSource

/** A part Research again can be limited to. */
export type AgainPart = ShownSource
/** Read menu again: Research again over the menu file first, then the menu photos. */
export const MENU_PARTS: readonly AgainPart[] = ['menu-file', 'menu-photos']

/** Start research on an opportunity; a repeat press reuses the held request id (`request-ids.ts`). */
export async function startResearch(
  api: Pick<Api, 'research'>,
  opportunityId: string,
  ids: RequestIds,
  only?: OnlyPart
): Promise<Answer<{ job?: unknown }>> {
  const action = `research${only ? `-${only}` : ''}:${opportunityId}`
  const { id: requestId } = ids.begin(action)
  const answer = await api.research(opportunityId, requestId, only)
  if (answer.ok) ids.succeed(action)
  else ids.fail(action)
  return answer
}

/** Research again on an opportunity; a repeat press reuses the held request id. */
export async function startResearchAgain(
  api: Pick<Api, 'researchAgain'>,
  opportunityId: string,
  ids: RequestIds,
  parts?: readonly AgainPart[]
): Promise<Answer<{ job?: unknown; again?: unknown }>> {
  const action = `research-again${parts?.length ? `-${parts.join('+')}` : ''}:${opportunityId}`
  const { id: requestId } = ids.begin(action)
  const answer = await api.researchAgain(opportunityId, requestId, parts)
  if (answer.ok) ids.succeed(action)
  else ids.fail(action)
  return answer
}

/**
 * Send what the person picked: create each opportunity (the server answers the old one for a
 * duplicate), then start its research. One failure does not stop the others; it is named back.
 */
export async function sendPicks(
  api: Api,
  picks: ReadonlyArray<{ name?: string | null }>,
  ids: RequestIds
): Promise<{ sent: number; failed: string[] }> {
  let sent = 0
  const failed: string[] = []
  for (const candidate of picks) {
    const created = await api.create({ candidate })
    const opportunityId = created.ok ? created.body?.opportunity?.id : undefined
    const started = typeof opportunityId === 'string' ? await startResearch(api, opportunityId, ids) : null
    if (started?.ok) sent += 1
    else failed.push(typeof candidate.name === 'string' ? candidate.name : '')
  }
  return { sent, failed }
}

/**
 * Links of one business: one opportunity, then its research. A refusal comes back as it is, with the candidates of
 * an ambiguous Google link (resend the same body with `place`) and the server's judgement of each link. A success
 * carries that judgement too (`links`), so the page can say which links were left out.
 */
export async function sendLinks(
  api: Api,
  body: LinksBody,
  ids: RequestIds
): Promise<Answer<{ job?: unknown; links?: ServerLink[] }>> {
  const name = body.name?.trim()
  const created = await api.create({
    links: body.links,
    ...(name ? { name } : {}),
    ...(body.place ? { place: body.place } : {})
  })
  if (!created.ok) return created
  const opportunityId = created.body?.opportunity?.id
  if (typeof opportunityId !== 'string') return { ok: false, status: created.status, code: 'HTTP_200' }
  const started = await startResearch(api, opportunityId, ids)
  const links = created.body?.links
  if (!started.ok || !Array.isArray(links)) return started
  return { ...started, body: { ...started.body, links } }
}

/** How long the page waits for an earlier hand-off press of the same build: 36 × 5 s = 3 minutes. */
export const HANDOFF_WAIT_TRIES = 36
export const HANDOFF_WAIT_MS = 5000

export interface HandOffWait {
  /** Called each time the server says an earlier press still runs (the page shows a waiting note). */
  onWaiting?: () => void
  tries?: number
  ms?: number
  sleep?: (ms: number) => Promise<void>
}

/** Open the exact chat whose prompt the server accepted, with no browser fallback sender. */
export async function handOffBuild(
  api: Api,
  buildId: string,
  wait: HandOffWait = {}
): Promise<{ ok: true; target: string } | { ok: false; reasonKey: string }> {
  // 409 HANDOFF_IN_PROGRESS: an earlier press (another tab, or one whose answer the proxy cut off) still
  // runs. Pressing again once it ends is safe — the server sends the prompt once per chat — so the page
  // waits and asks again instead of showing an error, and gives up only after `tries` answers.
  const tries = wait.tries ?? HANDOFF_WAIT_TRIES
  const sleep = wait.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let answer = await api.handOff(buildId)
  for (let left = tries; !answer.ok && answer.code === 'HANDOFF_IN_PROGRESS' && left > 0; left -= 1) {
    wait.onWaiting?.()
    await sleep(wait.ms ?? HANDOFF_WAIT_MS)
    answer = await api.handOff(buildId)
  }
  if (!answer.ok) return { ok: false, reasonKey: reasonKey(answer.code) ?? 'reason.other' }
  const key = answer.body?.site?.key
  if (typeof key !== 'string' || key === '') return { ok: false, reasonKey: 'reason.other' }
  const next = answer.body?.next
  const ownPath = typeof next === 'string' && next.startsWith(`/${id(key)}/s/`) && !next.includes('\\')
  return ownPath ? { ok: true, target: next } : { ok: false, reasonKey: 'reason.other' }
}

/** One press on a demo (the Demo column, the Inspector, the Details page); a rebuild keeps its request id until it succeeds. */
export async function pressDemo(
  api: Pick<Api, 'demo' | 'rebuildDemo'>,
  ids: RequestIds,
  opportunityId: string,
  press: 'extend' | 'reopen' | 'rebuild'
): Promise<Answer<unknown>> {
  if (press !== 'rebuild') return api.demo(opportunityId, press)
  const action = `rebuild:${opportunityId}`
  const { id: requestId } = ids.begin(action)
  const answer = await api.rebuildDemo(opportunityId, requestId)
  if (answer.ok) ids.succeed(action)
  else ids.fail(action)
  return answer
}
