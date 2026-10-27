/** Derived numbers require an explicit semantic role, never a translated heading guess. */
export function quickstartDerivedCount(source, slot) {
  let value
  try {
    value = JSON.parse(source.value)
  } catch {
    return null
  }
  if (slot.semanticRole === 'open-days' && source.type === 'opening-hours') {
    const days = weeklyCoverage(value)
    if (!days) return null
    return { number: days.size, rule: 'weekly-open-days/3', sourceId: source.id }
  }
  if (
    ['social-profiles', 'social-networks'].includes(slot.semanticRole) &&
    source.id === 'business.socials'
  ) {
    const entries = Array.isArray(value) ? value.map((v) => [v.network, v.url]) : Object.entries(value ?? {})
    if (!entries.length) return null
    const profiles = new Set(),
      networks = new Set()
    for (const [network, raw] of entries) {
      let url
      try {
        url = new URL(raw)
      } catch {
        return null
      }
      if (
        url.protocol !== 'https:' ||
        !url.pathname.replaceAll('/', '') ||
        /\/(?:share|sharer|search|intent|login)(?:[/.]|$)/i.test(url.pathname)
      )
        return null
      profiles.add(url.href.replace(/\/$/, ''))
      networks.add(network || url.hostname)
    }
    return {
      number: slot.semanticRole === 'social-networks' ? networks.size : profiles.size,
      rule: 'business-social-profiles/2',
      sourceId: source.id
    }
  }
  return null
}

/** Count local weekdays with at least one open minute, including overnight and continuous periods. */
function weeklyCoverage(value) {
  const days = new Set()
  const add = (start, end) => {
    for (let day = Math.floor(start / 1440); day <= Math.floor((end - 1) / 1440); day++) days.add(day % 7)
  }
  if (Array.isArray(value)) {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      seen = new Set()
    if (value.length !== 7) return null
    const time = (text) => {
      const m = text.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
      if (!m) return null
      let hour = Number(m[1])
      const minute = Number(m[2])
      if (minute > 59 || (m[3] ? hour < 1 || hour > 12 : hour > 23)) return null
      if (m[3]) hour = (hour % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)
      return hour * 60 + minute
    }
    for (const line of value) {
      if (typeof line !== 'string') return null
      const m = line.normalize('NFKC').match(/^([A-Za-z]+):\s*(.*)$/)
      const day = m ? names.indexOf(m[1].toLowerCase()) : -1
      if (day < 0 || seen.has(day)) return null
      seen.add(day)
      if (/^closed$/i.test(m[2].trim())) continue
      if (/^open 24 hours$/i.test(m[2].trim())) {
        add(day * 1440, (day + 1) * 1440)
        continue
      }
      for (const period of m[2].split(',')) {
        const pair = period.trim().split(/\s*[–—-]\s*/)
        if (pair.length !== 2) return null
        const start = time(pair[0]),
          end = time(pair[1])
        if (start === null || end === null || start === end) return null
        add(day * 1440 + start, day * 1440 + end + (end < start ? 1440 : 0))
      }
    }
    return days
  }
  const periods = value?.periods
  if (!Array.isArray(periods) || !periods.length) return null
  const minute = (point) =>
    point &&
    Number.isInteger(point.day) &&
    point.day >= 0 &&
    point.day <= 6 &&
    Number.isInteger(point.hour) &&
    point.hour >= 0 &&
    point.hour <= 23 &&
    Number.isInteger(point.minute ?? 0) &&
    (point.minute ?? 0) >= 0 &&
    (point.minute ?? 0) <= 59
      ? point.day * 1440 + point.hour * 60 + (point.minute ?? 0)
      : null
  for (const period of periods) {
    const start = minute(period.open)
    if (start === null) return null
    if (!period.close) {
      if (periods.length !== 1 || start !== 0) return null
      add(0, 7 * 1440)
      continue
    }
    let end = minute(period.close)
    if (end === null || end === start) return null
    if (end < start) end += 7 * 1440
    add(start, end)
  }
  return days
}
