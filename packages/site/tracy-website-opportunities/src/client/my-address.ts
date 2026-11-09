/**
 * What the tab keeps in the page address, so a reload or a reopened tab lands where it was: the
 * sub-tab, My opportunities' filter and search, the row open in the Inspector, and the Details or
 * Brief page. dsh owns the address and offers a plugin no state of its own there, so these ride as
 * `wo-*` parameters (like `wo-handoff`) beside dsh's and tracy-tab-link's, which are kept untouched.
 *
 * Read once when the tab mounts, written only on a press (as the Design inspiration tab does): a tab
 * nobody presses never overwrites the address of the tab in sight.
 */
import { STAGES, type Stage } from './opportunity-row.ts'

export type SubTab = 'find' | 'mine'
export type FilterValue = 'all' | Stage | 'attention'
export type Page = 'details' | 'brief'

export interface MyAddress {
  /** null = no choice yet: the tab opens My opportunities when the account has any, else Find. */
  view: SubTab | null
  stage: FilterValue
  q: string
  /** The opportunity open in the Inspector, or whose page is open. */
  opp: string | null
  page: Page | null
  /** The site brief (revision) of the Brief page. */
  brief: string | null
}

export const BLANK_ADDRESS: MyAddress = Object.freeze({
  view: null,
  stage: 'all',
  q: '',
  opp: null,
  page: null,
  brief: null
})

const P = {
  view: 'wo-view',
  stage: 'wo-stage',
  q: 'wo-q',
  opp: 'wo-opp',
  page: 'wo-page',
  brief: 'wo-brief'
} as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The list door's own limit on a search. */
export const Q_MAX = 100

const FILTERS: readonly string[] = ['all', ...STAGES, 'attention']
const isFilter = (v: string | null): v is FilterValue => v !== null && FILTERS.includes(v)
const uuid = (v: string | null): string | null => (v !== null && UUID.test(v) ? v.toLowerCase() : null)

export function addressFromSearch(search: string): MyAddress {
  const params = new URLSearchParams(search)
  const view = params.get(P.view)
  const stage = params.get(P.stage)
  const opp = uuid(params.get(P.opp))
  const brief = uuid(params.get(P.brief))
  const asked = params.get(P.page)
  const page: Page | null =
    asked === 'details' && opp !== null
      ? 'details'
      : asked === 'brief' && opp !== null && brief !== null
        ? 'brief'
        : null
  return {
    view: view === 'find' || view === 'mine' ? view : null,
    stage: isFilter(stage) ? stage : 'all',
    q: (params.get(P.q) ?? '').slice(0, Q_MAX),
    opp,
    page,
    brief: page === 'brief' ? brief : null
  }
}

/** `search` with our parameters set to `address` (defaults left out); '' when nothing is left. */
export function searchWithAddress(search: string, address: MyAddress): string {
  const params = new URLSearchParams(search)
  for (const name of Object.values(P)) params.delete(name)
  if (address.view !== null) params.set(P.view, address.view)
  if (address.stage !== 'all') params.set(P.stage, address.stage)
  if (address.q !== '') params.set(P.q, address.q.slice(0, Q_MAX))
  if (address.opp !== null) params.set(P.opp, address.opp)
  if (address.page !== null && address.opp !== null) params.set(P.page, address.page)
  if (address.page === 'brief' && address.brief !== null) params.set(P.brief, address.brief)
  // URLSearchParams escapes the colon of `tab=tracy:…`; tracy-tab-link writes it bare too.
  const query = params.toString().replace(/%3A/gi, ':')
  return query === '' ? '' : `?${query}`
}
