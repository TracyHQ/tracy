/** Real campaign send ledger. Two kinds:
 *   test        an approved draft to one address of the server-held test list (`test` and `pilot`);
 *   invitation  an approved draft to its own customer (`pilot` only): at most `pilotMax` customers,
 *               `pacingSeconds` apart, once per customer, never to a suppressed address, and only
 *               after aMember confirms an active plan at send time.
 * Order, always:
 *   1. check everything under the campaign lock (aMember is asked before, outside the lock);
 *   2. write the ledger row `sending` and COMMIT, before any provider call;
 *   3. call Gmail once, with no retry;
 *   4. record sent / failed / send_unknown.
 * A missing answer is `send_unknown` and is only ever reconciled by reading Gmail, never resent.
 * Every message carries a one-time unsubscribe link (page and RFC 8058 one-click). */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { buildMessage } from './real-mime.js'
import { draftForSend } from './real-content.js'
import { simplifyHtml, trackLinks, withLiveFooter } from './real-footer.js'
import { getMailFormat } from './real-mail-format.js'
import { identityKey } from './real-crypto.js'
import { campaignAudience, openCampaign, openRealJson, sealRealJson } from './real-import.js'
import { realClock, realError, realId, realTransaction } from './real-store.js'
import { GmailCallError, gmailAccessToken, gmailFindByMessageId, gmailSendRaw, gmailStatus } from './gmail.js'
import { parseAccess, vietnamDay, withDeadline } from '../lib/beta-access.js'

export const TEST_SUBJECT_MARK = '[Test] '
// The sender: a fixed display name on the mailbox INVITATIONS_GMAIL_ADDRESS names.
const fromOf = (config) => ({ name: 'Sarah', address: config.invitationsGmail.address })
// One mailbox, one sender at a time, across every process: a session advisory lock on its own
// connection, held across the provider call but never inside an open SQL transaction.
const MAILBOX_LOCK = 724308098
// Reconcile an unknown send at 1, 5 and 15 minutes, then leave it to the operator.
const RECONCILE_AFTER_MS = [60_000, 300_000, 900_000]

function sending(config, kind) {
  const s = config.invitationsSending
  const allowed = kind === 'invitation' ? ['pilot'] : ['test', 'pilot']
  if (!allowed.includes(s?.mode))
    throw realError(kind === 'invitation' ? 'REAL_PILOT_OFF' : 'REAL_SENDING_OFF', 403)
  return s
}
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
/** The address as the suppression table knows it: the campaign's email identity HMAC. */
const suppressionIdentity = (indexKey, address) =>
  identityKey({ indexKey, kind: 'email', value: address.trim().toLowerCase() })

function view(row, key) {
  const payload = openRealJson(key, row.campaign_id, row.id, 'send', 1, row.payload)
  return {
    id: row.id,
    kind: row.kind,
    to: payload.to,
    subject: payload.subject,
    state: row.state,
    errorCode: row.error_code,
    draftRevision: row.draft_revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    gmailMessageId: row.gmail_message_id,
    reconcileAttempts: row.reconcile_attempts,
    nextReconcileAt: row.next_reconcile_at?.toISOString() ?? null,
    // Estimated opens: null = not measured (test send, or sent before measuring began).
    opens: row.open_token_hash
      ? { firstAt: row.first_open_at?.toISOString() ?? null, count: row.open_count }
      : null,
    // Estimated clicks: null = not measured (switch off when it was sent, or a test send).
    clicks: row.click_token_hash
      ? { firstAt: row.first_click_at?.toISOString() ?? null, count: row.click_count }
      : null
  }
}

/** Estimated opens over confirmed customer invitations that carry the image. Zero tracked = null
 * (not measured), never 0%. */
async function openSummary(db) {
  const row = (
    await db.query(
      "select count(*)::int tracked, count(first_open_at)::int opened from invitations_real_send where kind='invitation' and state='sent' and open_token_hash is not null"
    )
  ).rows[0]
  return row.tracked ? { tracked: row.tracked, opened: row.opened } : null
}

/** The image in an invitation was loaded. Counts only against a send that left (sent, or not yet
 * confirmed); a test row never has a token. No IP or agent is kept. Answers nothing about the row. */
export async function recordOpen({ pool, token }) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return
  await pool.query(
    "update invitations_real_send set first_open_at=coalesce(first_open_at,clock_timestamp()),open_count=least(open_count+1,1000) where open_token_hash=$1 and kind='invitation' and state in ('sent','send_unknown')",
    [sha256(token)]
  )
}

/** Sent customer invitations per group, with estimated opens and clicks over the ones that carried
 * the image or the tracked links. */
// Per group of one campaign: group keys are slots, so counting across campaigns would put one
// campaign's numbers under another campaign's group names.
async function engagementByGroup(db, campaignId) {
  return (
    await db.query(
      `select r.group_key, count(*)::int sent,
         count(*) filter (where s.open_token_hash is not null)::int open_tracked, count(s.first_open_at)::int opened,
         count(*) filter (where s.click_token_hash is not null)::int click_tracked, count(s.first_click_at)::int clicked
       from invitations_real_send s join invitations_real_recipient r on r.id=s.recipient_id
       where s.kind='invitation' and s.state='sent' and s.campaign_id=$1 group by r.group_key order by r.group_key`,
      [campaignId]
    )
  ).rows.map((r) => ({
    group: r.group_key,
    sent: r.sent,
    opens: r.open_tracked ? { tracked: r.open_tracked, opened: r.opened } : null,
    clicks: r.click_tracked ? { tracked: r.click_tracked, clicked: r.clicked } : null
  }))
}

// A press this soon after sending is most likely a mail scanner opening every link on arrival.
const SCANNER_WINDOW_MS = 120_000
const ROBOT =
  /bot|crawl|spider|preview|scan|proofpoint|mimecast|barracuda|safelinks|python|curl|wget|go-http|java\/|okhttp|headless/i

/** A tracked link was pressed: answers where to send the reader (the link as written in the letter),
 * or null for an unknown token or place. Counts the press unless it looks like a scanner (too soon
 * after sending, or a robot's user agent); a counted press also counts as an open. No IP or agent is
 * kept. An expired campaign no longer holds its links: null. */
export async function recordClick({ pool, keys, token, n, userAgent = '' }) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  if (!Number.isSafeInteger(n) || n < 0 || n > 49) return null
  const row = (
    await pool.query(
      "select id,campaign_id from invitations_real_send where click_token_hash=$1 and state in ('sent','send_unknown')",
      [sha256(token)]
    )
  ).rows[0]
  if (!row) return null
  let target
  try {
    target = await realTransaction({ pool, keys, campaignId: row.campaign_id }, async (db, state) => {
      const send = (await db.query('select payload from invitations_real_send where id=$1', [row.id])).rows[0]
      return openRealJson(state.key, state.row.id, row.id, 'send', 1, send.payload).links?.[n] ?? null
    })
  } catch (error) {
    if (error.code === 'REAL_EXPIRED' || error.code === 'REAL_NOT_FOUND') return null
    throw error
  }
  if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) return null
  if (ROBOT.test(String(userAgent).slice(0, 512))) return target
  // The two-minute window is measured on the database clock, the one created_at was written with.
  await pool.query(
    `update invitations_real_send set first_click_at=coalesce(first_click_at,clock_timestamp()),click_count=least(click_count+1,1000),
       first_open_at=case when open_token_hash is null then first_open_at else coalesce(first_open_at,clock_timestamp()) end,
       open_count=case when open_token_hash is null or first_open_at is not null then open_count else least(open_count+1,1000) end
     where id=$1 and clock_timestamp() - created_at >= make_interval(secs => $2)`,
    [row.id, SCANNER_WINDOW_MS / 1000]
  )
  return target
}

async function usedInWindow(db, kind) {
  return Number(
    (
      await db.query(
        "select count(*)::int n from invitations_real_send where mailbox_id='gmail' and kind=$1 and state<>'failed' and created_at > clock_timestamp() - interval '24 hours'",
        [kind]
      )
    ).rows[0].n
  )
}
async function pilotUsed(db) {
  return Number(
    (
      await db.query(
        "select count(*)::int n from invitations_real_send where kind='invitation' and state<>'failed'"
      )
    ).rows[0].n
  )
}
/** When the next customer invitation may leave, by the database clock; null = now. */
async function nextInvitationAt(db, pacingSeconds) {
  const row = (
    await db.query(
      "select max(created_at) + make_interval(secs => $1) as at from invitations_real_send where kind='invitation' and state<>'failed'",
      [pacingSeconds]
    )
  ).rows[0]
  return row.at && row.at.getTime() > Date.parse(await realClock(db)) ? row.at.toISOString() : null
}

/** What the Send controls need: the mode, the test list, the day's use and the pilot budget. */
/** Server-wide sending status. Per-group engagement needs a campaign and is empty without one. */
export async function readSendingStatus({ pool, config, campaignId = null }) {
  if (campaignId !== null) realId(campaignId)
  const s = config.invitationsSending ?? { mode: 'off', testRecipients: [], testDailyLimit: 0, pilotMax: 0 }
  const mailbox = await gmailStatus(pool, config)
  const on = s.mode === 'test' || s.mode === 'pilot'
  return {
    mode: s.mode,
    testRecipients: on ? s.testRecipients : [],
    testDailyLimit: s.testDailyLimit,
    testUsed: on ? await usedInWindow(pool, 'test') : 0,
    pilotMax: s.mode === 'pilot' ? s.pilotMax : 0,
    pilotUsed: s.mode === 'pilot' ? await pilotUsed(pool) : 0,
    nextInvitationAt: s.mode === 'pilot' ? await nextInvitationAt(pool, s.pacingSeconds) : null,
    mailbox: { status: mailbox.status, address: mailbox.address, from: mailbox.from, send: mailbox.send },
    customersEnabled: s.mode === 'pilot',
    opens: s.mode === 'pilot' ? await openSummary(pool) : null,
    campaignId,
    groups: s.mode === 'pilot' && campaignId ? await engagementByGroup(pool, campaignId) : [],
    pilotMissing: s.pilotMissing ?? []
  }
}

export async function listRecipientSends({ pool, keys, campaignId, recipientId }) {
  realId(recipientId)
  return realTransaction({ pool, keys, campaignId }, async (db, state) => ({
    items: (
      await db.query(
        'select * from invitations_real_send where campaign_id=$1 and recipient_id=$2 order by created_at desc limit 20',
        [state.row.id, recipientId]
      )
    ).rows.map((row) => view(row, state.key))
  }))
}

/** Every send of one campaign, newest first, for the Send tab: each row names its recipient so the
 * screen can put it beside the approved email it came from. */
export async function listCampaignSends({ pool, keys, campaignId }) {
  return realTransaction({ pool, keys, campaignId }, async (db, state) => ({
    items: (
      await db.query(
        'select * from invitations_real_send where campaign_id=$1 order by created_at desc limit 2000',
        [state.row.id]
      )
    ).rows.map((row) => ({ ...view(row, state.key), recipientId: row.recipient_id }))
  }))
}

async function withMailboxLock(pool, fn) {
  const client = await pool.connect()
  try {
    const got = (await client.query('select pg_try_advisory_lock($1) as ok', [MAILBOX_LOCK])).rows[0].ok
    if (!got) throw realError('REAL_SEND_BUSY', 409)
    try {
      return await fn()
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MAILBOX_LOCK]).catch(() => {})
    }
  } finally {
    client.release()
  }
}

async function record(pool, id, fields) {
  const sets = Object.keys(fields).map((k, i) => `${k}=$${i + 2}`)
  await pool.query(
    `update invitations_real_send set ${sets.join(',')},updated_at=clock_timestamp() where id=$1`,
    [id, ...Object.values(fields)]
  )
}

/** aMember check-access by email, uncached: 'allow' (an active plan), 'none' or 'unknown'. */
export async function memberStatus({ config, email, fetcher = fetch }) {
  if (!config.beta?.apiKey || !config.beta?.apiUrl) return { status: 'unknown', reason: 'NOT_CONFIGURED' }
  let result
  try {
    result = await withDeadline(async (signal) => {
      const url = new URL(config.beta.apiUrl)
      url.searchParams.set('email', email)
      url.searchParams.set('_key', config.beta.apiKey)
      const response = await fetcher(url, {
        headers: { 'user-agent': 'tracy-web/1.0 (+https://tracy.ai)' },
        signal,
        redirect: 'error'
      })
      if (response.status !== 200) return { status: 'error', reason: `HTTP_${response.status}` }
      return parseAccess(await response.json().catch(() => null), vietnamDay())
    }, 5000)
  } catch (error) {
    result = { status: 'error', reason: error?.message === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK' }
  }
  if (result.status === 'allow') return { status: 'allow' }
  if (result.status === 'waitlist') return { status: 'none' }
  return { status: 'unknown', reason: result.reason }
}

/** Common path for both kinds, from the committed ledger row to the recorded outcome. */
async function dispatch(input, { kind, to, checks }) {
  const {
    pool,
    keys,
    config,
    campaignId,
    recipientId,
    actorId,
    requestKey,
    draftRevision,
    fetcher = fetch
  } = input
  if (typeof requestKey !== 'string' || !/^[A-Za-z0-9-]{16,100}$/.test(requestKey))
    throw realError('REAL_INVALID_REQUEST_KEY')
  if (!Number.isSafeInteger(draftRevision) || draftRevision < 1) throw realError('REAL_STALE_DRAFT', 409)
  realId(recipientId)
  const origin = config.origin.replace(/\/+$/, '')
  const host = new URL(origin).hostname
  return withMailboxLock(pool, async () => {
    const prepared = await realTransaction({ pool, keys, campaignId }, async (db, state) => {
      const requestDigest = digest({ campaignId, recipientId, to, draftRevision, kind })
      const existing = (
        await db.query("select * from invitations_real_send where mailbox_id='gmail' and request_key=$1", [
          requestKey
        ])
      ).rows[0]
      if (existing) {
        if (existing.request_digest !== requestDigest) throw realError('REAL_REQUEST_KEY_REUSED', 409)
        return { replay: view(existing, state.key) }
      }
      const { recipient, draft, images } = await draftForSend(db, state, recipientId)
      if (draft.revision !== draftRevision) throw realError('REAL_STALE_DRAFT', 409)
      if (!draft.contentApproved) throw realError('REAL_NOT_APPROVED', 409)
      const mailbox = await gmailStatus(db, config)
      if (mailbox.status !== 'connected' || !mailbox.send) throw realError('REAL_MAILBOX_NOT_READY', 409)
      const suppressed = (
        await db.query('select 1 from invitations_real_suppression where campaign_id=$1 and identity=$2', [
          state.row.id,
          suppressionIdentity(state.indexKey, to)
        ])
      ).rowCount
      if (suppressed) throw realError('REAL_SUPPRESSED', 409)
      await checks(db, state, recipient)
      // Packaging is read at the moment of sending, so a change in Setup applies to the next send.
      const format = await getMailFormat({ db })
      const messageDomain = format.messageIdDomain === 'sender' ? fromOf(config).address.split('@')[1] : host
      const id = randomUUID(),
        messageId = `${id}@${messageDomain}`,
        token = randomBytes(32).toString('base64url'),
        // Estimated opens: customer invitations only; a test send never loads a production image.
        openToken = kind === 'invitation' && format.openImage ? randomBytes(32).toString('base64url') : null,
        // Estimated clicks, with the switch on: test sends carry the same links, so a test inbox shows
        // where Gmail files the mail as customers will get it (their presses stay out of the figures,
        // which count customer invitations only).
        clickToken = format.clickTracking ? randomBytes(32).toString('base64url') : null,
        tracked = clickToken
          ? trackLinks(draft.html, (n) => `${origin}/c/${clickToken}/${n}`)
          : { html: draft.html, targets: [] },
        subject = `${kind === 'test' ? TEST_SUBJECT_MARK : ''}${draft.subject}`
      // The plain-text part names the same links: the longest first, so one that starts like another
      // is not cut in two.
      const trackedUrl = (n) => `${origin}/c/${clickToken}/${n}`
      const text = [...tracked.targets.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .reduce((t, [n, url]) => t.split(url).join(trackedUrl(n)), draft.bodyText)
      const live = withLiveFooter({
        html: tracked.html,
        text,
        unsubscribeUrl: `${origin}/invitations/unsubscribe/${token}`,
        openUrl: openToken ? `${origin}/o/${openToken}.gif` : null,
        style: format.footer
      })
      const raw = buildMessage({
        from: fromOf(config),
        to,
        subject,
        html: format.html === 'simple' ? simplifyHtml(live.html) : live.html,
        text: live.text,
        messageId,
        date: new Date(await realClock(db)),
        images: images.map((img) => ({ ...img, cid: `${img.id}@${messageDomain}` })),
        headers: {
          ...(format.oneClickHeader
            ? {
                'List-Unsubscribe': `<${origin}/invitations/one-click/${token}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
              }
            : {}),
          ...(kind === 'test' ? { 'X-Tracy-Test': 'yes' } : {})
        }
      })
      try {
        await db.query(
          `insert into invitations_real_send(id,campaign_id,recipient_id,mailbox_generation,kind,actor_id,request_key,request_digest,rfc_message_id,draft_revision,state,payload,unsubscribe_token_hash,open_token_hash,click_token_hash)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sending',$11,$12,$13,$14)`,
          [
            id,
            state.row.id,
            recipientId,
            mailbox.generation,
            kind,
            actorId,
            requestKey,
            requestDigest,
            messageId,
            draft.revision,
            sealRealJson(state.key, state.row.id, id, 'send', 1, {
              to,
              subject,
              rawSha256: sha256(raw),
              ...(clickToken ? { links: tracked.targets } : {})
            }),
            sha256(token),
            openToken ? sha256(openToken) : null,
            clickToken ? sha256(clickToken) : null
          ]
        )
      } catch (error) {
        // The partial unique index: this customer already has an invitation that did not fail.
        if (error.code === '23505' && kind === 'invitation') throw realError('REAL_ALREADY_INVITED', 409)
        throw error
      }
      return { id, raw, generation: mailbox.generation }
    })
    if (prepared.replay) return prepared.replay
    let outcome
    try {
      const { accessToken, generation } = await gmailAccessToken({ pool, config, fetcher })
      if (generation !== prepared.generation) throw new GmailCallError('MAILBOX_CHANGED', 'blocked')
      const ids = await gmailSendRaw({ accessToken, raw: prepared.raw, fetcher })
      outcome = { state: 'sent', gmail_message_id: ids.id, gmail_thread_id: ids.threadId, error_code: null }
    } catch (error) {
      const code = error instanceof GmailCallError ? error.code : 'SEND_INTERNAL'
      // Only a definite refusal, or a stop before the request left, is `failed`. Anything else
      // may have reached Google.
      outcome =
        error instanceof GmailCallError && (error.kind === 'rejected' || error.kind === 'blocked')
          ? { state: 'failed', error_code: code }
          : {
              state: 'send_unknown',
              error_code: code,
              next_reconcile_at: new Date(Date.now() + RECONCILE_AFTER_MS[0])
            }
    }
    await record(pool, prepared.id, outcome)
    return listOne(pool, keys, campaignId, prepared.id)
  })
}

/** Send the recipient's approved draft to one test address. */
export async function sendRealTest(input) {
  const s = sending(input.config, 'test')
  const to = typeof input.to === 'string' ? input.to.trim().toLowerCase() : ''
  if (!s.testRecipients.includes(to)) throw realError('REAL_SEND_NOT_ALLOWED', 403)
  return dispatch(input, {
    kind: 'test',
    to,
    checks: async (db) => {
      if ((await usedInWindow(db, 'test')) >= s.testDailyLimit) throw realError('REAL_SEND_QUOTA', 429)
    }
  })
}

/** Send the recipient's approved invitation to the customer it was written for (pilot only). */
export async function sendRealInvitation(input) {
  const s = sending(input.config, 'invitation')
  realId(input.recipientId)
  // The address comes from the encrypted recipient, never from the request.
  const { to, audience } = await realTransaction(
    { pool: input.pool, keys: input.keys, campaignId: input.campaignId },
    async (db, state) => {
      const row = (
        await db.query('select * from invitations_real_recipient where campaign_id=$1 and id=$2', [
          state.row.id,
          input.recipientId
        ])
      ).rows[0]
      if (!row) throw realError('REAL_NOT_FOUND', 404)
      if (row.state === 'suppressed') throw realError('REAL_SUPPRESSED', 409)
      return {
        to: openRealJson(state.key, state.row.id, row.id, 'recipient', Number(row.revision), row.payload)
          .normalizedEmail,
        audience: campaignAudience(openCampaign(state.row, state.key))
      }
    }
  )
  // aMember is asked outside every lock and transaction. A campaign for customers with an active
  // plan stops at anything else; one for past customers needs only a clear answer from aMember, so
  // an aMember that cannot answer still stops (and pauses the queue) the same way.
  const member = await memberStatus({
    config: input.config,
    email: to,
    fetcher: input.memberFetcher ?? input.fetcher
  })
  if (member.status === 'unknown') throw realError('REAL_MEMBERSHIP_UNKNOWN', 503)
  if (member.status === 'none' && audience !== 'past_customers') throw realError('REAL_NOT_MEMBER', 409)
  return dispatch(input, {
    kind: 'invitation',
    to,
    checks: async (db, state, recipient) => {
      // Re-read under the lock: the list may have changed while aMember was being asked.
      if (recipient.row.state === 'suppressed') throw realError('REAL_SUPPRESSED', 409)
      if (recipient.value.normalizedEmail !== to) throw realError('REAL_STALE_DRAFT', 409)
      const invited = await db.query(
        "select 1 from invitations_real_send where campaign_id=$1 and recipient_id=$2 and kind='invitation' and state<>'failed'",
        [state.row.id, recipient.row.id]
      )
      if (invited.rowCount) throw realError('REAL_ALREADY_INVITED', 409)
      if ((await pilotUsed(db)) >= s.pilotMax) throw realError('REAL_PILOT_FULL', 409)
      if (await nextInvitationAt(db, s.pacingSeconds)) throw realError('REAL_PILOT_PACING', 429)
    }
  })
}

async function listOne(pool, keys, campaignId, id) {
  return realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const row = (
      await db.query('select * from invitations_real_send where campaign_id=$1 and id=$2', [state.row.id, id])
    ).rows[0]
    if (!row) throw realError('REAL_NOT_FOUND', 404)
    return view(row, state.key)
  })
}

/** Unsubscribe by the token in a sent message: suppresses that address for that campaign only.
 * Answers {done:true} (also when already suppressed) or {done:false} for an unknown token. */
export async function unsubscribeByToken({ pool, keys, token, reason }) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { done: false }
  const row = (
    await pool.query('select id,campaign_id from invitations_real_send where unsubscribe_token_hash=$1', [
      sha256(token)
    ])
  ).rows[0]
  if (!row) return { done: false }
  try {
    await realTransaction({ pool, keys, campaignId: row.campaign_id }, async (db, state) => {
      const send = (await db.query('select * from invitations_real_send where id=$1', [row.id])).rows[0]
      const { to } = openRealJson(state.key, state.row.id, send.id, 'send', 1, send.payload)
      await db.query(
        'insert into invitations_real_suppression(campaign_id,identity,reason,send_id) values($1,$2,$3,$4) on conflict do nothing',
        [state.row.id, suppressionIdentity(state.indexKey, to), reason, send.id]
      )
    })
  } catch (error) {
    // An expired campaign holds no addresses any more and sends nothing: nothing left to stop.
    if (error.code === 'REAL_EXPIRED' || error.code === 'REAL_NOT_FOUND') return { done: true }
    throw error
  }
  return { done: true }
}

/** Look for an unknown send in Gmail by its Message-ID. One match makes it sent; none or a failed
 * search keeps it unknown (search can lag; absence proves nothing); several are left for a person. */
export async function reconcileRealSend({ pool, keys, config, campaignId, sendId, fetcher = fetch }) {
  realId(sendId)
  const row = (
    await pool.query('select * from invitations_real_send where campaign_id=$1 and id=$2', [
      campaignId,
      sendId
    ])
  ).rows[0]
  if (!row) throw realError('REAL_NOT_FOUND', 404)
  if (row.state !== 'send_unknown' && row.state !== 'sending') return listOne(pool, keys, campaignId, sendId)
  const attempts = row.reconcile_attempts + 1
  const next = RECONCILE_AFTER_MS[attempts] ? new Date(Date.now() + RECONCILE_AFTER_MS[attempts]) : null
  let found = null
  try {
    const { accessToken } = await gmailAccessToken({ pool, config, fetcher })
    found = await gmailFindByMessageId({ accessToken, messageId: row.rfc_message_id, fetcher })
  } catch (error) {
    const code = error instanceof GmailCallError ? error.code : 'SEARCH_UNAVAILABLE'
    await record(pool, sendId, {
      state: 'send_unknown',
      reconcile_attempts: attempts,
      next_reconcile_at: next,
      error_code: code
    })
    return listOne(pool, keys, campaignId, sendId)
  }
  if (found.length === 1)
    await record(pool, sendId, {
      state: 'sent',
      gmail_message_id: found[0].id,
      gmail_thread_id: found[0].threadId,
      error_code: null,
      reconcile_attempts: attempts,
      next_reconcile_at: null
    })
  else
    await record(pool, sendId, {
      state: 'send_unknown',
      reconcile_attempts: attempts,
      next_reconcile_at: found.length > 1 ? null : next,
      error_code: found.length > 1 ? 'RECONCILE_MULTIPLE' : 'RECONCILE_NOT_FOUND_YET'
    })
  return listOne(pool, keys, campaignId, sendId)
}

/** Cron: a row left in `sending` by a crashed process becomes unknown (never resent), and unknown
 * rows due for a check are reconciled. Ids and codes only leave this function. */
export async function sweepRealSends({ pool, keys, config, fetcher = fetch, limit = 10 }) {
  if (!['test', 'pilot'].includes(config.invitationsSending?.mode)) return { recovered: 0, reconciled: 0 }
  // Only the lock holder ever has a row in `sending`. If the lock is free, every such row was left
  // by a process that stopped mid-send: it becomes unknown and is checked, never sent again.
  let recovered = 0
  const client = await pool.connect()
  try {
    if ((await client.query('select pg_try_advisory_lock($1) as ok', [MAILBOX_LOCK])).rows[0].ok)
      try {
        recovered = (
          await client.query(
            "update invitations_real_send set state='send_unknown',error_code='SEND_INTERRUPTED',next_reconcile_at=clock_timestamp(),updated_at=clock_timestamp() where state='sending'"
          )
        ).rowCount
      } finally {
        await client.query('select pg_advisory_unlock($1)', [MAILBOX_LOCK]).catch(() => {})
      }
  } finally {
    client.release()
  }
  const due = (
    await pool.query(
      "select id,campaign_id from invitations_real_send where state='send_unknown' and next_reconcile_at <= clock_timestamp() order by next_reconcile_at limit $1",
      [limit]
    )
  ).rows
  let reconciled = 0
  for (const row of due) {
    try {
      await reconcileRealSend({ pool, keys, config, campaignId: row.campaign_id, sendId: row.id, fetcher })
      reconciled++
    } catch {
      // A campaign that cannot be opened (expired, key held) keeps its row for the next pass.
    }
  }
  return { recovered, reconciled }
}
