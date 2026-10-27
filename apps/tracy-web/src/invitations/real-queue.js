/** Send queue of a real campaign (pilot mode). An owner/admin starts it once over every approved
 * email of the groups it names whose customer has no invitation yet, each group up to its own number
 * sent, the groups taking turns; the cron then sends the next one each minute it may, through
 * `sendRealInvitation`, so every email passes the same checks as a press: aMember at send
 * time, suppression, once per customer, the pilot budget and the 180 s pacing. A customer refusal
 * (no active plan, unsubscribed, no longer approved) skips that email; anything that may concern
 * every email (aMember or Gmail not answering, budget reached, sending off) pauses the queue for a
 * person. An unknown outcome is never resent: the queue pauses until it is checked in Gmail. */
import { REAL_GROUPS, listRealRecipients, readRealRecipient } from './real-import.js'
import { realRecord } from './real-fields.js'
import { realError, realId, realTransaction } from './real-store.js'
import { sendRealInvitation } from './real-send.js'

// Refusals that concern one customer only: skip and go on.
const SKIP = new Set([
  'REAL_NOT_MEMBER',
  'REAL_SUPPRESSED',
  'REAL_ALREADY_INVITED',
  'REAL_NOT_APPROVED',
  'REAL_STALE_DRAFT',
  'REAL_NOT_FOUND'
])
// Not now: try again on a later pass.
const WAIT = new Set(['REAL_PILOT_PACING', 'REAL_SEND_BUSY'])

async function queueRow(db, campaignId) {
  return (await db.query('select * from invitations_real_queue where campaign_id=$1', [campaignId])).rows[0]
}

export async function readRealQueue({ pool, keys, campaignId }) {
  return realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const q = await queueRow(db, state.row.id)
    if (!q)
      return {
        state: 'none',
        pauseReason: null,
        startedAt: null,
        groups: [],
        counts: { pending: 0, sent: 0, skipped: 0 },
        items: []
      }
    const items = (
      await db.query(
        'select recipient_id,state,reason,send_id,position from invitations_real_queue_item where campaign_id=$1 order by position',
        [state.row.id]
      )
    ).rows.map((r) => ({ recipientId: r.recipient_id, state: r.state, reason: r.reason, sendId: r.send_id }))
    const counts = { pending: 0, sent: 0, skipped: 0 }
    for (const i of items) counts[i.state]++
    const groups = (
      await db.query(
        `select g.group_key, g.send_limit,
           count(*) filter (where i.state='sent')::int as sent,
           count(*) filter (where i.state='skipped')::int as skipped,
           count(*) filter (where i.state='pending')::int as pending
         from invitations_real_queue_group g
         left join invitations_real_recipient r on r.campaign_id=g.campaign_id and r.group_key=g.group_key
         left join invitations_real_queue_item i on i.campaign_id=g.campaign_id and i.recipient_id=r.id
         where g.campaign_id=$1 group by g.group_key, g.send_limit order by g.group_key`,
        [state.row.id]
      )
    ).rows.map((g) => ({
      group: g.group_key,
      limit: g.send_limit,
      sent: g.sent,
      skipped: g.skipped,
      pending: g.pending
    }))
    return {
      state: q.state,
      pauseReason: q.pause_reason,
      startedAt: q.started_at.toISOString(),
      groups,
      counts,
      items
    }
  })
}

/** Start (or start again) over the approved emails of the groups in `groups` ({ group_1: 30, ... })
 * whose customer has no invitation that did not fail. Each group stops once its own number of emails
 * went out (skips do not count); the groups take turns so each subject goes out over the same hours. */
export async function startRealQueue({ pool, keys, config, campaignId, actorId, groups }) {
  realId(actorId)
  const limits = Object.entries(realRecord(groups) ? groups : {})
  if (
    !limits.length ||
    limits.some(
      ([key, n]) => !REAL_GROUPS.some((g) => g.key === key) || !Number.isSafeInteger(n) || n < 1 || n > 10000
    )
  )
    throw realError('REAL_INVALID_INPUT')
  if (config.invitationsSending?.mode !== 'pilot') throw realError('REAL_PILOT_OFF', 403)
  const lists = []
  for (const [group] of limits) {
    const ids = []
    let cursor = null
    do {
      const page = await listRealRecipients({
        pool,
        keys,
        campaignId,
        group,
        content: 'approved',
        cursor,
        limit: 100
      })
      for (const r of page.items) if (r.state !== 'suppressed') ids.push(r.id)
      cursor = page.nextCursor
    } while (cursor)
    lists.push(ids)
  }
  await realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const current = await queueRow(db, state.row.id)
    if (current?.state === 'running') throw realError('REAL_QUEUE_RUNNING', 409)
    const invited = new Set(
      (
        await db.query(
          "select recipient_id from invitations_real_send where campaign_id=$1 and kind='invitation' and state<>'failed'",
          [state.row.id]
        )
      ).rows.map((r) => r.recipient_id)
    )
    // Take turns: first of each group, then second of each group, and so on.
    const left = lists.map((ids) => ids.filter((id) => !invited.has(id)))
    const todo = []
    for (let i = 0; i < Math.max(...left.map((l) => l.length)); i++)
      for (const l of left) if (i < l.length) todo.push(l[i])
    if (!todo.length) throw realError('REAL_QUEUE_EMPTY', 409)
    await db.query('delete from invitations_real_queue_item where campaign_id=$1', [state.row.id])
    await db.query(
      `insert into invitations_real_queue_item(campaign_id,recipient_id,position,state)
       select $1, r, p, 'pending' from unnest($2::uuid[]) with ordinality as t(r,p)`,
      [state.row.id, todo]
    )
    await db.query(
      `insert into invitations_real_queue(campaign_id,state,actor_id) values($1,'running',$2)
       on conflict(campaign_id) do update set state='running',pause_reason=null,actor_id=$2,
         started_at=clock_timestamp(),updated_at=clock_timestamp()`,
      [state.row.id, actorId]
    )
    await db.query('delete from invitations_real_queue_group where campaign_id=$1', [state.row.id])
    await db.query(
      `insert into invitations_real_queue_group(campaign_id,group_key,send_limit)
       select $1, g, n from unnest($2::text[], $3::int[]) as t(g,n)`,
      [state.row.id, limits.map(([g]) => g), limits.map(([, n]) => n)]
    )
  })
  return readRealQueue({ pool, keys, campaignId })
}

async function setState({ pool, keys, campaignId, from, to, reason = null }) {
  await realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const q = await queueRow(db, state.row.id)
    if (!q || !from.includes(q.state)) throw realError('REAL_QUEUE_STATE', 409)
    await db.query(
      'update invitations_real_queue set state=$2,pause_reason=$3,updated_at=clock_timestamp() where campaign_id=$1',
      [state.row.id, to, reason]
    )
  })
  return readRealQueue({ pool, keys, campaignId })
}
export const pauseRealQueue = (input) =>
  setState({ ...input, from: ['running'], to: 'paused', reason: 'BY_OPERATOR' })
export const resumeRealQueue = (input) => setState({ ...input, from: ['paused'], to: 'running' })

const pause = (pool, campaignId, reason) =>
  pool.query(
    "update invitations_real_queue set state='paused',pause_reason=$2,updated_at=clock_timestamp() where campaign_id=$1 and state='running'",
    [campaignId, reason]
  )
const settle = (pool, campaignId, recipientId, fields) =>
  pool.query(
    'update invitations_real_queue_item set state=$3,reason=$4,send_id=$5,updated_at=clock_timestamp() where campaign_id=$1 and recipient_id=$2',
    [campaignId, recipientId, fields.state, fields.reason ?? null, fields.sendId ?? null]
  )

/** One pass over one running queue: skip what concerns one customer, send at most one email. */
async function runOne({ pool, keys, config, fetcher, q }) {
  const campaignId = q.campaign_id
  if (config.invitationsSending?.mode !== 'pilot') {
    await pause(pool, campaignId, 'REAL_PILOT_OFF')
    return { paused: 'REAL_PILOT_OFF' }
  }
  for (let guard = 0; guard < 200; guard++) {
    // The next pending email of a group that has not reached its number; none left means done, and
    // the rest stays approved for another day.
    const item = (
      await pool.query(
        `select i.recipient_id from invitations_real_queue_item i
         join invitations_real_recipient r on r.campaign_id=i.campaign_id and r.id=i.recipient_id
         join invitations_real_queue_group g on g.campaign_id=i.campaign_id and g.group_key=r.group_key
         where i.campaign_id=$1 and i.state='pending'
           and (select count(*) from invitations_real_queue_item s
                join invitations_real_recipient sr on sr.campaign_id=s.campaign_id and sr.id=s.recipient_id
                where s.campaign_id=$1 and s.state='sent' and sr.group_key=g.group_key) < g.send_limit
         order by i.position limit 1`,
        [campaignId]
      )
    ).rows[0]
    if (!item) {
      await pool.query(
        "update invitations_real_queue set state='done',updated_at=clock_timestamp() where campaign_id=$1 and state='running'",
        [campaignId]
      )
      return { done: true }
    }
    let row
    try {
      const recipient = await readRealRecipient({ pool, keys, campaignId, recipientId: item.recipient_id })
      if (!recipient.draft?.contentApproved) throw realError('REAL_NOT_APPROVED', 409)
      const draftRevision = recipient.draft.revision
      row = await sendRealInvitation({
        pool,
        keys,
        config,
        campaignId,
        recipientId: item.recipient_id,
        actorId: q.actor_id,
        // One key per customer and draft revision: a pass that stopped mid-send replays the same row.
        requestKey: `queue-${item.recipient_id}-r${draftRevision}`,
        draftRevision,
        fetcher
      })
    } catch (error) {
      const code =
        typeof error?.code === 'string' && /^REAL_[A-Z0-9_]+$/.test(error.code) ? error.code : 'REAL_INTERNAL'
      if (SKIP.has(code)) {
        await settle(pool, campaignId, item.recipient_id, { state: 'skipped', reason: code })
        continue
      }
      if (WAIT.has(code)) return { waiting: code }
      await pause(pool, campaignId, code)
      return { paused: code }
    }
    if (row.state === 'failed') {
      await settle(pool, campaignId, item.recipient_id, {
        state: 'skipped',
        reason: row.errorCode ?? 'SEND_FAILED',
        sendId: row.id
      })
      await pause(pool, campaignId, 'SEND_FAILED')
      return { paused: 'SEND_FAILED' }
    }
    await settle(pool, campaignId, item.recipient_id, {
      state: 'sent',
      reason: row.state === 'sent' ? null : 'SEND_UNKNOWN',
      sendId: row.id
    })
    if (row.state !== 'sent') {
      await pause(pool, campaignId, 'SEND_UNKNOWN')
      return { paused: 'SEND_UNKNOWN' }
    }
    return { sent: row.id }
  }
  return { waiting: 'GUARD' }
}

/** Cron: every running queue, one pass each. Ids and codes only leave this function. */
export async function runRealQueues({ pool, keys, config, fetcher = fetch }) {
  const queues = (await pool.query("select * from invitations_real_queue where state='running'")).rows
  const paused = []
  let sent = 0
  for (const q of queues) {
    try {
      const r = await runOne({ pool, keys, config, fetcher, q })
      if (r.sent) sent++
      if (r.paused) paused.push({ campaignId: q.campaign_id, reason: r.paused })
    } catch (error) {
      const reason =
        typeof error?.code === 'string' && /^REAL_[A-Z0-9_]+$/.test(error.code) ? error.code : 'REAL_INTERNAL'
      await pause(pool, q.campaign_id, reason).catch(() => {})
      paused.push({ campaignId: q.campaign_id, reason })
    }
  }
  return { sent, paused }
}
