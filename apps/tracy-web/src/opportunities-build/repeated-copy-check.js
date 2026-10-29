/**
 * No sentence is said twice on one page or on two pages of a built site (spec TracyHQ/tracy#189, round 9 class F), judged
 * on the served pages, so it holds for every CMS and catches a repeat whoever wrote it (the copy writer, a pinned brief
 * line, a summary step).
 *
 * Measured 30/10/2026 on a local brief build: the About page said the brief's introduction three times in three sections,
 * and the same framing lines came back on several offering pages. The writers refuse such answers before they are written
 * (`tracy-seeder` `distinct-copy.mjs`); this is the check on what the visitor reads.
 *
 * What a visitor reads is the text of the page's blocks (any element that is not inline) outside
 * its navigation, header and footer. A sentence the template shows on EVERY served page (a footer line that is not in a
 * footer element) is chrome, not a repeat, and so is one block (one id) the template shows on several pages; with fewer than three pages served nothing can be told apart, so only repeats
 * inside one page are judged then.
 */
import { parse } from 'parse5'

/** Shortest sentence worth comparing: a label, a button or a figure may repeat. */
const MIN_CHARS = 30
const SKIPPED = new Set(['nav', 'header', 'footer', 'script', 'style', 'template', 'noscript', 'svg'])
/** Elements that flow inside a line: their words belong to the block around them. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'wbr',
  'label'
])

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value
const children = (node) =>
  (node.childNodes ?? []).filter(
    (n) => !SKIPPED.has(n.tagName) && attr(n, 'hidden') === undefined && attr(n, 'aria-hidden') !== 'true'
  )
/** Every element in page order with the id of the nearest element around it that has one (its module, its block). */
const walk = (node, owner = '') => {
  const own = attr(node, 'id') || owner
  return [{ node, owner: own }, ...children(node).flatMap((n) => walk(n, own))]
}

/** The words of a block that are its own: its text and its inline elements', not those of a block inside it. */
const ownText = (node) =>
  children(node)
    .map((n) => (n.nodeName === '#text' ? n.value : INLINE.has(n.tagName) ? ownText(n) : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The visible sentences of a page, each with its normalized form, in page order. A block is any element that is not
 * inline (a paragraph, a heading, a list item, and the plain `div` a template writes its lead line in); the words of a
 * block inside it are read with that inner block, never twice.
 */
export function pageSentences(html) {
  const out = []
  const blocks = walk(parse(String(html ?? ''))).filter(
    ({ node }) => node.tagName && !INLINE.has(node.tagName)
  )
  for (const { node: block, owner } of blocks)
    for (const raw of ownText(block).split(/(?<=[.!?])\s+/)) {
      const said = raw.trim()
      const norm = said
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
      // A label (a card title beside its button, "Fitness View details") is no sentence: five words at least.
      if (norm.length >= MIN_CHARS && norm.split(' ').length >= 5) out.push({ said, norm, owner })
    }
  return out
}

/**
 * @param {{pages: Array<{path: string, status: number, html: string}>, near?: (a: string, b: string) => boolean}} input
 *   `near`: whether two normalized sentences are one line reworded (the writers' `containedCopy`); on one page a near copy
 *   is a repeat too, across pages only the same sentence is
 * @returns {Array<{kind: 'repeated-copy', severity: 'major', path: string, paths?: string[], sentence: string, why: string}>}
 */
export function checkRepeatedCopy({ pages, near = (a, b) => a === b }) {
  const served = (pages ?? []).filter((p) => p?.status === 200)
  const findings = []
  /** @type {Map<string, {said: string, paths: Set<string>, owners: Set<string>}>} */
  const across = new Map()
  for (const page of served) {
    /** @type {Array<{said: string, norm: string}>} */
    const seen = []
    for (const { said, norm, owner } of pageSentences(page.html)) {
      const first = seen.find((s) => s.norm === norm || near(norm, s.norm))
      if (first && !findings.some((f) => f.path === page.path && f.norm === norm))
        findings.push({
          kind: 'repeated-copy',
          severity: 'major',
          path: page.path,
          sentence: said,
          first: first.said,
          norm
        })
      seen.push({ said, norm })
      const entry = across.get(norm) ?? { said, paths: new Set(), owners: new Set() }
      entry.paths.add(page.path)
      entry.owners.add(owner)
      across.set(norm, entry)
    }
  }
  const out = findings.map(({ norm: _norm, first, ...f }) => ({
    ...f,
    why:
      first === f.sentence
        ? `Said twice on ${f.path}: "${f.sentence}"`
        : `Said twice on ${f.path}, reworded: "${first}" and "${f.sentence}"`
  }))
  if (served.length >= 3)
    // One block the template shows on several pages (the same module, the same id on each) is its design, not a
    // sentence written twice: only the same words in different blocks count.
    for (const { said, paths, owners } of across.values())
      if (paths.size >= 2 && paths.size < served.length && !(owners.size === 1 && !owners.has(''))) {
        const list = [...paths]
        out.push({
          kind: 'repeated-copy',
          severity: 'major',
          path: list[0],
          paths: list,
          sentence: said,
          why: `Said on ${list.length} pages (${list.join(', ')}): "${said}"`
        })
      }
  return out
}
