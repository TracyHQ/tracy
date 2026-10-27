/**
 * Format a future timestamp as a relative remaining duration down to the minute.
 * Supports en and zh.
 */

export const RELATIVE_UNITS = {
  en: {
    soon: 'just now',
    prefix: 'in ',
    suffix: '',
    minute: '{n}m',
    hour: '{n}h',
    day: '{n}d',
  },
  zh: {
    soon: '刚刚',
    prefix: '',
    suffix: '后',
    minute: '{n}分',
    hour: '{n}小时',
    day: '{n}天',
  },
}

function fill(template, n) {
  return String(template).replace('{n}', String(n))
}

/**
 * @param {number} resetAt epoch ms of the quota window reset
 * @param {string} [lang]
 * @param {number} [now]
 * @returns {string} human-readable remaining time, down to the minute
 */
export function formatRelativeReset(resetAt, lang = 'en', now = Date.now()) {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return ''
  const delta = resetAt - now
  const units = RELATIVE_UNITS[lang] || RELATIVE_UNITS.en
  if (delta <= 0) return units.soon

  const totalMinutes = Math.max(1, Math.round(delta / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  const bits = []
  if (days) bits.push(fill(units.day, days))
  if (hours) bits.push(fill(units.hour, hours))
  if (minutes || bits.length === 0) bits.push(fill(units.minute, minutes))

  const durationStr = bits.join(' ')
  return `${units.prefix}${durationStr}${units.suffix}`.trim()
}
