/**
 * The `/ops/wo` address, as data: every view of Website Opportunities keeps its state in the query
 * string, so a pasted link reopens the same screen and F5 keeps it.
 *
 * Parameters (only the current view's section is written; defaults are never written):
 *   view    research | places | settings      (queue is the default)
 *   Queue:  search   free text                 user  login or account id   city  city name
 *           cms      joomla | wordpress | emdash
 *           range    24h | 7d | 90d | any       (30d default)
 *           date     created | built            (updated default)
 *           stage    0..7 | attention           (a full stage id such as 3-researching is read too)
 *           sort     a WoSortKey                (time default)    dir  asc (desc default)
 *           open     the opened WO's id
 *   Places: tab      stale | failing | revoked | merge   (all default)
 *           search   the submitted place search
 *           place    the opened place's id
 *           dialog   caps                       (the Research caps dialog)
 *   Settings writes nothing but `view=settings`.
 *
 * Reading reads only the named view's section (the others are their defaults) and drops an
 * unknown or invalid value on its own; parameters this module does not own are kept as they are.
 */
import { WO_CUSTOMER_STAGES, type WoCms, type WoFilter, type WoSortKey, type WoStage } from './wo-api.ts'
import { PLACE_FILTERS, type PlaceFilter } from './wo-places-api.ts'

export type WoView = 'queue' | 'research' | 'places' | 'settings'
export type WoRange = '24h' | '7d' | '30d' | '90d' | 'any'
export type WoDateField = 'updated' | 'created' | 'built'

export interface WoQueueAddress {
  search: string
  user: string
  city: string
  cms: 'all' | WoCms
  range: WoRange
  date: WoDateField
  stage: WoFilter
  sort: WoSortKey
  dir: 'asc' | 'desc'
  open: string | null
}

export interface WoPlacesAddress {
  tab: PlaceFilter
  search: string
  place: string | null
  dialog: 'caps' | null
}

export interface WoAddress {
  view: WoView
  queue: WoQueueAddress
  places: WoPlacesAddress
}

export const WO_QUEUE_DEFAULT: WoQueueAddress = {
  search: '',
  user: 'all',
  city: 'all',
  cms: 'all',
  range: '30d',
  date: 'updated',
  stage: 'all',
  sort: 'time',
  dir: 'desc',
  open: null
}

export const WO_PLACES_DEFAULT: WoPlacesAddress = { tab: 'all', search: '', place: null, dialog: null }

const STAGES: readonly WoStage[] = [
  '0-pin',
  '1-queued',
  '2-waiting',
  '3-researching',
  '4-brief-ready',
  '5-provisioning',
  '6-uploading',
  '7-live'
]
const VIEWS: readonly WoView[] = ['queue', 'research', 'places', 'settings']
const CMSES: readonly WoCms[] = ['joomla', 'wordpress', 'emdash']
const RANGES: readonly WoRange[] = ['24h', '7d', '30d', '90d', 'any']
const DATE_FIELDS: readonly WoDateField[] = ['updated', 'created', 'built']
const SORT_KEYS: readonly WoSortKey[] = [
  'number',
  'step',
  'name',
  'research',
  'duration',
  'user',
  'time',
  'queue',
  'status',
  'cms'
]

/** Every key this module owns; anything else in the query is left alone. */
const OWNED = [
  'view',
  'search',
  'user',
  'city',
  'cms',
  'range',
  'date',
  'stage',
  'sort',
  'dir',
  'open',
  'tab',
  'place',
  'dialog'
]

const MAX_TEXT = 200
const ID = /^[A-Za-z0-9_-]{1,100}$/

function oneOf<T extends string>(list: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (list as readonly string[]).includes(value) ? (value as T) : fallback
}
const text = (value: string | null) => {
  const v = (value ?? '').trim()
  return v.length > 0 && v.length <= MAX_TEXT ? v : ''
}
const id = (value: string | null) => (value !== null && ID.test(value) ? value : null)

function stageOf(value: string | null): WoFilter {
  if (value === 'attention') return 'attention'
  const customerStage = WO_CUSTOMER_STAGES.find((stage) => stage === value)
  if (customerStage) return customerStage
  if (value === null) return 'all'
  return STAGES.find((s) => s === value || s.slice(0, 1) === value) ?? 'all'
}

export function parseWoAddress(search: string, hash = ''): WoAddress {
  const p = new URLSearchParams(search)
  const view = oneOf(VIEWS, p.get('view'), hash === '#dubai-pilot' ? 'research' : 'queue')
  // Only the named view's section is read: `search` means a different box in each view.
  const queue: WoQueueAddress =
    view !== 'queue'
      ? WO_QUEUE_DEFAULT
      : {
          search: text(p.get('search')),
          user: text(p.get('user')) || 'all',
          city: text(p.get('city')) || 'all',
          cms: oneOf<'all' | WoCms>(CMSES, p.get('cms'), 'all'),
          range: oneOf(RANGES, p.get('range'), '30d'),
          date: oneOf(DATE_FIELDS, p.get('date'), 'updated'),
          stage: stageOf(p.get('stage')),
          sort: oneOf(SORT_KEYS, p.get('sort'), 'time'),
          dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
          open: id(p.get('open'))
        }
  const places: WoPlacesAddress =
    view !== 'places'
      ? WO_PLACES_DEFAULT
      : {
          tab: oneOf(PLACE_FILTERS, p.get('tab'), 'all'),
          search: text(p.get('search')),
          place: id(p.get('place')),
          dialog: p.get('dialog') === 'caps' ? 'caps' : null
        }
  return { view, queue, places }
}

/** The query for `address`, keeping every parameter of `current` this module does not own. */
export function woSearchFor(address: WoAddress, current = ''): string {
  const p = new URLSearchParams(current)
  for (const key of OWNED) p.delete(key)
  const put = (key: string, value: string, fallback: string) => {
    if (value && value !== fallback) p.set(key, value)
  }
  if (address.view !== 'queue') p.set('view', address.view)
  if (address.view === 'queue') {
    const q = address.queue
    const d = WO_QUEUE_DEFAULT
    put('search', q.search.trim(), d.search)
    put('user', q.user, d.user)
    put('city', q.city, d.city)
    put('cms', q.cms, d.cms)
    put('range', q.range, d.range)
    put('date', q.date, d.date)
    put('stage', q.stage.includes('-') ? q.stage.slice(0, 1) : q.stage, d.stage)
    put('sort', q.sort, d.sort)
    put('dir', q.dir, d.dir)
    if (q.open) p.set('open', q.open)
  } else if (address.view === 'places') {
    const s = address.places
    put('tab', s.tab, WO_PLACES_DEFAULT.tab)
    put('search', s.search.trim(), '')
    if (s.place) p.set('place', s.place)
    if (s.dialog) p.set('dialog', s.dialog)
  }
  const q = p.toString()
  return q ? `?${q}` : ''
}
