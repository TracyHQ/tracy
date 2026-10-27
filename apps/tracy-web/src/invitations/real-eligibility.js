/** Check eligibility: ask aMember check-access for the recipients of a real campaign, a page at a
 * time, and keep each answer (allow / none / unknown) with when it was asked. Suppressed recipients
 * are never asked. Addresses are read under the campaign lock, aMember is asked outside every lock
 * and transaction, then the answers are written under the lock again. Sendy is not checked, and a
 * stored answer never replaces the check made at the moment of sending (`real-send.js`). */
import { openRealJson } from './real-import.js'
import { realError, realTransaction } from './real-store.js'
import { memberStatus } from './real-send.js'

const PAGE_MAX = 50
// Parallel aMember requests per page: fast enough for a campaign of a few thousand, gentle enough
// for joomlart.com.
const PARALLEL = 4

export async function checkRealEligibility({
  pool,
  keys,
  config,
  campaignId,
  cursor = null,
  limit = PAGE_MAX,
  fetcher = fetch
}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_MAX) throw realError('REAL_INVALID_LIMIT')
  if (cursor !== null && (typeof cursor !== 'string' || !/^[0-9a-f-]{36}$/.test(cursor)))
    throw realError('REAL_INVALID_CURSOR')
  if (!config.beta?.apiKey) throw realError('REAL_MEMBER_CHECK_OFF', 409)
  const page = await realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const rows = (
      await db.query(
        "select id,revision,payload from invitations_real_recipient where campaign_id=$1 and state<>'suppressed' and ($2::uuid is null or id>$2) order by id limit $3",
        [state.row.id, cursor, limit + 1]
      )
    ).rows
    return {
      next: rows.length > limit ? rows[limit - 1].id : null,
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        email: openRealJson(state.key, state.row.id, r.id, 'recipient', Number(r.revision), r.payload)
          .normalizedEmail
      }))
    }
  })
  const answers = Array.from({ length: page.items.length })
  let at = 0
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, page.items.length) }, async () => {
      while (at < page.items.length) {
        const i = at++
        answers[i] = await memberStatus({ config, email: page.items[i].email, fetcher })
      }
    })
  )
  await realTransaction({ pool, keys, campaignId }, async (db, state) => {
    for (const [i, item] of page.items.entries())
      await db.query(
        `insert into invitations_real_member_check(campaign_id,recipient_id,status,reason) values($1,$2,$3,$4)
         on conflict (campaign_id,recipient_id) do update set status=excluded.status,reason=excluded.reason,checked_at=clock_timestamp()`,
        [
          state.row.id,
          item.id,
          answers[i].status,
          answers[i].status === 'unknown' ? (answers[i].reason ?? 'UNKNOWN') : null
        ]
      )
  })
  const counts = { allow: 0, none: 0, unknown: 0 }
  for (const a of answers) counts[a.status]++
  return { checked: page.items.length, counts, nextCursor: page.next }
}

/** The stored answers of one campaign: totals and one entry per checked recipient. No address. */
export async function readRealEligibility({ pool, keys, campaignId }) {
  return realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const totals = (
      await db.query(
        `select count(*) filter (where r.state<>'suppressed')::int checkable,
                count(m.recipient_id) filter (where r.state<>'suppressed')::int checked,
                count(*) filter (where m.status='allow' and r.state<>'suppressed')::int allow,
                count(*) filter (where m.status='none' and r.state<>'suppressed')::int none,
                count(*) filter (where m.status='unknown' and r.state<>'suppressed')::int unknown,
                min(m.checked_at) oldest, max(m.checked_at) newest
           from invitations_real_recipient r
           left join invitations_real_member_check m on m.campaign_id=r.campaign_id and m.recipient_id=r.id
          where r.campaign_id=$1`,
        [state.row.id]
      )
    ).rows[0]
    const items = (
      await db.query(
        'select recipient_id,status,reason,checked_at from invitations_real_member_check where campaign_id=$1',
        [state.row.id]
      )
    ).rows.map((r) => ({
      recipientId: r.recipient_id,
      status: r.status,
      reason: r.reason,
      checkedAt: r.checked_at.toISOString()
    }))
    return {
      checkable: totals.checkable,
      checked: totals.checked,
      counts: { allow: totals.allow, none: totals.none, unknown: totals.unknown },
      oldest: totals.oldest?.toISOString() ?? null,
      newest: totals.newest?.toISOString() ?? null,
      items
    }
  })
}
