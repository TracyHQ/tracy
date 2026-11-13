// The links of written copy (#594, review W6), for the copy guard `page-writer-data-guard.mjs`: a URL with a scheme,
// one that starts with `www.`, or a bare domain with any top level domain of two letters or more ("ventoro.pt"). A
// link is known when its host is the host of a known link or of a known email address, and its path (if it writes one)
// starts a known link of that host. Hosts are compared whole: "loom.com" is not "meadowloom.com". Pure.

const URL_WITH_SCHEME = /\b(?:https?:\/\/|www\.)[^\s,;)]+/giu
/** A bare domain: labels of letters, digits and hyphens, a top level domain of two letters or more. */
const BARE_DOMAIN =
  /(?<![\p{L}\p{N}@._-])(?:[\p{L}\p{N}][\p{L}\p{N}-]*\.)+\p{L}{2,}(?![\p{L}\p{N}@_-])(?:\/[^\s,;)]*)?/giu
const EMAIL_DOMAIN = /@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)/gu

/** A link as `host/path`, lowercase, without its scheme, `www.` and a trailing dot or slash. */
export const linkForm = (text) =>
  String(text)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '')
const hostOf = (form) => form.split('/')[0]

/** Every link `text` writes, in `linkForm`. */
function linksIn(text) {
  const links = []
  const rest = String(text)
    .replace(URL_WITH_SCHEME, (m) => {
      links.push(linkForm(m))
      return ' '
    })
    .replace(BARE_DOMAIN, (m) => {
      links.push(linkForm(m))
      return ' '
    })
  return { links, rest }
}

/**
 * The links of `text` the known values do not hold, and `text` with every link taken out.
 * @param {string} text written copy, its emails already taken out
 * @param {string[]} known every value of the plan data
 * @returns {{invented: string[], rest: string}}
 */
export function inventedLinksOf(text, known) {
  const knownLinks = known.flatMap((k) => linksIn(k).links)
  const hosts = new Set([
    ...knownLinks.map(hostOf),
    ...known.flatMap((k) => [...String(k).matchAll(EMAIL_DOMAIN)].map((m) => m[1].toLowerCase()))
  ])
  const { links, rest } = linksIn(text)
  const invented = links.filter((link) => {
    if (!hosts.has(hostOf(link))) return true
    return link.includes('/') && !knownLinks.some((k) => k.startsWith(link))
  })
  return { invented, rest }
}
