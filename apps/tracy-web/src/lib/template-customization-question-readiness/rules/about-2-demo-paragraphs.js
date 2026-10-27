/**
 * ABOUT-2: when the customer answers the description, no page keeps a paragraph of the demo
 * (spec `tasks/spec-template-customization-question-readiness.md`, ABOUT-2). Static is the lower
 * bound: the demo text that NOTHING can rewrite. What really stays on a built site (Tracy keeping a
 * slot for lack of evidence, text in pictures or scripts) only a built site shows.
 *
 * - Joomla: every row of the contract's pages in the presentation lock (articles, modules), split
 *   into text pieces; a piece of prose must be a text slot of the same entity and column (`params`
 *   by `jsonPath`). A module that shows its title (`showtitle = 1`) needs a `title` slot.
 * - WordPress: the contract's pages and the `header`/`footer` template parts in the dump; a named
 *   block (`metadata.name`) with no inner block and with text needs a slot targeting its name.
 *   Unnamed blocks are Tracy's (`wp-leaves.js`, `wp-residue.js`).
 * - EmDash: every default-locale field of `seed/seed.json` with a sentence in it needs a rule that
 *   writes it (`identity`, `copy`, `blocks`, `rewrite`, `facts`, `trim`); `labels` and `replace`
 *   alone keep the demo's words. The alt text of a demo picture the site keeps (`<image>_alt` whose
 *   slot no `images` rule redraws, `readers/emdash-kept-pictures.js`) describes that picture and is
 *   not counted; the alt of a picture the customer replaces is.
 * Demo text kept on purpose is declared by the template (D6): `keptText` of the contract's
 * `<version>.copy.json` (Joomla, WordPress) or of `seed/personalize.json` (EmDash), read through
 * `contract-copy.js`; a declared piece is listed in the details, not counted.
 *
 * Categories (final decisions of 12/10/2026): FULL renames the blog categories for the customer's trade, so a demo
 * menu item that names a category by another label than the category's title fails too (Joomla and WordPress,
 * `readers/category-menu-labels.js`); a dump this check cannot read leaves that part to a built site
 * (`menu-category-names` of the built-site check).
 */

import { declaredCopy, splitKept } from '../../contract-copy.js'
import { categoryMenuLabels } from '../readers/category-menu-labels.js'
import { keptPictureAlt } from '../readers/emdash-kept-pictures.js'
import {
  coverageOf,
  defaultEntries,
  emdashTemplate,
  isRewritten,
  stringsIn
} from '../readers/emdash-personalize-coverage.js'
import {
  acmStrings,
  htmlTextPieces,
  isProse,
  isSettingField,
  normalText,
  samePath
} from '../readers/joomla-row-text.js'
import {
  contractOf,
  declaredCopyOwner,
  NO_CONTRACT_FIX,
  NO_CONTRACT_OWNER,
  slotsByEntity
} from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { wordpressDemoBlocks } from '../readers/wordpress-named-blocks.js'
import { counted as countOf } from '../readers/rule-findings.js'
import { customizable } from '../../contract-customize.js'

const HTML_COLUMNS = ['content', 'introtext', 'fulltext', 'description']

/** @typedef {{ entity: string, field: string, line: string }} DemoPiece */

/** @param {import('../readers/quickstart-contract.js').SealingContract} contract */
function joomla(contract) {
  const lock = contract.json('presentation-lock.json')
  const map = contract.json('content-map.json')
  const slots = slotsByEntity(map)
  const keys = new Set()
  for (const page of map?.pages ?? []) {
    for (const m of page.assignedModules ?? []) if (m.published === '1') keys.add(m.entity)
    const article = /[?&]id=(\d+)/.exec(String(page.link ?? ''))
    if (/view=article/.test(String(page.link ?? '')) && article) keys.add(`article-${article[1]}`)
  }
  /** @type {DemoPiece[]} */
  const found = []
  const titles = []
  for (const key of keys) {
    const row = lock?.entities?.[key]
    if (!row) continue
    // A slot the profile only declares (`customize: "keep"`) is not one Customize rewrites, so it covers no demo piece.
    const own = (slots.get(key) ?? []).filter((s) => s.type === 'text' && customizable(s))
    const covers = (/** @type {string} */ column, /** @type {string} */ text, path = null) =>
      own.some((s) => {
        if (s.column !== column) return false
        if (path) return samePath(s.jsonPath, path)
        const sample = normalText(s.sample)
        return (
          sample === text ||
          (sample.length >= 12 && sample.includes(text)) ||
          (text.includes(sample) && sample.length >= text.length / 2)
        )
      })
    for (const column of HTML_COLUMNS)
      for (const piece of htmlTextPieces(row[column]))
        if (isProse(piece) && !covers(column, piece))
          found.push({ entity: key, field: column, line: `${key}.${column}: "${piece.slice(0, 70)}"` })
    for (const { path, text } of acmStrings(row.params)) {
      const piece = htmlTextPieces(text).join(' ')
      if (!isSettingField(path, piece) && isProse(piece) && !covers('params', piece, path))
        found.push({
          entity: key,
          field: 'params',
          line: `${key}.params ${path.join('/')}: "${piece.slice(0, 70)}"`
        })
    }
    // A shown module title with no slot: whether the position's chrome prints it, only a built site
    // tells (spec, ABOUT-2 "Not sure"), so it is reported, not failed.
    if (key.startsWith('module-') && row.showtitle === '1' && !own.some((s) => s.column === 'title'))
      titles.push(`${key} "${normalText(row.title)}"`)
  }
  return { found, titles }
}

/** @param {import('../index.js').RuleContext} context */
async function emdash(context) {
  const t = await emdashTemplate(context)
  if (!t?.personalize || !t.seed) return null
  const covered = coverageOf(t.personalize)
  const isKeptPictureAlt = keptPictureAlt(t)
  /** @type {DemoPiece[]} */
  const found = []
  for (const { collection, slug, data } of defaultEntries(t.seed)) {
    // The kit's sample pages stay as the template (S3, 08/10/2026).
    if (String(slug).startsWith('kit-') || String(data.template ?? '').startsWith('kit-')) continue
    for (const [field, value] of Object.entries(data)) {
      if (/(^|_)(url|href|slug|image|images|template|id|key)$/.test(field)) continue
      // The entry title of the site chrome singleton names the entry in the admin, not the page.
      if (collection === 'site' && field === 'title') continue
      // The alt text of a demo picture that stays describes that picture; a replaced picture's alt still counts.
      if (isKeptPictureAlt(collection, slug, field, data)) continue
      const kinds = covered(collection, slug, field)
      if (isRewritten(kinds)) continue
      // A field `labels` translates is a UI label unless it reads as a sentence (spec: "if it is a sentence").
      const strings = stringsIn(value).map((s) => s.trim())
      const prose = kinds.includes('labels') ? strings.find(isSentence) : strings.find(isDemoText)
      if (prose)
        found.push({
          entity: `${collection}/${slug}`,
          field,
          line: `${collection}/${slug}.${field}: "${prose.slice(0, 60)}"`
        })
    }
  }
  return { found, titles: [], keptText: t.personalize.keptText }
}

const wordsOf = (/** @type {string} */ s) =>
  s
    .replace(/\{[^}]*\}/g, ' ')
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
/** Demo words in a field no rule touches: 15 characters, a space, not an address. */
const isDemoText = (/** @type {string} */ s) =>
  s.length >= 15 && /\s/.test(s) && !/^(https?:|mailto:|tel:|\/)/.test(s)
/** A sentence, not a label: eight words, or five ending with a full stop. */
const isSentence = (/** @type {string} */ s) =>
  wordsOf(s).length >= 8 || (wordsOf(s).length >= 5 && /[.!?]$/.test(s))

/** One line per entry: `investors/investors: 12 fields (lede, …)`. */
function grouped(/** @type {string[]} */ found) {
  const by = new Map()
  for (const f of found) {
    const entry = /^(page \S+|part \S+|[^.:\s]+)/.exec(f)?.[1] ?? f
    by.set(entry, [
      ...(by.get(entry) ?? []),
      f
        .slice(entry.length + 1)
        .split(':')[0]
        .trim()
    ])
  }
  return [...by].map(
    ([entry, fields]) =>
      `${entry}: ${fields.length} (${fields.slice(0, 6).join(', ')}${fields.length > 6 ? ', …' : ''})`
  )
}

export const about2DemoParagraphs = {
  id: 'ABOUT-2',
  title: 'No page keeps a paragraph of the demo once the customer describes the business',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    /** @type {DemoPiece[]} */
    let pieces = []
    /** @type {string[]} */
    let titles = []
    /** @type {unknown} */
    let keptText = []
    /** @type {string[]} */
    const details = []
    try {
      if (platform === 'emdash') {
        const out = await emdash(context)
        if (out === null)
          return {
            status: 'live-only',
            message: `${name}: the release carries no readable source zip with seed/personalize.json and seed/seed.json.`
          }
        ;({ found: pieces, keptText } = out)
      } else {
        const contract = contractOf(context)
        if (!contract)
          return {
            status: 'fail',
            message: `${name}: no content contract seals this release.`,
            fix: NO_CONTRACT_FIX,
            owner: NO_CONTRACT_OWNER
          }
        keptText = declaredCopy(contract.dir).keptText
        if (platform === 'joomla') ({ found: pieces, titles } = joomla(contract))
        else
          pieces = (await wordpressDemoBlocks(context, contract)).map((b) => ({
            entity: b.entity,
            field: b.name,
            line: `${b.where} ${b.name}: "${b.text.slice(0, 70)}"`
          }))
      }
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    const { counted, kept, declared, unused } = splitKept(pieces, keptText)
    const found = counted.map((p) => p.line)
    /** @type {string[]} */
    let categories = []
    try {
      const menus = await categoryMenuLabels(context)
      categories = menus.problems
      if (menus.unrelated.length)
        details.push(
          `menu items to a category that name no category (left as they are): ${menus.unrelated.slice(0, 8).join(', ')}`
        )
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      details.push(`the menu items to categories could not be read (${e.message}); a built site shows them`)
    }
    const note = `${
      declared.length
        ? `The template declares ${declared.length} kept-on-purpose ids (keptText); ${kept.length} demo text pieces sit in them and are not counted.`
        : 'The template declares no demo text kept on purpose (keptText, D6): every uncovered paragraph counts.'
    } What stays on a built site beyond this lower bound only a built site shows.`
    if (unused.length)
      details.push(
        `keptText ids no uncovered demo text sits in (a slot may cover them now): ${unused.join(', ')}`
      )
    if (titles.length)
      details.push(
        `${countOf(titles.length, 'shown module title has', 'shown module titles have')} no slot; whether their position prints them only a built site shows: ${titles.slice(0, 12).join(', ')}`
      )
    const categoryFix =
      'Title each menu item that opens a blog category exactly as the category (Tracy renames the categories for the customer), or give it a label that names no category.'
    if (!found.length && categories.length)
      return {
        status: 'fail',
        message: `${name} fails ABOUT-2: ${countOf(categories.length, 'menu item names', 'menu items name')} a category by another label than its title, so the rename cannot follow them: ${categories.slice(0, 8).join('; ')}.`,
        fix: categoryFix,
        details: [...categories, ...details, note]
      }
    if (!found.length)
      return {
        status: 'pass',
        message: `${name}: every demo paragraph on the pages sits where Tracy writes.`,
        details: [...details, note]
      }
    return {
      status: 'fail',
      message: `${name} fails ABOUT-2: ${countOf(found.length, 'demo text piece nothing rewrites', 'demo text pieces nothing rewrites')}; ${grouped(found).slice(0, 8).join('; ')}${
        categories.length
          ? `; and ${countOf(categories.length, 'menu item names', 'menu items name')} a category by another label than its title: ${categories.slice(0, 4).join('; ')}`
          : ''
      }.`,
      // A slot or keptText lives in the contract (tch) on Joomla and WordPress, in the theme on EmDash.
      owner: declaredCopyOwner(platform),
      fix:
        platform === 'emdash'
          ? 'Add a copy, rewrite or blocks rule for these fields in seed/personalize.json, or declare them kept on purpose in its keptText.'
          : `Give these texts a slot (re-capture the contract), or declare them kept on purpose in keptText of the contract version's .copy.json.${categories.length ? ` ${categoryFix}` : ''}`,
      details: [...found.slice(0, 60), ...categories, ...details, note]
    }
  }
}
