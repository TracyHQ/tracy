/**
 * The shared vision label of a place's picture, kept in `wo_media_analysis` by (sha256, model, key): claimed before the
 * model is called, settled with its answer. One label per picture's bytes for every account and every step that asks
 * (the brief's labelling at research time, `brief-picture-labels.js`, and a build's, `site-pictures.js`), so a picture
 * is paid for once.
 */

/** How long a claim on a picture's vision label holds while the model answers. */
const ANALYSIS_LEASE = `interval '10 minutes'`

/**
 * The shas the caller may label now: no done label of this key, no live claim by another.
 * @param {{query: Function}} pool
 * @param {string[]} shas
 * @param {{door: {model: string}, key: string}} vision
 * @returns {Promise<Set<string>>}
 */
export async function claimAnalyses(pool, shas, vision) {
  const unique = [...new Set(shas)]
  if (unique.length === 0) return new Set()
  const { rows } = await pool.query(
    `insert into wo_media_analysis (media_sha256, model, version, state, lease_until, attempts)
     select sha, $2, $3, 'pending', now() + ${ANALYSIS_LEASE}, 1 from unnest($1::text[]) as sha
     on conflict (media_sha256, model, version) do update
       set state = 'pending', lease_until = now() + ${ANALYSIS_LEASE},
         attempts = wo_media_analysis.attempts + 1, updated_at = now()
       where wo_media_analysis.state <> 'done'
         and (wo_media_analysis.lease_until is null or wo_media_analysis.lease_until < now())
     returning media_sha256`,
    [unique, vision.door.model, vision.key]
  )
  return new Set(rows.map((r) => r.media_sha256))
}

/**
 * The model's answer for a claimed picture (`failed` when it gave none: asked again later). `reason`: why it gave none,
 * kept on the failed row (`{reason}`) so a later reader can say why (item 27).
 */
export async function settleAnalysis(pool, sha256, result, vision, reason = null) {
  await pool.query(
    `update wo_media_analysis set state = $4, result = $5::jsonb, lease_until = null, updated_at = now()
     where media_sha256 = $1 and model = $2 and version = $3 and state = 'pending'`,
    [
      sha256,
      vision.door.model,
      vision.key,
      result ? 'done' : 'failed',
      result
        ? JSON.stringify(result)
        : reason
          ? JSON.stringify({ reason: String(reason).slice(0, 60) })
          : null
    ]
  )
}

/** The done labels of these shas under this key: sha256 to the model's answer. */
export async function doneAnalyses(pool, shas, vision) {
  const unique = [...new Set(shas)]
  if (unique.length === 0) return new Map()
  const { rows } = await pool.query(
    `select media_sha256, result from wo_media_analysis
     where media_sha256 = any($1::text[]) and model = $2 and version = $3 and state = 'done'`,
    [unique, vision.door.model, vision.key]
  )
  return new Map(rows.map((r) => [r.media_sha256, r.result]))
}

/**
 * Opens done labels of these shas under this key for asking again: a label made against another closed list of the
 * brief's offerings and people (`picture-links.mjs closedListDigest`). The caller then claims them as usual.
 */
export async function reopenAnalyses(pool, shas, vision) {
  const unique = [...new Set(shas)]
  if (unique.length === 0) return
  await pool.query(
    `update wo_media_analysis set state = 'failed', updated_at = now()
     where media_sha256 = any($1::text[]) and model = $2 and version = $3 and state = 'done'`,
    [unique, vision.door.model, vision.key]
  )
}

/**
 * Where each sha's label of this key stands: `{state, attempts, at, result}` (`at`: its last change), for the photo
 * labelling's progress and its stall check (item 27). A sha never claimed is absent.
 * @returns {Promise<Map<string, {state: string, attempts: number, at: number, result: any}>>}
 */
export async function analysisStates(pool, shas, vision) {
  const unique = [...new Set(shas)]
  if (unique.length === 0) return new Map()
  const { rows } = await pool.query(
    `select media_sha256, state, attempts, updated_at, result from wo_media_analysis
     where media_sha256 = any($1::text[]) and model = $2 and version = $3`,
    [unique, vision.door.model, vision.key]
  )
  return new Map(
    rows.map((r) => [
      r.media_sha256,
      { state: r.state, attempts: r.attempts, at: new Date(r.updated_at).getTime(), result: r.result }
    ])
  )
}

/**
 * A label derived without a model call of its own (the merged label of a content label and its links, item 27): written
 * done under this key, replacing what was there.
 */
export async function storeAnalysis(pool, sha256, result, vision) {
  await pool.query(
    `insert into wo_media_analysis (media_sha256, model, version, state, result, attempts)
     values ($1, $2, $3, 'done', $4::jsonb, 1)
     on conflict (media_sha256, model, version) do update
       set state = 'done', result = excluded.result, lease_until = null, updated_at = now()`,
    [sha256, vision.door.model, vision.key, JSON.stringify(result)]
  )
}
