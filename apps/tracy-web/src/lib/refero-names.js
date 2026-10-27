/**
 * Distinct display names for the offered Refero systems (12/10/2026). The catalogue gives
 * several systems the same name ("Apple" six times, "Coda" twice); the library would show them as
 * look-alike cards. A name only one offered system has is left alone. Each name several share gets
 * " · <suffix>" from the source data, the first step that tells them apart:
 *
 * 1. the page, when another system of the group is on the same site ("Apple · iPhone 18 Pro"); a
 *    home page names its domain instead ("Apple · apple.com");
 * 2. the domain without www, when the site is its own in the group ("Coda · coda.io");
 * 3. the theme, when two still read the same (same site and page: "Spotify · Dark");
 * 4. a number, " 2", " 3", in id order, when even that collides (and against any other name).
 *
 * Pure; the library (`ds-slot.js` `referoLibrary`) calls it once, so every door, list, change row
 * and worn name reads the same name.
 */

/** Words whose casing a title-case would break. */
const BRAND_CASE = new Map(
  Object.entries({
    iphone: 'iPhone',
    ipad: 'iPad',
    imac: 'iMac',
    ipod: 'iPod',
    airpods: 'AirPods',
    airtag: 'AirTag',
    macbook: 'MacBook',
    homepod: 'HomePod',
    ios: 'iOS',
    ipados: 'iPadOS',
    macos: 'macOS',
    watchos: 'watchOS',
    tv: 'TV',
    se: 'SE',
    ai: 'AI',
    ui: 'UI',
    api: 'API'
  })
)

/** The site's host, lower case, without a leading `www.`; null when the address does not parse. */
export function domainOf(/** @type {unknown} */ url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * The page an address points at, for people: its last path segment split on '-', each word
 * title-cased (brand words keep their casing, numbers stay). Null for a home page or a bad address.
 */
export function pageLabelOf(/** @type {unknown} */ url) {
  let segment
  try {
    segment = new URL(String(url)).pathname.split('/').filter(Boolean).pop()
  } catch {
    return null
  }
  if (!segment) return null
  try {
    segment = decodeURIComponent(segment)
  } catch {}
  const words = segment.split(/[-_]+/).filter(Boolean)
  if (words.length === 0) return null
  return words.map((w) => BRAND_CASE.get(w.toLowerCase()) ?? w[0].toUpperCase() + w.slice(1)).join(' ')
}

const themeLabelOf = (/** @type {unknown} */ theme) =>
  typeof theme === 'string' && theme ? theme[0].toUpperCase() + theme.slice(1) : null

/** Group items by a key, keeping input order. */
function groupBy(items, keyOf) {
  const out = new Map()
  for (const item of items) {
    const k = keyOf(item)
    if (!out.has(k)) out.set(k, [])
    out.get(k).push(item)
  }
  return out
}

const byUuid = (a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0)

/**
 * The display name of each offered system, by uuid.
 * @param {{ uuid: string, name: string, sourceWebsite?: unknown, theme?: unknown }[]} rows
 * @returns {Map<string, string>}
 */
export function distinctReferoNames(rows) {
  /** @type {Map<string, string | null>} uuid -> suffix (null: the base name as it is). */
  const suffix = new Map(rows.map((r) => [r.uuid, null]))
  for (const group of groupBy(rows, (r) => r.name).values()) {
    if (group.length < 2) continue
    const domain = new Map(group.map((r) => [r.uuid, domainOf(r.sourceWebsite)]))
    const sameSite = (r) =>
      group.some((o) => o !== r && domain.get(o.uuid) && domain.get(o.uuid) === domain.get(r.uuid))
    // Steps 1 and 2: the page when the site is shared within the group, else the domain.
    for (const r of group) {
      const label = (sameSite(r) && pageLabelOf(r.sourceWebsite)) || domain.get(r.uuid)
      suffix.set(r.uuid, label)
    }
    // Step 3: those that still read the same take their theme.
    for (const same of groupBy(group, (r) => suffix.get(r.uuid)).values()) {
      if (same.length < 2) continue
      for (const r of same) suffix.set(r.uuid, themeLabelOf(r.theme) ?? suffix.get(r.uuid))
    }
  }
  const wanted = new Map(
    rows.map((r) => {
      const s = suffix.get(r.uuid)
      return [r.uuid, s ? `${r.name} · ${s}` : r.name]
    })
  )
  // Step 4: a number for whatever still collides. A name left as it is claims its name first, then
  // the renamed ones in id order; the first of a kind keeps the bare name.
  const order = [...rows].sort(
    (a, b) => (suffix.get(a.uuid) === null ? 0 : 1) - (suffix.get(b.uuid) === null ? 0 : 1) || byUuid(a, b)
  )
  const used = new Set()
  const out = new Map()
  for (const r of order) {
    const base = /** @type {string} */ (wanted.get(r.uuid))
    let name = base
    for (let n = 2; used.has(name); n++) name = `${base} ${n}`
    used.add(name)
    out.set(r.uuid, name)
  }
  return out
}
