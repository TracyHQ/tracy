/**
 * The seller's own edits of the Profile (#524): kept on the opportunity (`candidate.profileEdits`), never on the shared
 * place store, and laid over the researched profile whenever it is read, by the Details door and by the brief alike.
 * A null value removes that edit, so the researched value shows again. Each edited field is listed in
 * `editedBySeller`, so the card can mark it.
 */

/** The text facts a seller can edit, with their longest value. */
// The name has its own door (`PUT /:id/name`, `business-name.js`).
export const EDITABLE_PROFILE_FIELDS = Object.freeze({ phone: 40, address: 300, email: 200, bio: 1200 })

/**
 * `{ edits }` of a request body, each field a string (trimmed, within its length) or null. `{ error }` otherwise.
 * @returns {{ edits: Record<string, string | null> } | { error: string }}
 */
export function readProfileEdits(body) {
  const edits = body?.edits
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return { error: 'INVALID_EDITS' }
  const out = {}
  for (const [field, value] of Object.entries(edits)) {
    const max = EDITABLE_PROFILE_FIELDS[field]
    if (!max) return { error: 'INVALID_EDITS' }
    if (value === null) {
      out[field] = null
      continue
    }
    if (typeof value !== 'string') return { error: 'INVALID_EDITS' }
    const text = field === 'bio' ? value.trim() : value.replace(/\s+/g, ' ').trim()
    if (!text || text.length > max) return { error: 'INVALID_EDITS' }
    out[field] = text
  }
  if (!Object.keys(out).length) return { error: 'INVALID_EDITS' }
  return { edits: out }
}

/** Merge edits into the stored ones under a row lock; null removes one. Null when the row is not this account's. */
export async function saveProfileEdits(pool, accountId, id, edits) {
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
    const at = new Date().toISOString()
    const next = { ...held.candidate?.profileEdits }
    for (const [field, value] of Object.entries(edits)) {
      if (value === null) delete next[field]
      else next[field] = { value, at }
    }
    const { rows } = await client.query(
      `update wo_opportunity set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('profileEdits', $3::jsonb),
         updated_at = now() where id = $1 and account_id = $2 returning *`,
      [id, accountId, JSON.stringify(next)]
    )
    await client.query('commit')
    return rows[0] ?? null
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** The profile with the seller's edits of this opportunity on top, or the profile as it was when there are none. */
export function withProfileEdits(profile, opportunity) {
  const edits = opportunity?.candidate?.profileEdits
  if (!profile || typeof profile !== 'object' || !edits || typeof edits !== 'object') return profile
  const fields = Object.keys(edits).filter(
    (f) => EDITABLE_PROFILE_FIELDS[f] && typeof edits[f]?.value === 'string' && edits[f].value
  )
  if (!fields.length) return profile
  const next = { ...profile, provenance: { ...profile.provenance } }
  for (const field of fields) {
    next[field] = edits[field].value
    next.provenance[field] = { source: 'seller', seenAt: edits[field].at ?? null }
  }
  if (fields.includes('phone')) {
    next.phoneSources = ['seller']
    next.otherPhones = (profile.otherPhones ?? []).filter((o) => o.phone !== edits.phone.value)
  }
  next.editedBySeller = fields
  return next
}
