import type { AppStatisticListState, AppStatisticView } from './app-statistic-api'

export interface AppStatisticState extends AppStatisticListState {
  compare: boolean
  selected: string | null
}
/** View navigation and Reset include table defaults, so scope keys take precedence over sort keys. */
export function shouldResetAppStatisticDaily(patch: Partial<AppStatisticState>, resetPage = true) {
  return (
    resetPage &&
    [
      'view',
      'days',
      'q',
      'version',
      'channel',
      'platform',
      'source',
      'template',
      'account',
      'attention',
      'user',
      'start',
      'end',
      'compare'
    ].some((key) => key in patch)
  )
}
export const defaultAppStatisticState: AppStatisticState = {
  view: 'users',
  days: '7',
  q: '',
  version: '',
  channel: '',
  platform: '',
  source: '',
  template: '',
  account: 'all',
  attention: false,
  user: null,
  sort: 'lastAppContact',
  direction: 'desc',
  page: 1,
  pageSize: 10,
  compare: true,
  selected: null,
  start: '',
  end: ''
}
const textKeys = [
  'days',
  'q',
  'version',
  'channel',
  'platform',
  'source',
  'template',
  'account',
  'sort',
  'direction',
  'start',
  'end'
] as const
export function readAppStatisticState(
  initialView: AppStatisticView = 'users',
  initialSelection: string | null = null
): AppStatisticState {
  const params = new URLSearchParams(window.location.search)
  const state = { ...defaultAppStatisticState, view: initialView, selected: initialSelection }
  for (const key of textKeys) if (params.has(key)) state[key] = params.get(key) || ''
  const view = params.get('view')
  if (['users', 'downloads', 'installs', 'quickstarts'].includes(view ?? ''))
    state.view = view as AppStatisticView
  if (!params.has('sort')) state.sort = state.view === 'users' ? 'lastAppContact' : 'time'
  if (state.start || state.end) state.days = 'custom'
  state.attention = params.get('attention') === 'needs-attention'
  state.compare = params.get('compare') !== 'false'
  state.user = params.get('user')
  state.selected = params.get('record') ?? initialSelection
  const page = Number(params.get('page')),
    size = Number(params.get('pageSize'))
  state.page = Number.isSafeInteger(page) && page > 0 ? page : 1
  state.pageSize = [10, 25, 50, 100].includes(size) ? size : 10
  return state
}
export function saveAppStatisticState(state: AppStatisticState, resetDaily = false) {
  const url = new URL(window.location.href)
  for (const key of textKeys) {
    const value = state[key]
    if (value && !(key === 'days' && state.days === 'custom')) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  url.searchParams.set('view', state.view)
  url.searchParams.set('page', String(state.page))
  url.searchParams.set('pageSize', String(state.pageSize))
  url.searchParams.set('compare', String(state.compare))
  if (resetDaily)
    for (const id of [
      'app-daily',
      'app-funnel',
      'app-platform',
      'app-version',
      'app-new-copies',
      'app-adoption'
    ])
      url.searchParams.set(`signals_${id}_page`, '1')
  for (const [key, value] of [
    ['attention', state.attention ? 'needs-attention' : ''],
    ['user', state.user],
    ['record', state.selected]
  ] as const) {
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  if (url.href !== window.location.href) window.history.pushState(null, '', url)
}
