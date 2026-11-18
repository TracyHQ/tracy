/**
 * Where the owner's choices for the site itself are kept (#537, `domain/owner-site-picks.mjs`): on the opportunity's
 * candidate, written under a row lock so two clicks never lose one, like the reading picks (`store.js saveReadingPick`).
 */
import { randomBytes } from 'node:crypto'
import { nextReadingPicks } from '../domain/business-reading.mjs'
import { nextHidden, nextSiteSocials, nextTeamEdits } from '../domain/owner-site-picks.mjs'
import { currentSnapshotOf, snapshotProfileOf } from './places.js'
import { profileOf } from './store.js'

/** The most photos, videos or reviews an owner can keep off; a Profile shows far fewer. */
export const HIDDEN_MAX = 500

/**
 * The candidate after `change(candidate)` (which returns `{patch}` to merge into the candidate, or `{error}`), saved
 * under a row lock. Null when the row is not this account's; `{error}` passes through untouched, nothing saved.
 * @returns {Promise<null | {row: object, result: object} | {error: string}>}
 */
export async function changeCandidate(pool, accountId, id, change) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const held = (
      await client.query(
        'select candidate from wo_opportunity where id = $1 and account_id = $2 for update',
        [id, accountId]
      )
    ).rows[0]
    if (!held) {
      await client.query('rollback')
      return null
    }
    const result = change(held.candidate ?? {})
    if (result.error) {
      await client.query('rollback')
      return { error: result.error }
    }
    const { rows } = await client.query(
      `update wo_opportunity set candidate = coalesce(candidate, '{}'::jsonb) || $3::jsonb, updated_at = now()
        where id = $1 and account_id = $2 returning *`,
      [id, accountId, JSON.stringify(result.patch)]
    )
    await client.query('commit')
    return { row: rows[0], result }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** One team edit (`readTeamEdit`) saved: `{row, result: {member, ...}}`, `{error}` or null. */
export function saveTeamEdit(pool, accountId, id, edit, researchIds) {
  const newId = `te_own${randomBytes(5).toString('hex')}`
  return changeCandidate(pool, accountId, id, (candidate) => {
    const next = nextTeamEdits(candidate.teamEdits, edit, { researchIds, newId })
    if (next.error) return next
    const patch = { teamEdits: { ...next.teamEdits, at: new Date().toISOString() } }
    // Removing a person research read takes them off through the reading picks, as Remove on the card does.
    if (next.removeFromReading)
      patch.readingPicks = {
        ...nextReadingPicks(candidate.readingPicks, edit.id, 'remove'),
        at: new Date().toISOString()
      }
    return { patch, member: next.member }
  })
}

/** One social link (`readSocialLink`) set or removed. */
export function saveSiteSocial(pool, accountId, id, link) {
  return changeCandidate(pool, accountId, id, (candidate) => ({
    patch: { siteSocials: nextSiteSocials(candidate.siteSocials, link) }
  }))
}

/** One photo or video (`mediaPicks`) or review (`reviewPicks`) kept off the site, or put back. */
export function saveHidden(pool, accountId, id, field, key, hidden) {
  return changeCandidate(pool, accountId, id, (candidate) => {
    const next = nextHidden(candidate[field], key, hidden)
    if (next.hidden.length > HIDDEN_MAX) return { error: 'TOO_MANY_HIDDEN' }
    return { patch: { [field]: { ...next, at: new Date().toISOString() } } }
  })
}

/** The ids of the people research read for this opportunity (its place snapshot's reading, else its own profile). */
export async function researchTeamIdsOf(db, opp) {
  const snapshot = opp.place_id ? await currentSnapshotOf(db, opp.place_id) : null
  const held = snapshot ? await snapshotProfileOf(db, snapshot.id) : await profileOf(db, opp.id)
  const team = held?.profile?.businessReading?.team
  return Array.isArray(team) ? team.map((p) => p?.id).filter((x) => typeof x === 'string') : []
}

/** Whether a stored photo of this opportunity (its own `wo_media` row, an image) exists: a team member's photo. */
export async function ownPhotoExists(db, opportunityId, mediaId) {
  const { rows } = await db.query(
    `select 1 from wo_media where id = $1 and opportunity_id = $2 and kind = 'image' and status = 'stored'`,
    [mediaId, opportunityId]
  )
  return rows.length > 0
}

/** Whether a photo or video belongs to this opportunity: its own row, or one of its place's pictures. */
export async function opportunityMediaExists(db, opp, mediaId) {
  const { rows } = await db.query(
    `select 1 from wo_media where id = $1 and opportunity_id = $2
     union all
     select 1 from wo_place_media where id = $1 and $3::uuid is not null and place_id = $3::uuid
     limit 1`,
    [mediaId, opp.id, opp.place_id ?? null]
  )
  return rows.length > 0
}
