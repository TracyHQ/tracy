/**
 * The social links a JA ACM style module keeps in its JSON list parameter (spec TracyHQ/tracy#189, C18): parallel arrays
 * such as `social-intro[font-icon]`, `[title]` and `[link]`, one item per network. The custom-module path of
 * `joomla-plan-identity.js` reads HTML anchors and never sees these, so the template's `#` links and demo accounts stayed.
 *
 * Rule, by structure and never by template: in any list whose items carry a link array and name a network (in the icon
 * class, the title or the link), an item of a network the brief holds a profile for takes that address; any other social item
 * leaves every array of its list. Share links and WhatsApp items are not touched. Pure.
 */

/** Which network a list item is for, from its icon class, title and link. */
const NETWORKS = [
  ['facebook', /facebook|fb\.com/i],
  ['instagram', /instagram/i],
  ['x', /twitter|x\.com|fa-x-twitter/i],
  ['tiktok', /tiktok/i],
  ['youtube', /youtube|youtu\.be/i],
  ['linkedin', /linkedin/i],
  ['pinterest', /pinterest/i],
  ['telegram', /(^|[^a-z])t\.me\/|telegram/i]
]
const SHARE = /sharer|share\?|intent\/tweet|share\.php/i
const LINK_KEY = /\[(?:link|url|href)\]$/i

const networkOf = (/** @type {string} */ text) => {
  if (/wa\.me\/|whatsapp/i.test(text)) return null
  for (const [net, re] of NETWORKS) if (re.test(text)) return net
  return null
}

/**
 * @param {any} node - a parsed JSON value, changed in place
 * @param {Record<string, string>} keep - the brief's profile address by network
 * @param {{ changed: number, left: number }} tally
 */
function walk(node, keep, tally) {
  if (!node || typeof node !== 'object') return
  if (!Array.isArray(node)) {
    const groups = new Map()
    for (const key of Object.keys(node)) {
      const prefix = key.includes('[') ? key.slice(0, key.indexOf('[')) : null
      if (prefix && Array.isArray(node[key])) groups.set(prefix, [...(groups.get(prefix) ?? []), key])
    }
    for (const keys of groups.values()) {
      const linkKey = keys.find((k) => LINK_KEY.test(k))
      if (!linkKey) continue
      const length = node[linkKey].length
      const drop = new Set()
      for (let i = 0; i < length; i += 1) {
        const text = keys.map((k) => (typeof node[k][i] === 'string' ? node[k][i] : '')).join(' ')
        if (SHARE.test(String(node[linkKey][i] ?? ''))) continue
        const net = networkOf(text)
        if (!net) continue
        const own = keep[net]
        if (!own) drop.add(i)
        else if (node[linkKey][i] !== own) {
          node[linkKey][i] = own
          tally.changed += 1
        }
      }
      if (drop.size) {
        for (const k of keys) if (node[k].length === length) node[k] = node[k].filter((_, i) => !drop.has(i))
        tally.changed += drop.size
      }
      tally.left += node[linkKey].length
    }
  }
  for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value, keep, tally)
}

/**
 * A module's parameters with the plan's social decisions applied to its JSON lists.
 * @param {Record<string, any>} params - the module's parsed parameters (not changed)
 * @param {{ keep?: Record<string, string> } | undefined} socials - the site plan's `socials`
 * @returns {{ params: Record<string, any>, changed: number, empty: boolean }} `empty`: the module held social items only
 *   and none is left
 */
export function socialListParams(params, socials) {
  const out = { params, changed: 0, empty: false }
  const raw = params?.['jatools-config']
  if (!socials || typeof raw !== 'string' || !/\[(?:link|url|href)\]/i.test(raw)) return out
  let config
  try {
    config = JSON.parse(raw)
  } catch {
    return out
  }
  const tally = { changed: 0, left: 0 }
  walk(config, socials.keep ?? {}, tally)
  if (tally.changed === 0) return out
  return {
    params: { ...params, 'jatools-config': JSON.stringify(config) },
    changed: tally.changed,
    empty: tally.left === 0
  }
}
