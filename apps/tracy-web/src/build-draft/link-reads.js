/**
 * What became of each link the owner gave the build chat's research (#609): one line per link, named by what it is
 * ("Instagram", "Google Maps", or the host name of a web page or listing), with its state and, once the research
 * ended, what came back in plain counts. Made at read time from what the draft already holds: the links of the
 * running step (`engine.inputs.links`) and the research record (`brief.sources`, the needs profile research made from
 * the brief and manifest, `setAside`, `picturesSetAside`). Pure.
 *
 * 🔒 A LINK THAT GAVE NOTHING SAYS SO. A link set aside, a source row that read nothing, a link read with no fact and
 * no picture, and a link whose pictures were all set aside each say it in their own state or counts; nothing is
 * hidden. A reason is a plain clause (`gather-links.js` `SET_ASIDE`), never a provider name or an error code.
 */
import { linkKind, researchOf } from 'website-opportunities/domain'

/** The owner's words for a social platform's link. */
const PLATFORMS = Object.freeze({
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  pinterest: 'Pinterest'
})

/** The research's source names that are Google's (`needs-research.mjs` origins). */
const GOOGLE = new Set(['google', 'google-places', 'google-maps'])
const COLLECTED = new Set(['complete', 'partial'])

/** Said of a link whose source row read nothing and whose link was not set aside with a reason of its own. */
export const UNREAD_REASON = 'the page could not be read'

/** Pictures not stored because the server had no store: said as not kept, never as a failed download. */
const NOT_KEPT = new Set(['this server has no store to keep pictures in', 'the picture could not be kept'])

const list = (value) => (Array.isArray(value) ? value : [])
const sourceIdOf = (name) => (GOOGLE.has(name) ? 'google' : name === 'twitter' ? 'x' : name)

/** The host name of a link, without `www.`; the link itself when it is not a web address. */
function hostOf(link) {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(
      /^www\./,
      ''
    )
  } catch {
    return String(link)
  }
}

/**
 * What one owner link is: the research source it feeds and the name the owner reads.
 * @param {string} link
 * @returns {{source: string | null, name: string}}
 */
export function linkOf(link) {
  const info = linkKind(link)
  if (!info) return { source: null, name: String(link) }
  if (info.kind === 'google') return { source: 'google', name: 'Google Maps' }
  if (PLATFORMS[info.kind]) return { source: info.kind, name: PLATFORMS[info.kind] }
  return { source: info.kind === 'listing' ? 'listing' : 'website', name: hostOf(info.url) }
}

/** One line per link, all in the same state (`reading` while research runs). */
export function linkStatesOf(links, state = 'reading') {
  return list(links)
    .filter((l) => typeof l === 'string' && l.trim() !== '')
    .map((link) => ({ link, name: linkOf(link).name, state }))
}

/** How many facts a needs profile research source holds: each field value and each line of its own words. */
function factsOf(source) {
  const fields = Object.values(source?.fields ?? {}).reduce(
    (n, v) => n + (Array.isArray(v) ? v.length : 1),
    0
  )
  const text = typeof source?.text === 'string' ? source.text.split('\n').filter((l) => l.trim()).length : 0
  return fields + text
}

/**
 * The line of each owner link once the research ended, from the research record.
 * @param {object | null} research the draft's research record (`engine-steps.js` `researchStep`)
 */
export function linkReadsOf(research) {
  if (!research?.brief) return []
  let read = { sources: [], setAside: [] }
  try {
    read = researchOf(research.brief, { manifest: list(research.manifest) })
  } catch {
    read = { sources: [], setAside: [] }
  }
  return linkReadsFrom({
    links: research.links,
    rows: research.brief.sources,
    sources: read.sources,
    setAside: research.setAside,
    picturesSetAside: research.picturesSetAside,
    picturesNotUsed: list(read.setAside).filter((p) => p?.what === 'picture' && p.kind === 'image')
  })
}

/**
 * The line of each owner link from the parts of a research record.
 *
 * 🔒 FOUND IS NOT USABLE. `pictures` counts the pictures the site may use (the business's own, `researchOf`);
 * `picturesFound` counts every picture the link gave, the ones research set aside too (`picturesNotUsed`), and
 * `picturesNotOwn` says none was usable only because the business did not post them. A link that gave nine pictures
 * posted by others never reads "No pictures".
 * @param {{links: string[], rows?: object[], sources?: object[], setAside?: object[], picturesSetAside?: object[],
 *   picturesNotUsed?: object[]}} input `rows`: the brief's source rows (`brief.sources`); `sources`: the needs profile
 *   research sources (`researchOf`); `picturesNotUsed`: the pictures research set aside, each with its source
 * @returns {Array<{link: string, name: string, state: 'read' | 'failed', reason?: string, facts?: number,
 *   pictures?: number, picturesFound?: number, picturesNotOwn?: boolean, picturesLost?: number,
 *   picturesNotKept?: boolean}>}
 */
export function linkReadsFrom({ links, rows, sources, setAside, picturesSetAside, picturesNotUsed }) {
  return linkStatesOf(links, 'read').map((line) => {
    const { source } = linkOf(line.link)
    const aside = list(setAside).find((a) => a?.link === line.link)
    if (aside) return { ...line, state: 'failed', reason: aside.reason || UNREAD_REASON }
    const row = list(rows).find((r) => sourceIdOf(r?.source) === source)
    if (row && !COLLECTED.has(row.status)) return { ...line, state: 'failed', reason: UNREAD_REASON }
    const read = list(sources).find((s) => s?.id === source)
    const lost = list(picturesSetAside).filter((p) => sourceIdOf(p?.source) === source)
    const pictures = list(read?.pictures).length
    const notUsed = list(picturesNotUsed).filter((p) => sourceIdOf(p?.source) === source)
    return {
      ...line,
      facts: factsOf(read),
      pictures,
      ...(notUsed.length ? { picturesFound: pictures + notUsed.length } : {}),
      ...(notUsed.length && pictures === 0 && notUsed.every((p) => p.notOwn === true)
        ? { picturesNotOwn: true }
        : {}),
      ...(lost.length ? { picturesLost: lost.length } : {}),
      ...(lost.length && lost.every((p) => NOT_KEPT.has(p.reason)) ? { picturesNotKept: true } : {})
    }
  })
}

/**
 * The lines while the research waits on the owner's choice of place: the Google link needs the choice, the others
 * are read once it is made.
 */
export function linkChoiceOf(links) {
  return linkStatesOf(links).map((line) =>
    linkOf(line.link).source === 'google' ? { ...line, state: 'choice' } : line
  )
}
