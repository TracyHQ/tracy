/**
 * The words of a WordPress page that no slot names, planned and written like slots.
 *
 * 🔒 A PAGE HAS WORDS THE CONTRACT NEVER LISTED. Measured 03/10/2026 on a bakery's `tracy-business/wp7` once the
 * slots were written and the template's own sections were cut: the News page still said "News & engineering notes" and
 * offered "Tender news, material price movements and engineering notes", and the Contact page asked a bakery's
 * customers to attach drawings for a "take-off". They are single lines in ordinary blocks — a heading, a paragraph — on
 * pages that have a few slots or none, so no slot reaches them and no section is theirs to cut.
 *
 * They are made slots here: every line of one block that is more than the template's interface becomes a slot of a map
 * built from the page itself, so the SEEDER'S OWN PLANNER writes them (its batches, its language check, its fact
 * rules, `guard.js`), and the answer goes back into the block that held the line, found by its text. The map is what
 * the Claude Cowork plugin calls a derived contract (`DerivedMap`), built on this side from `content.list` because
 * the plugin derives only at import.
 *
 * Not touched: a block with a name (`metadata.name`: the contract's slots, written or left by decision), a raw HTML
 * block (cut or kept as a whole by `wp-residue.js`), a live block or one that wears an identity token.
 */

import {
  cut,
  hasLive,
  htmlRuns,
  isLiveBlock,
  parseBlocks,
  plain,
  singleLine,
  tokensOf,
  withText
} from './wp-blocks.js'
import { isInterface } from './repair.js'
import { buttonKind, buttonLink } from './wp-buttons.js'

/** A line shorter than this is a label, not a sentence. */
const MIN_LENGTH = 12

/**
 * Whether a line is only an address: what an embed block holds (a YouTube video, a post of a network), which WordPress turns
 * into the player at the visit. 🔒 K6 (measured 11/10/2026 on dev g64-ess-wp-full, JA Essence WordPress 1.0.15): the video
 * of a post was planned as a line and printed a sentence in its place. An address is never words to rewrite or translate.
 */
const isAddress = (/** @type {string} */ text) => /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/i.test(text.trim())

/**
 * How many blocks of each name the contract's slots write into, by page slug: the contract finds a slot by the nth block of its
 * name (`target.block`), so a name listed once is the first block's only (JA Essence), and one listed three times is the first
 * three's (Tracy Business, `wp-duplicates.js`).
 * @param {{ entities?: any[], slots?: any[] }} contentMap
 * @returns {Map<string, Map<string, number>>}
 */
export function slotCountsByPage(contentMap) {
  /** @type {Map<string, string>} */
  const slugOf = new Map()
  for (const entity of contentMap.entities ?? [])
    if (entity.kind === 'page' && typeof entity.identity?.slug === 'string')
      slugOf.set(String(entity.key), entity.identity.slug)
  /** @type {Map<string, Map<string, number>>} */
  const out = new Map()
  for (const slot of contentMap.slots ?? []) {
    const slug = slugOf.get(String(slot.entity))
    const block = slot.target?.block
    if (!slug || typeof block !== 'string' || block === '') continue
    const own = out.get(slug) ?? new Map()
    own.set(block, (own.get(block) ?? 0) + 1)
    out.set(slug, own)
  }
  return out
}

/**
 * How many blocks of a name are a slot's on the page `slug` (`slotCountsByPage`), for the `slotted` option of the line passes.
 * @param {Map<string, Map<string, number>>} counts
 * @param {string | null | undefined} slug
 * @returns {(name: string) => number}
 */
export const slottedOn = (counts, slug) => {
  const own = counts.get(String(slug ?? '')) ?? new Map()
  return (name) => own.get(name) ?? 0
}

/**
 * Which of its name each named block of a body is, counting from 1 in document order.
 * @param {import('./wp-blocks.js').Block} root
 * @returns {Map<import('./wp-blocks.js').Block, number>}
 */
function nthOfName(root) {
  /** @type {Map<string, number>} */
  const seen = new Map()
  /** @type {Map<import('./wp-blocks.js').Block, number>} */
  const out = new Map()
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    const name = node.attrs?.metadata?.name
    if (typeof name === 'string' && name !== '') {
      const nth = (seen.get(name) ?? 0) + 1
      seen.set(name, nth)
      out.set(node, nth)
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  return out
}

/**
 * The test a line pass leaves a named block out by: on a page (`slotted` given) only a block a contract slot can name (the
 * first of its name, or one of the first `slotted(name)`); in a template part (no `slotted`) every named block, a name there
 * being the theme's (`namedRuns`).
 *
 * 🔒 A REPEAT OF A NAME NO SLOT NAMES IS A LINE OF THE PAGE (LANG-2, TCH #1013). Measured 11/10/2026 in the JA Essence WordPress
 * 1.0.12 dump: home-2 holds three blocks named `articles-category.main-section` and home-3, home-5 two each, and the contract
 * lists each name once; "Trending", "Features post" and the second "Features Lead" stayed English on dev g60-ess-wp-full
 * because the line passes left out every named block.
 * @param {import('./wp-blocks.js').Block} root
 * @param {((name: string) => number) | undefined} slotted
 * @returns {(node: import('./wp-blocks.js').Block) => boolean}
 */
function namedTest(root, slotted) {
  if (!slotted) return (node) => Boolean(node.attrs?.metadata?.name)
  const nth = nthOfName(root)
  return (node) => {
    const name = node.attrs?.metadata?.name
    if (typeof name !== 'string' || name === '') return false
    return (nth.get(node) ?? 1) <= Math.max(1, slotted(name))
  }
}

/**
 * Whether a run of a raw HTML block is a sentence to say again: long enough, made of words, and no identity token, shortcode
 * or interface word. (A page's raw HTML also holds markup, data and labels no sentence replaces.)
 * @param {string} text
 */
const isSentence = (text) =>
  text.length >= MIN_LENGTH && /\p{L}{3}/u.test(text) && !/[{}[\]]/.test(text) && !isInterface(text)

/**
 * A button block's kind and address (`wp-buttons.js`), or null for any other block.
 * @param {string} markup
 * @param {import('./wp-blocks.js').Block} node
 * @param {string | null} text
 */
const buttonOf = (markup, node, text) => {
  if (node.name !== 'core/button' || text === null) return null
  const link = buttonLink(markup, node)
  return { kind: buttonKind({ text, ...link }), href: link.href }
}

/**
 * The lines of a body worth putting to the model, once each, in document order. A button into a page of the site carries its
 * address (`href`), so the planner is told where it leads; a social button, one that leads nowhere and one to a document are
 * not lines to say again (`wp-buttons.js`): the first two are labels (`labelLines`), the last leads to the Contact page.
 * @param {string} markup
 * @param {{ slotted?: (name: string) => number }} [options] - `slotted`: the body is a page's, and this many blocks of a name are
 *   a slot's (`slottedOn`); absent, every named block is left out (a template part)
 * @returns {Array<{ text: string, block: string, href?: string }>}
 */
export function staticLines(markup, { slotted } = {}) {
  const root = parseBlocks(markup)
  if (!root) return []
  const isNamed = namedTest(root, slotted)
  /** @type {Map<string, { text: string, block: string }>} */
  const out = new Map()
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.name === 'core/html') {
      // Raw HTML is cut or kept as a whole (`wp-residue.js`); what is left of it says its sentences again where they stand.
      for (const run of htmlRuns(markup, node))
        if (isSentence(run.text) && !out.has(run.text))
          out.set(run.text, { text: run.text, block: node.name })
      return
    }
    if (!isNamed(node) && node.children.length === 0 && !hasLive(markup, node)) {
      const text = singleLine(markup, node)
      const button = buttonOf(markup, node, text)
      if (
        text !== null &&
        text.length >= MIN_LENGTH &&
        !isInterface(text) &&
        !isAddress(text) &&
        !out.has(text) &&
        (!button || button.kind === 'page')
      )
        out.set(
          text,
          button?.href ? { text, block: node.name, href: button.href } : { text, block: node.name }
        )
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  return [...out.values()]
}

/** Whether a run is words a visitor reads: letters, no identity token, shortcode or data. */
const isWords = (/** @type {string} */ text) =>
  /\p{L}{2}/u.test(text) && !isAddress(text) && !/[{}[\]]/.test(text) && tokensOf(text).length === 0

/**
 * The words of a body `staticLines` leaves to the template because they are not sentences to say again for a business: a
 * label ("Health", "New", "Primary"), a run of a paragraph a link or a tag cuts in two ("You can use the mark tag to" ·
 * "highlight" · "text."), a short run of raw HTML ("Each" · "JA Template"). Once each, in document order.
 *
 * 🔒 ONLY TO BE TRANSLATED, FOR A SITE WRITTEN IN ONE LANGUAGE OTHER THAN THE SOURCE'S (LANG-2, measured 11/10/2026 on dev
 * g58-ess-wp-full, JA Essence WordPress 1.0.11, Vietnamese): the Layout 1 page kept its "Health" badge and "By" before the
 * author, and the Typography, Error and Offline pages kept half their words in English. They are never rewritten: a label
 * says what the template draws, not what the business does. Written back where they stand (`editLines`).
 * @param {string} markup
 * @param {{ slotted?: (name: string) => number }} [options] - `slotted`: the body is a page's, and this many blocks of a name are
 *   a slot's (`slottedOn`); absent, every named block is left out (a template part)
 * @returns {Array<{ text: string, block: string }>}
 */
export function labelLines(markup, { slotted } = {}) {
  const root = parseBlocks(markup)
  if (!root) return []
  const isNamed = namedTest(root, slotted)
  const lines = new Set(staticLines(markup, { slotted }).map((line) => line.text))
  /** @type {Map<string, { text: string, block: string }>} */
  const out = new Map()
  const add = (/** @type {string} */ text, /** @type {string} */ block) => {
    if (isWords(text) && !lines.has(text) && !out.has(text)) out.set(text, { text, block: `${block} label` })
  }
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.name === 'core/html') {
      for (const run of htmlRuns(markup, node)) if (!isSentence(run.text)) add(run.text, node.name)
      return
    }
    if (!isNamed(node) && node.children.length === 0 && !hasLive(markup, node)) {
      const text = singleLine(markup, node)
      const kind = buttonOf(markup, node, text)?.kind
      if (text === null) for (const run of htmlRuns(markup, node)) add(run.text, node.name ?? 'block')
      else if (kind === 'file') {
        // A button to the demo company's document leads to the Contact page and says so (`fileLinksToContact`).
      } else if (text.length < MIN_LENGTH || isInterface(text) || kind === 'social' || kind === 'void')
        add(text, node.name ?? 'block')
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  return [...out.values()]
}

/**
 * A contract map of those lines, for the planner: one entity per page, one slot per line, labelled by what the page is
 * (`what`, "blog posts") or by its slug.
 * @param {Array<{ slug: string, what?: string, lines: Array<{ text: string, block: string }> }>} pages
 * @param {string} language - the edition's language, as the planner reads it from an entity (`en`)
 * @returns {{ contentMap: { entities: any[], slots: any[] }, keys: Map<string, { slug: string, text: string }> }}
 */
export function lineMap(pages, language) {
  /** @type {any[]} */
  const entities = []
  /** @type {any[]} */
  const slots = []
  /** @type {Map<string, { slug: string, text: string }>} */
  const keys = new Map()
  for (const page of pages) {
    if (page.lines.length === 0) continue
    const entity = `line-${page.slug}`
    entities.push({ key: entity, kind: 'page', identity: { postType: 'page', slug: page.slug, language } })
    page.lines.forEach((line, i) => {
      const key = `line.${page.slug}.${i + 1}`
      keys.set(key, { slug: page.slug, text: line.text })
      slots.push({
        key,
        entity,
        type: 'text',
        sample: line.text,
        maxCharacters: Math.max(40, Math.ceil(line.text.length * 1.25)),
        label: `${page.what ?? `${page.slug} page`} — ${line.block.replace(/^core\//, '')}`
      })
    })
  }
  return { contentMap: { entities, slots }, keys }
}

/**
 * The body with lines replaced or taken off: each `edit` names a line by its text, and every block that holds
 * exactly that one line, unnamed and not raw HTML, takes the value — or goes, when the value is null. A sentence inside raw
 * HTML takes the value where it stands (the text between its tags and nothing else); a raw HTML line with no value to take
 * is left as it is, since nothing can say where its markup ends.
 * @param {string} markup
 * @param {Array<{ text: string, value: string | null }>} edits
 * @param {{ slotted?: (name: string) => number }} [options] - `slotted`: the body is a page's, and this many blocks of a name are
 *   a slot's (`slottedOn`); absent, every named block is left out (a template part)
 * @returns {{ markup: string, edited: number, dropped: number }}
 */
export function editLines(markup, edits, { slotted } = {}) {
  const root = parseBlocks(markup)
  if (!root || edits.length === 0) return { markup, edited: 0, dropped: 0 }
  const isNamed = namedTest(root, slotted)
  const want = new Map(edits.map((e) => [e.text, e.value]))
  /** @type {Array<{ at: number, node: import('./wp-blocks.js').Block | null, run: { start: number, end: number } | null, value: string | null }>} */
  const found = []
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.name === 'core/html') {
      for (const run of htmlRuns(markup, node)) {
        const value = want.get(run.text)
        if (typeof value === 'string' && value !== '') found.push({ at: run.start, node: null, run, value })
      }
      return
    }
    if (!isNamed(node) && node.children.length === 0) {
      const text = singleLine(markup, node)
      if (text !== null && !isAddress(text) && want.has(text))
        found.push({ at: node.start, node, run: null, value: want.get(text) ?? null })
      // A block of several runs (a link or a tag in the middle of a paragraph) takes each run's value where it stands, and
      // only a value: a run is never taken off (`labelLines`).
      if (text === null && !hasLive(markup, node))
        for (const run of htmlRuns(markup, node)) {
          const value = want.get(run.text)
          if (typeof value === 'string' && value !== '') found.push({ at: run.start, node: null, run, value })
        }
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  // Last first, so the blocks still to do keep the places they were found at.
  let out = markup
  let edited = 0
  let dropped = 0
  for (const { node, run, value } of found.sort((a, b) => b.at - a.at)) {
    /** @type {string | null} */
    let next
    if (run && value !== null)
      next = `${out.slice(0, run.start)}${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}${out.slice(run.end)}`
    else if (node) next = value === null ? cut(out, [[node.start, node.end]]) : withText(out, node, value)
    else continue
    if (next === null || !parseBlocks(next)) continue
    out = next
    if (value === null) dropped += 1
    else edited += 1
  }
  return { markup: out, edited, dropped }
}

/** A text as a name is compared: entities decoded, one case, one spacing, no punctuation around it. */
const asName = (/** @type {unknown} */ text) =>
  plain(String(text ?? ''))
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')

/**
 * The answers that say nothing but the business's name, for a line that is not that name already: no answer at all.
 *
 * 🔒 Measured 11/10/2026 on dev g57-ess-wp-full (JA Essence WordPress 1.0.10, About given): the heading the Layout 1 page prints
 * over its article (`tracy_page_heading`) came back as the bakery's name, so the page's h1 and its tab named the bakery
 * instead of an article. The guard lets a name through (the customer gave it), and nothing else read the answer.
 * @param {Record<string, string>} values
 * @param {Map<string, any>} slotOf
 * @param {string | null | undefined} name
 * @returns {Set<string>}
 */
function bareNames(values, slotOf, name) {
  const own = asName(name)
  /** @type {Set<string>} */
  const out = new Set()
  if (own.length < 3) return out
  for (const [key, value] of Object.entries(values))
    if (asName(value) === own && asName(slotOf.get(key)?.sample) !== own) out.add(key)
  return out
}

/**
 * What to say in place of each line of a site's pages and forms: planned as slots by the planner it is handed, the
 * ones it leaves pending asked once more, and what even that cannot write marked for removal. A line answered with only the
 * business's `name` is asked again, and keeps the template's words when that is still all it gets (`bareNames`).
 * @param {object} input
 * @param {Array<{ slug: string, what?: string, lines: Array<{ text: string, block: string }> }>} input.pages
 * @param {Array<{ id: number, lines: Array<{ text: string, kind: 'text' | 'placeholder' }> }>} input.forms
 * @param {string} input.language
 * @param {(map: { entities: any[], slots: any[] }) => Promise<{ changes: Record<string, string>, pending: string[] }>} input.plan
 * @param {(slots: any[]) => Promise<{ texts: Record<string, string>, nulls: Set<string> }>} input.repair
 * @param {(changes: Record<string, string>, slotOf: Map<string, any>) => { kept: Record<string, string>, dropped: Array<{ key: string }> }} input.guard
 * @param {string | null} [input.name] - the business's name
 * @returns {Promise<{ lines: Array<{ slug: string, text: string, value: string | null }>, forms: Map<number, Map<string, string | null>> }>}
 */
export async function planLines({ pages, forms, language, plan, repair, guard, name = null }) {
  const all = [
    ...pages,
    ...forms.map((form) => ({
      slug: `form-${form.id}`,
      lines: form.lines.map((line) => ({
        text: line.text,
        block: line.kind === 'placeholder' ? 'form placeholder' : 'form text'
      }))
    }))
  ]
  const { contentMap, keys } = lineMap(all, language)
  /** @type {{ lines: Array<{ slug: string, text: string, value: string | null }>, forms: Map<number, Map<string, string | null>> }} */
  const out = { lines: [], forms: new Map() }
  if (contentMap.slots.length === 0) return out
  const slotOf = new Map(contentMap.slots.map((s) => [s.key, s]))
  const first = await plan(contentMap)
  const checked = guard(first.changes, slotOf)
  const values = { ...checked.kept }
  for (const key of bareNames(values, slotOf, name)) delete values[key]
  // Every line the first pass has no value for: pending, stopped by the guard, or simply not answered.
  const left = contentMap.slots.filter((slot) => !(slot.key in values))
  /** @type {Set<string>} */
  let nothing = new Set()
  if (left.length > 0) {
    const second = await repair(left)
    const again = guard(second.texts, slotOf)
    const named = bareNames(again.kept, slotOf, name)
    for (const [key, value] of Object.entries(again.kept)) if (!named.has(key)) values[key] = value
    nothing = new Set([...second.nulls, ...again.dropped.map((d) => d.key)])
  }
  for (const [key, where] of keys) {
    const value = key in values ? values[key] : nothing.has(key) ? null : undefined
    if (value === undefined || value === where.text) continue
    const form = /^form-(\d+)$/.exec(where.slug)
    if (form) {
      const id = Number(form[1])
      out.forms.set(id, (out.forms.get(id) ?? new Map()).set(where.text, value))
    } else out.lines.push({ slug: where.slug, text: where.text, value })
  }
  return out
}

/** The named blocks another pass says again: a button by its label, raw HTML by its sentences. */
const SAID_ELSEWHERE = new Set(['core/button', 'core/html'])

/**
 * Whether a block's runs are a part's lines no other pass says again (`namedRuns`): a leaf block, not a button or raw HTML, not
 * printed by WordPress at the visit, that carries a name (the theme's, in a part) or an identity token (which keeps it out of
 * `staticLines` and `labelLines`).
 * @param {string} markup
 * @param {import('./wp-blocks.js').Block} node
 */
const isRunBlock = (markup, node) =>
  node.children.length === 0 &&
  !SAID_ELSEWHERE.has(node.name ?? '') &&
  !isLiveBlock(node.name) &&
  (Boolean(node.attrs?.metadata?.name) || tokensOf(markup.slice(node.start, node.end)).length > 0)

/**
 * The text runs of a part's NAMED blocks, and of its blocks that carry an identity token, which no other pass says again:
 * `staticLines` leaves a named block out (in a page the name is a contract slot's), and so it leaves out every named line of a
 * template part too, where a name is the theme's and no slot writes; it leaves out a block with a token as live. A run that
 * carries an identity token is one of them: its words are said again around the token.
 *
 * 🔒 ONLY FOR A SITE WRITTEN IN ONE LANGUAGE OTHER THAN THE SOURCE'S (LANG-2, measured 10/10/2026 on dev g56-ess-wp-full, JA
 * Essence WordPress 1.0.10): the footer's `footer.copyright`, "Copyright © {year} {site.title}. All Rights Reserved.<br>
 * WordPress is Free Software released under the GNU General Public License.", stayed English on a Vietnamese site. A site
 * in the source's language keeps them as the theme wrote them; the caller decides.
 *
 * 🔒 AN UNNAMED COPYRIGHT LINE IS ONE TOO (LANG-2, round g60, 10/10/2026): JA Impact, Morgan, Nova, Vega and Kinetic print
 * "Copyright © {year} {site.title}. All Rights Reserved." in a paragraph with no name, which the token kept away from every
 * other pass.
 *
 * Left to their own passes: a button (`wp-residue.js` `partButtons`), raw HTML, and a block WordPress prints at the visit.
 * @param {string} markup
 * @returns {Array<{ text: string, block: string }>} `block` says which block the run is in (its name, when it has one)
 */
export function namedRuns(markup) {
  const root = parseBlocks(markup)
  if (!root) return []
  /** @type {Map<string, { text: string, block: string }>} */
  const out = new Map()
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (isRunBlock(markup, node)) {
      const name = node.attrs?.metadata?.name
      for (const run of htmlRuns(markup, node)) {
        const words = tokensOf(run.text).reduce((rest, token) => rest.replace(token, ' '), run.text)
        if (!/\p{L}{3}/u.test(words) || out.has(run.text)) continue
        out.set(run.text, { text: run.text, block: name ? `${node.name} ${name}` : String(node.name) })
      }
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  return [...out.values()]
}

/**
 * A part with the runs of its named blocks (`namedRuns`) replaced where they stand, the tags around them, the block's comment
 * and its name kept. A value that does not carry the run's identity tokens again, each as often, is not written: the year and
 * the site's name are filled at the visit, and words written over them would print the template's. The caller makes sure an
 * answer carries them (`wp-runs.js`), and says the ones it could not.
 * @param {string} markup
 * @param {Array<{ text: string, value: string | null }>} edits
 * @returns {{ markup: string, edited: number }}
 */
export function editRuns(markup, edits) {
  const root = parseBlocks(markup)
  const want = new Map(
    edits
      .filter((e) => typeof e.value === 'string' && e.value.trim() !== '')
      .map((e) => [e.text, String(e.value)])
  )
  if (!root || want.size === 0) return { markup, edited: 0 }
  const same = (/** @type {string} */ a, /** @type {string} */ b) =>
    tokensOf(a).sort().join(' ') === tokensOf(b).sort().join(' ')
  /** @type {Array<{ start: number, end: number, value: string }>} */
  const found = []
  const named = new Set(namedRuns(markup).map((r) => r.text))
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (isRunBlock(markup, node))
      for (const run of htmlRuns(markup, node)) {
        const value = want.get(run.text)
        if (named.has(run.text) && value !== undefined && value !== run.text && same(run.text, value))
          found.push({ start: run.start, end: run.end, value })
      }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  let out = markup
  let edited = 0
  // Last first, so the runs still to do keep the places they were found at.
  for (const run of found.sort((a, b) => b.start - a.start)) {
    const escaped = run.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const next = `${out.slice(0, run.start)}${escaped}${out.slice(run.end)}`
    if (!parseBlocks(next)) continue
    out = next
    edited += 1
  }
  return { markup: out, edited }
}
