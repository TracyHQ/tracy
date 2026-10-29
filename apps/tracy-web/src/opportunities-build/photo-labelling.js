/**
 * PHOTOS ARE LABELLED BESIDE THE RESEARCH, NOT IN A REQUEST (item 27). Right after a research run stores its photos (and
 * again when a research run adds some), this labeller asks what each photo shows, in the background, so neither the brief
 * (`POST /revisions`) nor the build pays a vision call on its own clock.
 *
 * 🔒 TWO HALVES, TWO KEYS, ONE PROMPT EACH. (a) The content label (`visionContentKey`, the prompt with no trade and no
 * closed list) is asked once per photo's sha256 and kept for good. (b) The link to the brief's closed list of offerings and
 * people is a cheap text call from (a)'s words (`picture-link-text.js`), written with (a) as the label a reader takes
 * (`visionKey`, p6, with the list's digest). A changed list re-runs (b) only; it never re-pays (a).
 * 🔒 THE OWNER'S PHOTOS FIRST, THE LARGEST FIRST, AT MOST THE STORED MEDIA (300). Never the logo, a video or a photo too
 * small for any place on a site (`photosToLabel`).
 * 🔒 SAVED AFTER EVERY BATCH. Batches of 8, 4 in flight, each claimed in `wo_media_analysis` before its call and settled
 * right after it (one retry inside the call), then linked and stored: a crash loses one batch, never the run.
 * 🔒 THE BUILD WAITS FOR IT, NOT FOR EVER (`gate`). While photos are still being looked at, a build's brief is not made
 * and the person sees "Looking at photos 180/300". When every photo is settled (labelled, or failed after its retry) the
 * build goes on; when the labelling makes no progress for {@link PHOTO_LABEL_STALL_MS}, it goes on anyway, and the brief
 * says how many photos were left to their words.
 */
import { createHash } from 'node:crypto'
import { createChargeable } from 'website-opportunities/src/cost-ledger.js'
import { ceilingCents, visionCostCents } from 'website-opportunities/src/cost-prices.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { photographsOnly } from 'website-opportunities/domain/pictures/brief-media.mjs'
import { closedListDigest, ownershipOf } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { labelWithVision, visionContentKey, visionKey } from '../lib/picture-vision.js'
import { LINK_CHUNK, linkPicturesByText, mergedLabel } from '../lib/picture-link-text.js'
import { analysisStates, claimAnalyses, settleAnalysis, storeAnalysis } from './media-analysis.js'

/** At most this many photos are labelled for one business: the stored media of a research (`executor.js` MEDIA_BUDGET). */
export const PHOTO_LABEL_CEILING = 300
/** Photos in one vision call. */
export const PHOTO_LABEL_BATCH = 8
/** Vision calls in flight at once. */
export const PHOTO_LABEL_IN_FLIGHT = 4
/** Rounds a failed call is sent again, inside the same batch. */
export const PHOTO_LABEL_RETRY = 1
/** A build waits for the labelling only while it moves: this long without a settled photo and the build goes on. */
export const PHOTO_LABEL_STALL_MS = 15 * 60_000
/** When a waiting build asks again. */
export const PHOTO_LABEL_POLL_MS = 5_000

/** Who published a photo, in the order photos are labelled. */
const OWNERSHIP_RANK = { owner: 0, unknown: 1, customer: 2 }
/** A photo smaller than this on its long side is never shown to the model: no place on a site takes it. */
const MIN_EDGE = 480
const PICTURE_MAX_BYTES = 25 * 1024 * 1024

const area = (m) => (Number(m.width) || 0) * (Number(m.height) || 0)

/**
 * The photos worth labelling, in the order they are labelled: photographs with stored bytes, large enough for a place,
 * the owner's first, then unknown uploaders, then customers', the largest first in each; at most `ceiling`, one per
 * sha256. `skipped`: why each other picture is left out.
 * @param {any[]} media
 * @param {{brand?: any, businessName?: string | null, ceiling?: number}} options
 */
export function photosToLabel(
  media,
  { brand = null, businessName = null, ceiling = PHOTO_LABEL_CEILING } = {}
) {
  const all = (media ?? []).filter((m) => m?.id)
  /** @type {Map<string, string>} */
  const skipped = new Map()
  for (const m of all) if (m.kind === 'video') skipped.set(m.id, 'video')
  const photographs = photographsOnly(all, brand)
  const photoIds = new Set(photographs.map((m) => m.id))
  for (const m of all) if (m.kind === 'image' && !photoIds.has(m.id)) skipped.set(m.id, 'not_a_photograph')
  const tooSmall = (m) => Math.max(Number(m.width) || 0, Number(m.height) || 0) < MIN_EDGE
  for (const m of photographs)
    if (!m.sha256) skipped.set(m.id, 'no_bytes')
    else if (tooSmall(m)) skipped.set(m.id, 'too_small')
  const rank = (m) => OWNERSHIP_RANK[ownershipOf(m, businessName)]
  const ranked = photographs
    .filter((m) => m.sha256 && !tooSmall(m))
    .sort((a, b) => rank(a) - rank(b) || area(b) - area(a) || String(a.id).localeCompare(String(b.id)))
  const seen = new Set()
  const wanted = []
  for (const m of ranked) {
    if (seen.has(m.sha256)) {
      // The same bytes again: labelled with the first, never asked twice.
      wanted.push(m)
      continue
    }
    if (seen.size >= ceiling) {
      skipped.set(m.id, 'over_cap')
      continue
    }
    seen.add(m.sha256)
    wanted.push(m)
  }
  return { wanted, skipped }
}

/** One photo per sha256, the first in labelling order. */
function bySha(rows) {
  const out = new Map()
  for (const r of rows) if (!out.has(r.sha256)) out.set(r.sha256, r)
  return [...out.values()]
}

/** Runs `work` over `items`, at most `limit` at once, in order of start. */
async function inPool(items, limit, work) {
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++]
      await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
}

/**
 * @param {{pool: {query: Function, connect?: Function}, objects: {get: (key: string) => Promise<Response | null>} | null,
 *   visionFor: () => Promise<any>, readPhotos: (pool: any, accountId: string, opportunityId: string) => Promise<any>,
 *   label?: typeof labelWithVision, link?: typeof linkPicturesByText, chargeable?: Function, log?: {warn?: Function},
 *   now?: () => number, ceiling?: number, batch?: number, inFlight?: number, retry?: number, stallMs?: number}} deps
 *   `visionFor`: the vision door (`{url, key, model}`, or `{door}`), null when none; `readPhotos`: the research's photos
 *   (`revisions.js researchPhotosOf`)
 */
export function createPhotoLabelling({
  pool,
  objects,
  visionFor,
  readPhotos,
  label = labelWithVision,
  link = linkPicturesByText,
  chargeable = createChargeable(null),
  log = console,
  now = Date.now,
  ceiling = PHOTO_LABEL_CEILING,
  batch = PHOTO_LABEL_BATCH,
  inFlight = PHOTO_LABEL_IN_FLIGHT,
  retry = PHOTO_LABEL_RETRY,
  stallMs = PHOTO_LABEL_STALL_MS
}) {
  /** @type {Map<string, {done: Promise<any>, again: boolean, retryFailed: boolean}>} */
  const running = new Map()

  async function doorOf() {
    const got = await visionFor()
    const door = got?.door ?? got
    return door?.url && door?.model ? door : null
  }

  /** The stored bytes of each photo, read by id and checked against its sha256. */
  async function bytesOf(rows, accountId) {
    const place = rows.filter((r) => r.origin === 'place').map((r) => r.id)
    const own = rows.filter((r) => r.origin !== 'place').map((r) => r.id)
    const keys = new Map()
    if (place.length) {
      const { rows: got } = await pool.query(
        `select id, sha256, object_key from wo_place_media
         where id = any($1::uuid[]) and status = 'stored' and revoked_at is null`,
        [place]
      )
      for (const r of got) keys.set(r.id, r)
    }
    if (own.length && accountId) {
      const { rows: got } = await pool.query(
        `select id, sha256, object_key from wo_media where id = any($1::uuid[]) and account_id = $2 and status = 'stored'`,
        [own, accountId]
      )
      for (const r of got) keys.set(r.id, r)
    }
    const pictures = []
    for (const r of rows) {
      const held = keys.get(r.id)
      if (!held?.object_key || held.sha256 !== r.sha256 || !objects) continue
      const res = await objects.get(held.object_key).catch(() => null)
      if (!res?.ok) continue
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length > PICTURE_MAX_BYTES) continue
      if (createHash('sha256').update(bytes).digest('hex') === r.sha256) pictures.push({ id: r.id, bytes })
    }
    return pictures
  }

  /**
   * Links photos whose content is labelled to the closed list and stores the label a reader takes: in the shared cache
   * for every photo, and on the account's own row too, where builds read it.
   */
  async function linkAndStore(items, { door, merged, closedList, accountId, payer }) {
    for (let n = 0; n < items.length; n += LINK_CHUNK) {
      const group = items.slice(n, n + LINK_CHUNK)
      const model = door.model
      let answer
      try {
        answer = await chargeable(
          {
            provider: 'vision',
            operation: model,
            maxCents: ceilingCents('vision', model),
            actualCents: (r) => visionCostCents(model, r.usage),
            purpose: 'picture-links',
            payer,
            tokens: (r) => modelTokensOf((r.usage?.requests ?? []).map((q) => q.usage))
          },
          () =>
            link({
              door,
              closedList,
              items: group.map(({ row, content }) => ({
                id: row.id,
                content,
                caption: row.caption ?? null,
                alt: row.alt ?? null
              }))
            })
        )
      } catch (error) {
        log.warn?.(`[photo labels] linking failed (${error?.code ?? error?.message ?? error})`)
        answer = { labels: new Map() }
      }
      const at = new Date(now()).toISOString()
      for (const { row, content } of group) {
        // A link the text model did not give: the photo stays general for this list and is linked again next run.
        const value = answer.labels.get(row.id) ?? {
          ...mergedLabel(content, null, closedList),
          linkFailed: true
        }
        await storeAnalysis(pool, row.sha256, value, merged)
        if (row.origin !== 'place' && accountId)
          await pool.query(
            `update wo_media set labels = coalesce(labels, '{}'::jsonb) || jsonb_build_object('vision', $2::jsonb)
             where id = $1 and account_id = $3`,
            [row.id, JSON.stringify({ key: merged.key, model: door.model, at, labels: value }), accountId]
          )
      }
    }
  }

  /** One pass over the research's photos: content labels for what lacks one, then links for what lacks a current one. */
  async function runOnce({ accountId, opportunityId, retryFailed = false }) {
    const subject = await readPhotos(pool, accountId, opportunityId)
    if (!subject) return { state: 'none' }
    const door = await doorOf()
    if (!door) return { state: 'off' }
    const content = { door, key: visionContentKey(door) }
    const merged = { door, key: visionKey(door) }
    const closedList = subject.closedList ?? null
    const digest = closedListDigest(closedList)
    const payer = accountId ? { kind: 'account', accountId } : null
    const { wanted } = photosToLabel(subject.media, { ...subject, ceiling })
    const unique = bySha(wanted)
    const states = await analysisStates(
      pool,
      unique.map((r) => r.sha256),
      content
    )
    const todo = unique.filter((r) => {
      const held = states.get(r.sha256)
      if (!held) return true
      if (held.state === 'done') return false
      return held.state === 'failed' ? retryFailed : true
    })
    const batches = []
    for (let n = 0; n < todo.length; n += batch) batches.push(todo.slice(n, n + batch))
    /** @type {number[]} */
    const batchMs = []
    await inPool(batches, inFlight, async (rows) => {
      const claimed = await claimAnalyses(
        pool,
        rows.map((r) => r.sha256),
        content
      )
      const sent = rows.filter((r) => claimed.has(r.sha256))
      if (!sent.length) return
      const pictures = await bytesOf(sent, accountId).catch(() => [])
      const read = new Set(pictures.map((p) => p.id))
      for (const r of sent)
        if (!read.has(r.id)) await settleAnalysis(pool, r.sha256, null, content, 'no_bytes')
      if (!pictures.length) return
      const model = door.model
      const started = now()
      let answer
      try {
        answer = await chargeable(
          {
            provider: 'vision',
            operation: model,
            // The call and, at most, its retry.
            maxCents: (1 + retry) * ceilingCents('vision', model),
            actualCents: (r) => visionCostCents(model, r.usage),
            purpose: 'picture-labels',
            payer,
            tokens: (r) => modelTokensOf((r.usage?.requests ?? []).map((q) => q.usage))
          },
          // The content prompt: no trade and no closed list (one prompt for `visionContentKey`).
          () => label({ door, pictures, batch, concurrency: 1, retry })
        )
      } catch (error) {
        log.warn?.(`[photo labels] a batch failed (${error?.code ?? error?.message ?? error})`)
        answer = { labels: new Map(), failure: String(error?.code ?? 'vision_failed') }
      }
      batchMs.push(now() - started)
      const labelled = []
      for (const r of sent) {
        if (!read.has(r.id)) continue
        const got = answer.labels.get(r.id) ?? null
        const why = got ? null : (answer.reasons?.get(r.id) ?? answer.failure ?? 'not_in_answer')
        await settleAnalysis(pool, r.sha256, got, content, why)
        if (got) labelled.push({ row: r, content: got })
      }
      // Saved after every batch: what this batch saw is linked and kept before the next one starts.
      await linkAndStore(labelled, { door, merged, closedList, accountId, payer })
    })
    // Photos labelled before (by another run, a build, or against another list): linked to this list now.
    const contentNow = await analysisStates(
      pool,
      unique.map((r) => r.sha256),
      content
    )
    const mergedNow = await analysisStates(
      pool,
      unique.map((r) => r.sha256),
      merged
    )
    const relink = []
    for (const r of unique) {
      const c = contentNow.get(r.sha256)
      if (c?.state !== 'done' || !c.result) continue
      const m = mergedNow.get(r.sha256)
      const current =
        m?.state === 'done' &&
        (m.result?.closedList ?? null) === digest &&
        !(retryFailed && m.result?.linkFailed)
      if (!current) relink.push({ row: r, content: c.result })
    }
    await linkAndStore(relink, { door, merged, closedList, accountId, payer })
    return { state: 'done', batches: batches.length, batchMs }
  }

  /**
   * Where the labelling of an opportunity's photos stands: `total` photos to label, `looked` with a content label,
   * `failed` after their retry, `linked` with a label of the current closed list, `lastAt` the last change of any.
   */
  async function progress({ accountId, opportunityId }) {
    const subject = await readPhotos(pool, accountId, opportunityId)
    if (!subject) return { state: 'none', total: 0, looked: 0, failed: 0, linked: 0, lastAt: null }
    const door = await doorOf()
    if (!door) return { state: 'off', total: 0, looked: 0, failed: 0, linked: 0, lastAt: null }
    const unique = bySha(photosToLabel(subject.media, { ...subject, ceiling }).wanted)
    const shas = unique.map((r) => r.sha256)
    const content = await analysisStates(pool, shas, { door, key: visionContentKey(door) })
    const merged = await analysisStates(pool, shas, { door, key: visionKey(door) })
    const digest = closedListDigest(subject.closedList ?? null)
    let looked = 0
    let failed = 0
    let linked = 0
    let lastAt = null
    for (const sha of shas) {
      const c = content.get(sha)
      const m = merged.get(sha)
      for (const at of [c?.at, m?.at]) if (Number.isFinite(at)) lastAt = Math.max(lastAt ?? 0, at)
      if (c?.state === 'done') {
        looked += 1
        if (m?.state === 'done' && (m.result?.closedList ?? null) === digest) linked += 1
      } else if (c?.state === 'failed') failed += 1
    }
    const total = shas.length
    const state = !total ? 'none' : looked + failed >= total && linked >= looked ? 'done' : 'running'
    return { state, total, looked, failed, linked, lastAt }
  }

  /**
   * Starts the labelling of an opportunity's photos in the background, once per opportunity at a time: asked again
   * while it runs, it runs once more after (a research run that added photos, a list that changed). Never throws.
   * @param {{accountId: string, opportunityId: string, retryFailed?: boolean}} who - `retryFailed`: photos that failed
   *   before are asked again (a new research run); a waiting build does not ask again what already failed
   */
  function start({ accountId, opportunityId, retryFailed = false }) {
    const key = `${accountId}:${opportunityId}`
    const held = running.get(key)
    if (held) {
      held.again = true
      held.retryFailed ||= retryFailed
      return held.done
    }
    const entry = { done: Promise.resolve(), again: false, retryFailed: false }
    entry.done = (async () => {
      let flags = { retryFailed }
      for (;;) {
        try {
          await runOnce({ accountId, opportunityId, ...flags })
        } catch (error) {
          log.warn?.(`[photo labels] ${opportunityId}: ${error?.code ?? error?.message ?? error}`)
        }
        if (!entry.again) break
        flags = { retryFailed: entry.retryFailed }
        entry.again = false
        entry.retryFailed = false
      }
    })().finally(() => running.delete(key))
    running.set(key, entry)
    return entry.done
  }

  /**
   * Whether a build may start now (item 27): `{ready: true, progress}` once every photo is settled, when there is
   * nothing to label, when labelling made no progress for `stallMs` (`progress.state: 'stalled'`) or could not be read
   * (`'failed'`); else `{pending: true, retryAt, progress}` and the labelling is running.
   * @param {{accountId: string, opportunityId: string, waitingSince?: number | null}} who - `waitingSince`: when the
   *   build first waited, so a labelling that never moved still ends the wait
   */
  async function gate({ accountId, opportunityId, waitingSince = null }) {
    try {
      const p = await progress({ accountId, opportunityId })
      if (p.state !== 'running') return { ready: true, progress: p }
      void start({ accountId, opportunityId })
      const moved = Math.max(p.lastAt ?? 0, waitingSince ?? now())
      if (now() - moved >= stallMs) return { ready: true, progress: { ...p, state: 'stalled' } }
      return { pending: true, retryAt: now() + PHOTO_LABEL_POLL_MS, progress: p }
    } catch (error) {
      log.warn?.(
        `[photo labels] ${opportunityId}: progress unreadable (${error?.code ?? error?.message ?? error})`
      )
      return {
        ready: true,
        progress: { state: 'failed', total: 0, looked: 0, failed: 0, linked: 0, lastAt: null }
      }
    }
  }

  return { start, run: runOnce, progress, gate }
}
