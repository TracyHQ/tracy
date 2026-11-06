// Fixtures for the finisher of the write step bench (#420): a written site behind a fake site door that records every write
// and revert, scripted model doors for the finder, the fixer and the checker, and a fake capture that answers the host's
// tiled screenshot stream with fixed images. The club, its words and its site are invented.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { report, written } from './_site-check.mjs'
import { keptPages } from './_site-check-pages.mjs'
import { SITE } from './_write-step-run.mjs'

export const VERSION = 'demo-gym/j6/1.2.3'
/** The bench site of the shared write step fixtures (a made-up label in the bench's own form). */
export { SITE }
/** What the writer ordered for the heading: words with emphasis codes the site printed as they are. */
export const RAW = 'Strength ((span))coaching((/span)) for every level'
export const CLEAN = 'Strength coaching for every level'

/** Words the site holds right, in a second block of the home page. */
export const HOURS = 'Open every day from six'

/** The kit's blocks: a heading slot the finisher may repair, and a block with two more slots, all on the home page. */
export const BLOCKS = [
  { id: 'block-2', slots: [{ id: 'block-2.1', type: 'text' }] },
  {
    id: 'block-3',
    slots: [
      { id: 'block-3.1', type: 'text' },
      { id: 'block-3.2', type: 'text' }
    ]
  },
  { id: 'block-4', slots: [{ id: 'block-4.1', type: 'text' }] }
]

/**
 * The kit's pages, at the demo's addresses: the home page shows blocks 2 and 3, the about page block 4, and the plans page
 * is one the written site does not keep.
 */
export const PAGES = [
  { id: 'page-home', path: '/', blocks: { 390: ['block-2', 'block-3'], 1440: ['block-2', 'block-3'] } },
  { id: 'page-about-us', path: '/about-us', blocks: { 390: ['block-4'], 1440: ['block-4'] } },
  { id: 'page-plans', path: '/plans', blocks: {} }
]

/** The pages the write step kept, at the addresses the written site answers at: the about page was renamed. */
export const KEPT_PAGES = [
  { id: 'page-home', path: '/' },
  { id: 'page-about-us', path: '/about' }
]

/** What the written site holds: the heading prints raw codes, the other slots are right. */
export const heldAtStart = () => ({
  'module-2.1': RAW,
  'module-3.1': HOURS,
  'module-3.2': 'Showers ((span))and((/span)) lockers',
  'module-4.1': 'Our story ((span))began((/span)) in a garage'
})

/** The bench site record the site creator would have kept. */
export const benchSite = () => ({
  id: 'site-1',
  label: SITE.slice(0, SITE.indexOf('.')),
  siteKey: SITE,
  status: 'ready',
  contract: VERSION
})

/**
 * The write report of the run, with the first site check result the bench's check kept on it. `groups` adds groups after
 * its one red group, and `allGroups` says the first check ran every group despite a red one.
 */
export function writtenRun({ failures, groups = [], allGroups = false } = {}) {
  const firstCheck = {
    version: 'site-check/1',
    status: 'red',
    allGroups,
    counts: { block: 1, warn: 0, unmeasured: 0 },
    groups: [
      {
        name: 'emphasis-codes-left',
        status: 'red',
        checked: 1,
        failures: failures ?? [
          {
            group: 'emphasis-codes-left',
            page: null,
            slot: 'block-2.1',
            width: null,
            level: 'block',
            causingStep: 9,
            measured: RAW
          }
        ]
      },
      ...groups
    ]
  }
  return {
    id: 'run-1',
    siteKey: SITE,
    kit: VERSION,
    status: 'done',
    phase: 'done',
    report: {
      ...report(
        Object.entries(heldAtStart()).map(([key, words]) => written(`block-${key.slice(7)}`, key, words)),
        { site: SITE, kit: VERSION, contract: VERSION, keptPages: KEPT_PAGES }
      ),
      siteCheck: firstCheck
    }
  }
}

/**
 * The written site: `content.contract inspect` lists what it holds, `apply` takes changes under the caller's apply id, and
 * `apply.revert` puts back what one apply id changed. `writes` and `reverts` are what a test reads.
 */
export function writtenSite(held = heldAtStart(), { sideEffect = null } = {}) {
  const writes = []
  const reverts = []
  const before = new Map()
  const door = {
    async apply({ action, params }) {
      if (action === 'apply.revert') {
        reverts.push(params.apply_id)
        const kept = before.get(params.apply_id)
        if (!kept) return { ok: false, error: 'not_found', message: 'no such apply' }
        Object.assign(held, kept)
        return { ok: true, reverted: Object.keys(kept).length }
      }
      if (action !== 'content.contract') return { ok: false, error: 'unexpected_action' }
      if (params.operation === 'inspect')
        return {
          ok: true,
          contract: VERSION,
          revision: `rev-${writes.length + reverts.length + 1}`,
          pages: keptPages(2),
          slots: Object.entries(held).map(([key, current]) => ({
            key,
            entity: key.slice(0, key.lastIndexOf('.')),
            type: 'text',
            current
          }))
        }
      if (params.operation !== 'apply' || !params.apply_id)
        return { ok: false, error: 'bad_params', message: 'apply_id required' }
      writes.push({ applyId: params.apply_id, changes: { ...params.changes } })
      before.set(
        params.apply_id,
        Object.fromEntries(Object.keys(params.changes ?? {}).map((key) => [key, held[key]]))
      )
      Object.assign(held, params.changes)
      // A site that changes more than it was asked to, as a broken repair would.
      if (sideEffect) {
        before.get(params.apply_id)[sideEffect.key] ??= held[sideEffect.key]
        held[sideEffect.key] = sideEffect.value
      }
      return { ok: true }
    }
  }
  return { door, held, writes, reverts }
}

/**
 * A model door with scripted answers, one per call, as the finisher's doors answer: `ask` returns the answer's text.
 * @param {string} label
 * @param {object[]} answers each the JSON object the model answers
 * @param {{ images?: boolean }} [over] `images: false` is a model its provider says cannot read pictures
 */
export function scriptedDoor(label, answers, { images = true } = {}) {
  const asked = []
  const queue = [...answers]
  return {
    asked,
    door: {
      ok: true,
      label,
      model: 'deepseek-flash',
      providerId: 'deepseek',
      images,
      async ask(message) {
        asked.push(message)
        const next = queue.shift()
        if (!next) throw new Error(`${label} was asked more often than scripted`)
        return {
          text: JSON.stringify(next),
          costUsd: 0.01,
          reasoning: `${label} looked at what it was sent.`,
          usage: { promptTokens: 1200, completionTokens: 40, cachedTokens: 0, reasoningTokens: 30 }
        }
      }
    }
  }
}

/** A plain JPEG of a viewport, as the host's tiles are. */
const jpegs = new Map()
const viewportJpeg = async (width, height) => {
  const key = `${width}x${height}`
  if (!jpegs.has(key))
    jpegs.set(
      key,
      (
        await sharp({ create: { width, height, channels: 3, background: { r: 240, g: 236, b: 228 } } })
          .jpeg({ quality: 60 })
          .toBuffer()
      ).toString('base64')
    )
  return jpegs.get(key)
}

/**
 * The host's capture stream (mode vision-tiles/1), one tile per page and width. With `held` (the site's words by key), each
 * view starts with the boxes of the text elements on the page, as the host measures them: one per slot the page shows, in
 * page order, each holding the slot's words as the site prints them. Without `held`, no box is given. A page in `failing`
 * ends its views unshot, as a page the browser could not open does. Every call's paths are kept in `calls`, its layouts as
 * sent in `layoutsAsked`.
 * @param {{ held?: Record<string, string>, failing?: string[] }} [input]
 */
export function fakeCapture({ held = null, failing = [] } = {}) {
  const calls = []
  const layoutsAsked = []
  const onPage = { '/': ['module-2.1', 'module-3.1', 'module-3.2'], '/about': ['module-4.1'] }
  const capture = async (layouts, { onFrame }) => {
    calls.push(layouts.map((l) => l.path))
    layoutsAsked.push(layouts)
    for (const layout of layouts)
      for (const [width, viewport, viewportHeight] of [
        [1440, 'desktop', 900],
        [390, 'phone', 844]
      ]) {
        const base = { page: layout.path, key: layout.key, viewport, width, viewportHeight }
        const boxes = held
          ? (onPage[layout.path] ?? []).map((key, i) => ({
              x: 40,
              y: 120 + i * 200,
              width: width - 80,
              height: 90,
              text: held[key]
            }))
          : undefined
        if (failing.includes(layout.path)) {
          await onFrame({
            type: 'view-end',
            ...base,
            tiles: 0,
            complete: false,
            reason: 'CAPTURE_PAGE_FAILED'
          })
          continue
        }
        await onFrame({
          type: 'view-start',
          ...base,
          documentHeight: viewportHeight,
          ...(boxes ? { boxes } : {})
        })
        const jpeg = await viewportJpeg(width, viewportHeight)
        await onFrame({
          type: 'tile',
          ...base,
          index: 0,
          y: 0,
          height: viewportHeight,
          from: 0,
          to: viewportHeight,
          documentHeight: viewportHeight,
          jpeg,
          sha256: createHash('sha256').update(Buffer.from(jpeg, 'base64')).digest('hex')
        })
        await onFrame({ type: 'view-end', ...base, tiles: 1, covered: viewportHeight, complete: true })
      }
    await onFrame({ type: 'end', version: 'vision-tiles/1', complete: true })
    return { ok: true }
  }
  return { capture, calls, layoutsAsked }
}

/** The finder's answer naming one fault of a kind, on the home page at desktop width. */
export const finding = (kind = 'raw-markup', over = {}) => ({
  faults: [
    {
      page: '/',
      viewport: 'desktop',
      tile: 0,
      slot: 'block-2.1',
      kind,
      seen: 'the heading prints ((span))',
      ...over
    }
  ]
})

/** The checker's answer for one page: the verdict of one repair, by its number in the run (the first repair is 1). */
export const judged = (verdict, reason, repair = 1) => ({ verdicts: [{ repair, verdict, reason }] })
