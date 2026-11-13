// The words an icon is matched against (ticket #595): the page writer's output (`writePages`, `page-writer.mjs`) and
// the plan data. Pure.
//
// The writer returns `{pages: [{id, fields}]}`, each field `{key, block, item?, field, kind, from, value?}` with `from`
// one of `writer` (written by the model), `data` (copied from the plan data) or `no-data` (no value). The entries that
// hold a value (`writer` and `data`) are the item's words, its headings first. A row of a child list reads the entries
// that name its `row` (`<list>.<n>`, the place id of `picture-block-places.mjs`); the writer writes no child list field
// yet, so a row has no written words today and its icon is hidden with `icon_words_missing`.
//
// 🔒 A page of the plan holding an icon field with no page in the copy, or a copy in another shape, throws
// `icon_copy_missing`: icons are never matched against the plan data alone without saying so.
import { IconSelectionError } from './icon-ranking.mjs'

const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** Kinds whose value names what the item is: its heading tier. */
const HEADING = /\.(heading|name|title)$/
const keyOf = (page, block, item, row) => `${page}|${block}|${item ?? ''}|${row ?? ''}`

/**
 * The written entries by scope key, headings first, checked against the pages that hold icon fields.
 * @param {{pages?: Array<{id: string, fields?: object[]}>} | undefined} copy the writer's output
 * @param {Array<{page: string}>} scopes the icon scopes (`iconScopesOfPlan`)
 * @returns {Map<string, Array<{field: string, kind: string, value: string}>>}
 */
export function writtenByScope(copy, scopes) {
  const wanted = [...new Set(scopes.map((s) => s.page))]
  if (!Array.isArray(copy?.pages))
    throw new IconSelectionError(
      'icon_copy_missing',
      'icon fields are matched to the written copy, and none was given',
      { pages: wanted }
    )
  const byPage = new Map(copy.pages.map((p) => [p?.id, p]))
  const missing = wanted.filter((id) => !Array.isArray(byPage.get(id)?.fields))
  if (missing.length)
    throw new IconSelectionError(
      'icon_copy_missing',
      `the written copy has no fields for page(s) ${missing.join(', ')}, which hold icon fields`,
      { pages: missing }
    )
  const out = new Map()
  for (const id of wanted)
    for (const entry of byPage.get(id).fields) {
      if ((entry?.from !== 'writer' && entry?.from !== 'data') || !isText(entry.value)) continue
      const key = keyOf(id, entry.block, entry.item, entry.row)
      if (!out.has(key)) out.set(key, [])
      out.get(key).push({ field: entry.field, kind: entry.kind ?? '', value: entry.value })
    }
  for (const values of out.values())
    values.sort((a, b) => (HEADING.test(b.kind) ? 1 : 0) - (HEADING.test(a.kind) ? 1 : 0))
  return out
}

/**
 * The words of one scope in two tiers: its written heading, then its other written text, then its plan data's own
 * words (an item's name leads its tier). A row reads its own entries only.
 * @returns {{heading: string[], text: string[], all: string[]}}
 */
export function wordsOfScope(scope, written, data) {
  const copy = (written.get(keyOf(scope.page, scope.block, scope.item, scope.row)) ?? []).filter(
    (c) => !scope.for || scope.for.includes(c.field)
  )
  const heading = copy.filter((c) => HEADING.test(c.kind)).map((c) => c.value)
  const text = copy.filter((c) => !HEADING.test(c.kind)).map((c) => c.value)
  const entry = scope.item && !scope.row ? data.byId.get(scope.item) : null
  if (entry?.what === 'item') {
    const own = Object.entries(entry.source?.fields ?? {}).filter(([, f]) => isText(f?.value))
    heading.push(...own.filter(([k]) => HEADING.test(k)).map(([, f]) => f.value))
    text.push(entry.entry?.label, ...own.filter(([k]) => !HEADING.test(k)).map(([, f]) => f.value))
  }
  const unique = (values) => [...new Set(values.filter(isText))]
  const h = unique(heading)
  const t = unique(text).filter((v) => !h.includes(v))
  return { heading: h, text: t, all: [...h, ...t] }
}
