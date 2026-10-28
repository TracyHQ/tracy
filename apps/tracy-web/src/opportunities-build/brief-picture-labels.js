/**
 * What the brief's photographs show, labelled when the brief is made (F08) so the FIRST brief already says it: the
 * build's own batched vision call (`lib/picture-vision.js` `labelWithVision`, same prompt and key) and its shared cache
 * (`media-analysis.js`), so a picture labelled here is never paid for again by a build, and the other way round.
 *
 * 🔒 CAPPED. At most `maxPictures` photographs (24 = three calls of 8 by default; `TRACY_BRIEF_VISION_MAX_PICTURES`),
 * the largest first, never the logo or a profile picture, never one too small for any place on a site.
 * 🔒 EVERY UNLABELLED PICTURE SAYS WHY (`note.unlabelled`, id → reason): never shown (a video, the logo, too small, past
 * the cap) or shown and not answered, per picture. A call that fails is sent once more (`retry: 1`), within a budget that
 * names both rounds; "labelled" means every picture asked was, "partial" that some were not.
 * 🔒 NEVER IN THE WAY OF THE BRIEF. No model, a refused budget, a failed call or an unreadable store: nothing is labelled,
 * the claims go back for a later build, and the note says why. This step never throws.
 */
import { createHash } from 'node:crypto'
import { createChargeable } from 'website-opportunities/src/cost-ledger.js'
import { ceilingCents, visionCostCents } from 'website-opportunities/src/cost-prices.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { photographsOnly } from 'website-opportunities/domain/pictures/brief-media.mjs'
import { labelWithVision } from '../lib/picture-vision.js'
import { claimAnalyses, doneAnalyses, settleAnalysis } from './media-analysis.js'

export const BRIEF_VISION_MAX_PICTURES = 24
/** Pictures sent in one call (as a build sends them). */
const BATCH = 8
/** A picture smaller than this on its long side is never shown to the model: no place on a site takes it. */
const MIN_EDGE = 480
const PICTURE_MAX_BYTES = 25 * 1024 * 1024

/** Rounds a failed call is sent again; the charge's ceiling covers them. */
const RETRY = 1

const area = (m) => (Number(m.width) || 0) * (Number(m.height) || 0)
const entryOf = (vision, labels) => ({ key: vision.key, model: vision.door.model, labels })

/**
 * @param {{pool: {query: Function}, objects: {get: (key: string) => Promise<Response | null>} | null,
 *   visionFor: () => Promise<{door: {url: string, key: string, model: string}, key: string} | null>,
 *   label?: typeof labelWithVision, chargeable?: Function, maxPictures?: number, log?: {warn?: Function}}} deps
 */
export function createBriefPictureLabels({
  pool,
  objects,
  visionFor,
  label = labelWithVision,
  chargeable = createChargeable(null),
  maxPictures = BRIEF_VISION_MAX_PICTURES,
  log = console
}) {
  /** The stored bytes of each picture, read by id and checked against its sha256. */
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
   * @param {{media: any[], brand: any, accountId: string | null, trade: string | null}} input a brief read's media
   * @returns {Promise<{labels: Map<string, {key: string, model: string, labels: any}>, note: Record<string, any>}>}
   */
  return async function labelBriefPictures({ media, brand, accountId, trade }) {
    const labels = new Map()
    const note = { status: 'none', asked: 0, labelled: 0, cached: 0, max: maxPictures }
    /** @type {Record<string, string>} why each picture is left unlabelled */
    const unlabelled = {}
    const mark = (ids, reason) => {
      for (const id of ids) if (!labels.has(id)) unlabelled[id] ??= reason
    }
    const done = (out) => {
      for (const id of labels.keys()) delete unlabelled[id]
      return { labels, note: Object.keys(unlabelled).length ? { ...out, unlabelled } : out }
    }
    const all = (media ?? []).filter((m) => m?.id)
    mark(
      all.filter((m) => m.kind === 'video').map((m) => m.id),
      'video'
    )
    const photographs = photographsOnly(all, brand)
    const photoIds = new Set(photographs.map((m) => m.id))
    mark(
      all.filter((m) => m.kind === 'image' && !photoIds.has(m.id)).map((m) => m.id),
      'not_a_photograph'
    )
    let vision = null
    let claimed = new Set()
    let sent = []
    try {
      vision = await visionFor()
      if (!vision) {
        mark([...photoIds], 'no_vision_model')
        return done({ ...note, status: 'off', reason: 'no_vision_model' })
      }
      const tooSmall = (m) => Math.max(Number(m.width) || 0, Number(m.height) || 0) < MIN_EDGE
      mark(
        photographs.filter((m) => !m.sha256).map((m) => m.id),
        'no_bytes'
      )
      mark(
        photographs.filter((m) => m.sha256 && tooSmall(m)).map((m) => m.id),
        'too_small'
      )
      const ranked = photographs
        .filter((m) => m.sha256 && !tooSmall(m))
        .sort((a, b) => area(b) - area(a) || String(a.id).localeCompare(String(b.id)))
      const wanted = ranked.slice(0, maxPictures)
      mark(
        ranked.slice(maxPictures).map((m) => m.id),
        'over_cap'
      )
      if (!wanted.length) return done(note)
      // Labelled already: on the row under this key (an opportunity's picture) or in the shared cache (a place's).
      const cachedLabels = await doneAnalyses(
        pool,
        wanted.filter((m) => m.origin === 'place').map((m) => m.sha256),
        vision
      )
      const ask = []
      for (const m of wanted) {
        const own = m.labels?.vision?.key === vision.key ? m.labels.vision.labels : null
        const held = own ?? (m.origin === 'place' ? cachedLabels.get(m.sha256) : null)
        if (held) labels.set(m.id, entryOf(vision, held))
        else ask.push(m)
      }
      note.cached = labels.size
      if (!ask.length) return done({ ...note, status: 'cached' })
      claimed = await claimAnalyses(
        pool,
        ask.filter((m) => m.origin === 'place').map((m) => m.sha256),
        vision
      )
      sent = ask.filter((m) => m.origin !== 'place' || claimed.has(m.sha256))
      const pictures = await bytesOf(sent, accountId)
      const read = new Set(pictures.map((p) => p.id))
      mark(
        sent.filter((m) => !read.has(m.id)).map((m) => m.id),
        'no_bytes'
      )
      note.asked = pictures.length
      if (!pictures.length) {
        for (const sha of claimed) await settleAnalysis(pool, sha, null, vision)
        claimed = new Set()
        return done({ ...note, status: labels.size ? 'cached' : 'failed', reason: 'no_bytes' })
      }
      const model = vision.door.model
      const answer = await chargeable(
        {
          provider: 'vision',
          operation: model,
          // The first round's calls and, at most, as many again for the retry.
          maxCents: (1 + RETRY) * Math.ceil(pictures.length / BATCH) * ceilingCents('vision', model),
          actualCents: (r) => visionCostCents(model, r.usage),
          purpose: 'picture-labels',
          payer: accountId ? { kind: 'account', accountId } : null,
          tokens: (r) => modelTokensOf((r.usage?.requests ?? []).map((q) => q.usage))
        },
        () => label({ door: vision.door, pictures, trade, batch: BATCH, retry: RETRY })
      )
      for (const m of sent) {
        const got = answer.labels.get(m.id) ?? null
        if (m.origin === 'place' && claimed.has(m.sha256)) await settleAnalysis(pool, m.sha256, got, vision)
        if (!got) {
          if (read.has(m.id)) mark([m.id], answer.reasons?.get(m.id) ?? 'not_in_answer')
          continue
        }
        labels.set(m.id, entryOf(vision, got))
        note.labelled += 1
        if (m.origin !== 'place' && accountId)
          await pool.query(
            `update wo_media set labels = coalesce(labels, '{}'::jsonb) || jsonb_build_object('vision', $2::jsonb)
             where id = $1 and account_id = $3`,
            [m.id, JSON.stringify({ ...entryOf(vision, got), at: new Date().toISOString() }), accountId]
          )
      }
      claimed = new Set()
      const failed = note.asked - note.labelled
      if (!failed) return done({ ...note, status: 'labelled' })
      const reason = commonest(sent.map((m) => unlabelled[m.id]).filter(Boolean)) ?? 'no_answer'
      return done({ ...note, status: note.labelled ? 'partial' : 'failed', failed, reason })
    } catch (error) {
      // The claims go back: a later build asks again.
      for (const sha of claimed) await settleAnalysis(pool, sha, null, vision).catch(() => {})
      log.warn?.(`[brief pictures] the vision model could not label (${error?.message ?? error})`)
      mark(
        sent.map((m) => m.id),
        'vision_failed'
      )
      return done({ ...note, status: 'failed', reason: String(error?.code ?? 'vision_failed').slice(0, 60) })
    }
  }
}

/** The reason most pictures share (the first of a tie), or null. */
function commonest(reasons) {
  const counts = new Map()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  let best = null
  for (const [r, n] of counts) if (!best || n > counts.get(best)) best = r
  return best
}
