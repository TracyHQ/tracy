/**
 * The seller's edits of a Content brief (#524): the words of the brief cards (who they are, what they offer, what makes
 * them stand out, who they serve, how to reach them), saved as a NEW revision marked edited by the seller. Revisions
 * never change; the edited one is the newest, so the Details page shows it and Build builds from it.
 *
 * 🔒 Only text the brief already holds can be edited: a path that names nothing in the brief is refused, so an edit
 * never invents a fact the research did not find. The edited brief passes the same schema as a made one, and its
 * Markdown is rendered again from it, so the build's prompt says what the seller wrote.
 */
import { randomUUID } from 'node:crypto'
import { renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import { briefWithResearch } from './revision-research.js'

/** The brief texts a seller may edit, as dotted paths into `revision.brief`. */
const PATHS = [
  /^business\.(name|phone|address|website)$/,
  /^reading\.about$/,
  /^reading\.(services|story|audience|facts)\.\d{1,2}\.label$/,
  /^keyMessages\.\d{1,2}\.label$/
]
const MAX_TEXT = 2000
const MAX_EDITS = 60

/** `{ edits: [{path, value}] }` of a request body, or `{ error }`. */
export function readBriefEdits(body) {
  const edits = body?.edits
  if (!Array.isArray(edits) || !edits.length || edits.length > MAX_EDITS) return { error: 'INVALID_EDITS' }
  const out = []
  for (const e of edits) {
    if (typeof e?.path !== 'string' || !PATHS.some((p) => p.test(e.path))) return { error: 'INVALID_EDITS' }
    const value = typeof e.value === 'string' ? e.value.trim() : ''
    if (!value || value.length > MAX_TEXT) return { error: 'INVALID_EDITS' }
    out.push({ path: e.path, value })
  }
  return { edits: out }
}

/** The brief with the edits applied, or `{ error: 'UNKNOWN_PATH', path }` when one names nothing the brief holds. */
export function applyBriefEdits(brief, edits) {
  const next = structuredClone(brief ?? {})
  for (const { path, value } of edits) {
    const keys = path.split('.')
    let at = next
    for (const key of keys.slice(0, -1)) {
      at = at?.[/^\d+$/.test(key) ? Number(key) : key]
      if (!at || typeof at !== 'object') return { error: 'UNKNOWN_PATH', path }
    }
    const last = keys.at(-1)
    if (typeof at[last] !== 'string') return { error: 'UNKNOWN_PATH', path }
    at[last] = value
  }
  return { brief: next }
}

/**
 * Save the edits of one revision as a new revision of the same opportunity, marked `brief.edited`.
 * @returns {Promise<{revision: object} | {error: 'NOT_FOUND' | 'UNKNOWN_PATH' | 'BRIEF_INVALID', path?: string,
 *   errors?: string[]}>}
 */
export async function editRevision(
  pool,
  { accountId, opportunityId, revisionId, edits, domain, now = Date.now }
) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const opp = (
      await client.query('select id from wo_opportunity where id = $1 and account_id = $2 for update', [
        opportunityId,
        accountId
      ])
    ).rows[0]
    const base = opp
      ? (
          await client.query(
            'select * from wo_revision where id = $1 and opportunity_id = $2 and account_id = $3',
            [revisionId, opportunityId, accountId]
          )
        ).rows[0]
      : null
    if (!base) {
      await client.query('rollback')
      return { error: 'NOT_FOUND' }
    }
    const applied = applyBriefEdits(base.brief, edits)
    if (applied.error) {
      await client.query('rollback')
      return applied
    }
    const { readiness, edited: _was, ...plain } = applied.brief
    const checked = domain.validateBrief(plain)
    if (!checked?.ok) {
      await client.query('rollback')
      return { error: 'BRIEF_INVALID', errors: checked?.errors ?? [] }
    }
    const before = base.brief?.edited ?? null
    const brief = {
      ...plain,
      ...(readiness ? { readiness } : {}),
      // The research this brief still stands for: an edited brief of the current research is current too.
      edited: {
        by: 'seller',
        at: new Date(now()).toISOString(),
        from: base.id,
        fromHash: base.research_hash ?? before?.fromHash ?? null,
        paths: [...new Set([...(before?.paths ?? []), ...edits.map((e) => e.path)])]
      }
    }
    const id = randomUUID()
    const md = renderBriefWithReviews(
      domain,
      briefWithResearch({
        id,
        account_id: accountId,
        brief,
        research: base.research,
        place_profile: base.place_profile
      })
    )
    const inserted = (
      await client.query(
        `insert into wo_revision (id, opportunity_id, account_id, n, brief, brief_md, asset_manifest, place_snapshot_id,
           profile_effective, research_hash, place_profile, research)
         values ($1, $2, $3, (select coalesce(max(n), 0) + 1 from wo_revision where opportunity_id = $2), $4::jsonb, $5,
           $6::jsonb, $7, $8::jsonb, null, $9::jsonb, $10::jsonb) returning *`,
        [
          id,
          opportunityId,
          accountId,
          JSON.stringify(brief),
          md,
          JSON.stringify(base.asset_manifest),
          base.place_snapshot_id,
          base.profile_effective ? JSON.stringify(base.profile_effective) : null,
          base.place_profile ? JSON.stringify(base.place_profile) : null,
          base.research ? JSON.stringify(base.research) : null
        ]
      )
    ).rows[0]
    await client.query('commit')
    return { revision: inserted }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
