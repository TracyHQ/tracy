// Staff-only desktop and quickstart statistics; identity is only shown when the server verified an account link.
import type { T as Translate } from '../i18n/index.ts'
import { en } from '../i18n/ns/appstat.ts'
import { translate } from '../i18n/translator.ts'

type ReadSubject = 'statistics' | 'details'
type Params = Record<string, string | number>

/** A failed read: `key` + `params` say it in any language; `message` is the English. */
export class AppStatisticReadError extends Error {
  signInRequired: boolean
  key: string
  params: Params

  constructor(key: string, params: Params = {}, signInRequired = false) {
    super(translate('en', {}, en, key, params))
    this.key = key
    this.params = params
    this.signInRequired = signInRequired
  }
}

/** A read failure in the language on screen; anything else is the generic sentence for `subject`. */
export const readErrorText = (error: unknown, t: Translate, subject: ReadSubject = 'statistics') =>
  error instanceof AppStatisticReadError ? t(error.key, error.params) : t(`appstat.error.${subject}.generic`)

/** API reads must not follow the staff door's sign-in redirect and parse its HTML as JSON. */
export async function readAppStatistic<T>(
  url: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  subject: ReadSubject = 'statistics'
): Promise<T> {
  const response = await fetchImpl(url, {
    credentials: 'same-origin',
    redirect: 'manual',
    headers: { accept: 'application/json' },
    signal
  })
  if (
    response.type === 'opaqueredirect' ||
    response.status === 401 ||
    (response.status >= 300 && response.status < 400) ||
    (response.redirected && new URL(response.url).pathname === '/login')
  ) {
    throw new AppStatisticReadError('appstat.error.signIn', {}, true)
  }
  if (response.status === 403) throw new AppStatisticReadError('appstat.error.forbidden')
  if (!response.ok) {
    throw new AppStatisticReadError(`appstat.error.${subject}.status`, { status: response.status })
  }
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''))
    throw new AppStatisticReadError(`appstat.error.${subject}.unexpected`)
  try {
    return (await response.json()) as T
  } catch (error) {
    if (signal.aborted) throw error
    throw new AppStatisticReadError(`appstat.error.${subject}.invalid`)
  }
}

/**
 * A recorded URL as a link, or null. Referrers are text a visitor's browser or a link supplied, so
 * only an absolute http(s) URL becomes a link; the label is host and path, the full URL its title.
 */
export function externalLink(raw: string | null | undefined): { href: string; label: string } | null {
  if (typeof raw !== 'string' || raw === '') return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  return { href: url.href, label: `${url.host}${url.pathname === '/' ? '' : url.pathname}` }
}

export type AppStatisticView = 'users' | 'downloads' | 'installs' | 'quickstarts'
export type AppStatisticFilter =
  | 'version'
  | 'channel'
  | 'platform'
  | 'source'
  | 'template'
  | 'account'
  | 'attention'

/**
 * The filters each view's records can answer. A quickstart has no app version, channel, OS or
 * install link; a desktop record has no template. Users aggregate accounts, so they have no
 * Linked/Not linked split. A filter outside this list is hidden on that tab and sent neutral.
 */
const VIEW_FILTERS: Record<AppStatisticView, readonly AppStatisticFilter[]> = {
  users: ['version', 'channel', 'platform', 'source', 'attention'],
  downloads: ['version', 'channel', 'platform', 'source'],
  installs: ['version', 'channel', 'platform', 'account', 'attention'],
  quickstarts: ['template', 'source', 'attention']
}
export const appStatisticFilters = (view: AppStatisticView) => VIEW_FILTERS[view]

export interface AppStatisticListState {
  view: AppStatisticView
  days: string
  q: string
  version: string
  channel: string
  platform: string
  source: string
  template: string
  account: string
  attention: boolean
  user: string | null
  sort: string
  direction: string
  page: number
  pageSize: number
  start?: string
  end?: string
}

/** The list URL for one view, carrying only the filters that apply to its records. */
export function appStatisticListUrl(state: AppStatisticListState): string {
  const applies = (filter: AppStatisticFilter) => VIEW_FILTERS[state.view].includes(filter)
  const params = new URLSearchParams({
    view: state.view,
    days: state.days,
    q: state.q,
    version: applies('version') ? state.version : '',
    channel: applies('channel') ? state.channel : '',
    platform: applies('platform') ? state.platform : '',
    source: state.source,
    account: applies('account') ? state.account : 'all',
    attention: applies('attention') && state.attention ? 'needs-attention' : 'all',
    sort: state.sort,
    direction: state.direction,
    page: String(state.page),
    pageSize: String(state.pageSize)
  })
  if (applies('template')) params.set('template', state.template)
  if (state.start && state.end) {
    params.set('start', state.start)
    params.set('end', state.end)
    params.delete('days')
  }
  if (state.view === 'installs') params.delete('source')
  if (state.user && state.view !== 'downloads') params.set('user', state.user)
  return `/api/ops/app-statistic?${params}`
}
export interface AppStatisticSource {
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
}
export interface AppStatisticRow {
  id: string
  userId?: string | null
  email?: string | null
  name?: string | null
  source: AppStatisticSource | null
  versions: string[]
  downloads?: number
  installs: number
  /** Quickstart zip requests admitted by Tracy, not completed downloads. */
  quickstarts?: number
  firstSeen: string | null
  lastSeen: string | null
  /** Latest matching update check from an account-linked app, not an app-open event. */
  lastAppContact?: string | null
  /** Most recent foreground app-open signal; background update checks do not change it. */
  lastOpened?: string | null
  /** Distinct UTC+7 days with a foreground app-open signal in the selected period. */
  daysUsed?: number
  attention: number
  requestedAt?: string | null
  version?: string | null
  channel?: string | null
  platform?: string | null
  arch?: string | null
  file?: string | null
  installId?: string | null
  osVersion?: string | null
  linkedAt?: string | null
  account?: 'linked' | 'unlinked'
  /** Quickstart rows: the release tag `quickstart/<template>/<cms>`, split. */
  template?: string | null
  cms?: string | null
  /** The template's page on joomlart.com — Joomla quickstarts only, never guessed for other CMSs. */
  templateUrl?: string | null
  /** The release on the private releases repository; opening it needs access. */
  releaseUrl?: string | null
  /** The referring page recorded with the request; null before it was recorded or when none was sent. */
  referrer?: string | null
}
export interface AppStatisticPayload {
  readAt: string
  view: AppStatisticView
  days: string | number
  page: number
  pageSize: number
  total: number
  activityAvailable: boolean
  activityMinimumVersion: string
  pages: number
  summary: {
    users?: number
    activeAppUsers: number
    downloads?: number
    installs: number
    quickstarts?: number
    linkedInstalls: number
    unlinkedInstalls: number
  }
  rows: AppStatisticRow[]
  options: {
    versions: string[]
    channels: string[]
    platforms?: string[]
    sources: string[]
    templates?: string[]
  }
  dateField: 'requestedAt' | 'lastSeen'
  analytics: {
    desktopGrowth?: AppStatisticGrowth | null
    previous: AppStatisticPayload['summary'] | null
    daily: AppStatisticDay[]
    previousDaily: AppStatisticDay[]
    range: {
      start: string | null
      end: string
      previousStart: string | null
      previousEnd: string | null
      timeZone: 'Asia/Ho_Chi_Minh'
      partialEnd: boolean
      bucket?: 'hour' | 'day'
      preset?: string
      startAt?: string
      endAt?: string
    }
    dateField: 'requestedAt' | 'lastSeen'
  }
}
export interface AppStatisticDay {
  day: string
  activeAppUsers: number
  users: number
  downloads?: number
  installs: number
  quickstarts: number
  linkedInstalls: number
  unlinkedInstalls: number
}
export interface AppStatisticDetail {
  readAt: string
  view: AppStatisticView
  row: AppStatisticRow
  installs: AppStatisticRow[]
  quickstarts?: AppStatisticRow[]
  activity: {
    id: string | number
    kind: string
    at: string
    siteKey: string | null
    data: Record<string, unknown>
  }[]
  issues: { siteKey: string; at: string; step: string | null; reason: string | null }[]
  truncated?: {
    installs?: boolean
    quickstarts?: boolean
    activity?: boolean
    issues?: boolean
  }
}

/** All counts precede record pagination. Updater state is current; opens are immutable events. */
export interface AppStatisticGrowth {
  unit: 'download requests' | 'app copies'
  distributionTotal: number
  distribution: { dimension: 'platform' | 'version'; label: string; count: number; share: number }[]
  funnel: { copies: number; signedIn: number; opened: number | null }
  openedCopiesOutsideConnections: number | null
  activityCollectionStart: string | null
  newCopies: { day: string; copies: number }[]
  adoption: { day: string; total: number; versions: { version: string; copies: number; share: number }[] }[]
}
