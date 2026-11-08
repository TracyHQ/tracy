// Slots of a site copy that are not plain content slots of the contract door. A setting slot lives in a CMS row the
// page settings stage writes. An icon slot holds a network's name in the copy, while the site holds the icon class in
// the text slot the kit names as its `field`, so the name is turned into that class and written there.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])

/** Every icon of the kit by slot id, with the classes of its list's rows by network name. */
export function iconsOf(kit) {
  const icons = new Map()
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists)) {
      const rowIcons = each(list?.rows).flatMap((row) => each(row?.slots).filter((s) => s?.type === 'icon'))
      const classes = new Map(
        rowIcons.filter((s) => s.network && s.fieldValue).map((s) => [s.network.toLowerCase(), s.fieldValue])
      )
      for (const icon of rowIcons) icons.set(icon.id, { field: icon.field ?? null, classes })
    }
  return icons
}

/**
 * Takes the mapping's changes apart: what stays goes to the contract door as it is, an icon moves to its field, and a
 * slot that cannot go through the door now is set aside with the reason.
 * @param {Record<string, string>} changes
 * @param {object} kit
 * @param {{ slot: string }[]} slots the copy's slots
 * @returns {{ changes: Record<string, string>, routed: Map<string, string>, deferred: Map<string, string> }}
 */
export function routeChanges(changes, kit, slots) {
  const out = { ...changes }
  const routed = new Map()
  const deferred = new Map()
  const settings = new Set(each(kit?.site?.settingSlots).map((s) => s?.id))
  const icons = iconsOf(kit)
  const fields = iconFields(icons)
  for (const { slot } of slots) {
    const key = contentMapKey(slot)
    // The copy filled an icon's field itself: its class is never taken as is, only its network, in the template's own set.
    if (fields.has(key) && looksLikeIconClass(changes[key])) {
      const network = networkOfClass(changes[key])
      const value = network && classOf(fields.get(key), network)
      if (value) out[key] = value
      else {
        delete out[key]
        deferred.set(key, `this template has no icon for "${changes[key]}"`)
      }
      continue
    }
    if (settings.has(slot)) {
      delete out[key]
      deferred.set(key, 'a setting slot: the page settings stage writes it')
      continue
    }
    const icon = icons.get(slot)
    if (!icon) continue
    const name = String(changes[key] ?? '').trim()
    const value = icon.classes.get(name.toLowerCase())
    delete out[key]
    if (icon.field && value) {
      const target = contentMapKey(icon.field)
      out[target] = value
      routed.set(key, target)
    } else
      deferred.set(
        key,
        icon.field ? `this template has no icon for "${name}"` : 'this icon has no slot to write'
      )
  }
  return { changes: out, routed, deferred }
}

/** Whether a value is a list of icon classes (`fa fa-x`, `fa-brands fa-x`, `fab fa-x`), not words. */
const looksLikeIconClass = (value) =>
  typeof value === 'string' &&
  /^(?:[\w-]+\s+)*fa[a-z-]*(?:\s+[\w-]+)*$/i.test(value.trim()) &&
  /(?:^|\s)fa-/i.test(value)

/** Each icon field by content map key, with the classes of its list's rows by network name. */
function iconFields(icons) {
  const fields = new Map()
  for (const { field, classes } of icons.values()) if (field) fields.set(contentMapKey(field), classes)
  return fields
}

/** Network names that differ between icon sets and addresses; the kit names a network by its rows' own word. */
const ALIASES = {
  x: ['x', 'twitter'],
  'x-twitter': ['x', 'twitter'],
  'facebook-f': ['facebook'],
  'linkedin-in': ['linkedin']
}
const classOf = (classes, network) =>
  (ALIASES[network] ?? [network]).map((n) => classes.get(n)).find((v) => typeof v === 'string') ?? null

/** The network an icon class draws (`fa-brands fa-instagram`, `fab fa-x-twitter`), or null. */
export function networkOfClass(value) {
  const found =
    /(?:^|\s)fa-(facebook-f|facebook|instagram|x-twitter|twitter|linkedin-in|linkedin|youtube|tiktok|pinterest|whatsapp|telegram|threads)(?=\s|$)/i.exec(
      String(value ?? '')
    )
  return found ? found[1].toLowerCase() : null
}

const HOSTS = [
  [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)pinterest\.com$/, 'pinterest'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
  [/(^|\.)t\.me$/, 'telegram'],
  [/(^|\.)threads\.net$/, 'threads']
]

/** The network an address is on, or null. */
export function networkOfUrl(url) {
  let host
  try {
    host = new URL(String(url)).hostname.toLowerCase()
  } catch {
    return null
  }
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? null
}

/**
 * A row's icon follows its link (the icon slot `<link>.icon`): when a plan link writes the row's address, the row's icon field
 * takes the template's class for that address's network, so no icon of a kept row is left unowned with the demo's glyph.
 * @param {{ kit: object, links: Record<string, string> }} input `links`: what the link stage writes, by content map key
 * @returns {{ changes: Record<string, string>, owned: string[], unknown: { slot: string, reason: string }[] }}
 */
export function linkIconChanges({ kit, links }) {
  const changes = {}
  const owned = []
  const unknown = []
  for (const [id, { field, classes }] of iconsOf(kit)) {
    const url = field && id.endsWith('.icon') ? links[contentMapKey(id.slice(0, -'.icon'.length))] : null
    if (typeof url !== 'string') continue
    const network = networkOfUrl(url)
    const value = network && classOf(classes, network)
    if (value) {
      changes[contentMapKey(field)] = value
      owned.push(id)
    } else unknown.push({ slot: id, reason: `this template has no icon for the network of ${url}` })
  }
  return { changes, owned, unknown }
}

/** The line of each row icon its link owns: written to the icon field, read back on that field. */
export function iconLinkLines(owned, { written, refused, ordered }) {
  const done = new Set(written)
  return owned.map(({ slot, key }) => ({
    slot,
    key,
    owner: 'plan',
    readBack: null,
    ordered: ordered[key],
    status: done.has(key) ? 'written' : refused.has(key) ? 'failed' : 'skipped',
    reason: done.has(key)
      ? 'the icon follows the network its row now links to, in the template icon set'
      : refused.has(key)
        ? 'the site refused the icon of the network its row now links to'
        : 'the run ended before the icon was written'
  }))
}
