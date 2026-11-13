// The inline markup a text field's stored value carries (ticket #584): `inline` on a block store text field. Pure.
//
//   "inline": {"emphasis": [{"tag": "br"}, {"tag": "span", "attrs": "", "at": "end"}], "wrapper": ["p"], "from": "template-kit"}
//
// `emphasis` is the shape of the emphasis the demo value carries, in the template kit's own notation
// (`template-kit.json`, slot `inline`): a line break (`br`), and an accent span (`span`, its attributes, and where it
// sits in the words: `start`, `end` or `inside`). The writer supplies words plus an optional emphasis part; the build
// wraps that part the way the demo does (the content map's `((br/))` and `((span))` markers). Plain words are always
// valid. `wrapper` lists the block elements the stored value is wrapped in (`p`, a body list `ul` and `li`), which the
// build keeps around the words. `from` names where the shape was read: `template-kit` (the kit's measured slot), or
// `content-map` (the markers of the content map sample, for a slot the kit lists without it). `write` says how a build
// writes the value through the Claude Cowork door (0.24.85, measured on the blank site): `codes`, the content map's
// markers as they are (an ACM module's data, which the template turns into tags when it draws); `html`, real tags in
// the stored HTML (the door's `content.contract` refuses `<` and `>` and writes markers as words, so the build
// replaces them by tags with `content.get` and `content.update`, or writes the tags where it creates the record).
import { scopesOf } from './ai-quickstart-field-keys.mjs'

export const EMPHASIS_TAGS = Object.freeze(['br', 'span'])
export const EMPHASIS_AT = Object.freeze(['start', 'end', 'inside'])
export const WRAPPER_TAGS = Object.freeze(['p', 'ul', 'li'])
export const INLINE_FROM = Object.freeze(['template-kit', 'content-map'])
export const INLINE_WRITE = Object.freeze(['codes', 'html'])

/** The write form a content map slot's value takes (see the head of this file), or null when it is neither. */
export function inlineWriteOfSlot(slot) {
  const xpath = typeof slot?.xpath === 'string' && slot.xpath ? slot.xpath : null
  if (slot?.nestedJson === 'jatools-config' && !xpath) return 'codes'
  if (xpath && !/\/@[^/]+$/.test(xpath) && slot.nestedJson === undefined) return 'html'
  return null
}

/** Where the accent span of a sample sits in its words (`start`, `end`, `inside`), or null when it has none. */
export function spanAtOfSample(sample) {
  const words = String(sample ?? '')
    .replace(/\(\(br\s*\/?\)\)/gi, ' ')
    .trim()
  if (!/\(\(span[^()]*\)\)/i.test(words)) return null
  return /^\(\(span/i.test(words) ? 'start' : /\(\(\/span\)\)$/i.test(words) ? 'end' : 'inside'
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** The problem of one emphasis part, or null. */
function emphasisProblem(e) {
  if (!isObject(e) || !EMPHASIS_TAGS.includes(e.tag))
    return `an emphasis part is {tag: ${EMPHASIS_TAGS.join(' | ')}}`
  if (e.tag === 'br') return Object.keys(e).length === 1 ? null : 'a line break is {tag: "br"} alone'
  if (typeof e.attrs !== 'string' || !EMPHASIS_AT.includes(e.at))
    return `an accent span is {tag: "span", attrs, at: ${EMPHASIS_AT.join(' | ')}}`
  return null
}

/** The problem of an `inline` declaration, or null. */
export function inlineProblem(inline) {
  if (!isObject(inline)) return 'inline is {emphasis, wrapper?, from, write}'
  if (!Array.isArray(inline.emphasis)) return 'inline.emphasis is a list of emphasis parts (it may be empty)'
  for (const e of inline.emphasis) {
    const problem = emphasisProblem(e)
    if (problem) return problem
  }
  if (
    inline.wrapper !== undefined &&
    !(Array.isArray(inline.wrapper) && inline.wrapper.every((t) => WRAPPER_TAGS.includes(t)))
  )
    return `inline.wrapper lists the block elements kept around the words: ${WRAPPER_TAGS.join(', ')}`
  if (inline.emphasis.length === 0 && !list(inline.wrapper).length)
    return 'inline declares an emphasis or a wrapper'
  if (!INLINE_FROM.includes(inline.from)) return `inline.from is ${INLINE_FROM.join(' or ')}`
  if (!INLINE_WRITE.includes(inline.write))
    return `inline.write is how the build writes the value through the door: ${INLINE_WRITE.join(' or ')}`
  return null
}

/** Every `inline` key of the store holds its shape, on a text field. */
export function inlineShapeProblems(blockStore, report) {
  for (const block of list(blockStore?.blocks)) {
    if (!isObject(block) || !isName(block.id)) continue
    for (const scope of scopesOf(block, `blocks[${block.id}]`))
      list(scope.fields).forEach((field, i) => {
        if (!isObject(field) || field.inline === undefined) return
        const at = `${scope.at(field, i)}.inline`
        if (field.type !== 'text') return report(at, 'inline is a key of text fields')
        const problem = inlineProblem(field.inline)
        if (problem) report(at, problem)
      })
  }
}

/** The store field a draft report entry `{block, list?, field}` names, with its place in the store. */
function storeFieldOf(blockStore, entry) {
  const block = list(blockStore?.blocks).find((b) => b?.id === entry.block)
  if (!block) return null
  // A list scope is named by its path of list names (`pages`, or `cards/links` for a nested list).
  const pathOf = (s) =>
    [...s.listAt.matchAll(/\.(?:lists|itemLists)\[([^\]]+)\]/g)].map((m) => m[1]).join('/')
  return (
    scopesOf(block, `blocks[${block.id}]`)
      .filter((s) => (isName(entry.list) ? s.kind === 'list' && pathOf(s) === entry.list : s.kind !== 'list'))
      .flatMap((s) => list(s.fields).map((f, i) => ({ f, at: s.at(f, i) })))
      .find(({ f }) => f?.name === entry.field) ?? null
  )
}

/**
 * Every text field the draft report classes `inline-markup-in-text` declares the markup its demo value carries:
 * `inline`, its emphasis and wrapper tags covering every tag the report found.
 */
export function inlineCoverageProblems(blockStore, draftReport, reportStore) {
  for (const entry of list(draftReport?.inlineMarkup?.fields)) {
    const found = storeFieldOf(blockStore, entry)
    if (!found) continue
    const { f, at } = found
    if (f.inline === undefined) {
      reportStore(
        `${at}.inline`,
        `the stored value carries ${list(entry.markup).join(', ')}: declare its inline markup`
      )
      continue
    }
    const declared = new Set([...list(f.inline?.emphasis).map((e) => e?.tag), ...list(f.inline?.wrapper)])
    const missing = list(entry.markup).filter((t) => !declared.has(t))
    if (missing.length)
      reportStore(`${at}.inline`, `the stored value also carries ${missing.join(', ')}: declare it`)
  }
}
