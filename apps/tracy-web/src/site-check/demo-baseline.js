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
import { callPages, CALL_BUDGET_MS, CALL_TIMEOUT_MS, chunksOf } from './page-chunks.js'

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

/** A picture this narrow on the page may be an icon: its drawn box is what the site check holds a replaced icon to. */
const ICON_FRAME_MAX = 400

/** Each small picture the untouched site drew, where and how large, once. */
function iconFramesOf(measured) {
  const seen = new Map()
  for (const f of each(measured?.imageFrames)) {
    if (!(f?.width > 0 && f.width <= ICON_FRAME_MAX && f.path)) continue
    const key = `${f.route} ${f.path}`
    if (!seen.has(key)) seen.set(key, { page: f.route, file: f.path, width: f.width, height: f.height })
  }
  return [...seen.values()]
}

/**
 * What the host measured on an untouched site, cut to what the demo measures use.
 * @param {object} measured the `baseline` of a host `demo-qa` answer
 * @param {{ version: string, measuredAt?: string }} input
 */
export function baselineFromHost(measured, { version, measuredAt }) {
  const unread = each(measured?.unread)
  if (unread.length || !each(measured?.read).length)
    throw new Error(
      `The untouched site was not read whole (${unread.length ? unread.map((u) => `${u.path}: ${u.why}`).join('; ') : 'no page read'})`
    )
  return {
    schema: BASELINE_SCHEMA,
    quickstart: version,
    source: 'host',
    ...(measuredAt ? { measuredAt } : {}),
    texts: [...new Set(each(measured.texts))].sort(),
    labels: [...new Set(each(measured.labels))].sort(),
    iconFrames: iconFramesOf(measured),
    pictures: {
      files: [...new Set(each(measured.pictures?.files))].sort(),
      shas: [...new Set(each(measured.pictures?.shas))].sort()
    }
  }
}

/** The baseline in the form the host's request takes: no stylesheet rules are held, so the CSS checks skip. */
export const forHost = (baseline) => ({
  cssRules: {},
  texts: baseline.texts,
  labels: baseline.labels,
  pictures: baseline.pictures
})

/**
 * The look of an untouched site out of the host's page measures: per page and side of the template's switch, each element's
 * computed look and each logo's reading, and at each width the words on a picture with what lay under them. A site wearing a brand style is no baseline.
 * @param {object[]} measures the host's `pageMeasures`
 * @returns {{ props: string[], pages: Record<string, object> } | null}
 */
export function lookFromHost(measures) {
  const pages = {}
  const over = []
  let props = null
  for (const m of each(measures)) {
    if (!m?.look?.sides) continue
    if (m.look.worn)
      throw new Error(`The site is not untouched: ${m.path} wears a brand style, so its look is no baseline.`)
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
    if (!m.look.props) continue
    props = m.look.props
    pages[m.path] = {
      sides: Object.fromEntries(
        Object.entries(m.look.sides).map(([side, read]) => [
          side,
          { styles: read.styles, truncated: read.truncated === true, logos: read.logos }
        ])
      )
    }
  }
  return props ? { props, pages, over } : null
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

/** Several reads of one untouched site as one: words and pictures are the union, and a page unread in any is unread. */
function joined(parts) {
  const union = (pick) => [...new Set(parts.flatMap((p) => each(pick(p))))]
  return {
    texts: union((p) => p.texts),
    labels: union((p) => p.labels),
    pictures: { files: union((p) => p.pictures?.files), shas: union((p) => p.pictures?.shas) },
    imageFrames: parts.flatMap((p) => each(p.imageFrames)),
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
  for (const chunk of chunksOf(pages)) {
    const answer = await host({
      ...callPages(chunk),
      discover: false,
      measurePages: true,
      measureFrames: true,
      budgetMs: CALL_BUDGET_MS,
      timeoutMs: CALL_TIMEOUT_MS
    })
    if (!answer?.baseline)
      throw new Error(`The host gave no baseline: ${answer?.code ?? answer?.error ?? 'no answer'}`)
    parts.push(answer.baseline)
    measures.push(...each(answer.pageMeasures))
  }
  const baseline = {
    ...baselineFromHost(joined(parts), { version, measuredAt: now().toISOString() }),
    look: lookFromHost(measures)
  }
  await store.save(version, baseline)
  return { baseline, measured: true }
}
