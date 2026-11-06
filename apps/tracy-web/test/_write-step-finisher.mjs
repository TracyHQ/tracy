// Fixtures for the finisher of the write step bench (#420): a written site behind a fake site door that records every write
// and revert, scripted model doors for the finder, the fixer and the checker, and a fake capture that answers the host's
// tiled screenshot stream with fixed images. The club, its words and its site are invented.
import { createHash } from 'node:crypto'
import { report, written } from './_site-check.mjs'
import { keptPages } from './_site-check-pages.mjs'

export const VERSION = 'demo-gym/j6/1.2.3'
export const SITE = 'write-bench-abc.sites.example'
/** What the writer ordered for the heading: words with emphasis codes the site printed as they are. */
export const RAW = 'Strength ((span))coaching((/span)) for every level'
export const CLEAN = 'Strength coaching for every level'

/** The kit's blocks: one heading slot the finisher may repair. */
export const BLOCKS = [{ id: 'block-2', slots: [{ id: 'block-2.1', type: 'text' }] }]

/** The bench site record the site creator would have kept. */
export const benchSite = () => ({
  id: 'site-1',
  label: 'write-bench-abc',
  siteKey: SITE,
  status: 'ready',
  contract: VERSION
})

/** The write report of the run, with the first site check result the bench's check kept on it. */
export function writtenRun() {
  const firstCheck = {
    version: 'site-check/1',
    status: 'red',
    counts: { block: 1, warn: 0, unmeasured: 0 },
    groups: [
      {
        name: 'emphasis-codes-left',
        status: 'red',
        checked: 1,
        failures: [{ level: 'block', slot: 'block-2.1', causingStep: 9, measured: RAW }]
      }
    ]
  }
  return {
    id: 'run-1',
    siteKey: SITE,
    kit: VERSION,
    status: 'done',
    phase: 'done',
    report: {
      ...report([written('block-2.1', 'module-2.1', RAW)], { site: SITE, kit: VERSION, contract: VERSION }),
      siteCheck: firstCheck
    }
  }
}

/**
 * The written site: `content.contract inspect` lists what it holds, `apply` takes changes under the caller's apply id, and
 * `apply.revert` puts back what one apply id changed. `writes` and `reverts` are what a test reads.
 */
export function writtenSite(held = { 'module-2.1': RAW }) {
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
        return { text: JSON.stringify(next), costUsd: 0.01 }
      }
    }
  }
}

/** A JPEG-looking fixed image per call: the first shot of a page is the "before" picture, a later one the "after". */
const picture = (name) => Buffer.from(`fixed image ${name}`).toString('base64')

/**
 * The host's capture stream (mode vision-tiles/1), one tile per page and width. Every call is kept in `calls`.
 */
export function fakeCapture() {
  const calls = []
  const capture = async (layouts, { onFrame }) => {
    calls.push(layouts.map((l) => l.path))
    const name = calls.length === 1 ? 'before' : `after-${calls.length}`
    for (const layout of layouts)
      for (const [width, viewport, viewportHeight] of [
        [1440, 'desktop', 900],
        [390, 'phone', 844]
      ]) {
        const base = { page: layout.path, key: layout.key, viewport, width, viewportHeight }
        await onFrame({ type: 'view-start', ...base, documentHeight: viewportHeight })
        const jpeg = picture(`${name} ${layout.path} ${viewport}`)
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
  return { capture, calls }
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
