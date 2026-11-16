/**
 * The lines that say what became of each link the owner gave the build chat's research (#609). tracy-web answers one
 * line per link (`apps/tracy-web/src/build-draft/link-reads.js`): its name ("Instagram", "Google Maps", a host name),
 * its state and, once research ended, plain counts. While a research call still runs, the lines are made here from
 * the call's own links, each `reading`. Pure: no React, no DOM.
 *
 * 🔒 A LINK THAT GAVE NOTHING SAYS SO, in its own line. A line names no provider and no error code: its reason is the
 * plain clause tracy-web wrote.
 */

/** The English words of the lines (`tracy-build-chat` namespace; `strings.ts` spreads them into `en`). */
export const LINK_READ_STRINGS = Object.freeze({
  'links.reading': '{name}: reading',
  'links.choice': '{name}: needs your choice',
  'links.failed': '{name}: could not be read',
  'links.failedWhy': '{name}: could not be read ({reason})',
  'links.read': '{name}: read',
  'links.readNothing': '{name}: read, but nothing about the business was found',
  'links.readPicturesLost': '{name}: read, but its pictures could not be downloaded',
  'links.readPicturesNotKept': '{name}: read, but its pictures could not be kept',
  'links.facts.one': '{count} fact',
  'links.facts.other': '{count} facts',
  'links.pictures.one': '{count} picture',
  'links.pictures.other': '{count} pictures',
  'links.pictures.none': 'No pictures',
  'links.pictures.someLost': '{count} more could not be downloaded'
})

const STATES = new Set(['reading', 'choice', 'read', 'failed'])
const PLATFORMS = Object.freeze({
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'fb.com': 'Facebook',
  'tiktok.com': 'TikTok',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube'
})

/** @param {unknown} value */
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
/** @param {unknown} value */
const countOf = (value) => (Number.isInteger(value) && /** @type {number} */ (value) >= 0 ? value : 0)
/** @param {unknown} value */
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The name the owner reads for one link: its platform, "Google Maps", or its host name.
 * @param {string} link
 */
export function linkNameOf(link) {
  let url
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`)
  } catch {
    return link
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const google = /(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps')
  if (google || host === 'maps.app.goo.gl' || host.startsWith('maps.google.') || host === 'g.page')
    return 'Google Maps'
  if (host === 'goo.gl' && url.pathname.startsWith('/maps')) return 'Google Maps'
  return PLATFORMS[host] ?? host
}

/**
 * @typedef {{ name: string, state: 'reading' | 'choice' | 'read' | 'failed', reason?: string, facts?: number,
 *   pictures?: number, picturesLost?: number, picturesNotKept?: boolean }} LinkRead
 */

/**
 * The link lines of a tool answer, checked: a line without a name or a known state is dropped.
 * @param {unknown} value
 * @returns {LinkRead[]}
 */
export function linkReadsOf(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((line) => {
    if (!isObject(line) || !isText(line.name) || !STATES.has(line.state)) return []
    /** @type {LinkRead} */
    const read = { name: line.name, state: line.state }
    if (line.state === 'failed' && isText(line.reason)) read.reason = line.reason
    if (line.state === 'read') {
      read.facts = countOf(line.facts)
      read.pictures = countOf(line.pictures)
      if (countOf(line.picturesLost) > 0) read.picturesLost = countOf(line.picturesLost)
      if (line.picturesNotKept === true) read.picturesNotKept = true
    }
    return [read]
  })
}

/**
 * One `reading` line per link of a research call that still runs.
 * @param {unknown} links
 * @returns {LinkRead[]}
 */
export const readingLinksOf = (links) =>
  (Array.isArray(links) ? links : [])
    .filter(isText)
    .map((link) => ({ name: linkNameOf(link), state: /** @type {const} */ ('reading') }))

/**
 * The words of one line, in the owner's language.
 * @param {LinkRead} line
 * @param {(key: string, vars?: Record<string, string | number>) => string} t
 */
export function linkLineOf(line, t) {
  const name = line.name
  if (line.state === 'reading') return t('links.reading', { name })
  if (line.state === 'choice') return t('links.choice', { name })
  if (line.state === 'failed')
    return line.reason ? t('links.failedWhy', { name, reason: line.reason }) : t('links.failed', { name })
  const facts = line.facts ?? 0
  const pictures = line.pictures ?? 0
  const lost = line.picturesLost ?? 0
  const factPart =
    facts > 0 ? [t(facts === 1 ? 'links.facts.one' : 'links.facts.other', { count: facts })] : []
  if (facts === 0 && pictures === 0 && lost === 0) return t('links.readNothing', { name })
  if (pictures === 0 && lost > 0)
    return [
      t(line.picturesNotKept ? 'links.readPicturesNotKept' : 'links.readPicturesLost', { name }),
      ...factPart
    ].join('. ')
  // Counts run on with a comma ("18 facts, 12 pictures"); "No pictures" is its own sentence.
  const counts =
    pictures === 0
      ? factPart
      : [
          [
            ...factPart,
            t(pictures === 1 ? 'links.pictures.one' : 'links.pictures.other', { count: pictures })
          ].join(', ')
        ]
  return [
    t('links.read', { name }),
    ...counts,
    ...(pictures === 0 ? [t('links.pictures.none')] : []),
    ...(lost > 0 ? [t('links.pictures.someLost', { count: lost })] : [])
  ].join('. ')
}
