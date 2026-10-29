/**
 * No showcase block shown again and again across the built site (spec TracyHQ/tracy#189, COO decision 30/10/2026), judged on
 * the served pages, so it holds for every CMS. Measured on a local brief build: one decorative block (six photos and a
 * "years running" figure) closed the home, About, Team and lessons pages alike. The site plan keeps such a block on one
 * page (`website-opportunities/domain/repeated-blocks.mjs`) and the engine narrows it; this is the check on what the
 * visitor sees.
 *
 * A block is an element with an id. It repeats when the same id shows the same content (its words and its pictures) on two
 * served pages or more; of a nest of blocks repeated on exactly the same pages (a template section around a module), the
 * one the plan names is judged, else the outermost. Not judged: a block on every served page (the template's frame), a block the plan keeps on
 * several pages on purpose (`repeat: 'everywhere'`), and a block inside another repeated block (the outer one is reported).
 *
 *   major  the plan said the block stays on one page and it is still on several: the plan's decision did not reach the site
 *   minor  the plan never decided about the block (the content map does not describe it) and it shows pictures or a
 *          paragraph: worth a look, it may be a showcase the map missed
 *
 * The plan's blocks are content map entities (`module-166`); a served id names one when it carries the entity's number
 * after the first letters of its kind (`Mod166`, `module-166`).
 */
import { parse } from 'parse5'

const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'svg', 'nav', 'header', 'footer'])
/** Shortest run of words that makes a block without pictures worth reporting. */
const MIN_TEXT = 80

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value

/** Every element with an id, with its words, its pictures and the ids around it. */
function blocksOf(html) {
  /** @type {Map<string, {text: string, pictures: string[], ancestors: string[]}>} */
  const out = new Map()
  const visit = (node, ancestors) => {
    if (SKIPPED.has(node.tagName)) return { text: '', pictures: [] }
    const id = node.tagName ? attr(node, 'id') : undefined
    const inner = id ? [...ancestors, id] : ancestors
    let text = node.nodeName === '#text' ? String(node.value ?? '') : ''
    const pictures = node.tagName === 'img' && attr(node, 'src') ? [String(attr(node, 'src'))] : []
    for (const child of node.childNodes ?? []) {
      const got = visit(child, inner)
      text += ` ${got.text}`
      pictures.push(...got.pictures)
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (id && !out.has(id)) out.set(id, { text, pictures, ancestors })
    return { text, pictures }
  }
  visit(parse(String(html ?? '')), [])
  return out
}

/** The plan's entry a served id names, if any. */
function planEntryOf(id, blocks) {
  const number = /(\d+)$/.exec(id)?.[1]
  const letters = id.replace(/[^a-z]/gi, '').toLowerCase()
  if (!number || letters.length < 3) return null
  return (
    blocks.find((b) => {
      const [kind, n] = String(b?.entity ?? '').split('-')
      return n === number && kind && kind.toLowerCase().startsWith(letters.slice(0, 3))
    }) ?? null
  )
}

/**
 * @param {{pages: Array<{path: string, status: number, html: string}>, sitePlan?: any}} input
 * @returns {Array<{kind: 'repeated-block', severity: 'major' | 'minor', path: string, paths: string[], block: string,
 *   why: string}>}
 */
export function checkRepeatedBlocks({ pages, sitePlan = null }) {
  const served = (pages ?? []).filter((p) => p?.status === 200)
  const planned = Array.isArray(sitePlan?.repeatedBlocks) ? sitePlan.repeatedBlocks : []
  /** @type {Map<string, Map<string, {paths: string[], text: string, pictures: string[], ancestors: string[]}>>} */
  const byId = new Map()
  for (const page of served)
    for (const [id, block] of blocksOf(page.html)) {
      const signature = `${block.text}|${block.pictures.join(',')}`
      const shapes = byId.get(id) ?? new Map()
      const entry = shapes.get(signature) ?? { ...block, paths: [] }
      entry.paths.push(page.path)
      shapes.set(signature, entry)
      byId.set(id, shapes)
    }
  const repeated = []
  for (const [id, shapes] of byId)
    for (const entry of shapes.values())
      if (entry.paths.length >= 2 && (entry.text || entry.pictures.length)) repeated.push({ id, entry })
  // A wrapper repeated on exactly the pages of a block inside it (a template section around a module) is that block: of
  // such a nest, the block the plan names is judged, else the outermost one.
  const same = (a, b) => a.paths.length === b.paths.length && a.paths.every((p) => b.paths.includes(p))
  const nested = (a, b) => a.entry.ancestors.includes(b.id) || b.entry.ancestors.includes(a.id)
  const named = (c) => planEntryOf(c.id, planned) !== null
  const blocks = repeated.filter(
    (c) => named(c) || !repeated.some((o) => o !== c && named(o) && nested(c, o) && same(c.entry, o.entry))
  )
  const found = []
  for (const { id, entry } of blocks) {
    const plan = planEntryOf(id, planned)
    if (plan?.repeat === 'everywhere') continue
    const once = plan?.repeat === 'once'
    // A block on every served page is the frame; with fewer than three pages that cannot be told apart.
    if (!once && (served.length < 3 || entry.paths.length === served.length)) continue
    if (!once && entry.pictures.length < 2 && entry.text.length < MIN_TEXT) continue
    found.push({ id, entry, once })
  }
  const ids = new Set(found.map((f) => f.id))
  return found
    .filter(
      (f) =>
        !f.entry.ancestors.some((a) => ids.has(a)) &&
        !blocks.some((b) => named(b) && f.entry.ancestors.includes(b.id) && same(f.entry, b.entry))
    )
    .map(({ id, entry, once }) => ({
      kind: /** @type {const} */ ('repeated-block'),
      severity: once ? /** @type {const} */ ('major') : /** @type {const} */ ('minor'),
      path: entry.paths[0],
      paths: entry.paths,
      block: id,
      why: once
        ? `The block ${id} was to stay on one page, but it still shows on ${entry.paths.length} pages (${entry.paths.join(', ')})`
        : `The block ${id} shows the same content on ${entry.paths.length} pages (${entry.paths.join(', ')}) and the site plan did not decide it should`
    }))
}
