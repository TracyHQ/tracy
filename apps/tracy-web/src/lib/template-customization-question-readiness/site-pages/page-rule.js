/**
 * The rule that turns a main menu, read as a tree, into the pages a customer may keep or hide: the
 * list `tracy_site_pages.json` must equal (spec REL-2). Each CMS reader in this folder turns its
 * menu into the same node shape and hands it here, so WordPress, Joomla and EmDash follow one rule:
 *
 * - every content page a visitor reaches from the main menu, at ANY depth: the children of a
 *   submenu heading are offered, not skipped with it (#1013: JA Kinetic offered 2 of 13 pages);
 * - never a system or utility page (login, registration, password reset, profile, error, offline,
 *   typography, search, tag lists, author lists, archives);
 * - never another demo of the home page ("Home 2", "Home > Terminal", colour variants);
 * - never a kit sample page (newsletter, email, form, slide, style guide under a Resources or Kit
 *   heading): 08/10/2026 (S3), they stay as the template has them and are not asked. The
 *   writer in tracy-dev does not skip them yet; until it does, this is the one place they differ.
 * - a label the customer recognises: a shared label, or one that only means something under its
 *   heading ("Layout 1", "Video"), carries the heading in front.
 *
 * Ported line for line from the writer of the file, `tracy-dev site-pages`
 * (TracyHQ/tracy-template-dev, `lib/site-pages-rule.mjs`): a check that ruled differently from the
 * writer would fail files the writer made correctly.
 *
 * @typedef {{
 *   label: string, id?: string | null, key?: string, alias?: boolean, home?: boolean,
 *   utility?: string | null, children: MenuNode[]
 * }} MenuNode
 *   `id` what the engine hides by (null for a heading, a placeholder or a link to no page); `key`
 *   the page itself (a Joomla alias item and its target share it); `utility` why it is a system page.
 * @typedef {{ id: string, label: string, home?: true }} SitePage
 */

/** Words a system page's label, slug or alias is made of. */
export const UTILITY_WORDS =
  /(^|[^a-z0-9])(log-?in|log-?out|sign-?in|sign-?up|register|registration|reset|remind|reminder|forgot|password|passwords|profile|2fa|error|404|offline|typography|search|smart-search|tags?|tagged|authors?|writers?|archives?)([^a-z0-9]|$)/i
/** Labels of another demo of the home page or of a colour scheme. */
const VARIANT_LABEL = /^home\b|\bcolou?rs?$/i
/** A kit sample page: its label, under a heading that names the kit. */
const KIT_LABEL = /^(newsletter|e-?mail|form|slides?|style ?guide)\b/i
const KIT_HEADING = /\b(resources?|kit)\b/i
/** Labels that only mean something under their heading. */
const GENERIC_LABEL = /^(layout|style|detail|default|list view|grid view|video|gallery)\b/i

const clean = (/** @type {unknown} */ s) =>
  String(s ?? '')
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The first of `names` that reads as a system page, or null.
 * @param {...unknown} names
 */
export function utilityName(...names) {
  return names.map((n) => String(n ?? '')).find((n) => n && UTILITY_WORDS.test(n)) ?? null
}

/** @param {MenuNode} n @returns {boolean} */
const holdsHome = (n) => !!n.home || (n.children ?? []).some(holdsHome)
/** @param {MenuNode} n @returns {MenuNode[]} */
const flat = (n) => [n, ...(n.children ?? []).flatMap(flat)]

/**
 * @param {MenuNode[]} items the main menu's level 1, each with its children
 * @param {{ homeId: string, homeTitle: () => string }} home the front page's id, and its title
 *   when no menu entry names it
 * @param {(message: string) => void} warn
 * @returns {{ pages: SitePage[] }}
 */
export function pagesFromMenu(items, home, warn) {
  if (!home.homeId) throw new Error('this release has no front page')
  // The branch that holds the front page (or, when none does, a level-1 entry called Home) is the
  // Home entry; the other pages under it are demos of the home page.
  const branch = items.find(holdsHome) ?? items.find((n) => /^home$/i.test(clean(n.label)))
  let homeLabel = branch ? clean(branch.label) : null
  const variants = []
  if (branch) for (const n of flat(branch)) if (n.id && !n.home) variants.push(clean(n.label))
  if (!homeLabel) for (const n of items.flatMap(flat)) if (n.home) homeLabel = clean(n.label)
  const utilities = []
  const kit = []
  /** @type {{ id: string, key: string, alias: boolean, label: string, parent: string | null }[]} */
  const found = []
  const walk = (/** @type {MenuNode} */ n, /** @type {string | null} */ parent) => {
    const label = clean(n.label)
    if (n.id && !n.home) {
      if (n.utility) utilities.push(label)
      else if (KIT_LABEL.test(label) && KIT_HEADING.test(String(parent ?? ''))) kit.push(label)
      else if (VARIANT_LABEL.test(label)) variants.push(label)
      else found.push({ id: n.id, key: n.key ?? n.id, alias: !!n.alias, label, parent })
    }
    for (const c of n.children ?? []) walk(c, label || parent)
  }
  for (const n of items) if (n !== branch) walk(n, null)
  if (variants.length) warn(`skipped as other demos of the home page: ${variants.join(', ')}`)
  if (utilities.length) warn(`skipped as system pages: ${utilities.join(', ')}`)
  if (kit.length) warn(`skipped as kit sample pages: ${kit.join(', ')}`)
  // One entry per page, where the menu first shows it and under the label it shows there. When that
  // first entry is a Joomla alias item, the id is the entry that IS the page (JA Prodex: "News" is an
  // alias of "Pages > Category Blog"): hiding it hides the page, and the alias goes with it.
  const chosen = new Map()
  for (const p of found) {
    const had = chosen.get(p.key)
    if (!had) {
      chosen.set(p.key, { ...p })
      continue
    }
    warn(`"${p.label}" links the page of "${had.label}" again: kept one entry`)
    if (had.alias && !p.alias) Object.assign(had, { id: p.id, alias: false })
  }
  const pages = []
  const seenIds = new Set([home.homeId])
  for (const p of chosen.values()) {
    if (seenIds.has(p.id)) continue
    seenIds.add(p.id)
    pages.push(p)
  }
  const count = new Map()
  for (const p of pages) count.set(p.label.toLowerCase(), (count.get(p.label.toLowerCase()) ?? 0) + 1)
  const labelOf = (/** @type {(typeof pages)[number]} */ p) => {
    const shared = count.get(p.label.toLowerCase()) > 1
    const generic =
      GENERIC_LABEL.test(p.label) && !p.label.toLowerCase().includes(String(p.parent).toLowerCase())
    return p.parent && (shared || generic) ? `${p.parent} › ${p.label}` : p.label
  }
  return {
    pages: [
      { id: home.homeId, label: homeLabel || home.homeTitle() || 'Home', home: true },
      ...pages.map((p) => ({ id: p.id, label: labelOf(p) }))
    ]
  }
}

/** Menu text as a person reads it: tags stripped, the common entities decoded. */
export const plainText = (/** @type {unknown} */ s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
