import { signalQuery } from './ops-signal-query.js'

const options = {
  cms: ['all', 'wordpress', 'joomla', 'emdash', 'unknown'],
  audience: ['customers', 'staff', 'all'],
  demo: ['exclude', 'include', 'only']
}

/** Shared UTC+7 date bounds, with one cohort applied to every usage block and text sample. */
export function usageQuery(params, now = Date.now()) {
  const dates = new URLSearchParams(params)
  if (dates.has('from')) dates.set('start', dates.get('from'))
  if (dates.has('to')) dates.set('end', dates.get('to'))
  dates.delete('cms')
  const query = signalQuery(dates, now)
  query.filters = {}
  for (const [key, values] of Object.entries(options)) {
    const value = params.get(key) || values[0]
    if (!values.includes(value)) {
      const error = new Error('INVALID_USAGE_FILTER')
      error.parameter = key
      throw error
    }
    query.filters[key] = value
  }
  query.observedEnd = new Date(Math.min(query.end.getTime(), now + 1))
  query.previousEnd = new Date(query.observedEnd.getTime() - (query.end.getTime() - query.start.getTime()))
  return query
}

export function usageAudience(email, filters, staff) {
  const internal = staff.has(String(email ?? '').toLowerCase())
  return filters.audience === 'all' || (filters.audience === 'staff' ? internal : !internal)
}

/** Unknown history is never silently called a customer site. */
export function usageSite(demo, platform, filters) {
  return (
    (filters.cms === 'all' || (platform || 'unknown') === filters.cms) &&
    (filters.demo === 'include' || (filters.demo === 'only' ? demo === true : demo === false))
  )
}
