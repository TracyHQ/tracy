/**
 * The research step that turns a place's menu links into `profile.menuItems` (shared research
 * contract §5): the WO domain's `readMenus` with this app's PDF reader. Menu photos are read by
 * `menu-photo-reading.js` (only when a vision model is assigned); `mergeMenuItems` below is the ONE place where the
 * items of every source meet, and it decides which source's dish and price win.
 */
import { tradeOfPlace, tradeOfSchemaType } from '../domain/trades.mjs'
import { pdfTextPages } from './menu-pdf-text.js'

/** The research part that reads a place's menu files and pages (`document-text`), and the rule it reads them by. */
export const MENU_FILE_PART = 'menu-file'
export const MENU_FILE_VERSION = 'menu-file-1'

/** What Google Place Details says only of a place that serves food or drink. */
const SERVES = [
  'servesBreakfast',
  'servesBrunch',
  'servesLunch',
  'servesDinner',
  'servesBeer',
  'servesWine',
  'servesCocktails',
  'servesCoffee',
  'servesDessert',
  'servesVegetarianFood',
  'dineIn'
]

/**
 * Whether a place has a Menu: a food or drink business (`domain/trades.mjs` `food`, by Google's types, else the
 * website's schema.org type, else what Google says it serves, else a menu link, else Google listing menu photos), or any place whose
 * research already holds real dishes (a hotel with a restaurant). Other places have no menu parts: never due, never
 * paid for, never in Research again.
 * @param {{google?: any, profile?: any, items?: any[], menuPhotos?: number}} input
 */
export function menuApplicable({ google = null, profile = null, items = [], menuPhotos = 0 } = {}) {
  if ((items ?? []).length > 0) return true
  if (
    google &&
    tradeOfPlace({ primaryType: google.primaryType ?? null, types: google.types ?? null }) === 'food'
  )
    return true
  if (profile?.businessType && tradeOfSchemaType(profile.businessType) === 'food') return true
  // Place Details facts keep these under `amenities` (`placeFactsFromDetails`).
  if (google && SERVES.some((k) => google.amenities?.[k] === true || google[k] === true)) return true
  // Its own website (or a search) links a menu: Place Details does not name the place's types.
  if ((profile?.menus ?? []).length > 0) return true
  return menuPhotos > 0
}

/**
 * Source rank, best first (decided 23/10/2026): the place's own website (a menu page or PDF read from its site), then a link a
 * web search found, then a photo (it can be old). `searched` = the urls of menu links found by search.
 */
const rankOf = (item, searched) =>
  item?.source?.kind === 'photo' ? 2 : searched.has(item?.source?.url) ? 1 : 0

const PRICES_DIFFER = 'prices differ between sources'

/**
 * A dish's name as compared across sources: lower case, accents and punctuation gone, `&` = `and`, text in brackets
 * (allergen codes such as `(D)(G)`) dropped, and each word of 4+ letters reduced to its singular by a few English
 * rules (`ies`→`y`, `ches/shes/xes/zes/oes`→ without `es`, a final `s` unless `ss`/`us`/`is`).
 * ⚠ LIMITS: it does not match a translation, an abbreviation, another word order or a typo; two dishes that differ only
 * by such a thing stay two dishes (a duplicate is better than two dishes merged into one).
 */
export function dishKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular)
    .join(' ')
}

function singular(word) {
  if (word.length < 4) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(ch|sh|x|z|o)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1)
  return word
}

/**
 * A printed price as a number to compare (`74`, `74.00`, `AED 74` equal; `65.000` and `65,000` are 65000, `12,50` is
 * 12.5), or null when it holds no number. The printed number, not yet scaled (`amountOf`).
 */
export function priceNumber(price) {
  const printed = String(price ?? '').replace(/[^\d.,]/g, '')
  const digits = /^\d{1,3}(?:[.,]\d{3})+$/.test(printed)
    ? printed.replace(/[.,]/g, '')
    : printed.replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '')
  const n = Number(digits)
  return digits && Number.isFinite(n) ? n : null
}

/** The digits a currency's amounts carry after the decimal (ISO 4217 through `Intl`: VND 0, EUR 2, KWD 3); null when not a code. */
export function currencyMinorDigits(code) {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return null
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits
  } catch {
    return null
  }
}

/** A printed number's digit groups and the separators (`.` or `,`) between them, in order. */
const separatorsOf = (s) => ({ groups: s.split(/[.,]/), seps: s.replace(/\d/g, '') })

/**
 * What the menu's other printed prices say of `sep`: `thousands` where it repeats ("1.250.000") or comes before the other
 * separator ("1.234,50"); `decimal` where it is the last one and cannot group thousands ("0.750", "12.5").
 */
function separatorEvidence(sep, menu) {
  const found = { thousands: false, decimal: false }
  for (const printed of menu) {
    const { groups, seps } = separatorsOf(printed)
    if (!seps.includes(sep)) continue
    if (seps.split(sep).length > 2 || seps.at(-1) !== sep) found.thousands = true
    else if (groups.at(-1).length !== 3 || groups.at(-2) === '0' || groups.at(-2).length > 3)
      found.decimal = true
  }
  return found
}

/** `whole.fraction`; three decimals lose their trailing zeros so the value never reads as a thousands group ("0.750" → "0.75"). */
const decimal = (whole, fraction) =>
  fraction.length === 3
    ? `${whole}.${fraction.replace(/0+$/, '') || '0'}`.replace(/\.0$/, '')
    : `${whole}.${fraction}`

/**
 * A printed price (digits with `.`/`,`, no suffix: `printedPrice`) as a plain decimal string: no thousands separator, `.`
 * for the decimal ("1.700" → "1700" where the dot groups thousands, "1.234,50" → "1234.50", "17.00" stays). One separator
 * before exactly three digits is the ambiguous case, resolved by the menu's other prices (`menu`), else by the currency's
 * minor units (`minorDigits` 2 or fewer: three digits after it cannot be decimals). Null when nothing settles it.
 */
export function plainPrice(printed, { minorDigits = null, menu = [] } = {}) {
  const s = String(printed ?? '')
  if (/^\d+$/.test(s)) return s
  if (!/^\d[\d.,]*\d$/.test(s)) return null
  const { groups, seps } = separatorsOf(s)
  const grouped = (parts) => /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((g) => g.length === 3)
  const last = seps.at(-1)
  if (seps.includes('.') && seps.includes(',')) {
    // The last separator is the decimal, once; the other groups thousands before it.
    if (seps.indexOf(last) !== seps.length - 1 || !grouped(groups.slice(0, -1))) return null
    return decimal(groups.slice(0, -1).join(''), groups.at(-1))
  }
  if (seps.length > 1) return grouped(groups) ? groups.join('') : null
  const [whole, fraction] = groups
  if (fraction.length !== 3 || whole === '0' || whole.length > 3) return decimal(whole, fraction)
  const evidence = separatorEvidence(
    last,
    menu.filter((p) => p !== s)
  )
  const noThreeDecimals = minorDigits !== null && minorDigits <= 2
  if (evidence.thousands && !evidence.decimal) return `${whole}${fraction}`
  if (evidence.decimal && !evidence.thousands && !noThreeDecimals) return decimal(whole, fraction)
  if (!evidence.decimal && !evidence.thousands && noThreeDecimals) return `${whole}${fraction}`
  return null
}

/** What an item's price is worth: the printed number times its `priceScale` (a menu printing thousands); null without one. */
const amountOf = (item) => {
  const n = priceNumber(item?.price)
  return n === null ? null : n * (item?.priceScale ?? 1)
}

const postedAt = (item) => {
  const t = Date.parse(item?.source?.postedAt ?? '')
  return Number.isFinite(t) ? t : null
}

/**
 * One dish read several times at one rank, one size of it: its rows, never a silently chosen price. One source printing
 * several prices (a 25ml and a 50ml the reader could not label) keeps a row per price; different sources that disagree
 * leave one row with no price and `priceConflict`.
 */
function settleReadings(list) {
  const priced = list.filter((i) => amountOf(i) !== null)
  if (priced.length === 0) return [list[0]]
  if (new Set(priced.map(amountOf)).size === 1) {
    // Same price on every reading that has one: the newest of them speaks, else the first.
    return [[...priced].sort((a, b) => (postedAt(b) ?? -1) - (postedAt(a) ?? -1))[0]]
  }
  if (priced.every((i) => i.source?.url) && new Set(priced.map((i) => i.source.url)).size === 1)
    return priced.filter((i, n) => priced.findIndex((x) => amountOf(x) === amountOf(i)) === n)
  const dates = priced.map(postedAt)
  if (dates.every((t) => t !== null)) {
    const newest = Math.max(...dates)
    const holders = priced.filter((i) => postedAt(i) === newest)
    if (holders.length === 1 || new Set(holders.map(amountOf)).size === 1)
      return [withOtherPrices(holders[0], priced)]
  }
  // Dates unknown or equal and the sources disagree: no price, flagged, every printed price kept beside it.
  return [
    withOtherPrices(
      {
        ...priced[0],
        price: null,
        currency: null,
        priceScale: undefined,
        priceConflict: true,
        priceNote: PRICES_DIFFER
      },
      priced
    )
  ]
}

/** The other prices photos printed for a dish, each with the photo it came from (`otherPrices`) and its scale; only photo readings. */
function withOtherPrices(item, priced) {
  const kept = amountOf(item)
  const others = []
  for (const i of priced) {
    const n = amountOf(i)
    if (i.source?.kind !== 'photo' || n === kept || others.some((o) => amountOf(o) === n)) continue
    others.push({
      price: i.price,
      mediaId: i.source.mediaId ?? i.source.region ?? null,
      ...(i.priceScale ? { priceScale: i.priceScale } : {})
    })
  }
  return others.length ? { ...item, otherPrices: others } : item
}

/**
 * Every source's items → the list the profile carries. A dish is matched by `dishKey`. Per dish the best-ranked source
 * alone speaks and lower-ranked readings of the same dish are dropped, so a photo never overrides a website's name or price.
 * Readings of one rank settle by `settleReadings`, per size (and, for a link, per printed section): one price, or none and
 * `priceConflict` when they disagree. Only the website's own reading can stay `verified`. Dishes come out grouped by
 * section in the order the sections first appear, as on the menu. The ONE producer of the merged menu: the profile, the
 * build agent's `menu` part (`agent-demo.js`) and the fixed fill all read its output.
 * @param {any[]} items @param {{searched?: Set<string>}} [options]
 */
export function mergeMenuItems(items, { searched = new Set() } = {}) {
  const dishes = new Map()
  for (const item of items ?? []) {
    const key = dishKey(item?.name)
    if (!key) continue
    const rank = rankOf(item, searched)
    const dish = dishes.get(key) ?? { best: rank, items: [] }
    dish.best = Math.min(dish.best, rank)
    dish.items.push({ item, rank })
    dishes.set(key, dish)
  }
  const out = []
  for (const dish of dishes.values()) {
    const kept = dish.items.filter((x) => x.rank === dish.best).map((x) => x.item)
    const groups = new Map()
    for (const item of kept) {
      const key = `${dishKey(item.size)}\n${dish.best < 2 ? dishKey(item.section) : ''}`
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    for (const group of groups.values()) {
      for (const settled of settleReadings(group))
        out.push(dish.best === 0 && !settled.priceConflict ? settled : { ...settled, verified: false })
    }
  }
  const sections = new Map()
  for (const item of out)
    if (!sections.has(dishKey(item.section))) sections.set(dishKey(item.section), sections.size)
  return out.sort((a, b) => sections.get(dishKey(a.section)) - sections.get(dishKey(b.section)))
}

/** What a menu's stated `priceScale` reads as in the agent's summary. */
const SCALE_WORDS = { 1000: 'thousands', 10000: 'ten-thousands', 1000000: 'millions' }

const SEASONAL =
  /\b(?:seasonal|season|summer|winter|spring|autumn|fall|christmas|xmas|easter|ramadan|iftar|eid|valentine|new year|tet|halloween|thanksgiving|festive|limited)\b/i
const YEAR_MS = 365 * 24 * 3600 * 1000
const SECTIONS_NAMED = 12
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : /(?:sh|ch|s|x)$/.test(word) ? 'es' : 's'}`
const sourceLabel = (item, searched) =>
  item?.source?.kind === 'photo' ? 'photo' : searched.has(item?.source?.url) ? 'search result' : 'website'

/**
 * Plain facts about a merged menu (`mergeMenuItems`), for the build agent to read before the dishes: how many, the
 * sections, the price range per currency, the sources, the dishes with no price, seasonal sections and how old the photos
 * are. No model call.
 * @param {any[]} items @param {{at?: string | null, searched?: Set<string>}} [options]
 */
export function menuSummary(items, { at = null, searched = new Set(), empty = null } = {}) {
  const list = items ?? []
  if (!list.length) return empty ?? 'No menu was collected; add no dish of your own.'
  const sections = [...new Set(list.map((i) => (i.section ? String(i.section) : '(no section)')))]
  const shown =
    sections.length > SECTIONS_NAMED
      ? `${sections.slice(0, SECTIONS_NAMED).join(', ')} and ${sections.length - SECTIONS_NAMED} more`
      : sections.join(', ')
  const lines = [`${plural(list.length, 'dish')} in ${plural(sections.length, 'section')}: ${shown}.`]
  // Per currency and printed scale: the numbers as printed, and what a number in thousands means.
  const byCurrency = new Map()
  for (const item of list) {
    const n = priceNumber(item.price)
    if (n === null) continue
    const c = item.currency ?? 'no currency'
    const scale = item.priceScale ?? 1
    const key = `${c}\n${scale}`
    const group = byCurrency.get(key) ?? { c, scale, ns: [] }
    group.ns.push(n)
    byCurrency.set(key, group)
  }
  if (byCurrency.size)
    lines.push(
      `Prices: ${[...byCurrency.values()]
        .map(({ c, scale, ns }) => {
          const lo = Math.min(...ns)
          const hi = Math.max(...ns)
          const printed =
            scale > 1
              ? `, printed in ${SCALE_WORDS[scale] ?? `units of ${scale}`} (${lo} means ${(lo * scale).toLocaleString('en-US')})`
              : ''
          return `${c} ${lo === hi ? lo : `${lo}–${hi}`}${printed} (${plural(ns.length, 'dish')})`
        })
        .join('; ')}.`
    )
  const unpriced = list.filter((i) => priceNumber(i.price) === null)
  const conflicts = unpriced.filter((i) => i.priceConflict).length
  if (unpriced.length)
    lines.push(
      `${plural(unpriced.length, 'dish')} ${unpriced.length === 1 ? 'has' : 'have'} no price${conflicts ? ` (${conflicts} because sources disagree)` : ''}.`
    )
  const kinds = new Map()
  for (const item of list)
    kinds.set(sourceLabel(item, searched), (kinds.get(sourceLabel(item, searched)) ?? 0) + 1)
  lines.push(`Sources: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}.`)
  const seasonal = sections.filter((s) => SEASONAL.test(s))
  if (seasonal.length) lines.push(`Seasonal sections: ${seasonal.join(', ')}.`)
  const dates = list.map(postedAt).filter((t) => t !== null)
  if (dates.length) {
    const day = (t) => new Date(t).toISOString().slice(0, 10)
    const lo = Math.min(...dates)
    const hi = Math.max(...dates)
    const old = Number.isFinite(Date.parse(at ?? '')) && Date.parse(at) - lo > YEAR_MS
    lines.push(
      `Photos dated ${lo === hi ? day(lo) : `${day(lo)} to ${day(hi)}`}${old ? '; the oldest is over a year old' : ''}.`
    )
  }
  return lines.join(' ')
}

/** The empty `menu` part of a business that is not food or drink. */
export const NO_PRICES_NOTE = 'No prices were collected: show no price, and add no item or price of your own.'

/**
 * Why a place's research holds no dishes, for the build agent's `menu` part (`agent-demo.js`): read from what the
 * research recorded (`menuPhotoStatus`, the menu links and their readings), so the agent says "photo reading is off",
 * never "this place has no menu", and marks any dish it writes as a sample.
 * @param {any} profile the place's snapshot profile
 * @param {{trade?: string | null}} [opts] the business's trade (`trades.mjs briefTradeOf`); only `food` reads menus
 */
export function menuEmptyNote(profile, { trade = 'food' } = {}) {
  // A menu is a food business's: any other trade (a gym, a clinic, one nothing says the trade of) hears no word of
  // dishes or menus, only that no price was collected.
  if (trade !== 'food') return NO_PRICES_NOTE
  const tail =
    ' Dishes and prices are unknown: any dish written is a sample for the owner, never presented as read.'
  const status = profile?.menuPhotoStatus
  if (status === 'switched_off' || status === 'not_configured' || status === 'unavailable')
    return `No dishes were read: menu photo reading is off on this site, so the place's menu photos were not read.${tail}`
  if (status === 'not_tested')
    return `No dishes were read: the vision model for menu photos has not passed its test yet, so menu photos were not read.${tail}`
  if (status === 'not_applicable')
    return `No menu was read: this place is not a food or drink business.${tail}`
  if ((profile?.menus ?? []).length)
    return `No dishes were read: the place's menu links were read but held no dishes that could be read.${tail}`
  return `No menu link or menu photo was found for this place.${tail}`
}

const linkReading = (item) => item?.source?.kind !== 'photo'

const urlsOf = (menus) =>
  [...new Set((menus ?? []).map((m) => m?.url).filter((u) => typeof u === 'string' && u))].sort().join('\n')

/**
 * @param {{domain: any, profile: {menus?: Array<{url: string}>}, previous?: {menus?: any[], menuItems?: any[],
 *   menuReads?: any[]} | null, force?: boolean, deps: {fetch?: Function, resolve?: Function}, now?: () => number,
 *   log?: {warn?: Function}, renderers?: any[], rethrow?: (err: unknown) => boolean}} args - `renderers`, `rethrow`:
 *   as `readMenus` takes them; `previous`: the place's last snapshot profile, reused while its menu links are the same
 * @returns {Promise<{menuItems?: any[], menuReads?: any[]}>} the fields to set on the profile; `{}` leaves the links only
 */
export async function menuItemsForProfile({
  domain,
  profile,
  previous = null,
  force = false,
  deps,
  now = Date.now,
  log,
  renderers = [],
  rethrow
}) {
  const key = urlsOf(profile?.menus)
  if (!key) return {}
  // A read held as `needs_render` is read again once a rendered reader is configured (`menu-reader.mjs`).
  const drawnLater =
    renderers.length > 0 && (previous?.menuReads ?? []).some((r) => r?.status === 'needs_render')
  if (!force && !drawnLater && previous?.menuReads && urlsOf(previous.menus) === key)
    return {
      // Photo readings belong to `menu-photo-reading.js`; only the link readings are reused here.
      ...(previous.menuItems?.some(linkReading) ? { menuItems: previous.menuItems.filter(linkReading) } : {}),
      menuReads: previous.menuReads.filter((r) => r?.kind !== 'photo')
    }
  try {
    const { items, reads } = await domain.readMenus({
      menus: profile.menus,
      fetch: deps.fetch,
      resolve: deps.resolve,
      pdfText: pdfTextPages,
      now,
      renderers,
      rethrow
    })
    // A link found by a web search may be another branch's menu: what it says is never a fact.
    const searched = new Set(profile.menus.filter((m) => m.source === 'search').map((m) => m.url))
    const kept = mergeMenuItems(
      items.map((item) => (searched.has(item.source?.url) ? { ...item, verified: false } : item)),
      { searched }
    )
    return { ...(kept.length ? { menuItems: kept } : {}), menuReads: reads }
  } catch (err) {
    if (rethrow?.(err)) throw err
    log?.warn?.('wo menu read failed', { error: err?.message })
    return {}
  }
}

/**
 * The profile fields of every menu source together: the link readings (`menuItemsForProfile`) and the photo readings
 * (`readMenuPhotos`, null when that step did not run) through `mergeMenuItems`. With no photo step it is `docs` unchanged.
 * @param {{docs: {menuItems?: any[], menuReads?: any[]}, photos: {items: any[], reads: any[], reading: any} | null,
 *   searched?: Set<string>}} input
 */
export function menuFieldsOf({ docs, photos, searched = new Set() }) {
  if (!photos) return docs
  const menuItems = mergeMenuItems([...(docs.menuItems ?? []), ...photos.items], { searched })
  const menuReads = [...(docs.menuReads ?? []), ...photos.reads]
  return {
    ...(menuItems.length ? { menuItems } : {}),
    ...(menuReads.length ? { menuReads } : {}),
    ...(photos.reading ? { menuPhotoReading: photos.reading } : {}),
    menuPhotoStatus: photos.status
  }
}
