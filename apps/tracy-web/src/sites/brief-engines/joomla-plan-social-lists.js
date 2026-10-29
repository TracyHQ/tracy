/**
 * The social links a JA ACM style module keeps in its JSON list parameter (spec TracyHQ/tracy#189, C18): parallel arrays
 * such as `social-intro[font-icon]`, `[title]` and `[link]`, one item per network. The custom-module path of
 * `joomla-plan-identity.js` reads HTML anchors and never sees these, so the template's `#` links and demo accounts stayed.
 *
 * Rule, by structure and never by template (COO name rule 2 of 29/10/2026): a list whose items carry a link array and name
 * a network (in the icon class, the title or the link) shows only the networks the business really has, each with its
 * real address, then WhatsApp when the brief holds it as a contact channel; the template's own item of a network keeps its
 * icon class, and a network the template has no item for takes a sibling's icon class with only the network's word
 * changed (an icon font class such as `fa fa-facebook`; any other icon mechanism leaves that network out, never a new
 * style). No icon is left without its address.
 *
 * 🔒 THE LIST KEEPS ITS LENGTH (#189). The contract binds every item field by its path (`social-intro[link]`, 3), and a
 * shorter list leaves that path without words: the plugin's inspect then refuses every contract write on the site, and
 * the records guard (`joomla-bound-nodes.js`) holds the whole write, so the demo icons stayed with empty links. So the
 * business's networks move to the front, in place, and the items after them are emptied where they stand. A module that
 * held social items only and is left with none is unpublished: the whole block goes. Share links are not touched. Pure.
 */

/** Which network a list item is for, from its icon class, title and link; WhatsApp is a network here too. */
const NETWORKS = [
  ['whatsapp', /wa\.me\/|whatsapp/i],
  ['facebook', /facebook|fb\.com/i],
  ['instagram', /instagram/i],
  ['x', /twitter|x\.com|fa-x-twitter/i],
  ['tiktok', /tiktok/i],
  ['youtube', /youtube|youtu\.be/i],
  ['linkedin', /linkedin/i],
  ['pinterest', /pinterest/i],
  ['telegram', /(^|[^a-z])t\.me\/|telegram/i]
]
/** The name a visitor reads for each network (the item's title, and the screen reader's). */
export const NETWORK_TITLES = Object.freeze({
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  telegram: 'Telegram'
})
/** The word of each network in an icon font's class (Font Awesome 4 to 6 and their kin). */
const ICON_WORDS = Object.freeze({
  whatsapp: 'whatsapp',
  facebook: 'facebook',
  instagram: 'instagram',
  x: 'twitter',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedin: 'linkedin',
  pinterest: 'pinterest',
  telegram: 'telegram'
})
/** An icon font class naming a network: `fa-facebook`, `fa-facebook-f`, `fa-x-twitter`, `fa-instagram-square`. */
const ICON_NETWORK =
  /\bfa-(?:x-twitter|facebook|instagram|twitter|tiktok|youtube|linkedin|pinterest|telegram|whatsapp)(?:-[a-z]+)?\b/i
const SHARE = /sharer|share\?|intent\/tweet|share\.php/i
const LINK_KEY = /\[(?:link|url|href)\]$/i
const ICON_KEY = /\[(?:[\w-]*icon[\w-]*|class)\]$/i
const TITLE_KEY = /\[(?:title|name|label)\]$/i

export const networkOf = (/** @type {string} */ text) => {
  for (const [net, re] of NETWORKS) if (re.test(text)) return net
  return null
}

/**
 * The networks a list shows, in order: the business's profiles (the template's order first, then the others), then WhatsApp.
 * @param {Record<string, string>} keep @param {string | null} whatsapp @param {string[]} templateOrder
 */
function wantedOf(keep, whatsapp, templateOrder) {
  const own = Object.keys(keep).filter((net) => typeof keep[net] === 'string' && keep[net] !== '')
  const ordered = [
    ...templateOrder.filter((n) => own.includes(n)),
    ...own.filter((n) => !templateOrder.includes(n))
  ]
  const unique = [...new Set(ordered)].filter((n) => n !== 'whatsapp')
  return [
    ...unique.map((net) => ({ net, href: keep[net] })),
    ...(whatsapp ? [{ net: 'whatsapp', href: whatsapp }] : [])
  ]
}

/**
 * @param {any} node - a parsed JSON value, changed in place
 * @param {{ keep: Record<string, string>, whatsapp: string | null }} plan
 * @param {{ changed: number, left: number, social: number }} tally
 */
function walk(node, plan, tally) {
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
      const same = keys.filter((k) => node[k].length === length)
      const iconKey = same.find((k) => ICON_KEY.test(k)) ?? null
      const titleKey = same.find((k) => TITLE_KEY.test(k)) ?? null
      /** @type {Array<{ index: number, net: string, values: Record<string, any> }>} */
      const items = []
      for (let i = 0; i < length; i += 1) {
        const text = same.map((k) => (typeof node[k][i] === 'string' ? node[k][i] : '')).join(' ')
        if (SHARE.test(String(node[linkKey][i] ?? ''))) continue
        const net = networkOf(text)
        if (net) items.push({ index: i, net, values: Object.fromEntries(same.map((k) => [k, node[k][i]])) })
      }
      if (items.length === 0) continue
      tally.social += items.length
      const sample = iconKey
        ? items.map((it) => String(it.values[iconKey] ?? '')).find((c) => ICON_NETWORK.test(c))
        : null
      const wanted = wantedOf(
        plan.keep,
        plan.whatsapp,
        items.map((it) => it.net)
      ).filter(({ net }) => items.some((it) => it.net === net) || (iconKey && sample))
      const slots = items.map((it) => it.index)
      const shown = wanted.slice(0, slots.length)
      const before = JSON.stringify(same.map((k) => node[k]))
      shown.forEach(({ net, href }, j) => {
        const at = slots[j]
        const own = items.find((it) => it.net === net)
        for (const k of same) {
          if (k === linkKey) node[k][at] = href
          else if (own) node[k][at] = own.values[k]
          else if (k === iconKey) node[k][at] = String(sample).replace(ICON_NETWORK, `fa-${ICON_WORDS[net]}`)
          else if (k === titleKey) node[k][at] = NETWORK_TITLES[net]
          else node[k][at] = typeof node[k][at] === 'string' ? '' : node[k][at]
        }
        if (titleKey && own && !own.values[titleKey]) node[titleKey][at] = NETWORK_TITLES[net]
      })
      // The items after the business's networks: emptied where they stand, the list keeps its length.
      for (const at of slots.slice(shown.length))
        for (const k of same) if (typeof node[k][at] === 'string') node[k][at] = ''
      if (JSON.stringify(same.map((k) => node[k])) !== before) tally.changed += 1
      tally.left += shown.length + (length - items.length)
    }
  }
  for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value, plan, tally)
}

/**
 * A module's parameters with the plan's social decisions applied to its JSON lists.
 * @param {Record<string, any>} params - the module's parsed parameters (not changed)
 * @param {{ keep?: Record<string, string>, whatsapp?: string | null } | undefined} socials - the site plan's `socials`
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
  const tally = { changed: 0, left: 0, social: 0 }
  walk(config, { keep: socials.keep ?? {}, whatsapp: socials.whatsapp ?? null }, tally)
  if (tally.changed === 0) return out
  return {
    params: { ...params, 'jatools-config': JSON.stringify(config) },
    changed: tally.changed,
    empty: tally.left === 0
  }
}
