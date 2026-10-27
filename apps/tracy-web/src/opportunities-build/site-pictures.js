/**
 * The restaurant's own pictures for the site built from a revision, as the brief engines read them (injected from `app.js`:
 * `sites/` never reads `wo_media`), and where the plan that placed them is kept.
 *
 * 🔒 A SITE THAT NO OPPORTUNITY BUILT ANSWERS NOTHING, AT ONCE. The first read is `site_creation` by its key; a site made
 * from the Add site form has no `wo_build` behind its build id, so the answer is null after one indexed query, and any
 * failure here is the engine's cue to carry on as before, never an error of the site's own build.
 * 🔒 THE PRESSER'S ACCOUNT, BY ID. The email the engine holds must name exactly one account, and that account must be
 * the one that made the site AND the build; a picture must be in the revision's manifest, stored, of that account, and its
 * bytes must hash to the sha256 the manifest says.
 * 🔒 A PLACE'S PICTURE IS READ THROUGH THE REVISION. A manifest entry with `origin: 'place'` names a `wo_place_media`
 * row: read when its sha256 is the manifest's and it is not revoked, whatever the opportunity's place is now. Its vision
 * label lives in `wo_media_analysis` by (sha256, model, key), claimed before the model is called, so a picture is
 * labelled once for every account that builds with it; the shared row itself is never written.
 * 🔒 THE PLAN IS WRITTEN ONCE. `recordPlan` writes `wo_build.pictures` only when it holds none; a retry gets the plan
 * already there, so it never chooses again (plan §7 C3). Receipts and the report are added beside it, the plan untouched.
 */
import { createHash } from 'node:crypto'
import { createChargeable } from 'website-opportunities/src/cost-ledger.js'
import { ceilingCents, visionCostCents } from 'website-opportunities/src/cost-prices.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { featuresOf } from 'website-opportunities/src/media-info.js'
import { acceptedDishPhotos } from 'website-opportunities/domain/dish-photos.mjs'
import { siteBuildOf } from './site-build.js'
import { claimAnalyses as claimShas, settleAnalysis as settleSha } from './media-analysis.js'
import { picturePolicy } from '../lib/wo-picture-policy.js'

/** How many pictures are read from the store at once to measure the ones collected before measuring existed. */
const MEASURE_AT_ONCE = 6
/** The largest picture read back for a site. */
const PICTURE_MAX_BYTES = 25 * 1024 * 1024
/** A picture smaller than this on its long side is never shown to the vision model: no place takes it anyway. */
const VISION_MIN_EDGE = 480

/**
 * @param {{pool: import('pg').Pool, objects: {get: (key: string) => Promise<Response | null>} | null,
 *   measure: (bytes: Uint8Array) => Promise<{dhash: string, top2Share: number, edgeDensity: number, centreLuminance: number}>,
 *   vision?: {door: {url: string, key: string, model: string}, key: string, label: Function, maxPictures?: number} | null,
 *   log?: {warn: Function}}} deps - `vision`: the vision model and `lib/picture-vision.js`'s `labelWithVision`; null = words only
 */
/** Where a picture drawn for a build's restaurant is kept: beside its collected media, in a folder of its own. */
const drawnKey = (build, key) => `opportunities/${build.account_id}/${build.opportunity_id}/drawn/${key}`

/** Two 64-bit hashes at most six bits apart. */
function near(a, b) {
  let bits = 0
  for (let i = 0; i < 16; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      bits += x & 1
      x >>= 1
    }
  }
  return bits <= 6
}

/** Select vision work from the whole pool, rotating aspect needs instead of truncating manifest order. */
export function visionPictureCandidates(rows, { key, maxPictures = 80, needs = [] }) {
  const wanted = rows
    .filter((r) => Math.max(r.width ?? 0, r.height ?? 0) >= VISION_MIN_EDGE)
    .sort((a, b) => b.width * b.height - a.width * a.height || String(a.id).localeCompare(String(b.id)))
  const unique = [],
    seen = []
  for (const row of wanted) {
    if (row.dhash && seen.some((other) => near(other, row.dhash))) continue
    if (row.dhash) seen.push(row.dhash)
    unique.push(row)
  }
  const aspects = [
    ...new Set(needs.filter((n) => n.width > 0 && n.height > 0).map((n) => n.width / n.height))
  ]
  // Even without a map, preserve landscape, square and portrait candidates for different places.
  if (!aspects.length) aspects.push(16 / 9, 1, 3 / 4)
  const selected = [],
    ids = new Set()
  while (selected.length < maxPictures && selected.length < unique.length) {
    for (const aspect of aspects) {
      const ranked = unique
        .filter((r) => !ids.has(r.id))
        .sort((a, b) => {
          const fit = (r) => Math.abs(Math.log(r.width / r.height / aspect))
          return (
            fit(a) - fit(b) ||
            b.width * b.height - a.width * a.height ||
            String(a.id).localeCompare(String(b.id))
          )
        })
      const next = ranked[0]
      if (!next || selected.length >= maxPictures) break
      selected.push(next)
      ids.add(next.id)
    }
  }
  return selected.filter((r) => r.labels?.vision?.key !== key)
}

export function createSitePictures({
  pool,
  objects,
  measure,
  vision: defaultVision = null,
  visionFor = null,
  log = console,
  // `cost-ledger.js`: each vision call is reserved against Tracy's research caps; the default counts nothing.
  chargeable = createChargeable(null)
}) {
  async function bytesOf(row) {
    if (!objects || !row.object_key) return null
    const res = await objects.get(row.object_key)
    if (!res?.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > PICTURE_MAX_BYTES) return null
    // The store returned what the manifest names, or nothing.
    return createHash('sha256').update(bytes).digest('hex') === row.sha256 ? bytes : null
  }

  /** The words collected with each picture, for pictures stored before they were kept on the row. */
  async function backfillWords(opportunityId, rows) {
    const missing = rows.filter((r) => r.caption === null && r.alt === null)
    if (missing.length === 0) return
    const { rows: sources } = await pool.query('select collected from wo_source where opportunity_id = $1', [
      opportunityId
    ])
    const byUrl = new Map()
    for (const s of sources)
      for (const m of s.collected?.media ?? []) if (typeof m?.url === 'string') byUrl.set(m.url, m)
    for (const row of missing) {
      const m = byUrl.get(row.source_url)
      if (!m) continue
      row.caption = typeof m.caption === 'string' ? m.caption.slice(0, 2000) : null
      row.alt = typeof m.alt === 'string' ? m.alt.slice(0, 2000) : null
      await pool.query('update wo_media set caption = $2, alt = $3 where id = $1', [
        row.id,
        row.caption,
        row.alt
      ])
    }
  }

  async function backfillFeatures(rows) {
    const missing = rows.filter((r) => r.origin !== 'place' && (!r.dhash || !r.labels?.features))
    for (let i = 0; i < missing.length; i += MEASURE_AT_ONCE)
      await Promise.all(
        missing.slice(i, i + MEASURE_AT_ONCE).map(async (row) => {
          const bytes = await bytesOf(row).catch(() => null)
          if (!bytes) return
          const measured = await measure(bytes).catch(() => null)
          if (!measured) return
          row.dhash = measured.dhash
          row.labels = { ...row.labels, features: featuresOf(measured) }
          await pool.query(
            `update wo_media set dhash = $2, labels = coalesce(labels, '{}'::jsonb) || $3::jsonb where id = $1`,
            [row.id, row.dhash, JSON.stringify({ features: row.labels.features })]
          )
        })
      )
  }

  /**
   * Label with the vision model the pictures that have no label of the current key: the ones large enough for a place,
   * one of each near-copy (the largest), the largest first, at most `maxPictures`. Kept on the row, so a rebuild asks nothing.
   */
  async function labelMissing(rows, signal, needs, vision, maxPictures, payer = null, trade = null) {
    signal?.throwIfAborted()
    if (!vision) return null
    const started = Date.now()
    const shortlist = visionPictureCandidates(rows, {
      key: vision.key,
      maxPictures,
      needs
    })
    if (shortlist.length === 0) return { labelled: 0, calls: 0, tokens: 0, failed: 0, ms: 0 }
    // A place's picture is sent only when this build holds its claim; another build labelling it answers later.
    const claimed = await claimShas(
      pool,
      shortlist.filter((r) => r.origin === 'place').map((r) => r.sha256),
      vision
    )
    const sent = shortlist.filter((r) => r.origin !== 'place' || claimed.has(r.sha256))
    if (sent.length === 0) return { labelled: 0, calls: 0, tokens: 0, failed: 0, ms: 0 }
    const pictures = []
    for (const r of sent) {
      signal?.throwIfAborted()
      const bytes = await bytesOf(r).catch(() => null)
      if (bytes) pictures.push({ id: r.id, bytes })
    }
    const model = vision.door.model
    let answer
    try {
      // `labelWithVision` sends 8 pictures a call.
      const invoke = () => {
        signal?.throwIfAborted()
        return vision.label({ door: vision.door, pictures, trade, signal })
      }
      answer = vision.metered
        ? await invoke()
        : await chargeable(
            {
              provider: 'vision',
              operation: model,
              maxCents: Math.ceil(pictures.length / 8) * ceilingCents('vision', model),
              actualCents: (r) => visionCostCents(model, r.usage),
              // One row for the whole batch: the build's owner pressed Build (/ops › Usage, migration 167).
              purpose: 'picture-labels',
              payer,
              tokens: (r) => modelTokensOf((r.usage?.requests ?? []).map((q) => q.usage))
            },
            invoke
          )
      signal?.throwIfAborted()
    } catch (error) {
      // Over the cap, or the model failed: the claims go back, a later build asks again.
      for (const sha of claimed) await settleSha(pool, sha, null, vision)
      throw error
    }
    const { labels, usage, failed } = answer
    const at = new Date().toISOString()
    for (const r of sent) {
      signal?.throwIfAborted()
      const own = labels.get(r.id)
      if (r.origin === 'place') await settleSha(pool, r.sha256, own ?? null, vision)
      if (!own) continue
      const entry = { key: vision.key, model: vision.door.model, at, labels: own }
      r.labels = { ...r.labels, vision: entry }
      if (r.origin !== 'place')
        await pool.query(
          `update wo_media set labels = coalesce(labels, '{}'::jsonb) || jsonb_build_object('vision', $2::jsonb) where id = $1`,
          [r.id, JSON.stringify(entry)]
        )
    }
    return {
      labelled: labels.size,
      booking: vision.booking ?? null,
      requests: usage.requests ?? [],
      calls: usage.calls,
      tokens: usage.promptTokens + usage.completionTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      failed,
      ms: Date.now() - started
    }
  }

  /**
   * The place pictures a manifest names (`origin: 'place'`), stored, not revoked, with the manifest's sha256, each
   * with the done vision label of the current key from `wo_media_analysis` as `labels.vision`.
   */
  async function placePictures(manifest, vision) {
    const wanted = [...manifest.values()].filter((a) => a.origin === 'place')
    if (wanted.length === 0) return []
    const { rows } = await pool.query(
      `select id, sha256, object_key, mime, width, height, source, source_url, posted_at, caption, alt, dhash, labels
       from wo_place_media where id = any($1::uuid[]) and status = 'stored' and kind = 'image' and revoked_at is null`,
      [wanted.map((a) => a.id)]
    )
    const own = rows.filter((r) => manifest.get(r.id)?.sha256 === r.sha256)
    const labels = new Map()
    if (vision && own.length) {
      const { rows: done } = await pool.query(
        `select media_sha256, model, version, result, updated_at from wo_media_analysis
         where media_sha256 = any($1::text[]) and model = $2 and version = $3 and state = 'done'`,
        [own.map((r) => r.sha256), vision.door.model, vision.key]
      )
      for (const d of done)
        labels.set(d.media_sha256, { key: d.version, model: d.model, at: d.updated_at, labels: d.result })
    }
    return own.map((r) => ({
      ...r,
      origin: 'place',
      labels: { ...r.labels, ...(labels.has(r.sha256) ? { vision: labels.get(r.sha256) } : {}) }
    }))
  }

  /** The build behind a site, if an opportunity made it and `email` is its one account. */
  const buildOf = (siteKey, email) => siteBuildOf(pool, siteKey, email)

  return {
    /**
     * @param {{siteKey: string, email: string, strict?: boolean, signal?: AbortSignal,
     *   visionNeeds?: Array<{width: number, height: number}>, visionOverride?: any}} who
     * @returns {Promise<null | {buildId: string, plan: any | null, colours: string[], pictures: any[],
     *   bytes: (id: string) => Promise<Buffer | null>}>}
     */
    async forSite({ siteKey, email, strict = false, signal, visionNeeds = [], visionOverride = undefined }) {
      signal?.throwIfAborted()
      try {
        const build = await buildOf(siteKey, email)
        if (!build) return null
        const policy = picturePolicy(build.brief?.picturePolicy)
        const vision = policy.visionEnabled
          ? visionOverride !== undefined
            ? visionOverride
            : visionFor
              ? await visionFor({ siteKey, email })
              : defaultVision
          : null
        const manifest = new Map(
          (build.asset_manifest ?? []).filter((a) => a?.kind === 'image' && a.id).map((a) => [a.id, a])
        )
        if (manifest.size === 0) return null
        const accountIds = [...manifest.values()].filter((a) => a.origin !== 'place').map((a) => a.id)
        const { rows } = accountIds.length
          ? await pool.query(
              `select id, sha256, object_key, mime, width, height, source, source_url, posted_at, caption, alt, dhash, labels
               from wo_media where account_id = $1 and id = any($2::uuid[]) and status = 'stored' and kind = 'image'`,
              [build.account_id, accountIds]
            )
          : { rows: [] }
        const accounts = rows.filter((r) => manifest.get(r.id)?.sha256 === r.sha256)
        await backfillWords(build.opportunity_id, accounts)
        const byManifest = new Map(
          [...accounts, ...(await placePictures(manifest, vision))].map((r) => [r.id, r])
        )
        // In manifest order, as the brief listed them.
        const own = [...manifest.keys()].map((id) => byManifest.get(id)).filter(Boolean)
        await backfillFeatures(own)
        const labelled = await labelMissing(
          own,
          signal,
          visionNeeds,
          vision,
          build.brief?.picturePolicy
            ? policy.maxVisionPictures
            : (vision?.maxPictures ?? policy.maxVisionPictures),
          build.account_id ? { kind: 'account', accountId: build.account_id } : null,
          build.brief?.business?.trade ?? 'food'
        ).catch((error) => {
          if (strict || signal?.aborted) throw error
          log.warn?.(`[pictures] ${siteKey}: the vision model could not label (${error?.message ?? error})`)
          return null
        })
        signal?.throwIfAborted()
        const byId = new Map(own.map((r) => [r.id, r]))
        // Only a label of the current key: an old model's or prompt's answer is not read.
        const seenBy = (r) => (vision && r.labels?.vision?.key === vision.key ? r.labels.vision.labels : null)
        // The brief's dish photos, a candidate accepted now when this build's vision calls it a dish (`dish-photos.mjs`).
        const dishes = acceptedDishPhotos(
          build.brief,
          own.map((r) => ({ id: r.id, postId: manifest.get(r.id)?.postId ?? null, vision: seenBy(r) }))
        )
        const colours = (build.brief?.brand?.colors ?? [])
          .filter((c) => c?.role !== 'neutral' && typeof c?.hex === 'string')
          .map((c) => c.hex)
        return {
          buildId: build.id,
          picturePolicy: policy,
          plan: build.pictures?.plan ?? null,
          receipts: build.pictures?.receipts ?? {},
          vision: labelled,
          colours,
          pictures: own.map((r) => ({
            id: r.id,
            postId: manifest.get(r.id)?.postId ?? null,
            sha256: r.sha256,
            mime: r.mime,
            width: r.width,
            height: r.height,
            source: r.source,
            sourceUrl: r.source_url,
            postedAt: r.posted_at ? new Date(r.posted_at).toISOString() : null,
            caption: r.caption,
            alt: r.alt,
            dhash: r.dhash,
            features: r.labels?.features ?? null,
            vision: seenBy(r),
            ...(dishes.has(r.id) ? { dish: dishes.get(r.id) } : {})
          })),
          bytes: async (id) => (byId.has(id) ? bytesOf(byId.get(id)) : null),
          // Pictures drawn for this restaurant (plan §8), kept apart from what was collected: never a `wo_media` row.
          drawing: objects?.put
            ? {
                get: async (key) => {
                  const res = await objects.get(drawnKey(build, key))
                  return res?.ok ? { bytes: Buffer.from(await res.arrayBuffer()) } : null
                },
                put: (key, bytes) =>
                  objects.put(drawnKey(build, key), bytes, bytes[0] === 0x89 ? 'image/png' : 'image/jpeg')
              }
            : null
        }
      } catch (error) {
        if (strict || signal?.aborted) throw error
        log.warn?.(
          `[pictures] ${siteKey}: the collected pictures could not be read (${error?.message ?? error})`
        )
        return null
      }
    },

    /** Keep the plan, once; answer the plan the build holds (this one, or the one a run before wrote). */
    async recordPlan(buildId, plan) {
      const planHash = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
      const { rows } = await pool.query(
        `update wo_build set pictures = $2::jsonb, updated_at = now() where id = $1 and pictures is null returning pictures`,
        [buildId, JSON.stringify({ plan, planHash, at: new Date().toISOString(), receipts: {} })]
      )
      if (rows[0]) return rows[0].pictures.plan
      const held = await pool.query('select pictures from wo_build where id = $1', [buildId])
      return held.rows[0]?.pictures?.plan ?? plan
    },

    /** Receipts by group (`uploaded`, `applied`, `verified`) and the report, beside the plan. */
    async recordOutcome(buildId, { receipts, report }) {
      await pool.query(
        `update wo_build set pictures = coalesce(pictures, '{}'::jsonb)
           || jsonb_build_object('receipts', coalesce(pictures->'receipts', '{}'::jsonb) || $2::jsonb)
           || case when $3::jsonb is null then '{}'::jsonb else jsonb_build_object('report', $3::jsonb) end,
           updated_at = now()
         where id = $1`,
        [buildId, JSON.stringify(receipts ?? {}), report ? JSON.stringify(report) : null]
      )
    }
  }
}
