/**
 * Where the seller's outreach to one business stands (`schema/0016-outreach-state.sql`): sent, replied, then won or
 * lost, each with the time the seller marked it. Nothing here sends a message or reads one: the seller marks each step
 * through `PUT /api/website-opportunities/:id/outreach/state`, and the state is only ever what they marked.
 *
 * `sent` and `replied` keep the time they were first marked (marking again changes nothing); `won` and `lost` end the
 * outreach and each clears the other; `none` clears every mark, for a step marked by mistake. Private to the seller,
 * like the rest of the pipeline: never sent to a hub.
 */
export const OUTREACH_STATES = Object.freeze(['sent', 'replied', 'won', 'lost'])
/** What the door takes: a state, or `none` to clear them all. */
export const OUTREACH_MARKS = Object.freeze([...OUTREACH_STATES, 'none'])

const iso = (value) => (value ? new Date(value).toISOString() : null)

/**
 * `{state, sentAt, repliedAt, wonAt, lostAt, updatedAt}` of one `wo_outreach` row (null: nothing marked). `state` is
 * the furthest step marked: `won` or `lost`, else `replied`, else `sent`, else null.
 */
export function outreachStateShape(row) {
  const state = !row
    ? null
    : row.won_at
      ? 'won'
      : row.lost_at
        ? 'lost'
        : row.replied_at
          ? 'replied'
          : row.sent_at
            ? 'sent'
            : null
  return {
    state,
    sentAt: iso(row?.sent_at),
    repliedAt: iso(row?.replied_at),
    wonAt: iso(row?.won_at),
    lostAt: iso(row?.lost_at),
    updatedAt: iso(row?.updated_at)
  }
}

/**
 * The outreach state of each of the account's opportunities among `ids`; one never marked reads `state: null`.
 * @returns {Promise<Map<string, ReturnType<typeof outreachStateShape>>>}
 */
export async function outreachStatesOf(db, accountId, ids) {
  const out = new Map((ids ?? []).map((id) => [id, outreachStateShape(null)]))
  if (!accountId || !out.size) return out
  const { rows } = await db.query(
    `select w.* from wo_outreach w join wo_opportunity o on o.id = w.opportunity_id
      where o.account_id = $1 and w.opportunity_id = any($2::uuid[])`,
    [accountId, [...out.keys()]]
  )
  for (const row of rows) out.set(row.opportunity_id, outreachStateShape(row))
  return out
}

/**
 * Mark one step of the account's opportunity at `at`. Answers the new state, or null when the opportunity is not the
 * account's.
 * @param {{ query: Function }} db
 * @param {string} mark one of `OUTREACH_MARKS`
 */
export async function markOutreach(db, accountId, opportunityId, mark, at) {
  if (!OUTREACH_MARKS.includes(mark)) throw new TypeError(`unknown outreach mark ${mark}`)
  const { rows } = await db.query(
    `insert into wo_outreach (opportunity_id, sent_at, replied_at, won_at, lost_at, updated_at)
     select o.id,
       case when $3::text = 'sent' then $4::timestamptz end,
       case when $3::text = 'replied' then $4::timestamptz end,
       case when $3::text = 'won' then $4::timestamptz end,
       case when $3::text = 'lost' then $4::timestamptz end,
       $4::timestamptz
     from wo_opportunity o where o.id = $2 and o.account_id = $1
     on conflict (opportunity_id) do update set
       sent_at = case when $3::text = 'sent' then coalesce(wo_outreach.sent_at, $4::timestamptz)
         when $3::text = 'none' then null else wo_outreach.sent_at end,
       replied_at = case when $3::text = 'replied' then coalesce(wo_outreach.replied_at, $4::timestamptz)
         when $3::text = 'none' then null else wo_outreach.replied_at end,
       won_at = case when $3::text = 'won' then coalesce(wo_outreach.won_at, $4::timestamptz)
         when $3::text in ('lost', 'none') then null else wo_outreach.won_at end,
       lost_at = case when $3::text = 'lost' then coalesce(wo_outreach.lost_at, $4::timestamptz)
         when $3::text in ('won', 'none') then null else wo_outreach.lost_at end,
       updated_at = $4::timestamptz
     returning *`,
    [accountId, opportunityId, mark, new Date(at)]
  )
  return rows[0] ? outreachStateShape(rows[0]) : null
}
