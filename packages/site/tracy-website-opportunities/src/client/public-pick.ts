/**
 * The places a stranger picked on the sign-in-free `/find` page (apps/tracy-web
 * `public/wo-find-page.js`), carried through sign-in in the address: `wo-at=<lat>,<lon>`,
 * `wo-radius=<m>`, `wo-pick=<placeId,…>`. Read once and removed, like `wo-handoff`; the signed-in
 * search then runs on the account's own budget and the matching rows are preselected. Research is
 * the person's press, never this link's: a shared link costs whoever opens it one search at most.
 * `wo-build=<placeId>` (Build demo on a researched row) names the one place to build: the signed-in
 * Find builds it only when its own answer says the published research can be built (`findAction`).
 */
import type { Api } from './api.ts'
import { type FlowAction, searchAnswer } from './flow.ts'
import { type SearchArea, searchBody } from './find-input.ts'

export interface PublicPick {
  lat: number
  lon: number
  radiusM: number
  placeIds: string[]
  /** Build demo was pressed for this place (one of `placeIds`). */
  build?: string
}

const PARAMS = ['wo-at', 'wo-radius', 'wo-pick', 'wo-build'] as const
const PLACE_ID = /^[A-Za-z0-9_-]{1,300}$/
export const MAX_PICKS = 10
/** The radii the public search door takes (`apps/tracy-web` `public/wo-find-page.js`). */
export const PUBLIC_RADII_M: readonly number[] = Object.freeze([1000, 3000, 5000, 10_000])
const MAX_RADIUS_M = 50_000

export interface PublicPickDeps {
  location: { pathname: string; search: string; hash?: string }
  replaceUrl?: (url: string) => void
}

/** The signed-in Find these picks open in (`/new/` sends a stranger through sign-in first). */
export const SIGNED_IN_FIND = '/new/?tab=tracy:website-opportunities&wo-view=find'
const UTM = /^utm_[a-z0-9_]{1,30}$/

/**
 * The address the public Find's Continue opens: the signed-in Find with the point, the radius and the
 * picks `takePublicPick` reads back, plus the visit's own `utm_*`. Throws on anything the reader
 * would drop, so a pick is never lost silently.
 */
export function buildSignedInFindUrl(args: {
  lat: number
  lon: number
  radiusM: number
  picks: readonly string[]
  /** Build demo pressed for this place; it rides along as a pick too. */
  build?: string
  /** The public page's own query string, for its `utm_*`. */
  search?: string
}): string {
  const { lat, lon, radiusM, build } = args
  if (build !== undefined && !PLACE_ID.test(build)) throw new Error('the place to build is not a place id')
  const picks = build === undefined || args.picks.includes(build) ? args.picks : [...args.picks, build]
  if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180))
    throw new Error('the search point is not a point')
  if (!Number.isInteger(radiusM) || radiusM <= 0 || radiusM > MAX_RADIUS_M)
    throw new Error('the radius is out of range')
  if (picks.length === 0 || picks.length > MAX_PICKS) throw new Error(`pick 1 to ${MAX_PICKS} places`)
  if (picks.some((id) => !PLACE_ID.test(id))) throw new Error('a pick is not a place id')
  const utm = [...new URLSearchParams(args.search ?? '')].filter(([name]) => UTM.test(name))
  const extra = utm.map(([name, value]) => `&${name}=${encodeURIComponent(value.slice(0, 200))}`).join('')
  return `${SIGNED_IN_FIND}&wo-at=${lat.toFixed(5)},${lon.toFixed(5)}&wo-radius=${radiusM}&wo-pick=${[...new Set(picks)].join(',')}${build === undefined ? '' : `&wo-build=${build}`}${extra}`
}

/** The hand-over in the address, or null; any of its parameters is removed whether it is usable or not. */
export function takePublicPick(deps: PublicPickDeps): PublicPick | null {
  const params = new URLSearchParams(deps.location.search)
  if (!PARAMS.some((name) => params.has(name))) return null
  const at = (params.get('wo-at') ?? '').split(',').map(Number)
  const radiusM = Number(params.get('wo-radius'))
  const asked = (params.get('wo-pick') ?? '').split(',')
  const build = params.get('wo-build') ?? ''
  for (const name of PARAMS) params.delete(name)
  deps.replaceUrl?.(`${deps.location.pathname}${params.size ? `?${params}` : ''}${deps.location.hash ?? ''}`)
  const [lat, lon] = at
  const point =
    at.length === 2 &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  if (!point || !Number.isInteger(radiusM) || radiusM <= 0 || radiusM > MAX_RADIUS_M) return null
  const placeIds = [...new Set(asked.filter((id) => PLACE_ID.test(id)))].slice(0, MAX_PICKS)
  return PLACE_ID.test(build) && placeIds.includes(build)
    ? { lat, lon, radiusM, placeIds, build }
    : { lat, lon, radiusM, placeIds }
}

export interface OpenPublicPickDeps {
  /** The signed-in search; the place ids it shows, or null when it failed or was superseded. */
  search: (area: SearchArea, radiusM: number) => Promise<readonly string[] | null>
  /** The two existing signed-in doors a missing pick is fetched through, on the account's own limits. */
  api: Pick<Api, 'resolvePlace' | 'search'>
  /** A Places session token (UUID) for the resolve call. */
  session: () => string
  lang?: string
  /** False once the person started another search: nothing more is added or selected. */
  current?: () => boolean
  dispatch: (action: FlowAction) => void
  /** Build demo was handed over for this place: the view decides from its own row whether it can. */
  onBuild?: (placeId: string) => void
}

/**
 * The signed-in search around the handed point; each pick it did not return is then fetched by its
 * id (resolve for its name, then the `place` search with that id) and added; then every pick found
 * is selected. Never research: that stays the person's press.
 */
export async function openPublicPick(pick: PublicPick, deps: OpenPublicPickDeps): Promise<void> {
  const current = deps.current ?? (() => true)
  const shown = await deps.search({ kind: 'point', lat: pick.lat, lon: pick.lon }, pick.radiusM)
  if (shown === null || !current()) return
  for (const placeId of pick.placeIds.filter((id) => !shown.includes(id))) {
    const resolved = await deps.api.resolvePlace(placeId, deps.session(), deps.lang).catch(() => null)
    const label = resolved?.ok ? resolved.body?.label : undefined
    if (typeof label !== 'string' || label.trim() === '' || !current()) continue
    const answer = await deps.api
      .search(searchBody({ kind: 'text', query: label, placeId }, pick.radiusM))
      .catch(() => null)
    const rows = answer?.ok
      ? searchAnswer(answer.body).candidates.filter((row) => row.providerId === placeId)
      : []
    if (rows.length > 0 && current()) deps.dispatch({ type: 'add-found', candidates: rows })
  }
  if (!current()) return
  deps.dispatch({ type: 'preselect', providerIds: pick.placeIds })
  if (pick.build !== undefined) deps.onBuild?.(pick.build)
}

/** "1 place …" / "3 places …" by the interface language's plural rules. */
export function handedKey(count: number, locale?: string): 'find.handed.one' | 'find.handed.other' {
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'find.handed.one' : 'find.handed.other'
}
