/**
 * WHAT EACH OF A BUILD'S PHOTOS SHOWS, SO IT GOES WHERE IT FITS (plan "10/10" P1-1, 26/10/2026). The research's
 * photos carry no caption; the agent chose from a numbered sheet (`media.look`) and local rounds 31–33 still put a
 * selfie behind a section's words and a bunch of flowers behind a cookie club. Each photo is labelled once with the
 * label the quickstart-first pictures already use (`lib/picture-vision.js`: subject, quality, heroWorthy, one line) and
 * kept where that pipeline keeps it — an account's own photo on its `wo_media` row, a place's shared photo in
 * `wo_media_analysis` by its sha256, claimed first so one build labels it for every account. The labels go to the
 * agent with the sheet, and to the checks (`photos-fit`, tracy-host).
 *
 * 🔒 NO MODEL, NO LABEL, NO FAILURE. Without a vision door, over the cost cap or when the model fails, a photo has no
 * label and the build goes on as before: the agent still sees the sheet, the check judges only what is labelled.
 */
import { ceilingCents, visionCostCents } from 'website-opportunities/src/cost-prices.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { labelWithVision, visionKey } from '../lib/picture-vision.js'

/** How long a claim on a shared photo's label holds while the model answers (`site-pictures.js` `ANALYSIS_LEASE`). */
const LEASE = `interval '10 minutes'`

/** A media row's vision label, whatever key made it, or null. @param {any} row */
export function visionLabelOf(row) {
  const vision = row?.labels?.vision
  if (!vision?.model || vision.key !== visionKey({ model: vision.model })) return null
  const labels = vision.labels
  return labels && typeof labels === 'object' ? labels : null
}

/**
 * @param {{ pool: import('pg').Pool, visionFor: () => Promise<{url: string, key: string, model: string} | null>,
 *   chargeable?: (spec: object, fn: () => Promise<any>) => Promise<any>, label?: typeof labelWithVision,
 *   fetchImpl?: typeof fetch }} deps
 */
export function createDemoPhotoLabels({
  pool,
  visionFor,
  chargeable = (_spec, fn) => fn(),
  label = labelWithVision,
  fetchImpl = fetch
}) {
  /**
   * The label of each row, labelling those that have none.
   * @param {any[]} rows - `buildPlaced` rows of the photos asked about.
   * @param {Map<string, 'place' | 'own'>} origins - by row id, from the revision's manifest.
   * @param {(row: any) => Promise<Buffer | null>} bytesOf
   * @param {{ payer?: object | null, buildId?: string | null, signal?: AbortSignal }} [options]
   * @returns {Promise<Map<string, Record<string, unknown>>>}
   */
  return async function labelsOf(rows, origins, bytesOf, { payer = null, buildId = null, signal } = {}) {
    const out = new Map()
    for (const row of rows) {
      const held = visionLabelOf(row)
      if (held) out.set(row.id, held)
    }
    const missing = rows.filter((row) => !out.has(row.id))
    if (missing.length === 0) return out
    const door = await visionFor().catch(() => null)
    if (!door) return out
    const key = visionKey({ model: door.model })
    // Claim each batch immediately before use: a large gallery must not spend later photos' leases
    // waiting for earlier model calls. Keep only this batch's originals in memory.
    for (let offset = 0; offset < missing.length; offset += 8) {
      if (signal?.aborted) break
      const group = missing.slice(offset, offset + 8)
      const place = group.filter((row) => origins.get(row.id) === 'place')
      const claimed = place.length
        ? new Set(
            (
              await pool.query(
                `insert into wo_media_analysis (media_sha256, model, version, state, lease_until, attempts)
                 select sha, $2, $3, 'pending', now() + ${LEASE}, 1 from unnest($1::text[]) as sha
                 on conflict (media_sha256, model, version) do update
                   set state = 'pending', lease_until = now() + ${LEASE},
                     attempts = wo_media_analysis.attempts + 1, updated_at = now()
                   where wo_media_analysis.state <> 'done'
                     and (wo_media_analysis.lease_until is null or wo_media_analysis.lease_until < now())
                 returning media_sha256`,
                [[...new Set(place.map((row) => row.sha256))], door.model, key]
              )
            ).rows.map((r) => r.media_sha256)
          )
        : new Set()
      const sent = group.filter((row) => origins.get(row.id) !== 'place' || claimed.has(row.sha256))
      const pictures = []
      for (const row of sent) {
        const bytes = await bytesOf(row).catch(() => null)
        if (bytes) pictures.push({ id: row.id, bytes })
      }
      let answer = null
      if (pictures.length)
        try {
          answer = await chargeable(
            {
              provider: 'vision',
              operation: door.model,
              maxCents: Math.ceil(pictures.length / 8) * ceilingCents('vision', door.model),
              actualCents: (r) => visionCostCents(door.model, r.usage),
              purpose: 'picture-labels',
              payer,
              buildId,
              tokens: (r) => modelTokensOf((r.usage?.requests ?? []).map((q) => q.usage))
            },
            () => label({ door, pictures, concurrency: 1, fetchImpl, signal })
          )
        } catch {
          answer = null
        }
      const at = new Date().toISOString()
      for (const row of sent) {
        const own = answer?.labels?.get(row.id) ?? null
        if (origins.get(row.id) === 'place')
          await pool.query(
            `update wo_media_analysis set state = $4, result = $5::jsonb, lease_until = null, updated_at = now()
             where media_sha256 = $1 and model = $2 and version = $3 and state = 'pending'`,
            [row.sha256, door.model, key, own ? 'done' : 'failed', own ? JSON.stringify(own) : null]
          )
        else if (own)
          await pool.query(
            `update wo_media set labels = coalesce(labels, '{}'::jsonb) || jsonb_build_object('vision', $2::jsonb) where id = $1`,
            [row.id, JSON.stringify({ key, model: door.model, at, labels: own })]
          )
        if (own) out.set(row.id, own)
      }
    }
    return out
  }
}

/**
 * Where a photo of each subject may go, said with the sheet and by the check (`photos-fit`). A photo of people, an
 * event, a poster, a menu board or a logo is never a section's background or the photo behind a band's words.
 */
export const BACKGROUND_UNFIT = Object.freeze(['people', 'event', 'poster', 'menu-board', 'logo'])
