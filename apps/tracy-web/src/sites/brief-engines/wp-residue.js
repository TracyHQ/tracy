/**
 * What is left of the template's own company on a WordPress site once the words have been written.
 *
 * 🔒 THE CONTRACT WRITES THE SLOTS, AND SLOTS ARE NOT THE WHOLE SITE. Measured 03/10/2026 on a bakery's
 * `tracy-business/wp7` (every slot written, 241 of 253): the header's "Recent projects" menu on every page
 * still listed a Russian contractor's plants; the About page told its history (2004, Domodedovo, a steel
 * plant) and listed its ISO certificates; the Services page described steel structures; the footer offered
 * "Pre-engineered buildings". None of it is a slot: it is a raw HTML section, a menu, a list in a template
 * part, a page nobody navigates to. Another company's facts on a customer's site are worse than no section
 * (CLAUDE.md §0.3), and the contract cannot reach them, so they are taken out through the same door the
 * words went in by (`content.get` / `content.update`, as the person who pressed Apply).
 *
 * The rule is the one thing that makes this safe to run on any template, with no list of its own parts:
 *
 *   A BLOCK THE CUSTOMER'S WORDS NEVER REACHED IS CUT, WHEN IT IS NOTHING BUT STORED TEXT.
 *
 * - "reached": one of the lines Apply just wrote stands inside a NAMED block of it — a block with a
 *   `metadata.name`, the only kind a slot can name, so the only kind Apply can have written. A section with a
 *   written line is the customer's section, however much of the template's wording is still around it, and is left
 *   whole. A raw HTML block has no name and nothing was ever written into it: a line of it that happens to equal a
 *   written one ("What we offer", "Production") is the template's, not the customer's.
 * - "nothing but stored text": no menu, query, form, search or identity token (`wp-blocks.js` `hasLive`)
 *   anywhere inside. A block that holds one is entered instead, and only its multi-line static parts are
 *   cut (the three columns of a mega menu: two of lists, one a live query) — a lone heading beside a live
 *   block is its label, and stays.
 *
 * A page that would lose most of what it says is left alone and reported: that is a page for the owner to
 * decide about, not a bug to repair silently.
 */

import {
  cut,
  hasLive,
  htmlRuns,
  leavesOf,
  namedBlocks,
  parseBlocks,
  plain,
  singleLine,
  withText
} from './wp-blocks.js'
import { contactLinks, identityWithEmail } from './wp-contacts.js'
import { editForm, formIdsIn, mailTo } from './wp-forms.js'
import { editLines, editRuns, slottedOn, staticLines } from './wp-leaves.js'
import { linksOff } from './wp-unlink.js'
import { hideBlocks } from './wp-hide.js'
import { writeFacts } from './wp-facts.js'
import { fillDishItems, markSections } from './wp-wo-fill.js'
import { buttonKind, buttonLink, fileLinksToContact } from './wp-buttons.js'
import { pageKind } from './picked-pages.js'
import { jsonObjectIn, pool } from './shared.js'
import { translateLeft } from './left-words.js'

/** A static part of a block that also holds live ones is cut only when it has this many lines. */
const MIXED_MIN_LEAVES = 3
/** A page that would lose this share or more of its text sections is left alone. */
const MAX_SHARE = 0.75
/**
 * The template parts a quickstart's theme prints on its pages. The first two are stored with the site; the others are
 * the theme's own files until the door writes them, and a part the theme does not have answers nothing and is skipped.
 */
export const PARTS = ['header', 'footer', 'sidebar-news', 'sidebar-article', 'sidebar-search']
/** Pages every site has under these names: never counted among the template's showcase. */
export const PROTECTED = new Set([
  'home',
  'about',
  'services',
  'projects',
  'contact',
  'news',
  'blog',
  'sitemap'
])

/**
 * The template parts the content map covers: the slug of each of its `templatePart` entities (TracyHQ/tracy#139). Their
 * words are the contract's slots, written by the build like a page's; the sweep never rewrites them.
 * @param {{ entities?: any[] }} contentMap
 * @returns {Set<string>}
 */
export function partsInMap(contentMap) {
  return new Set(
    (contentMap.entities ?? [])
      .filter((e) => e?.kind === 'templatePart' && typeof e.identity?.slug === 'string')
      .map((e) => String(e.identity.slug))
  )
}

/**
 * The blocks the contract writes into, by the slug of the page that holds them: the `target.block` of every slot of a page
 * entity. The Claude Cowork plugin finds a slot by the first block of that name on its page, and a slot whose block is gone
 * is a PROBLEM of its inspect, not a warning: every `content.contract apply` of the site is refused until it is back
 * (`QuickstartContract::inspect`, measured 08/10/2026 on dev). So the sweep leaves these blocks where they are.
 * @param {{ entities: any[], slots: any[] }} contentMap
 * @returns {Map<string, Set<string>>}
 */
export function slotBlocksByPage(contentMap) {
  /** @type {Map<string, string>} */
  const slugOf = new Map()
  for (const entity of contentMap.entities ?? [])
    if (entity.kind === 'page' && typeof entity.identity?.slug === 'string')
      slugOf.set(String(entity.key), entity.identity.slug)
  /** @type {Map<string, Set<string>>} */
  const keep = new Map()
  for (const slot of contentMap.slots ?? []) {
    const slug = slugOf.get(String(slot.entity))
    const block = slot.target?.block
    if (!slug || typeof block !== 'string' || block === '') continue
    const names = keep.get(slug) ?? new Set()
    names.add(block)
    keep.set(slug, names)
  }
  return keep
}

/**
 * How many of the slot blocks `keep` names a body had before a change and has no more after it. A slot is found by the first
 * block of its name, so a name is lost only when no block of it is left.
 * @param {string} before
 * @param {string} after
 * @param {Set<string>} keep
 */
export function slotBlocksLost(before, after, keep) {
  if (keep.size === 0 || before === after) return 0
  const was = parseBlocks(before)
  const now = parseBlocks(after)
  if (!was) return 0
  let lost = 0
  for (const name of keep)
    if (namedBlocks(was, name).length > 0 && (!now || namedBlocks(now, name).length === 0)) lost += 1
  return lost
}

/**
 * The lines Apply wrote, as a visitor reads them. A written value of a dozen characters or more also stands
 * for any line that contains it (a slot written into a longer paragraph).
 * @param {Iterable<string>} values
 */
export function writtenLines(values) {
  const lines = new Set()
  for (const value of values) {
    const text = plain(String(value).replace(/<[^>]*>/g, ' '))
    if (text.length >= 3) lines.add(text)
  }
  return lines
}

/** @param {string} line @param {Set<string>} written */
const isWritten = (line, written) => {
  if (written.has(line)) return true
  for (const w of written) if (w.length >= 12 && line.includes(w)) return true
  return false
}

/**
 * The same body without the blocks the customer's words never reached.
 *
 * 🔒 A BLOCK A CONTRACT SLOT WRITES INTO IS NEVER CUT, NOR IS ANY BLOCK HOLDING ONE (TCH #1013, measured 08/10/2026 on dev,
 * `tamq-7q-tbwp5`): the Contact page's four "Contact information" lines had no honest words, the section was cut, and the
 * plugin then refused every guided text edit of the site. A section holding such a block is entered instead, like a live one:
 * only its other static parts can go.
 *
 * 🔒 WITH THE TEMPLATE'S COMPANY NAMES, ONLY A BLOCK THAT NAMES THAT COMPANY GOES (TCH #1013, spec TCQR: answered fields
 * change, unticked pages go, everything else keeps the template's structure and blocks). Measured 11/10/2026 on dev
 * (g57-ess-wp-full, JA Essence WordPress 1.0.10, About given): every block no written word reached was cut, so the four
 * article pages lost their whole body and the three kit pages their card; on the released WordPress quickstarts the same
 * rule also took pricing lists, mega-menu columns and service lists. A block the words never reached keeps its demo words
 * (the other words of the page are said again in it, `wp-leaves.js`); one naming the template's own company is its residue.
 * @param {string} markup
 * @param {{ written: Set<string>, keep?: Set<string>, names?: string[] | null }} options - `keep`: the names of the blocks
 *   the contract's slots write into on this page (`slotBlocksByPage`); `names`: the template's own company, every spelling
 *   (`demoCompanyNames` and the samples of the name slots): a block is cut only when one of its lines names it, and an empty
 *   list cuts nothing. Null cuts every block the words never reached (the mechanics, as the tests read them). `fill`: an
 *   opportunity's build (Website Opportunities) cuts nothing — each block that would go stays, every line of it saying `fill`
 *   (🔒 a demo replaces, never removes: product owner, 22/10/2026); `cut` then names the blocks filled
 * @returns {{ markup: string, cut: Array<{ name: string, text: string }>, refused?: string }}
 */
export function pruneBody(markup, { written, keep = new Set(), names = null, fill = null }) {
  const root = parseBlocks(markup)
  if (!root) return { markup, cut: [], refused: 'the body is not block markup' }
  /** @type {Array<[number, number]>} */
  const ranges = []
  /** @type {Array<{ name: string, text: string }>} */
  const gone = []
  /** @type {Array<import('./wp-blocks.js').Block>} */
  const filled = []
  let sections = 0
  /** Whether a named block of this one holds a line Apply wrote. */
  const reached = (/** @type {import('./wp-blocks.js').Block} */ node) =>
    (node.attrs?.metadata?.name && leavesOf(markup, node).some((line) => isWritten(line, written))) ||
    node.children.some(reached)
  /** Whether this block, or one inside it, is a block a contract slot writes into. */
  const holdsSlot = (/** @type {import('./wp-blocks.js').Block} */ node) =>
    keep.has(node.attrs?.metadata?.name) || node.children.some(holdsSlot)
  const spellings =
    names === null ? null : names.map((n) => plain(String(n)).toLowerCase()).filter((n) => n.length >= 3)
  /** Whether a block's lines are the template's residue: any line, or, with the company's names, one that names it. */
  const residue = (/** @type {string[]} */ lines) =>
    spellings === null || lines.some((line) => spellings.some((n) => line.toLowerCase().includes(n)))
  const visit = (/** @type {import('./wp-blocks.js').Block} */ node, mixed) => {
    const lines = leavesOf(markup, node)
    if (lines.length === 0) return
    if (!mixed) sections += 1
    if (reached(node)) return
    if (keep.has(node.attrs?.metadata?.name)) return
    if (!holdsSlot(node) && !hasLive(markup, node)) {
      // One lone line is not a section: it is a heading or a sentence for the other words of the page to say again
      // (`wp-leaves.js`) — except in raw HTML, which nothing can say again.
      if (!mixed && node.name !== 'core/html' && lines.length < 2) return
      if (mixed && lines.length < MIXED_MIN_LEAVES) return
      if (!residue(lines)) return
      ranges.push([node.start, node.end])
      filled.push(node)
      gone.push({ name: node.name, text: lines[0].slice(0, 80) })
      return
    }
    for (const child of node.children) visit(child, true)
  }
  for (const top of root.children) visit(top, false)
  if (ranges.length === 0) return { markup, cut: [] }
  const topCut = ranges.filter(([start]) => root.children.some((top) => top.start === start)).length
  // The limit guards against cutting a page bare; filling a block's lines takes nothing away, so it never refuses.
  if (fill === null && sections > 0 && topCut / sections >= MAX_SHARE)
    return { markup, cut: [], refused: `it would lose ${topCut} of its ${sections} sections` }
  const next = fill === null ? cut(markup, ranges) : withEveryLine(markup, filled, fill)
  // What is written back must still be blocks all the way down.
  if (!parseBlocks(next)) return { markup, cut: [], refused: 'the cut left the body unreadable' }
  return { markup: next, cut: gone }
}

/**
 * The body with every line of each block saying `text`: in each block below it (the block itself too) the first run of
 * text takes the words and the block's other runs are emptied, so a link or a strong word in a line leaves no second copy;
 * raw HTML (`core/html`) holds its elements in one block, so each of its runs takes the words. Tags, classes and blocks stay.
 * @param {string} markup
 * @param {Array<import('./wp-blocks.js').Block>} nodes
 * @param {string} text
 * @returns {string}
 */
function withEveryLine(markup, nodes, text) {
  /** @type {Array<{ start: number, end: number, to: string }>} */
  const edits = []
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    htmlRuns(markup, node).forEach((run, i) =>
      edits.push({ start: run.start, end: run.end, to: i === 0 || node.name === 'core/html' ? escaped : '' })
    )
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  let out = markup
  for (const e of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.to + out.slice(e.end)
  return out
}

/**
 * Published pages no slot of the contract names and that say something: the template's own showcase (an
 * email layout, a form library, a slide kit, a style guide). The pages every site has (`PROTECTED`: the posts page, the
 * sitemap) are not among them. An email layout wears the brand, so a live token inside does not make it the
 * customer's.
 *
 * 🔒 THEIR CONTENT AND URLS STAY; ONLY NAVIGATION IS PUT AWAY (product owner, 08/10/2026, TCH #1013; showcase-nav-map.json):
 * provisioning takes the showcase's links out of the menus, the pages stay published. Nothing Apply writes reaches these
 * pages, so their words are not planned and the sweep does not cut their sections (a cut would refuse and say so on every
 * one of them); they keep the template's sample text, and the customer is not told.
 * @param {Array<{ id: number, slug: string, status: string, content?: string }>} pages
 * @param {Set<string>} entitySlugs - the pages the contract has a slot on
 * @returns {Array<{ id: number, slug: string }>}
 */
export function showcasePages(pages, entitySlugs) {
  /** @type {Array<{ id: number, slug: string }>} */
  const out = []
  for (const page of pages) {
    if (page.status !== 'publish' || entitySlugs.has(page.slug) || PROTECTED.has(page.slug)) continue
    const markup = page.content ?? ''
    const root = parseBlocks(markup)
    if (!root || root.children.length === 0) continue
    if (leavesOf(markup, root).length === 0) continue
    out.push({ id: page.id, slug: page.slug })
  }
  return out
}

/** The last path segment of a link: `http://x.test/careers/` → `careers`. */
const slugOfUrl = (/** @type {unknown} */ url) => {
  if (typeof url !== 'string') return ''
  try {
    return new URL(url, 'http://site.invalid').pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  } catch {
    return ''
  }
}

/**
 * A navigation without the links to pages that are no longer shown: a link to one of their ids, or one whose address leads
 * there — by its last path segment, or, when `at` is given, by what `at` says of its address (a template part's own links are
 * custom ones, `/pricing`, and are judged by this site's path, so another site that shares the slug keeps its link).
 *
 * A submenu whose every link went goes too, unless its own label leads to a page that stays (TCH #1013: the Pages question
 * names the pages under a submenu, and an unticked Features and Blog left "Product" as a dropdown that opens on nothing).
 * @param {string} markup
 * @param {{ slugs: Set<string>, ids: Set<number> }} hidden
 * @param {((url: string) => boolean) | null} [at] - whether a link's address is a page that goes
 * @returns {{ markup: string, cut: string[] }}
 */
export function navWithout(markup, hidden, at = null) {
  const root = parseBlocks(markup)
  if (!root) return { markup, cut: [] }
  const away = (/** @type {any} */ attrs) => {
    const url = attrs?.url
    const leads = at ? typeof url === 'string' && at(url) : hidden.slugs.has(slugOfUrl(url))
    return hidden.ids.has(Number(attrs?.id)) || leads
  }
  /** Whether a submenu's own label leads to a page that stays: a page by id, or an address that is not a placeholder. */
  const leadsSomewhere = (/** @type {any} */ attrs) =>
    !away(attrs) &&
    ((attrs?.id !== undefined && Number.isFinite(Number(attrs.id))) ||
      !/^(#.*)?$/.test(String(attrs?.url ?? '').trim()))
  /**
   * The cuts of one block and what it holds: `links` counts the links (a submenu counts as one), `cutLinks` those cut.
   * @param {import('./wp-blocks.js').Block} node
   * @returns {{ ranges: Array<[number, number]>, gone: string[], links: number, cutLinks: number }}
   */
  const visit = (node) => {
    const label = String(node.attrs?.label ?? '')
    if (node.name === 'core/navigation-link')
      return away(node.attrs)
        ? { ranges: [[node.start, node.end]], gone: [label], links: 1, cutLinks: 1 }
        : { ranges: [], gone: [], links: 1, cutLinks: 0 }
    const inner = node.children.map(visit)
    const ranges = inner.flatMap((r) => r.ranges)
    const gone = inner.flatMap((r) => r.gone)
    const links = inner.reduce((n, r) => n + r.links, 0)
    const cutLinks = inner.reduce((n, r) => n + r.cutLinks, 0)
    if (node.name !== 'core/navigation-submenu') return { ranges, gone, links, cutLinks }
    if (links > 0 && cutLinks === links && !leadsSomewhere(node.attrs))
      return { ranges: [[node.start, node.end]], gone: [...gone, label], links: 1, cutLinks: 1 }
    return { ranges, gone, links: 1, cutLinks: 0 }
  }
  const all = root.children.map(visit)
  const ranges = all.flatMap((r) => r.ranges)
  if (ranges.length === 0) return { markup, cut: [] }
  const next = cut(markup, ranges)
  return parseBlocks(next) ? { markup: next, cut: all.flatMap((r) => r.gone) } : { markup, cut: [] }
}

/** An address that leads nowhere: missing, empty, or a placeholder (`#`, `#top`). */
const noUrl = (/** @type {unknown} */ url) => /^(#.*)?$/.test(String(url ?? '').trim())

/** An address's path with its query: `?page_id=129` is a page of its own, not the home page its empty path reads as. */
const placeOfUrl = (/** @type {string} */ url) => {
  try {
    return `${pathOfUrl(url)}${new URL(url, 'http://site.invalid').search}`
  } catch {
    return ''
  }
}

/** A menu item's page id, or null when it names none. */
const idOf = (/** @type {Record<string, any> | null} */ attrs) =>
  attrs?.id !== undefined && attrs.id !== null && attrs.id !== '' && Number.isFinite(Number(attrs.id))
    ? Number(attrs.id)
    : null

/** A submenu that is only a label: no page id behind it and no address, or a placeholder one (`#`). */
const labelOnly = (/** @type {import('./wp-blocks.js').Block} */ node) =>
  node.name === 'core/navigation-submenu' && idOf(node.attrs) === null && noUrl(node.attrs?.url)

/** A menu label that asks a visitor to get in touch: "Reservation", "Book a table", "Contact", "Enquiries". */
const CONTACT_WORDS = /\b(reserv|book|contact|enquir|inquir)/i

/** An attribute value written the way WordPress serializes block comments, so no `--` or `<` ever closes the comment. */
const commentJson = (/** @type {unknown} */ value) =>
  JSON.stringify(value)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

/**
 * An opportunity's menu without the demo kit's own dropdowns, and with a reservation dropdown that leads to the contact page
 * (Website Opportunities, ja-restaurant wp7 1.0.1, 22/10/2026). Run after `navWithout`, on a build an opportunity made only:
 * - a submenu that is only a label ("Explore", "Themes", "Bonus Pages") goes whole when every link it still holds leads to a
 *   page the menu already links outside such submenus ("Default Color" is Home, "About Us" is About us) or to a page that is
 *   not published (WordPress prints no link to a draft), or it holds none;
 * - a submenu that is only a label, says reserving, booking or contacting, and holds a link to the contact page
 *   ("Reservation" › "Contact Us") leads there itself, so the word a visitor clicks goes somewhere instead of nowhere; a
 *   "Company" dropdown that happens to hold Contact keeps opening on its links.
 * Two items lead to one place when their destinations match, whatever form each takes: a page id is read as that page's path
 * (`pathOf`), so a Home link by id and a custom link to `/` are one.
 * @param {string} markup
 * @param {Set<number>} [unpublished] - the ids of the site's pages that are not published
 * @param {{ pathOf?: Map<number, string>, host?: string | null }} [site] - each page's path on the site, and the site's origin
 * @returns {{ markup: string, cut: string[], led: string[] }}
 */
export function demoKitOff(markup, unpublished = new Set(), { pathOf = new Map(), host = null } = {}) {
  const root = parseBlocks(markup)
  if (!root) return { markup, cut: [], led: [] }
  /** Where a menu item leads, one key for every form of one place; '' for nowhere. */
  const targetOf = (/** @type {Record<string, any> | null} */ attrs) => {
    const id = idOf(attrs)
    const path = id !== null ? pathOf.get(id) : undefined
    if (path) return `path:${path}`
    const url = String(attrs?.url ?? '').trim()
    if (!noUrl(url)) {
      // An absolute address is this site's only on the site's known host; on any other host, or when the host is not known,
      // it is that address, never a page of this one that shares its path. A page link still compares by its page id.
      const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
      let origin = null
      try {
        origin = absolute ? new URL(url, 'http://site.invalid').origin : null
      } catch {
        return `url:${url}`
      }
      const place = placeOfUrl(url)
      if (origin === null || (host !== null && origin === host)) return `path:${place}`
      return id !== null ? `id:${id}` : `url:${origin}${place}`
    }
    return id !== null ? `id:${id}` : ''
  }
  /** @type {Set<string>} */
  const elsewhere = new Set()
  const collect = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (labelOnly(node)) return
    if (MENU_ITEMS.has(node.name ?? '')) {
      const target = targetOf(node.attrs)
      if (target) elsewhere.add(target)
    }
    for (const child of node.children) collect(child)
  }
  for (const top of root.children) collect(top)
  /**
   * @param {import('./wp-blocks.js').Block} node
   * @returns {{ ranges: Array<[number, number]>, gone: string[], live: string[] }}
   */
  const visit = (node) => {
    if (node.name === 'core/navigation-link') {
      const target = unpublished.has(Number(node.attrs?.id)) ? '' : targetOf(node.attrs)
      return { ranges: [], gone: [], live: target ? [target] : [] }
    }
    const inner = node.children.map(visit)
    const ranges = inner.flatMap((r) => r.ranges)
    const gone = inner.flatMap((r) => r.gone)
    const live = inner.flatMap((r) => r.live)
    if (node.name === 'core/navigation-submenu' && !labelOnly(node)) {
      const target = targetOf(node.attrs)
      return { ranges, gone, live: target ? [...live, target] : live }
    }
    if (labelOnly(node) && live.every((target) => elsewhere.has(target)))
      return { ranges: [[node.start, node.end]], gone: [String(node.attrs?.label ?? '')], live: [] }
    return { ranges, gone, live }
  }
  const all = root.children.map(visit)
  const ranges = all.flatMap((r) => r.ranges)
  const trimmed = ranges.length ? cut(markup, ranges) : markup
  const kept = parseBlocks(trimmed)
  if (!kept) return { markup, cut: [], led: [] }
  /** @type {Array<{ from: number, to: number, text: string, label: string }>} */
  const edits = []
  const lead = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    const label = String(node.attrs?.label ?? '')
    if (labelOnly(node) && (CONTACT_WORDS.test(label) || pageKind(label) === 'contact')) {
      /** @type {import('./wp-blocks.js').Block[]} */
      const links = []
      const walk = (/** @type {import('./wp-blocks.js').Block} */ at) => {
        if (at.name === 'core/navigation-link') links.push(at)
        for (const child of at.children) walk(child)
      }
      walk(node)
      const contact = links.find(
        (link) => !noUrl(link.attrs?.url) && pageKind(slugOfUrl(link.attrs?.url)) === 'contact'
      )
      const head = trimmed.slice(node.start, node.innerStart)
      const name = head.match(/^<!--\s*wp:\S+/)
      const end = head.lastIndexOf('-->')
      if (contact && name && end > name[0].length) {
        // The placeholder `#` (or an empty url) is replaced, not kept beside the contact page's address.
        /** @type {Record<string, unknown>} */
        const attrs = { ...node.attrs }
        for (const key of ['type', 'id', 'url', 'kind']) {
          if (contact.attrs?.[key] !== undefined) attrs[key] = contact.attrs[key]
          else delete attrs[key]
        }
        const text = `{${Object.entries(attrs)
          .map(([key, value]) => `${JSON.stringify(key)}:${commentJson(value)}`)
          .join(',')}}`
        const selfClose = /\/\s*-->$/.test(head.slice(0, end + 3))
        edits.push({
          from: node.start,
          to: node.start + end + 3,
          text: `${name[0]} ${text} ${selfClose ? '/' : ''}-->`,
          label
        })
      }
    }
    for (const child of node.children) lead(child)
  }
  for (const top of kept.children) lead(top)
  let out = trimmed
  for (const edit of edits.sort((a, b) => b.from - a.from))
    out = out.slice(0, edit.from) + edit.text + out.slice(edit.to)
  if (!parseBlocks(out)) return { markup: trimmed, cut: all.flatMap((r) => r.gone), led: [] }
  return { markup: out, cut: all.flatMap((r) => r.gone), led: edits.map((e) => e.label) }
}

/**
 * Which page a link leads to on its site: its path without the trailing slash or the query, so `http://x.test/careers/`,
 * `/careers` and `/careers/?from=home` are all `/careers`.
 */
export const pathOfUrl = (/** @type {string} */ url) => {
  try {
    return new URL(url, 'http://site.invalid').pathname.replace(/\/+$/, '') || '/'
  } catch {
    return ''
  }
}

/** The named blocks of a body that say something themselves: the lines a contract gives a page. */
const namedLines = (/** @type {string} */ markup) => {
  const root = parseBlocks(markup)
  let count = 0
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.attrs?.metadata?.name && node.children.length === 0 && leavesOf(markup, node).length > 0)
      count += 1
    for (const child of node.children) walk(child)
  }
  for (const top of root?.children ?? []) walk(top)
  return count
}

/**
 * What the contract could not write into a page, written by block: the words for the second and third block that
 * share a name, and the removal of a block whose template words nobody could replace.
 *
 * 🔒 THE REMOVALS NEVER EMPTY A PAGE. Each block with no honest line goes on its own, and a page whose every line got none
 * (a copy in another language whose second chance had nothing for it) was written back empty (review of 05/10/2026).
 * Removals that would take MAX_SHARE or more of the page's named lines are not made at all, the same limit `pruneBody`
 * keeps: such a page is for the owner to decide about, and `kept` says how many blocks it kept.
 * @param {string} markup
 * @param {Array<{ block: string, nth: number, value: string }>} edits - the nth block of that name gets that line
 * @param {Array<{ block: string, nth: number, sample: string }>} drops - the nth block of that name goes, but only
 *   while it still shows the template's own words
 * @param {Set<string>} [keep] - the names of the blocks the contract's slots write into on this page (`slotBlocksByPage`): the
 *   first block of such a name is the slot's own and never goes; it is emptied instead, and one that cannot be (a button,
 *   a block of more than one text run) keeps its words (`held` counts those)
 * @returns {{ markup: string, edited: number, dropped: number, kept: number, held: number }}
 */
export function editBlocks(markup, edits, drops, keep = new Set()) {
  let out = markup
  let edited = 0
  let dropped = 0
  let held = 0
  for (const edit of edits) {
    const root = parseBlocks(out)
    if (!root) break
    const node = namedBlocks(root, edit.block)[edit.nth - 1]
    if (!node) continue
    const next = withText(out, node, edit.value)
    if (next && parseBlocks(next)) {
      out = next
      edited += 1
    }
  }
  const placed = out
  // Last first: taking the second block of a name away must not move the third one under the number it was given.
  for (const drop of [...drops].sort((a, b) => b.nth - a.nth)) {
    const root = parseBlocks(out)
    if (!root) break
    const node = namedBlocks(root, drop.block)[drop.nth - 1]
    if (!node || leavesOf(out, node).join(' ') !== plain(drop.sample)) continue
    if (drop.nth === 1 && keep.has(drop.block)) {
      // A slot's own block loses its words and stays, empty: the template's fact is off the page, the slot is still there
      // for the customer to write, and the page's skeleton (every slot masked) is the one its presentation lock pins. A
      // button is not left as an empty link: it keeps its words.
      const blank = node.name === 'core/button' ? null : withText(out, node, '')
      if (blank !== null && parseBlocks(blank)) {
        out = blank
        dropped += 1
      } else held += 1
      continue
    }
    const next = cut(out, [[node.start, node.end]])
    if (parseBlocks(next)) {
      out = next
      dropped += 1
    }
  }
  if (dropped > 0 && dropped >= MAX_SHARE * namedLines(placed))
    return { markup: placed, edited, dropped: 0, kept: dropped, held }
  return { markup: out, edited, dropped, kept: 0, held }
}

/** The blocks of a menu that carry a label a visitor reads: a link, and a submenu's own entry. */
const MENU_ITEMS = new Set(['core/navigation-link', 'core/navigation-submenu'])

/**
 * A navigation with the labels in `labels` spelt another way. Only a label that stands in the block's own
 * comment exactly as the model was shown it is changed; anything else is left as it is.
 * @param {string} markup
 * @param {Map<string, string>} labels - old label → new label
 * @returns {{ markup: string, changed: string[] }}
 */
export function relabel(markup, labels) {
  const root = parseBlocks(markup)
  if (!root || labels.size === 0) return { markup, changed: [] }
  /** @type {Array<{ at: number, from: string, to: string, label: string }>} */
  const edits = []
  const visit = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (MENU_ITEMS.has(node.name ?? '') && typeof node.attrs?.label === 'string') {
      const next = labels.get(node.attrs.label)
      if (next) {
        const from = `"label":${JSON.stringify(node.attrs.label)}`
        const at = markup.slice(node.start, node.innerStart).indexOf(from)
        if (at >= 0)
          edits.push({
            at: node.start + at,
            from,
            to: `"label":${JSON.stringify(next)}`,
            label: node.attrs.label
          })
      }
    }
    for (const child of node.children) visit(child)
  }
  for (const top of root.children) visit(top)
  let out = markup
  for (const edit of edits.sort((a, b) => b.at - a.at))
    out = out.slice(0, edit.at) + edit.to + out.slice(edit.at + edit.from.length)
  return parseBlocks(out) ? { markup: out, changed: edits.map((e) => e.label) } : { markup, changed: [] }
}

/**
 * The menu items of a navigation body that lead to a renamed blog category, or are labelled with its demo name, given its new
 * name (L1, product owner after the g65 builds, 12/10/2026): JA Essence WordPress's footer "category" menu read "Health",
 * "Design", "Fashion" beside categories renamed for a bakery. An item is the category's when it links to it (`"type":"category"`
 * and its term id) or its label is the category's demo name word for word. Run before the judge's labels (`relabel`), so the
 * demo name is still there to match.
 * @param {string} markup
 * @param {Array<{ id: number, from: string, to: string }>} categories - the categories renamed for the business (`planTerms`)
 * @returns {{ markup: string, changed: string[] }}
 */
export function relabelCategories(markup, categories) {
  if (categories.length === 0) return { markup, changed: [] }
  const root = parseBlocks(markup)
  if (!root) return { markup, changed: [] }
  const byName = new Map(categories.map((c) => [c.from, c.to]))
  /** @type {Array<{ at: number, from: string, to: string, label: string }>} */
  const edits = []
  const visit = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    const attrs = node.attrs ?? {}
    if (MENU_ITEMS.has(node.name ?? '') && typeof attrs.label === 'string') {
      const next = byName.get(attrs.label)
      if (next && next !== attrs.label) {
        const from = `"label":${JSON.stringify(attrs.label)}`
        const at = markup.slice(node.start, node.innerStart).indexOf(from)
        if (at >= 0)
          edits.push({ at: node.start + at, from, to: `"label":${JSON.stringify(next)}`, label: attrs.label })
      }
    }
    for (const child of node.children) visit(child)
  }
  for (const top of root.children) visit(top)
  let out = markup
  for (const edit of edits.sort((a, b) => b.at - a.at))
    out = out.slice(0, edit.at) + edit.to + out.slice(edit.at + edit.from.length)
  return parseBlocks(out) ? { markup: out, changed: edits.map((e) => e.label) } : { markup, changed: [] }
}

/** Every label of the menu items (`core/navigation-link`, `core/navigation-submenu`) of a navigation body. */
export function navLabels(markup) {
  const root = parseBlocks(markup)
  /** @type {string[]} */
  const out = []
  const visit = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (MENU_ITEMS.has(node.name ?? '') && typeof node.attrs?.label === 'string') out.push(node.attrs.label)
    for (const child of node.children) visit(child)
  }
  for (const top of root?.children ?? []) visit(top)
  return out
}

/** The longest button label the judge is shown: a label, not a sentence (`judgeSite` keeps answers to 40 characters). */
const BUTTON_MAX = 40

/**
 * The button blocks (`core/button`) of a part whose label nothing else says again: a label of one text run, with no identity
 * token, that the other words of the part (`staticLines`) leave out, because it is an interface word too short for them or
 * because its block carries a name. In a template part a name is the theme's, never the contract's: no contract slot writes
 * a part (LANG-2, measured 10/10/2026 on dev g56-ess-wp-full, JA Essence WordPress 1.0.10: the header's `header.subscribe`
 * "Subscribe" stayed English on a Vietnamese site).
 *
 * Each carries its kind and address (`wp-buttons.js`): only a button into a page is judged (`buttonLabels`), told the page it
 * opens (`buttonTargets`); a social button and one that leads nowhere are translated only (`buttonWords`, K6).
 * @param {string} markup
 * @returns {Array<{ node: import('./wp-blocks.js').Block, text: string, kind: 'social' | 'void' | 'file' | 'page', href: string | null }>}
 */
function partButtons(markup) {
  const root = parseBlocks(markup)
  if (!root) return []
  const said = new Set(staticLines(markup).map((line) => line.text))
  /** @type {Array<{ node: import('./wp-blocks.js').Block, text: string, kind: 'social' | 'void' | 'file' | 'page', href: string | null }>} */
  const out = []
  const visit = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.name === 'core/button' && node.children.length === 0 && !hasLive(markup, node)) {
      const text = singleLine(markup, node)
      if (text !== null && text.length <= BUTTON_MAX && /\p{L}/u.test(text) && !said.has(text)) {
        const link = buttonLink(markup, node)
        out.push({ node, text, kind: buttonKind({ text, ...link }), href: link.href })
      }
    }
    for (const child of node.children) visit(child)
  }
  for (const top of root.children) visit(top)
  return out
}

/**
 * The labels of a part's buttons that only the judge says again (`partButtons`), for a site written in one language other
 * than the source's: they are put to it with the menu labels and written like them.
 * @param {string} markup
 */
export function buttonLabels(markup) {
  return partButtons(markup)
    .filter((b) => b.kind === 'page')
    .map((b) => b.text)
}

/**
 * The buttons of a part the judge is asked about (`buttonLabels`), each with the address it opens.
 * @param {string} markup
 * @returns {Array<{ text: string, href: string | null }>}
 */
export function buttonTargets(markup) {
  return partButtons(markup)
    .filter((b) => b.kind === 'page')
    .map((b) => ({ text: b.text, href: b.href }))
}

/**
 * The labels of a part's social buttons and of its buttons that lead nowhere: the template's, translated and never rewritten
 * (K6, product owner 10/10/2026; measured on dev g59-ess-wp-full, where "@Grazia on instagram" became an action label).
 * @param {string} markup
 */
export function buttonWords(markup) {
  return partButtons(markup)
    .filter((b) => b.kind === 'social' || b.kind === 'void')
    .map((b) => b.text)
}

/**
 * A part with the labels of its buttons (`partButtons`) in `labels` spelt another way; the block keeps its comment, so a
 * name the theme looks the button up by stays.
 * @param {string} markup
 * @param {Map<string, string>} labels - old label → new label
 * @returns {{ markup: string, changed: string[] }}
 */
export function relabelButtons(markup, labels) {
  if (labels.size === 0) return { markup, changed: [] }
  let out = markup
  /** @type {string[]} */
  const changed = []
  // Last first, so the buttons still to do keep the places they were found at.
  for (const { node, text } of partButtons(markup).sort((a, b) => b.node.start - a.node.start)) {
    const next = labels.get(text)
    if (!next) continue
    const edited = withText(out, node, next)
    if (edited === null || !parseBlocks(edited)) continue
    out = edited
    changed.push(text)
  }
  return { markup: out, changed }
}

const JUDGE_SYSTEM =
  'You are tidying a website that a small business has just made from a template. The template was written for ' +
  'another company, so some of its menu labels name things this business does not do. You are given a description ' +
  "of the business and the labels of the template's menus. A menu label that names something this business does not " +
  'do (for example "Book a site survey" for a bakery) gets a short neutral label of one to three words in the same ' +
  'language (for example "Contact us"). Leave ordinary labels (Home, About us, Projects, News, Contact) out.\n' +
  'Answer with JSON only: {"relabel": {"<label>": "<new label>", ...}}, using only the labels you were given.'

/**
 * The judge's question when the site is written in a language its template's menus are not: every label in that language.
 * @param {string} language - the language's English name ("Vietnamese")
 */
const judgeInLanguage = (language) =>
  'You are tidying a website that a small business has just made from a template. The site is written in ' +
  `${language}, but the template's menus still carry its own labels in another language. You are given a description ` +
  "of the business and the labels of the template's menus. Give every label in " +
  `${language}: a short, natural menu label of one to three words, the way a website written in ${language} says it ` +
  '(for example "Home", "About us", "Contact"). A label that names something this business does not do (for example ' +
  `"Book a site survey" for a bakery) gets a short neutral label in ${language} instead (for example the ${language} ` +
  'for "Contact us"). Keep only the business\'s own name and people\'s names as they are: a label of the template that ' +
  'reads like a product or brand name (for example "J!Pages") is the template\'s menu word, given in ' +
  `${language} like any other.\n` +
  'Answer with JSON only: {"relabel": {"<label>": "<label in ' +
  `${language}` +
  '>", ...}}, with every label you were given and no other.'

/**
 * What the judge is told when some labels are buttons: each opens a page, and its label names that page.
 * 🔒 Measured 10/10/2026 on dev g59-ess-wp-full: told only the label, the judge turned "Become a subscriber" → /contact into
 * "Xem thực đơn" (View the menu), a page the link does not open.
 */
const TARGETS_RULE =
  '\nSome labels are buttons; "targets" gives the page each of them opens. A button label names where it leads: the page ' +
  'it opens or what the visitor does there (for a button that opens the Contact page, a label like "Contact us"), never a ' +
  'page or an offer it does not open.'

/**
 * What the model would change in the template's menus: labels that name what this business does not do.
 *
 * 🔒 THE JUDGE NEVER TAKES A PAGE OFF (product owner, 08/10/2026, TCH #1013). It used to be asked which pages a business would
 * not want too, and on dev it named the Product page a bakery had ticked. A page goes only when the customer unticked it in
 * the Pages question (`sweepWordPress` `unwanted`); the model is not asked about pages at all.
 * @param {{ chat: Function }} model
 * @param {{ name: string, about: string, sector: string | null }} business
 *
 * 🔒 A SITE WRITTEN IN ONE LANGUAGE OTHER THAN THE SOURCE'S GETS EVERY LABEL IN IT (TCH #1013, measured 08/10/2026 on dev
 * tamq-8w-bizwp: Vietnamese pages under "Home", "About", "Careers", "Book a site survey"). Menu labels are no slot of the
 * contract, so the words never reached them; with `template.language` the judge is asked for all of them in that
 * language, and the sweep writes them like its other relabels (one apply id, one undo).
 * @param {{ labels: string[], language?: string | null, locale?: string | null, note?: (note: string) => void, targets?: Record<string, string> }} template - `language`: the
 *   English name of the one language the site is written in when it is not the source's, else absent; `locale`: its tag, for
 *   the translation of what the judge leaves (`translateLeft`), with `note` for what it says; `targets`: what each
 *   button label among them opens (`the "Contact" page`)
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ relabel: Map<string, string>, language?: string }>} only ever labels of `template`; `language` when the
 *   labels were asked for in the site's one language (`sweepWordPress` then titles the pages by them)
 */
export async function judgeSite(model, business, template, signal) {
  const none = { relabel: new Map() }
  if (template.labels.length === 0) return none
  const targets = template.targets && Object.keys(template.targets).length > 0 ? template.targets : null
  // One question, answered the same way each time (`temperature` 0), and asked again once when the answer is not one: a
  // silent "nothing" would leave another company's trade on the menus.
  /** @type {any} */
  let parsed = null
  for (let attempt = 1; attempt <= 2 && parsed === null; attempt += 1) {
    const answer = await model.chat({
      messages: [
        {
          role: 'system',
          content: `${template.language ? judgeInLanguage(template.language) : JUDGE_SYSTEM}${targets ? TARGETS_RULE : ''}`
        },
        {
          role: 'user',
          content: JSON.stringify({ business, labels: template.labels, ...(targets ? { targets } : {}) })
        }
      ],
      // Every label comes back when the site is in another language: room for each of them.
      maxTokens: template.language ? Math.min(4000, 600 + 40 * template.labels.length) : 600,
      temperature: 0,
      signal
    })
    const found = jsonObjectIn(answer)
    if (found && 'relabel' in found) parsed = found
  }
  if (parsed === null) throw new Error('the model did not say which menu labels to change')
  const labels = new Set(template.labels)
  /** @type {Map<string, string>} */
  const relabelled = new Map()
  if (parsed?.relabel && typeof parsed.relabel === 'object' && !Array.isArray(parsed.relabel))
    for (const [from, to] of Object.entries(parsed.relabel)) {
      const next = typeof to === 'string' ? plain(to.replace(/<[^>]*>/g, ' ')) : ''
      if (labels.has(from) && next !== '' && next.length <= 40 && next !== from) relabelled.set(from, next)
    }
  // 🔒 A LABEL THE IN-LANGUAGE JUDGE KEEPS OR LEAVES OUT IS TRANSLATED, NEVER LEFT ENGLISH SILENTLY (LANG-2, TCH #1013). Measured
  // 10/10/2026 on dev g60-ess-wp-full: told to keep a brand as it is, the judge gave "J!Pages" and "J! Content" back unchanged,
  // and both stayed English on every page. What it left goes through `translateLeft` (asked again, split, line by line), said.
  if (template.language && template.locale) {
    const left = template.labels.filter((label) => !relabelled.has(label))
    const said = await translateLeft({
      slots: left.map((label, i) => ({ key: `label.${i}`, type: 'text', sample: label, maxCharacters: 40 })),
      written: {},
      locale: template.locale,
      source: '',
      model,
      signal,
      note: template.note ?? (() => {}),
      what: 'the menu labels',
      keep: [business.name]
    })
    left.forEach((label, i) => {
      const next = said[`label.${i}`]
      if (typeof next === 'string' && plain(next) !== '' && plain(next).length <= 40)
        relabelled.set(label, plain(next))
    })
  }
  return template.language ? { relabel: relabelled, language: template.language } : { relabel: relabelled }
}

/** One page of a listing, until a short page says it was the last. */
const PAGE = 25

/** How many pages of the other languages are read at once. */
const READERS = 4

/**
 * @typedef {{ id: number, edition: string, slug: string, base: string | null }} EditionPage - a page of another edition,
 *   as the release made it: its language, its slug, and the slug of the source page it translates (null when it
 *   translates none)
 */

/**
 * The pages of the languages asked for, from the release's own inventory (`inventory.json`: every post with its
 * Polylang language and translation group). A site that runs Polylang lists only its own language's pages
 * (`content.list` follows the request's language), so these are reached by id or not at all. Their language and the
 * page they translate come from the inventory too, never from the shape of a slug: a Russian copy's slug is
 * percent-encoded Cyrillic with no `-ru` in it. No inventory, no pages.
 * @param {unknown} inventory
 * @param {string[]} slugs - the edition slugs (`vi`, `pt-br`)
 * @returns {EditionPage[]}
 */
export function editionPageIds(inventory, slugs) {
  const inv = /** @type {any} */ (inventory)
  const posts = inv?.posts
  if (!Array.isArray(posts) || slugs.length === 0) return []
  const wanted = new Set(slugs)
  const source = inv?.source?.language
  const slugOf = new Map(posts.map((p) => [p?.id, p?.slug]))
  return posts
    .filter((p) => p?.type === 'page' && wanted.has(p.language) && Number.isInteger(p.id))
    .map((p) => {
      const original = p.group && source ? inv.translations?.[p.group]?.[source] : undefined
      return {
        id: p.id,
        edition: p.language,
        slug: String(p.slug ?? ''),
        base: original !== undefined && slugOf.has(original) ? String(slugOf.get(original)) : null
      }
    })
}

/**
 * The pages of other editions, read one at a time by id, a few at once, in the shape `listAll` gives plus the edition
 * and the source page each translates. A page that cannot be read, or that is not the release's page on this site
 * (another post under that id, another slug), is left as it is, and said.
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} checked
 * @param {EditionPage[]} wanted
 * @param {string[]} notes
 */
async function readPages(checked, wanted, notes) {
  const read = await pool(
    wanted.map((page) => async () => {
      const item = (await checked('content.get', { kind: 'post', id: page.id }))?.item
      return item?.post_type === 'page' && item.post_name === page.slug ? { page, item } : null
    }),
    READERS
  )
  const left = read.filter((r) => !r.ok || !r.value).length
  if (left > 0)
    notes.push(
      `${left} page(s) of the other languages could not be read as the template made them and keep its words`
    )
  return read
    .filter((r) => r.ok && r.value)
    .map(({ value: { page, item } }) => ({
      id: page.id,
      slug: page.slug,
      title: String(item.post_title ?? ''),
      status: String(item.post_status ?? ''),
      content: typeof item.post_content === 'string' ? item.post_content : undefined,
      edition: page.edition,
      base: page.base
    }))
}

/**
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} call
 * @param {string} postType
 * @param {boolean} withBody
 * @returns {Promise<Array<{ id: number, slug: string, title: string, status: string, url?: string, content?: string, excerpt?: string, date?: string, categories?: string[], tags?: string[] }>>}
 *   `excerpt` with the body; `date`, `categories` and `tags` (slugs) when the site says them
 */
export async function listAll(call, postType, withBody) {
  /** @type {any[]} */
  const rows = []
  for (let offset = 0; offset < 1000; offset += PAGE) {
    const answer = await call('content.list', {
      post_type: postType,
      include_body: withBody,
      limit: PAGE,
      offset
    })
    const items = Array.isArray(answer?.items) ? answer.items : []
    rows.push(...items)
    if (items.length < PAGE) break
  }
  return rows.map((row) => ({
    id: Number(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    status: String(row.status ?? ''),
    url: typeof row.url === 'string' && row.url !== '' ? row.url : undefined,
    content:
      typeof row.content === 'string'
        ? row.content
        : typeof row.post_content === 'string'
          ? row.post_content
          : undefined,
    ...(typeof row.excerpt === 'string' ? { excerpt: row.excerpt } : {}),
    ...(typeof row.created === 'string' ? { date: row.created } : {}),
    ...(Array.isArray(row.categories) ? { categories: row.categories.map(String) } : {}),
    ...(Array.isArray(row.tags) ? { tags: row.tags.map(String) } : {})
  }))
}

/**
 * Take what is left of the template's company off the site, once the words are written: sections the written
 * words never reached, the pages the customer unticked and the links to them, the menu labels that name what this
 * business does not do, and the links that mail or call the template's company (`wp-contacts.js`). No other page goes:
 * the template's showcase (`showcasePages`) and every page the customer ticked or was never asked about stay published. Every write is one `content.update`, one at a time (a site takes one writer at a time),
 * all under one `apply_id` so one `apply.revert` undoes the lot. A write the site refuses costs that one change and
 * is said, never the rest.
 * @param {object} input
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.call
 * @param {string} input.applyId
 * @param {Set<string>} input.written - what was written into the source edition, as a visitor reads it
 * @param {Set<string>} input.entitySlugs - the pages the contract has a slot on
 * @param {Array<{ slug: string, written: Set<string> }>} [input.extras] - the other editions the customer asked for
 *   (a page of one is named `<page>-<edition>`, its home `<edition>`) and what was written into them
 * @param {EditionPage[]} [input.editionPages] - those editions' pages (`editionPageIds`): the page list of a site
 *   that runs Polylang shows only the source edition, so they are read one by one
 * @param {{ relabel: Map<string, string>, language?: string, files?: { url: string, label: string, voids?: boolean } }} input.judged - the menu
 *   labels the model would change; `files`: where a button to a document of the demo company (with `voids`, on FULL, a
 *   worded button to nowhere too) leads instead, and what it says
 *   (`judgeSite`); with `language`, the pages titled by one of them take its new label as their title too
 * @param {Array<{ slug?: string, id?: number, block: string, nth: number, value: string }>} [input.edits] - lines for blocks the
 *   contract door cannot name (the second `text.heading` of a page), by page: a source page by its slug, another language's
 *   copy by its id
 * @param {Array<{ slug?: string, id?: number, block: string, nth: number, sample: string }>} [input.drops] - blocks of the
 *   template's words that no line could replace, by page, the same way
 * @param {Array<{ page: string, block: string, nth: number, up?: number }>} [input.hides] - blocks of the source edition's
 *   pages, by slug, hidden from visitors and kept in the body (`wp-hide.js`): what an opportunity's build has nothing true for
 * @param {Array<{ page?: string, part?: string, block: string, nth: number, lines: Array<{ label?: string, text: string, href?: string }> | null }>} [input.facts]
 *   - demo facts outside the slots, by source page slug or template part: written with the restaurant's, or hidden
 *   (`wp-facts.js`)
 * @param {Array<{ slug: string, id?: number, text: string, value: string | null }>} [input.lines] - lines of ordinary blocks, by
 *   page the same way (a line with an id is another language's)
 * @param {Map<number, Map<string, string | null>>} [input.forms] - lines of Contact Form 7 forms, by form
 * @param {Array<{ id: number, slug: string, heading: string | null, excerpt: string | null, own?: Array<{ key: string, role: string, text: string | null }> }>} [input.meta]
 *   - the heading meta and the excerpt of the pages that print them, and the metas their theme keeps under its own name
 *   (`own`: the document title and the meta description), as read, with their lines said in `lines` under `meta-<slug>`
 * @param {string | null} [input.to] - where the forms the site shows send their mail, Contact Form 7's and the theme's own
 *   (option `tracy_contact_to`): the mailbox the customer typed, else the account of the person who pressed Apply (the
 *   owner's decision of 05/10/2026); it is a recipient only, never shown
 * @param {{ email: string, phone: string } | null} [input.contact] - the mailbox and phone the customer TYPED (empty when
 *   none): every link of a page or a part that mails or calls the template's company leads there instead (`wp-contacts.js`),
 *   and a typed mailbox is the one the site shows as its own (`contact.email` of option `tracy_site_identity`). A kind with
 *   nothing typed keeps the demo's links and shown mailbox as placeholders (11/10/2026); null leaves them all as they are
 * @param {(pages: Array<{ slug: string, url?: string }>) => Iterable<string>} [input.unwanted] - of the source edition's published pages,
 *   the slugs of those the customer said they do not want (the `pages` question, `picked-pages.js`)
 * @param {string[]} [input.unwantedPaths] - the Pages answer's unticked ids, which are page paths (`get_page_uri`): two pages
 *   of one slug, one ticked and one not, are told apart by them (JA Impact WP: "Blog" and the kit's "Category Blog")
 * @param {string[]} [input.keptPaths] - the Pages answer's ticked ids, the same way
 * @param {(pages: Array<{ slug: string, url?: string }>) => Iterable<string>} [input.kept] - of the source edition's published
 *   pages, the slugs of those the customer TICKED in the Pages question (`keptById`): none of them goes, even when an older
 *   answer (`unpickedPages`) names its kind
 * @param {Array<{ id: number, from: string, to: string }>} [input.categories] - the blog categories renamed for the business
 *   (`planTerms`): a menu item that leads to one, or carries its demo name, takes its new name (L1, `relabelCategories`)
 * @param {Map<string, Set<string>>} [input.slotBlocks] - the blocks the contract's slots write into, by page slug
 *   (`slotBlocksByPage`): no step of the sweep takes one off
 * @param {Map<string, Map<string, number>>} [input.slotCounts] - how many blocks of each name they write into, by page slug
 *   (`slotCountsByPage`): a later block of a name takes its line like an unnamed one (`editLines` `slotted`)
 * @param {boolean} [input.prune] - whether the blocks the customer's words never reached are cut (`pruneBody`), in the pages
 *   and in the header, footer and sidebars. False when the customer left About blank (TCH #1013, ABOUT-3): no word was
 *   written, so every block is one "the words never reached", and the site keeps the template as it is, renamed
 * @param {string[] | null} [input.names] - the template's own company, every spelling: with About given, the blocks the words
 *   never reached are cut only when they name it (`pruneBody`); the template's other blocks keep their words. Null cuts every
 *   block the words never reached
 * @param {string | null} [input.pruneFill] - an opportunity's build: what `pruneBody` would cut stays, each line saying this
 *   (empty: `section-fills.mjs` writes no filler), in the pages and in the header, footer and sidebars
 * @param {{ dishes?: Array<{ name: string, description?: string, price?: string, picture?: string }>,
 *   neutralName?: string, neutralPicture?: string | null, neutralAlt?: string, blank?: Set<string> } | null} [input.woFill]
 *   - an opportunity's build: the restaurant's dishes and uploaded pictures for the template's dish items no slot covers,
 *   written with each section's `tracy-sec-*` mark into the source edition's pages, in their one write (`wp-wo-fill.js`)
 * @param {Set<number> | ((pages: Array<{ id: number, path: string }>) => Set<number>)} [input.showcase] - the pages the
 *   contract's showcase-navigation map takes out of navigation (`showcasePageIds`), or what names them from the source
 *   pages and the path each lives at (a link the map names by address only): they stay published whatever the Pages
 *   answer says, so their URLs keep working
 * @param {boolean} [input.wo] - whether an opportunity built the site (Website Opportunities): its menus also lose the demo
 *   kit's own dropdowns, and a reservation dropdown leads to the contact page (`demoKitOff`)
 * @param {Set<string>} [input.mapParts] - the template parts the content map covers (`partsInMap`): their words are the
 *   contract's, written by the build through the fill plan, so the sweep leaves those parts as the contract wrote them
 * @returns {Promise<{ cut: number, pages: number, parts: number, navs: number, forms: number, mailboxes: number, options: number, contacts: number, edited: number, dropped: number, hidden: string[], posts: number, relabelled: number, titles: number, unlinked: number, blocksHidden: number, factsWritten: number, sections: Record<string, string[]>, dishLines: number, notes: string[] }>}
 */
export async function sweepWordPress({
  call,
  applyId,
  written,
  entitySlugs,
  extras = [],
  editionPages = [],
  judged,
  edits = [],
  drops = [],
  hides = [],
  facts = [],
  lines = [],
  forms = new Map(),
  meta = [],
  to = null,
  contact = null,
  unwanted = () => [],
  kept = () => [],
  unwantedPaths = [],
  keptPaths = [],
  slotBlocks = new Map(),
  slotCounts = undefined,
  prune = true,
  pruneFill = null,
  names = null,
  categories = [],
  woFill = null,
  showcase = new Set(),
  wo = false,
  mapParts = new Set()
}) {
  const checked = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    const answer = await call(action, params)
    if (answer?.ok === false)
      throw new Error(String(answer.message ?? answer.error ?? `${action} was refused`))
    return answer
  }
  /** @type {string[]} */
  const notes = []
  const part = async (/** @type {string} */ key) => {
    try {
      const answer = await checked('content.get', { kind: 'templatePart', key })
      const content = answer?.item?.content
      return typeof content === 'string' && content !== ''
        ? { content, revision: answer.body_revision ?? null }
        : null
    } catch (error) {
      // The header and the footer are every site's; a sidebar a theme does not have is simply not there.
      if (key === 'header' || key === 'footer')
        notes.push(`the ${key} could not be read: ${error instanceof Error ? error.message : error}`)
      return null
    }
  }
  const [listed, partBodies, navs, copies] = await Promise.all([
    listAll(checked, 'page', true),
    Promise.all(PARTS.map(async (key) => /** @type {const} */ ([key, await part(key)]))),
    listAll(checked, 'wp_navigation', true),
    readPages(checked, editionPages, notes)
  ])
  // A page read by id says its own edition and the page it translates; the listing's copy of it does not.
  const tagged = new Set(copies.map((p) => p.id))
  /** @type {Array<{ id: number, slug: string, title: string, status: string, url?: string, content?: string, edition?: string, base?: string | null }>} */
  const pages = [...listed.filter((p) => !tagged.has(p.id)), ...copies]
  const published = pages.filter((p) => p.status === 'publish' && p.content !== undefined)
  // A listed page of another edition is named after it: `about-vi`, and `vi` for the home page.
  const editionOf = (/** @type {{ slug: string, edition?: string }} */ page) =>
    page.edition !== undefined
      ? (extras.find((e) => e.slug === page.edition) ?? null)
      : (extras.find((e) => page.slug === e.slug || page.slug.endsWith(`-${e.slug}`)) ?? null)
  const baseOf = (/** @type {{ slug: string, edition?: string, base?: string | null }} */ page) => {
    if (page.edition !== undefined) return page.base ?? null
    const edition = editionOf(page)
    if (!edition) return page.slug
    return page.slug === edition.slug ? 'home' : page.slug.slice(0, -(edition.slug.length + 1))
  }
  const source = published.filter((p) => p.edition === undefined && !editionOf(p))

  // Where a page lives: the address the site gave it, or, for a page of the source edition, its slug under the release's
  // own permalinks (`/%postname%/`, locked by its presentation lock).
  const ownEdition = (/** @type {typeof pages[number]} */ page) =>
    page.edition === undefined && !editionOf(page)
  const addressOf = (/** @type {typeof pages[number]} */ page) =>
    page.url ?? (ownEdition(page) ? (baseOf(page) === 'home' ? '/' : `/${page.slug}/`) : null)
  /** A page's path on its site, '' when it has none known; the root is the home page. */
  const placeOf = (/** @type {typeof pages[number]} */ page) => {
    const url = addressOf(page)
    return typeof url === 'string' ? pathOfUrl(url) : ''
  }

  // Which pages go: only what the customer did not pick, and the pages under it. Their translations go with them.
  // 🔒 A PAGE IS HIDDEN ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013). The model's judgement and the
  // showcase rule used to hide pages too: on dev (tamq-7q-tbwp5, a bakery on tracy-base/wp7) the judge named the Product page
  // the customer had ticked, so /product/ answered 404 and its menu links led to the contact page. A page nobody can
  // customize stays published with the template's words; a ticked page stays even when an older answer names its kind.
  const ticked = new Set(kept(source))
  // 🔒 THE SHOWCASE IS PUT AWAY FROM NAVIGATION, NEVER DRAFTED (showcase-nav-map.json): provisioning took its links out of
  // the menus and its pages stay published, so their URLs keep working. A page of the map is not drafted even when the
  // Pages answer leaves it unticked; the customer's own business pages still go as before. A slug the showcase shares with
  // a business page is decided page by page, as below.
  const showcaseIds =
    typeof showcase === 'function' ? showcase(source.map((p) => ({ id: p.id, path: placeOf(p) }))) : showcase
  const shown = new Set(
    source
      .filter((p) => showcaseIds.has(p.id))
      .map((p) => p.slug)
      .filter((slug) => source.every((p) => p.slug !== slug || showcaseIds.has(p.id)))
  )
  const wanted = new Set([...unwanted(source)].filter((slug) => !shown.has(slug)))
  const unticked = new Set([...wanted].filter((slug) => !ticked.has(slug)))
  // 🔒 TWO PAGES OF ONE SLUG ARE TOLD APART BY THEIR PATH (TCH #1013, 13/10/2026, JA Impact WP: "Blog" at /category-blog/ and
  // the kit's "Category Blog" at /pages/j-content/category-blog/). The Pages answer names pages by path; a slug both ticked and
  // unticked is decided page by page, and only the unticked page goes, by id, never by the slug they share.
  const trimmed = (/** @type {string} */ at) => String(at).replace(/^\/+|\/+$/g, '')
  const goneByPath = new Set(unwantedPaths.map(trimmed))
  const keptByPath = new Set(keptPaths.map(trimmed))
  const shared = new Set([...wanted].filter((slug) => ticked.has(slug)))
  const byPath = source.filter(
    (p) =>
      shared.has(p.slug) &&
      !showcaseIds.has(p.id) &&
      goneByPath.has(trimmed(placeOf(p))) &&
      !keptByPath.has(trimmed(placeOf(p)))
  )
  // 🔒 AN UNTICKED PAGE'S CHILDREN GO WITH IT (product owner, 08/10/2026, TCH #1013): a page whose address sits under an
  // unticked page's (`/company/` → `/company/team/`) is that page's, and WordPress keeps answering it when only its parent is
  // drafted. A child the customer ticked stays, and so do a home and a contact page, which no Pages answer takes off.
  const under = source
    .filter((p) => unticked.has(p.slug) || byPath.includes(p))
    .map(placeOf)
    .filter((at) => at !== '' && at !== '/')
  const children = source
    .filter(
      (p) =>
        !ticked.has(p.slug) &&
        !unticked.has(p.slug) &&
        !shown.has(p.slug) &&
        !['home', 'contact'].includes(String(pageKind(p.slug)))
    )
    .filter((p) => under.some((at) => placeOf(p).startsWith(`${at}/`)))
    .map((p) => p.slug)
  const hideSlugs = new Set([...unticked, ...children])
  // The showcase keeps its content: its sections are not cut (`showcasePages`); its navigation was put away at provisioning.
  const asReleased = new Set(showcasePages(source, entitySlugs).map((p) => p.slug))
  const hideIds = new Set([
    ...published.filter((p) => hideSlugs.has(baseOf(p)) && !showcaseIds.has(p.id)).map((p) => p.id),
    ...byPath.map((p) => p.id)
  ])
  const hidden = { slugs: hideSlugs, ids: hideIds }
  // The pages a visitor cannot open once this sweep is done: a menu link to one leads nowhere (`demoKitOff`).
  const unpublished = new Set([...pages.filter((p) => p.status !== 'publish').map((p) => p.id), ...hideIds])

  // 🔒 THE POSTS OF AN UNTICKED POSTS PAGE GO WITH IT (product owner, 08/10/2026, TCH #1013). WordPress keeps serving every
  // post at its own address (`/%postname%/`) whatever its index page became, so an unticked News left each article
  // answering. When the page that goes is the site's posts page (`page_for_posts`), every published post is drafted too,
  // under the same apply id; a blog page that only shows a query of posts is not the posts page, and its posts stay.
  const readOption = async (/** @type {string} */ key) => {
    const answer = await call('content.get', { kind: 'option', key })
    if (answer?.ok !== false) return answer?.item?.value
    if (answer.error === 'not_found') return undefined
    throw new Error(String(answer.message ?? answer.error))
  }
  const hiding = published.filter((p) => hideIds.has(p.id))
  const postsPage = hiding.length ? Number(await readOption('page_for_posts').catch(() => 0)) || 0 : 0
  const posts = hiding.some((p) => p.id === postsPage)
    ? (
        await listAll(checked, 'post', false).catch((error) => {
          notes.push(
            `the posts could not be read, so they stay: ${error instanceof Error ? error.message : error}`
          )
          return []
        })
      ).filter((p) => p.status === 'publish')
    : []

  const goneAt = new Set(
    [...hiding.map(addressOf), ...posts.map((p) => p.url)]
      .filter((url) => typeof url === 'string')
      .map((url) => pathOfUrl(String(url)))
      // The root is the home page, which never goes: an address that reads as the root says nothing about the page.
      .filter((at) => at !== '' && at !== '/')
  )
  // This site's own addresses only: a path, or one on the host its pages are listed at.
  const host = (() => {
    try {
      const listedAt = published.find((p) => p.url)?.url
      return listedAt ? new URL(listedAt).origin : null
    } catch {
      return null
    }
  })()
  // Where each page lives, so a menu item by page id and one by address are known as one place (`demoKitOff`).
  const kitSite = {
    pathOf: new Map(
      pages
        .map((p) => /** @type {[number, string]} */ ([p.id, p.url ? placeOfUrl(p.url) : placeOf(p)]))
        .filter(([, at]) => at !== '')
    ),
    host
  }
  const away = (/** @type {string} */ url) =>
    (/^\/(?!\/)/.test(url) || (host !== null && url.startsWith(`${host}/`))) && goneAt.has(pathOfUrl(url))
  /** Links that still mail or call the template's company although something was typed: said once, at the end. */
  let unfound = 0
  // The last step on a body: its links that mail or call somebody lead to the customer (`wp-contacts.js`).
  const reach = (/** @type {string} */ markup) => {
    if (!contact) return { markup, moved: 0, dropped: 0 }
    const out = contactLinks(markup, contact)
    unfound += out.missed
    return out
  }
  // 🔒 A button to a document of the demo company leads to the Contact page and says so (DEMO FILE LINKS, `wp-buttons.js`).
  let filesLeft = 0
  const files = (/** @type {string} */ markup) => {
    if (!judged?.files) return { markup, moved: 0 }
    const out = fileLinksToContact(markup, judged.files)
    filesLeft += out.left
    return out
  }
  // A button or a link into a page that goes is taken off, never sent elsewhere (`linksOff`); a slot's block is hidden.
  const unlink = (/** @type {string} */ markup, keep = new Set()) =>
    goneAt.size === 0 ? { markup, removed: [], unwrapped: 0, hidden: 0 } : linksOff(markup, away, keep)

  let cutCount = 0
  const result = {
    cut: 0,
    pages: 0,
    parts: 0,
    navs: 0,
    forms: 0,
    mailboxes: 0,
    options: 0,
    contacts: 0,
    edited: 0,
    dropped: 0,
    hidden: /** @type {string[]} */ ([]),
    posts: 0,
    relabelled: 0,
    titles: 0,
    unlinked: 0,
    files: 0,
    blocksHidden: 0,
    factsWritten: 0,
    /** The sections each source page keeps, in order, by its slug (`woFill` only): `receipt.sections` of the build. */
    sections: /** @type {Record<string, string[]>} */ ({}),
    dishLines: 0,
    notes
  }
  /** What an opportunity's build settles in a body before anything else: its facts written or hidden, its hidden blocks. */
  const settle = (
    /** @type {string} */ markup,
    /** @type {(h: { page?: string, part?: string }) => boolean} */ ours
  ) => {
    const said = writeFacts(markup, facts.filter(ours))
    const hid = hideBlocks(said.markup, hides.filter(ours))
    return { markup: hid.markup, hidden: said.hidden + hid.hidden, written: said.written }
  }
  const write = async (/** @type {string} */ what, /** @type {Record<string, unknown>} */ params) => {
    try {
      await checked('content.update', { apply_id: applyId, ...params })
      return true
    } catch (error) {
      notes.push(`${what} could not be changed: ${error instanceof Error ? error.message : error}`)
      return false
    }
  }

  for (const page of published) {
    if (hideIds.has(page.id)) continue
    const edition = editionOf(page)
    // What is this page's: another language's copy is named by its id, a source page by its slug.
    const mine = (/** @type {{ slug?: string, id?: number }} */ e) =>
      e.id !== undefined ? e.id === page.id : !edition && e.slug === page.slug
    // The blocks the contract's slots write into on this page (its copies in other languages carry the same names): none of
    // the steps below may take one off, or the plugin refuses every guided text edit of the site (`slotBlocksByPage`).
    const keep = slotBlocks.get(baseOf(page) ?? '') ?? new Set()
    /** The steps of this page that were not taken because they would have taken a slot's block off. */
    const unsafe = []
    /** Whether a step keeps every slot block the page had; a step that does not is not taken, and is said. */
    const safe = (/** @type {string} */ from, /** @type {string} */ to, /** @type {string} */ step) => {
      if (slotBlocksLost(from, to, keep) === 0) return true
      unsafe.push(step)
      return false
    }
    // What this build has nothing true for is hidden first, kept in the body: the slots in it stay the plugin's.
    const shown = edition
      ? { markup: page.content ?? '', hidden: 0, written: 0 }
      : settle(page.content ?? '', (h) => !h.part && h.page === page.slug)
    // The lines the contract could not place come first: a section with one of them is the customer's.
    let placed = editBlocks(shown.markup, edits.filter(mine), drops.filter(mine), keep)
    if (!safe(shown.markup, placed.markup, 'its blocks with no honest words'))
      placed = { markup: shown.markup, edited: 0, dropped: 0, kept: 0, held: 0 }
    if (placed.kept > 0)
      notes.push(
        `the ${page.slug} page keeps ${placed.kept} block(s) no line could replace: taking them off would leave little of it`
      )
    if (placed.held > 0)
      notes.push(
        `the ${page.slug} page keeps ${placed.held} line(s) of the template no honest words were found for: they are slots guided editing writes into`
      )
    // What the words never reached goes first; the other words of the page are then said again in what is left. A page of the
    // showcase, or its copy, keeps its sections: no written word was meant to reach it.
    let out =
      !prune || asReleased.has(String(baseOf(page)))
        ? { markup: placed.markup, cut: [], refused: undefined }
        : pruneBody(placed.markup, {
            written: edition ? edition.written : written,
            keep,
            names,
            fill: pruneFill
          })
    if (out.refused) notes.push(`the ${page.slug} page was left as it is: ${out.refused}`)
    if (!safe(placed.markup, out.markup, 'its sections the words never reached'))
      out = { markup: placed.markup, cut: [] }
    let said = editLines(
      out.markup,
      lines.filter(mine).map((l) => ({ text: l.text, value: l.value })),
      slotCounts ? { slotted: slottedOn(slotCounts, baseOf(page)) } : {}
    )
    if (!safe(out.markup, said.markup, 'its other lines'))
      said = { markup: out.markup, edited: 0, dropped: 0 }
    // A button or a link into a page that goes is taken off (a slot's block is hidden, `linksOff`).
    let linked = unlink(said.markup, keep)
    if (!safe(said.markup, linked.markup, 'its links to pages taken off'))
      linked = { markup: said.markup, removed: [], unwrapped: 0, hidden: 0 }
    let reached = reach(linked.markup)
    if (!safe(linked.markup, reached.markup, "its links to the template's mailbox and phone"))
      reached = { markup: linked.markup, moved: 0, dropped: 0, left: 0, missed: 0 }
    let filed = files(reached.markup)
    // 🔒 An opportunity's build replaces, never removes (product owner, 22/10/2026): the dish items no slot covers are
    // filled, and every section is marked so the hand-off and the demo QA can name it (`wp-wo-fill.js`).
    if (woFill && !edition) {
      const dished = fillDishItems(filed.markup, {
        keep,
        blank: woFill.blank ?? new Set(),
        dishes: woFill.dishes ?? [],
        ...(woFill.neutralName ? { neutralName: woFill.neutralName } : {}),
        neutralPicture: woFill.neutralPicture ?? null,
        neutralAlt: woFill.neutralAlt ?? ''
      })
      const marked = markSections(dished.markup)
      if (marked.sections.length > 0) result.sections[page.slug] = marked.sections
      result.dishLines += dished.lines + dished.pictures
      filed = { ...filed, markup: marked.markup }
    }
    if (unsafe.length > 0)
      notes.push(
        `the ${page.slug} page keeps ${unsafe.join(', ')} as the template made them: changing them would take off a block a contract slot writes into`
      )
    if (filed.markup === page.content) continue
    if (
      await write(`the ${page.slug} page`, {
        kind: 'post',
        id: page.id,
        fields: { post_content: filed.markup }
      })
    ) {
      result.files += filed.moved
      result.pages += 1
      result.edited += placed.edited + said.edited
      result.dropped += placed.dropped + said.dropped
      result.blocksHidden += shown.hidden
      result.factsWritten += shown.written
      result.unlinked += linked.removed.length + linked.unwrapped
      result.contacts += reached.moved + reached.dropped
      if (pruneFill === null) cutCount += out.cut.length
      else if (out.cut.length > 0)
        notes.push(
          `the ${page.slug} page keeps ${out.cut.length} block(s) naming the template's company, ${pruneFill ? `each line saying "${pruneFill}"` : 'each line emptied'}`
        )
    }
  }
  for (const [id, wanted] of forms) {
    try {
      const answer = await checked('content.get', { kind: 'postmeta', id, key: '_form' })
      const value = answer?.item?.value
      if (typeof value !== 'string') continue
      const out = editForm(value, wanted)
      if (out.form === value) continue
      if (
        await write(`the form ${id}`, { kind: 'postmeta', id, key: '_form', fields: { value: out.form } })
      ) {
        result.forms += 1
        result.edited += out.edited
        result.dropped += out.dropped
      }
    } catch (error) {
      notes.push(`the form ${id} could not be read: ${error instanceof Error ? error.message : error}`)
    }
  }
  // A page's heading meta and its excerpt, said again where they stand (a hidden page's are not worth a write).
  for (const m of meta) {
    if (hideIds.has(m.id)) continue
    for (const [kind, text] of /** @type {const} */ ([
      ['heading', m.heading],
      ['excerpt', m.excerpt]
    ])) {
      const value = text ? lines.find((l) => l.slug === `meta-${m.slug}` && l.text === text)?.value : null
      if (!text || typeof value !== 'string' || value === '' || value === text) continue
      const params =
        kind === 'heading'
          ? { kind: 'postmeta', id: m.id, key: 'tracy_page_heading', fields: { value } }
          : { kind: 'post', id: m.id, fields: { post_excerpt: value } }
      if (await write(`the ${m.slug} page's ${kind}`, params)) result.edited += 1
    }
    // The title and the description the theme prints from metas of its own go back under the key they were read from.
    for (const own of m.own ?? []) {
      const value = own.text
        ? lines.find((l) => l.slug === `meta-${m.slug}` && l.text === own.text)?.value
        : null
      if (!own.text || typeof value !== 'string' || value === '' || value === own.text) continue
      const params = { kind: 'postmeta', id: m.id, key: own.key, fields: { value } }
      if (await write(`the ${m.slug} page's ${own.role}`, params)) result.edited += 1
    }
  }
  // A form mails the owner (`to`: the address they typed, else their account), not the one the host left (`[_site_admin_email]`
  // is the host's) or the template's.
  // Every published form: the ones the pages show, and the ones a template part or a theme file shows (a newsletter beside
  // the news), which no page of the site names.
  if (to) {
    const shown = new Set(
      [
        ...published.filter((p) => !hideIds.has(p.id)).map((p) => p.content ?? ''),
        ...partBodies.map(([, body]) => body?.content ?? '')
      ].flatMap(formIdsIn)
    )
    const listed = await listAll(checked, 'wpcf7_contact_form', false).catch(() => [])
    const ids = new Set([...listed.filter((f) => f.status === 'publish').map((f) => f.id), ...shown])
    // Read them all at once, write them one at a time: the component takes one writer.
    const mails = await Promise.all(
      [...ids].map(async (id) => {
        try {
          const answer = await checked('content.get', { kind: 'postmeta', id, key: '_mail' })
          return /** @type {const} */ ([id, mailTo(answer?.item?.value, to)])
        } catch (error) {
          notes.push(
            `the form ${id}'s mail could not be read: ${error instanceof Error ? error.message : error}`
          )
          return /** @type {const} */ ([id, null])
        }
      })
    )
    for (const [id, next] of mails) {
      if (!next) continue
      if (
        await write(`the form ${id}'s recipient`, {
          kind: 'postmeta',
          id,
          key: '_mail',
          fields: { value: next }
        })
      )
        result.mailboxes += 1
    }
  }
  // 🔒 A SITE'S OWN MAILBOXES ARE TWO OPTIONS, AND APPLY WROTE NEITHER (ledger L17b, 05/10/2026). Every Tracy WordPress theme
  // sends its own contact form to `tracy_contact_to` and nowhere else (never `admin_email`, Tracy's mailbox on a site Tracy
  // installs), and shows the site's public address from `contact.email` of `tracy_site_identity`. The Build path writes the
  // first (`apply-wordpress.mjs`); Apply wrote neither, so a visitor's message through such a form failed, and a theme that
  // shows the address showed none or the template's. The recipient is `to` (typed, else the account, which is never shown);
  // the address shown is only what the customer typed. 🔒 With nothing typed the demo's stays, a placeholder like the rest of the
  // demo's contact lines (11/10/2026, BLANK and FULL alike): it was emptied before.
  const owned = [
    ...(to
      ? [
          {
            key: 'tracy_contact_to',
            what: "the site's contact form recipient",
            next: (/** @type {unknown} */ v) => (v === to ? null : to)
          }
        ]
      : []),
    ...(contact?.email
      ? [
          {
            key: 'tracy_site_identity',
            what: "the site's public mailbox",
            next: (/** @type {unknown} */ v) => identityWithEmail(v, contact.email)
          }
        ]
      : [])
  ]
  for (const { key, what, next } of owned) {
    let value
    try {
      value = next(await readOption(key))
    } catch (error) {
      notes.push(`${what} could not be read: ${error instanceof Error ? error.message : error}`)
      continue
    }
    if (value !== null && (await write(what, { kind: 'option', key, fields: { value } }))) result.options += 1
  }
  for (const [key, body] of partBodies) {
    if (!body) continue
    // 🔒 A PART THE CONTENT MAP COVERS IS THE CONTRACT'S (TracyHQ/tracy#139): its words are slots the build wrote, some
    // found by position, so no step here rewrites, relabels or cuts one of its blocks.
    if (mapParts.has(key)) continue
    const settled = settle(body.content, (h) => h.part === key)
    const out = prune
      ? pruneBody(settled.markup, { written: new Set(), names, fill: pruneFill })
      : { markup: settled.markup, cut: [] }
    // The header and the footer are every site's, so a part left whole is worth saying; a sidebar is not.
    if (out.refused && (key === 'header' || key === 'footer'))
      notes.push(`the ${key} was left as it is: ${out.refused}`)
    // 🔒 A NAVIGATION WRITTEN INSIDE A PART LOSES ITS LINKS TOO (TCH #1013, measured 08/10/2026 on JA Kinetic WP): its header
    // navigation has no `ref` to a wp_navigation post and its links are custom ones (`/pricing`), so an unticked page stayed
    // in the menu while its address answered 404. Judged by this site's path, the way a link in a body is (`away`).
    const pruned = navWithout(out.markup, hidden, away)
    const kit = wo ? demoKitOff(pruned.markup, unpublished, kitSite) : { markup: pruned.markup, cut: [] }
    const links = { markup: kit.markup, cut: [...pruned.cut, ...kit.cut] }
    // A header or footer item, a button or a link into such a page goes too, before its words are said again (`linksOff`:
    // Tracy Base WP writes its desktop header links as paragraphs of the header part, not as navigation links).
    const linked = unlink(links.markup)
    // Its labels are relabelled like a wp_navigation post's: a part is the source edition's (TCH #1013); an item that leads to a
    // renamed category first takes its new name (L1, `relabelCategories`).
    const named = relabelCategories(linked.markup, categories)
    const judgedMenus = relabel(named.markup, judged.relabel)
    const menus = { markup: judgedMenus.markup, changed: [...named.changed, ...judgedMenus.changed] }
    // In the site's one language its buttons too (`relabelButtons`); in the source's language they keep the template's words.
    const buttons = judged.language
      ? relabelButtons(menus.markup, judged.relabel)
      : { markup: menus.markup, changed: [] }
    const labels = { markup: buttons.markup, changed: [...menus.changed, ...buttons.changed] }
    const said = editLines(
      labels.markup,
      lines.filter((l) => l.slug === `part-${key}`).map((l) => ({ text: l.text, value: l.value }))
    )
    // The named lines of the part, planned only for a site in one language other than the source's (`namedRuns`).
    const runs = editRuns(
      said.markup,
      lines.filter((l) => l.slug === `run-${key}`).map((l) => ({ text: l.text, value: l.value }))
    )
    const reached = reach(runs.markup)
    const filed = files(reached.markup)
    if (filed.markup === body.content) continue
    const params = { kind: 'templatePart', key, fields: { content: filed.markup } }
    if (
      await write(`the ${key}`, body.revision ? { ...params, expected_body_revision: body.revision } : params)
    ) {
      result.files += filed.moved
      result.parts += 1
      result.edited += said.edited + runs.edited
      result.dropped += said.dropped
      result.unlinked += linked.removed.length + linked.unwrapped
      result.contacts += reached.moved + reached.dropped
      result.relabelled += labels.changed.length
      result.blocksHidden += settled.hidden
      result.factsWritten += settled.written
      cutCount += (pruneFill === null ? out.cut.length : 0) + links.cut.length
      if (pruneFill !== null && out.cut.length > 0)
        notes.push(
          `the ${key} keeps ${out.cut.length} block(s) naming the template's company, ${pruneFill ? `each line saying "${pruneFill}"` : 'each line emptied'}`
        )
    }
  }
  const extraSlugs = extras.map((e) => e.slug)
  for (const nav of navs) {
    if (nav.status !== 'publish' || nav.content === undefined) continue
    let markup = nav.content
    const pruned = navWithout(markup, hidden)
    const kit = wo ? demoKitOff(pruned.markup, unpublished, kitSite) : { markup: pruned.markup, cut: [] }
    const links = { markup: kit.markup, cut: [...pruned.cut, ...kit.cut] }
    markup = links.markup
    // Another edition's menu keeps its own words; only the links go from every one.
    const ownLanguage = !extraSlugs.some((slug) => nav.slug.endsWith(`-${slug}`))
    // An item that leads to a renamed category takes its new name first (L1), then the judge's labels.
    const named = ownLanguage ? relabelCategories(markup, categories) : { markup, changed: [] }
    const judgedLabels = ownLanguage ? relabel(named.markup, judged.relabel) : { markup, changed: [] }
    const labels = { markup: judgedLabels.markup, changed: [...named.changed, ...judgedLabels.changed] }
    markup = labels.markup
    if (markup === nav.content) continue
    if (await write(`the ${nav.slug} menu`, { kind: 'post', id: nav.id, fields: { post_content: markup } })) {
      result.navs += 1
      cutCount += links.cut.length
      result.relabelled += labels.changed.length
    }
  }
  // 🔒 A PAGE TITLED BY ITS MENU WORD IS TITLED IN THE SITE'S LANGUAGE TOO (LANG-2, measured 10/10/2026 on dev g55-ess-wp-full,
  // JA Essence WordPress 1.0.10): every browser tab of a Vietnamese site read "Login Form –", "Contact –". A title is no slot
  // of the contract, and 34 of that template's 35 pages are titled exactly as their menu entry, so the labels the judge gave in
  // the site's one language title them as well. A page titled otherwise keeps its title; a site in its source language too.
  if (judged.language && judged.relabel.size > 0)
    for (const page of source) {
      const title = judged.relabel.get(page.title)
      if (!title || hiding.includes(page)) continue
      if (
        await write(`the ${page.slug} page title`, {
          kind: 'post',
          id: page.id,
          fields: { post_title: title }
        })
      )
        result.titles += 1
    }
  // 🔒 A DRAFTED POSTS PAGE STILL ANSWERS (measured 08/10/2026, Tracy Business WP 1.3.4): WordPress keeps serving the
  // posts index at the address of `page_for_posts` whatever that page's status, so an unticked News page stayed reachable
  // at /news/. Drafting it also sets the option to 0, under the same apply id, so the address 404s and the undo restores it.
  for (const page of hiding) {
    if (
      !(await write(`the ${page.slug} page`, { kind: 'post', id: page.id, fields: { post_status: 'draft' } }))
    )
      continue
    result.hidden.push(page.slug)
    if (page.id !== postsPage) continue
    await write("the site's posts page setting", {
      kind: 'option',
      key: 'page_for_posts',
      fields: { value: 0 }
    })
    // Its posts, each drafted, one write at a time, under the same apply id.
    for (const post of posts)
      if (
        await write(`the ${post.slug} post`, { kind: 'post', id: post.id, fields: { post_status: 'draft' } })
      )
        result.posts += 1
  }
  if (filesLeft > 0)
    notes.push(
      `${filesLeft} button(s) to a document of the template's company keep their link: their label is not one line`
    )
  if (unfound > 0)
    notes.push(
      `${unfound} link(s) to the template's mailbox or phone were left: their block keeps them in a way that could not be changed safely`
    )
  result.cut = cutCount
  return result
}
