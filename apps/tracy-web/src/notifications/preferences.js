/**
 * Settings › Notifications (spec #809, step 5): which channel (Inbox, Email) a person wants for
 * each GROUP of notification kinds.
 *
 * 🔒 THE ONE PLACE A KIND MAPS TO ITS GROUP. The page shows the groups below, the doors read and
 * write them, and the notifier asks `preferenceFor(pool, accountId, kind)` before every row; none
 * of them keeps a second list. A kind added later and not listed here is ON for everyone (no switch
 * can silence what the page never showed).
 *
 * Everything is on by default: no row in `notification_preference` = both channels on.
 *
 * T12 (`team.site_restored`) and T14 (`team.site_renamed`) change the site for the whole team, so
 * they have their own row, "Site changes" (04/10/2026), on by default like every other row.
 *
 * The join-request group is LOCKED on, both channels, for everyone (03/10/2026): an Owner
 * must not miss a person waiting at the door, or a Viewer waiting for edit access (ADR 0028). The page shows it disabled, and
 * `savePreferences` ignores any attempt to turn it off.
 */

/**
 * The six groups, in display order (U11 = C, plus Site changes 04/10). `section` is the heading above the row on the page
 * (`team` above the first three, `comments` above the last two).
 */
export const NOTIFICATION_GROUPS = Object.freeze([
  {
    id: 'about-you',
    section: 'team',
    locked: false,
    kinds: [
      'team.invited',
      'team.approved',
      'team.declined',
      'team.invite_accepted',
      'team.invite_declined',
      'team.removed',
      'team.role_changed',
      'team.invite_cancelled',
      // T13: like T8 ("removed you"), the reader loses access to the site.
      'team.site_deleted',
      // A Viewer hears the Owners' answer to their request for edit access (ADR 0028 §6).
      'team.edit_access_approved',
      'team.edit_access_declined'
    ]
  },
  // A Viewer asking for edit access waits on the Owners exactly as a person asking to join does
  // (ADR 0028 §6), so it sits in the same locked group.
  {
    id: 'join-requests',
    section: 'team',
    locked: true,
    kinds: [
      'team.join_request',
      'team.join_answered',
      'team.edit_access_request',
      'team.edit_access_answered'
    ]
  },
  { id: 'teammates', section: 'team', locked: false, kinds: ['team.joined', 'team.left'] },
  { id: 'site-changes', section: 'team', locked: false, kinds: ['team.site_restored', 'team.site_renamed'] },
  { id: 'mentions-replies', section: 'comments', locked: false, kinds: ['comment.mention', 'comment.reply'] },
  {
    id: 'resolved-reopened',
    section: 'comments',
    locked: false,
    kinds: ['comment.resolved', 'comment.reopened']
  }
])

const GROUP_OF_KIND = new Map(NOTIFICATION_GROUPS.flatMap((g) => g.kinds.map((kind) => [kind, g])))
const GROUP_BY_ID = new Map(NOTIFICATION_GROUPS.map((g) => [g.id, g]))

/** The group a kind belongs to, or null for a kind no group lists (it is then always on). */
export function groupOfKind(kind) {
  return GROUP_OF_KIND.get(kind) ?? null
}

const ON = Object.freeze({ inbox: true, email: true })

/**
 * The channels a person wants for one kind — the notifier's `preferenceFor`.
 * Unknown kind or locked group → both on, without reading the database.
 * @returns {Promise<{inbox: boolean, email: boolean}>}
 */
export async function preferenceFor(pool, accountId, kind) {
  const group = groupOfKind(kind)
  if (!group || group.locked) return { ...ON }
  const { rows } = await pool.query(
    'select inbox, email from notification_preference where account_id = $1 and group_id = $2',
    [accountId, group.id]
  )
  return rows[0] ? { inbox: rows[0].inbox, email: rows[0].email } : { ...ON }
}

/**
 * Every group with the person's two values, in display order. `accountId` null (a session the book
 * has no account for yet) reads as all on.
 * @returns {Promise<{id: string, section: string, locked: boolean, inbox: boolean, email: boolean}[]>}
 */
export async function readPreferences(pool, accountId) {
  const stored = new Map()
  if (accountId) {
    const { rows } = await pool.query(
      'select group_id, inbox, email from notification_preference where account_id = $1',
      [accountId]
    )
    for (const r of rows) stored.set(r.group_id, r)
  }
  return NOTIFICATION_GROUPS.map((g) => {
    const row = g.locked ? null : stored.get(g.id)
    return {
      id: g.id,
      section: g.section,
      locked: g.locked,
      inbox: row ? row.inbox : true,
      email: row ? row.email : true
    }
  })
}

/**
 * Check a `PUT` body: `{groups: {<groupId>: {inbox?: boolean, email?: boolean}}}`.
 * @returns {{changes: Map<string, {inbox?: boolean, email?: boolean}>} | {error: string}}
 */
export function parseChanges(body) {
  const groups = body && typeof body === 'object' && !Array.isArray(body) ? body.groups : undefined
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return { error: 'BAD_BODY' }
  const changes = new Map()
  for (const [id, value] of Object.entries(groups)) {
    if (!GROUP_BY_ID.has(id)) return { error: 'UNKNOWN_GROUP' }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'BAD_BODY' }
    const change = {}
    for (const channel of ['inbox', 'email']) {
      if (value[channel] === undefined) continue
      if (typeof value[channel] !== 'boolean') return { error: 'BAD_BODY' }
      change[channel] = value[channel]
    }
    changes.set(id, change)
  }
  return { changes }
}

/**
 * Apply parsed changes for one person. A channel left out keeps its value; a locked group is
 * skipped (it stays on whatever was asked).
 */
export async function savePreferences(pool, accountId, changes) {
  for (const [id, change] of changes) {
    if (GROUP_BY_ID.get(id)?.locked) continue
    if (change.inbox === undefined && change.email === undefined) continue
    await pool.query(
      `insert into notification_preference (account_id, group_id, inbox, email)
       values ($1, $2, coalesce($3::boolean, true), coalesce($4::boolean, true))
       on conflict (account_id, group_id) do update
         set inbox = coalesce($3::boolean, notification_preference.inbox),
             email = coalesce($4::boolean, notification_preference.email),
             updated_at = now()`,
      [accountId, id, change.inbox ?? null, change.email ?? null]
    )
  }
}
