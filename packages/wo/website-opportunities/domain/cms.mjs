export const CMS = Object.freeze(['joomla', 'wordpress', 'emdash'])
export const DEFAULT_CMS = 'joomla'

export function parseCms(x) {
  if (typeof x !== 'string') return null
  const v = x.trim().toLowerCase()
  return CMS.includes(v) ? v : null
}

function toDate(now) {
  const d = typeof now === 'function' ? now() : now
  return d instanceof Date ? d : new Date(d ?? Date.now())
}

// `pref` is the account preference row ({cms}) or null; `now` is a Date, a timestamp or a clock function.
export function resolveCms(pref, now) {
  const resolvedAt = toDate(now).toISOString()
  const cms = parseCms(pref?.cms)
  return cms
    ? { cms, cmsSource: 'account', resolvedAt }
    : { cms: DEFAULT_CMS, cmsSource: 'default', resolvedAt }
}
