import { tr } from '../i18n'
import { FILTER_KEYS, type FilterKey, type SignalFilters } from './signals-data'

const FILTER_NAME_KEYS: Record<FilterKey, string> = {
  medium: 'beta.filters.channel',
  source: 'beta.filters.source',
  campaign: 'beta.filters.campaign',
  content: 'beta.filters.content',
  cms: 'beta.filters.cms',
  status: 'beta.filters.status'
}

/** Unlinked waitlist and community events cannot inherit a site's acquisition tags. */
export function unaffectedFilterNote(filters: SignalFilters): string | undefined {
  const active = FILTER_KEYS.filter((key) => filters[key]).map((key) => tr(FILTER_NAME_KEYS[key]))
  return active.length ? tr('beta.filters.notAffected', { names: active.join(', ') }) : undefined
}
