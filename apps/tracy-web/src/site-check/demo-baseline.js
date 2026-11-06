// The demo baseline (ADR 0044, decision 8): the words and pictures an untouched quickstart site shows, measured once per
// quickstart version and reused by every run, not read from the kit. The host's `no-demo-words` and `no-demo-pictures`
// judge a site against it: what the untouched site showed and the written site still shows is demo content.
//
// Two ways to get one. `baselineFromHost` keeps what the host measured on an untouched site (the only measured source).
// `baselineFromKit` is a stopgap from the kit's sample words and demo picture files; it carries no picture bytes and
// only matches a block of words that is exactly one slot, so it is weaker, and says so in `source`.
//
// Nothing here stores customer data: a baseline is the template's own demo words and picture paths.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { callPages, CALL_BUDGET_MS, CALL_TIMEOUT_MS, chunksOf, hostPath } from './page-chunks.js'

export const BASELINE_SCHEMA = 'demo-baseline/1'

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The host's identity for a block of words (tracy-host `demo-qa.js` `textKey`): words, case and spacing aside. */
export const textKey = (text) => createHash('sha256').update(squash(text)).digest('hex').slice(0, 16)

const each = (value) => (Array.isArray(value) ? value : [])
const sorted = (set) => [...set].sort()

/** Every slot of a kit block: its own, its lists' row slots and its rows' slots. */
function blockSlots(block) {
  return [
    ...each(block?.slots),
    ...each(block?.lists).flatMap((l) => [
      ...each(l?.rowSlots),
      ...each(l?.rows).flatMap((r) => each(r?.slots))
    ])
  ]
}

/**
 * A stopgap baseline from the kit: the sample of each text slot, the kit's fixed texts, and the picture file of each frame.
 * @param {object} kit the kit document
 * @param {{ version: string }} input the quickstart version it stands for
 */
export function baselineFromKit(kit, { version }) {
  const texts = new Set()
  const files = new Set()
  const addText = (text) => {
    if (typeof text === 'string' && squash(text)) texts.add(textKey(text))
  }
  for (const block of each(kit?.blocks)) {
    for (const slot of blockSlots(block)) if (slot?.type === 'text') addText(slot.sample)
    for (const fixed of each(block?.fixedText)) addText(fixed?.text)
    for (const frame of each(block?.frames)) if (typeof frame?.picture === 'string') files.add(frame.picture)
  }
  for (const fixed of each(kit?.site?.fixedTexts)) addText(fixed?.text)
  return {
    schema: BASELINE_SCHEMA,
    quickstart: version,
    source: 'kit',
    texts: sorted(texts),
    labels: [],
    pictures: { files: sorted(files), shas: [] }
  }
}

/** One spelling for a page, however a call named it: no `/index.php`, no trailing slash, spaces encoded, lower case. */
const pageKey = (p) => {
  const key = hostPath(p)
    .replace(/^\/index\.php(?=\/|$)/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
  return key === '' ? '/' : key
}

/** The site answered, and not with this page: the page is broken, the read is not. Anything else is a failed read. */
const ANSWERED = /^(?:answered \d+$|not a page\b)/
/** More of a site than this answering errors is an outage, or the wrong site, and no picture of the template. */
const BROKEN_SHARE_MAX = 0.25

const named = (unread) => unread.map((u) => `${u.path}: ${u.why}`).join('; ')

/**
 * Throw unless the unread pages are a few pages the template itself breaks: the host reached every page, the home answered,
 * and the rest of the site is there to measure.
 */
function refuseUnlessSiteRead(read, unread) {
  const failed = unread.filter((u) => !ANSWERED.test(u.why))
  if (failed.length || !read.length)
    throw new Error(
      `The untouched site was not read whole (${failed.length ? named(failed) : unread.length ? named(unread) : 'no page read'})`
    )
  const home = unread.filter((u) => pageKey(u.path) === '/')
  if (home.length) throw new Error(`The untouched site's home did not answer (${named(home)})`)
  const total = read.length + unread.length
  if (unread.length > Math.max(1, Math.floor(total * BROKEN_SHARE_MAX)))
    throw new Error(
      `The untouched site is not up: ${unread.length} of ${total} pages failed (${named(unread)})`
    )
}

/**
 * What the host measured on an untouched site, cut to what the demo measures use. A page the template itself breaks is kept
 * as `unread`, and a measure of it says it has no demo to compare (`noDemoFaults`).
 * @param {object} measured the `baseline` of a host `demo-qa` answer
 * @param {{ version: string, measuredAt?: string }} input
 */
export function baselineFromHost(measured, { version, measuredAt }) {
  const unread = each(measured?.unread)
  refuseUnlessSiteRead(each(measured?.read), unread)
  return {
    schema: BASELINE_SCHEMA,
    quickstart: version,
    source: 'host',
    ...(measuredAt ? { measuredAt } : {}),
    texts: [...new Set(each(measured.texts))].sort(),
    labels: [...new Set(each(measured.labels))].sort(),
    pictures: {
      files: [...new Set(each(measured.pictures?.files))].sort(),
      shas: [...new Set(each(measured.pictures?.shas))].sort()
    },
    unread
  }
}

/** What a demo measure says of each of these pages the baseline could not read: a warning, in place of a comparison it cannot make. */
export function noDemoFaults(baseline, pages) {
  const why = new Map(each(baseline?.unread).map((u) => [pageKey(u.path), u.why]))
  return pages.flatMap((page) => {
    const said = why.get(pageKey(page))
    return said
      ? [
          {
            page,
            level: 'warn',
            reason: `This page ${said} on the untouched template, so it has no demo to compare.`
          }
        ]
      : []
  })
}

/** The baseline in the form the host's request takes: no stylesheet rules are held, so the CSS checks skip. */
export const forHost = (baseline) => ({
  cssRules: {},
  texts: baseline.texts,
  labels: baseline.labels,
  pictures: baseline.pictures
})

/**
 * The words on a picture of an untouched site, per page, width and side of the template's switch, with what lay under them: what
 * `words-over-picture` holds a written site's to. A site wearing a brand style is no baseline.
 * @param {object[]} measures the host's `pageMeasures`
 * @returns {object[]}
 */
export function overFromHost(measures) {
  const over = []
  for (const m of each(measures)) {
    if (!m?.look?.sides) continue
    if (m.look.worn)
      throw new Error(`The site is not untouched: ${m.path} wears a brand style, so it is no baseline.`)
    for (const [side, read] of Object.entries(m.look.sides))
      for (const w of each(read.over))
        if (w.under)
          over.push({
            page: m.path,
            width: m.width,
            side,
            key: w.key,
            fg: w.fg,
            under: w.under,
            large: w.large
          })
  }
  return over
}

/**
 * The tall blocks of an untouched site, per page and width, with their height: what `tall-blocks` holds a written site's to. The
 * host reports only blocks over two screens, so a block missing here has no demo height.
 * @param {object[]} measures the host's `pageMeasures`
 */
export function blocksFromHost(measures) {
  return each(measures).flatMap((m) =>
    each(m?.blocks)
      .filter((b) => typeof b?.selector === 'string' && b.height > 0)
      .map((b) => ({ page: m.path, width: m.width, selector: b.selector, height: b.height }))
  )
}

/**
 * The text each block of an untouched site prints, per page and width, and the item lengths of a list: what `text-fill` holds a
 * written site's to. A host from before it read text blocks answers none, and the measure then says nothing.
 * @param {object[]} measures the host's `pageMeasures`
 */
export function textBlocksFromHost(measures) {
  return each(measures).flatMap((m) =>
    each(m?.textBlocks)
      .filter((b) => typeof b?.selector === 'string' && b.chars > 0)
      .map((b) => ({
        page: m.path,
        width: m.width,
        selector: b.selector,
        chars: b.chars,
        ...(Array.isArray(b.items) ? { items: b.items } : {})
      }))
  )
}

/**
 * The maps an untouched site draws, per page and width, with the coordinates or address each names: what `map-location` holds a
 * written site's to (a map still at the demo's place). A host from before it read maps answers none, and the measure then compares
 * with the brief only.
 * @param {object[]} measures the host's `pageMeasures`
 */
export function mapsFromHost(measures) {
  return each(measures).flatMap((m) =>
    each(m?.maps)
      .filter((x) => Number.isFinite(x?.lat) || typeof x?.address === 'string')
      .map((x) => ({
        page: m.path,
        width: m.width,
        kind: x.kind,
        ...(Number.isFinite(x.lat) && Number.isFinite(x.lng) ? { lat: x.lat, lng: x.lng } : {}),
        ...(typeof x.address === 'string' ? { address: x.address } : {})
      }))
  )
}

const fileOf = (dir, version) => path.join(dir, `${String(version).replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`)

/** One baseline per quickstart version, kept as a file in a folder that is not in the repo. */
export function fileBaselineStore(dir) {
  return {
    /** @returns {Promise<object | null>} */
    async read(version) {
      try {
        return JSON.parse(await readFile(fileOf(dir, version), 'utf8'))
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
      }
    },
    async save(version, baseline) {
      await mkdir(dir, { recursive: true })
      await writeFile(fileOf(dir, version), `${JSON.stringify(baseline, null, 2)}\n`)
    }
  }
}

/**
 * Every page asked for gets its answer: `read` holds only pages that opened. The host's own `unread` misses a 404 it read or
 * skipped, and holds a 404 to a home's rule when that page merely opened a call; its `visited` says what each page answered.
 * A page it never visited is a failed read.
 */
function settled({ read, unread, ...rest }, visited, pages) {
  const out = new Map(unread.map((u) => [pageKey(u.path), u]))
  const opened = new Set()
  for (const v of visited) {
    const key = pageKey(v.path)
    opened.add(key)
    if (v.status >= 400 && !out.has(key)) out.set(key, { path: v.path, why: `answered ${v.status}` })
    else if (v.skipped && !out.has(key)) out.set(key, { path: v.path, why: `not a page, ${v.skipped}` })
  }
  const known = new Set(read.map(pageKey))
  for (const page of pages) {
    const key = pageKey(page)
    if (!known.has(key) && !out.has(key) && !opened.has(key)) out.set(key, { path: page, why: 'no answer' })
  }
  return { ...rest, read: read.filter((p) => !out.has(pageKey(p))), unread: [...out.values()] }
}

/** Several reads of one untouched site as one: words and pictures are the union, and a page unread in any is unread. */
function joined(parts) {
  const union = (pick) => [...new Set(parts.flatMap((p) => each(pick(p))))]
  return {
    texts: union((p) => p.texts),
    labels: union((p) => p.labels),
    pictures: { files: union((p) => p.pictures?.files), shas: union((p) => p.pictures?.shas) },
    read: union((p) => p.read),
    unread: parts.flatMap((p) => each(p.unread))
  }
}

/**
 * Measure a baseline on an untouched site and keep it. A version that already has one is not measured again.
 * @param {{ host: Function, pages: string[], version: string, store: object, force?: boolean, now?: () => Date }} input
 *   `host(payload)` asks the site's host to read pages and answers its body; `pages` are the paths of the whole site
 */
export async function ensureBaseline({ host, pages, version, store, force = false, now = () => new Date() }) {
  if (!force) {
    const kept = await store.read(version)
    if (kept) return { baseline: kept, measured: false }
  }
  const parts = []
  const measures = []
  const visited = []
  for (const chunk of chunksOf(pages)) {
    const answer = await host({
      ...callPages(chunk),
      discover: false,
      measurePages: true,
      budgetMs: CALL_BUDGET_MS,
      timeoutMs: CALL_TIMEOUT_MS
    })
    if (!answer?.baseline)
      throw new Error(`The host gave no baseline: ${answer?.code ?? answer?.error ?? 'no answer'}`)
    parts.push(answer.baseline)
    measures.push(...each(answer.pageMeasures))
    visited.push(...each(answer.visited))
  }
  const measured = settled(joined(parts), visited, pages)
  const baseline = {
    ...baselineFromHost(measured, { version, measuredAt: now().toISOString() }),
    over: overFromHost(measures),
    blocks: blocksFromHost(measures),
    textBlocks: textBlocksFromHost(measures),
    maps: mapsFromHost(measures)
  }
  await store.save(version, baseline)
  return { baseline, measured: true }
}
