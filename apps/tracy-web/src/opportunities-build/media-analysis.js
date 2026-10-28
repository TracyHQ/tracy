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

/** The model's answer for a claimed picture (`failed` when it gave none: asked again later). */
export async function settleAnalysis(pool, sha256, result, vision) {
  await pool.query(
    `update wo_media_analysis set state = $4, result = $5::jsonb, lease_until = null, updated_at = now()
     where media_sha256 = $1 and model = $2 and version = $3 and state = 'pending'`,
    [
      sha256,
      vision.door.model,
      vision.key,
      result ? 'done' : 'failed',
      result ? JSON.stringify(result) : null
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
