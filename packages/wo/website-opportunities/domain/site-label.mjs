// The site label a demo is built under, from the place's name: the Brief → Build door suggests it,
// and an automatic builder uses the same function.

const CMS_SHORT = Object.freeze({ wordpress: 'wp', joomla: 'j', emdash: 'em' })
const DNS_LABEL_MAX = 63
// Always left free behind the label for a "-NN" from `nextSiteLabel`.
const COUNTER_ROOM = 3
// With the default cap the name part stops at 55.
const NAME_SLACK = 8

function slug(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-')
}

// Dash trimming without a regex: an anchored `-+$` backtracks per position on dash-heavy input.
function trimDashes(text) {
  let start = 0
  let end = text.length
  while (start < end && text[start] === '-') start += 1
  while (end > start && text[end - 1] === '-') end -= 1
  return text.slice(start, end)
}

/**
 * @param {unknown} name the place's name
 * @param {{ cms?: string, suffix?: string, max?: number }} [options]
 * @returns {string} `a-z0-9-` only, at most `max` (63) less room for "-NN"; "site" when the name keeps nothing
 */
export function siteLabelFor(name, { cms, suffix, max = DNS_LABEL_MAX } = {}) {
  const tail = [CMS_SHORT[cms], slug(suffix)]
    .filter(Boolean)
    .map((part) => `-${part}`)
    .join('')
  const room = Math.min(max - NAME_SLACK, max - COUNTER_ROOM - tail.length)
  const head = trimDashes(slug(name).slice(0, room)) || 'site'
  return `${head}${tail}`
}

/**
 * @param {string} base
 * @param {Set<string>} taken
 * @returns {string} `base` when free, else the first free `base-2`, `base-3`…
 */
export function nextSiteLabel(base, taken) {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
