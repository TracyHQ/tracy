// Opening hours as two sources write them — schema.org (`Mo-Su 07:00-21:00`, `Monday,Tuesday 09:00:00-17:00:00`)
// and Google's weekday lines (`Monday: 11:00 AM – 2:00 PM, 5:00 – 10:00 PM`) — read into one week, so two
// sources can be compared. A line that cannot be read makes the whole list unreadable: no verdict, never a guess.

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
const DAY_NAMES = {
  monday: 'mo',
  tuesday: 'tu',
  wednesday: 'we',
  thursday: 'th',
  friday: 'fr',
  saturday: 'sa',
  sunday: 'su'
}

function dayOf(token) {
  const t = token.trim().toLowerCase()
  if (DAY_NAMES[t]) return DAY_NAMES[t]
  return DAYS.includes(t) ? t : null
}

/** `Mo-Fr,Su` → ['mo','tu','we','th','fr','su'], or null. */
function daysOf(spec) {
  const out = []
  for (const part of spec.split(',')) {
    if (!part.trim()) continue
    const [a, b] = part.split('-')
    const from = dayOf(a ?? '')
    if (!from) return null
    if (b === undefined) {
      out.push(from)
      continue
    }
    const to = dayOf(b)
    if (!to) return null
    for (let i = DAYS.indexOf(from); ; i = (i + 1) % 7) {
      out.push(DAYS[i])
      if (DAYS[i] === to) break
    }
  }
  return out.length ? out : null
}

/** `9:00`, `09:00:00`, with an optional AM/PM → minutes, or null. */
function minutesOf(clock, meridiem) {
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/.exec(clock)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (min > 59 || h > 24) return null
  if (meridiem) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (meridiem === 'pm' ? 12 : 0)
  }
  return h * 60 + min
}

/** `5:00 – 10:00 PM` → '1020-1320'; the start inherits the end's AM/PM when it has none, as Google writes it. */
function rangeOf(text) {
  const m = /^(\S+?)\s*(am|pm)?\s*[-–—]\s*(\S+?)\s*(am|pm)?$/i.exec(text.trim())
  if (!m) return null
  const endMer = m[4]?.toLowerCase()
  const startMer = m[2]?.toLowerCase() ?? endMer
  const start = minutesOf(m[1], startMer)
  let end = minutesOf(m[3], endMer)
  if (start === null || end === null) return null
  if (end === 0 || end === 1439) end = 1440
  return `${start}-${end}`
}

/**
 * The week a list of hours lines states: day → its ranges ('closed' when said so). Days no line names stay
 * unknown. Null when any line cannot be read.
 * @param {string[]} lines
 * @returns {Map<string, string> | null}
 */
export function weekOf(lines) {
  if (!Array.isArray(lines) || !lines.length) return null
  const week = new Map()
  for (const raw of lines) {
    if (typeof raw !== 'string') return null
    const line = raw.replace(/[   ]/g, ' ').trim()
    // Google: "Monday: …"; schema.org: "Mo-Fr 09:00-17:00".
    const m = /^([A-Za-z][A-Za-z,\- ]*?)(?::\s*|\s+)(.+)$/.exec(line)
    if (!m) return null
    const days = daysOf(m[1].replace(/\s+/g, ''))
    if (!days) return null
    const body = m[2].trim().toLowerCase()
    let value
    if (body === 'closed') value = 'closed'
    else if (body === 'open 24 hours') value = '0-1440'
    else {
      const ranges = body.split(',').map(rangeOf)
      if (ranges.some((r) => r === null)) return null
      value = ranges.sort().join(',')
    }
    for (const d of days) week.set(d, week.has(d) ? [week.get(d), value].sort().join(',') : value)
  }
  return week
}

/** True only when both lists can be read and a day both name has different hours. */
export function hoursDisagree(a, b) {
  const wa = weekOf(a)
  const wb = weekOf(b)
  if (!wa || !wb) return false
  for (const [day, value] of wa) if (wb.has(day) && wb.get(day) !== value) return true
  return false
}
