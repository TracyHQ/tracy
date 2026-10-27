/**
 * THE ONE WAY an event becomes a notification (spec #809): every team and comment door calls
 * `notify(...)` and nothing else writes the log or sends a notification email.
 *
 *   notify({ recipients: [accountId…], kind, siteKey?, actor?, data?, ref?, mail?, group? })
 *
 * For each recipient (the actor is always dropped, rule R2) it reads their settings, writes one
 * row, and owes one email:
 *   - `mail: 'send'` (default) — the email goes now, or is held when `group` says so;
 *   - `mail: 'none'` — the event mails by itself (an invitation carries a signed accept link the
 *     log cannot rebuild), so the row is Inbox only.
 *   - `group: { windowMinutes }` — C2 replies: the first email of a thread goes at once; rows of the
 *     same `ref` that arrive while a mail of that thread went out less than `windowMinutes` ago are
 *     held and sent together as ONE email when the window closes.
 *
 * The letter is rendered by `letterFor` (the mail domain's renderer, bound in by `app.js`, since a
 * domain imports only `lib/` and `db/`) from the rows' facts, in the recipient's own language
 * (`account.language`, English when none), at send time — so a retry after a failure, or a held
 * group, reads in the language the person has then. A failed send stays owed: the row is its own
 * outbox, and `deliverDue()` (run by the cron) retries it with back-off.
 *
 * Nothing here ever throws into the door that called it: a notification failing must not undo the
 * comment, the approval or the invitation that caused it. Failures are logged.
 */
import {
  actorOf,
  addNotification,
  dueMail,
  heldWith,
  recipientsById,
  recordMail,
  settleByRef,
  settleBySite,
  WITH_ACTOR
} from './store.js'

/** Everything on until Settings › Notifications says otherwise (#809 step 5). */
const ALL_ON = async () => ({ inbox: true, email: true })

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   send: (mail: {to: string, subject: string, text: string, html?: string}) => Promise<unknown>,
 *   letterFor: (input: {kind: string, lang: string, rows: object[], recipient: object}) =>
 *     ({subject: string, text: string, html: string} | null),
 *   preferenceFor?: (pool: import('pg').Pool, accountId: string, kind: string) =>
 *     Promise<{inbox: boolean, email: boolean}>,
 *   unsubscribeHeaders?: (accountId: string, kind: string) => Promise<Record<string, string> | null>,
 *     the one-click unsubscribe headers of this recipient's letter of this kind (RFC 8058), or null
 *     for a kind that cannot be switched off (the locked join-request group)
 *   log?: Pick<Console, 'warn' | 'error'>
 * }} deps
 */
export function createNotifier({
  pool,
  send,
  letterFor,
  preferenceFor = ALL_ON,
  unsubscribeHeaders = async () => null,
  log = console
}) {
  /** Shape a stored row the way a letter renderer reads it (same fields as the Inbox's JSON). */
  const shapeForLetter = (r) => ({
    id: r.id,
    kind: r.kind,
    siteKey: r.site_key,
    // The address the site has now (`WITH_ACTOR`), for every sentence; `siteKey` stays for links.
    siteName: r.site_name ?? r.site_key ?? null,
    actor: actorOf(r),
    data: r.data ?? {},
    ref: r.ref,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
  })

  /** Send one letter for rows of ONE recipient and ONE kind; record the outcome on every row. */
  async function deliver(rows) {
    const ids = rows.map((r) => r.id)
    try {
      const recipient = (await recipientsById(pool, [rows[0].account_id])).get(rows[0].account_id)
      if (!recipient?.email) {
        await recordMail(pool, ids, { sent: false, error: 'recipient has no email', maxAttempts: 1 })
        return
      }
      const letter = letterFor({
        kind: rows[0].kind,
        lang: recipient.language ?? 'en',
        rows: rows.map(shapeForLetter),
        recipient: { id: recipient.id, email: recipient.email, name: recipient.display_name ?? null }
      })
      if (!letter) {
        // No renderer for this kind (yet): nothing to send, nothing owed.
        await pool.query(`update notification set mail_state = 'none' where id = any($1::uuid[])`, [ids])
        return
      }
      const headers = await unsubscribeHeaders(recipient.id, rows[0].kind)
      await send({
        to: recipient.email,
        subject: letter.subject,
        text: letter.text,
        html: letter.html,
        ...(headers ? { headers } : {})
      })
      await recordMail(pool, ids, { sent: true })
    } catch (error) {
      log.warn('[notifications] mail not sent, will retry', error?.message ?? error)
      await recordMail(pool, ids, { sent: false, error: error?.message ?? String(error) }).catch(() => {})
    }
  }

  /** When a row of this thread should be held instead of mailed now (C2 grouping), or null. */
  async function holdUntil(accountId, ref, windowMinutes) {
    // The window is judged on the database clock: `mailed_at` is written by now(), not by this process.
    const { rows } = await pool.query(
      `select max(mail_due_at) filter (where mail_state = 'held') as due,
              max(mailed_at) + make_interval(mins => $3) as window_end,
              max(mailed_at) + make_interval(mins => $3) > now() as in_window
         from notification where account_id = $1 and ref = $2`,
      [accountId, ref, windowMinutes]
    )
    const { due, window_end, in_window } = rows[0]
    if (due) return due
    return in_window ? window_end : null
  }

  /**
   * @param {{recipients: string[], kind: string, siteKey?: string|null, actor?: string|null,
   *   data?: Record<string, unknown>, ref?: string|null, mail?: 'send'|'none',
   *   group?: {windowMinutes: number} | null}} event
   * @returns {Promise<string[]>} ids of the rows written (for tests and callers that settle later).
   */
  async function notify({
    recipients,
    kind,
    siteKey = null,
    actor = null,
    data = {},
    ref = null,
    mail = 'send',
    group = null
  }) {
    const written = []
    for (const recipient of new Set(recipients ?? [])) {
      if (!recipient || recipient === actor) continue
      try {
        const prefs = await preferenceFor(pool, recipient, kind)
        if (!prefs.inbox && !prefs.email) continue
        const wantsMail = mail === 'send' && prefs.email
        const held = wantsMail && group && ref ? await holdUntil(recipient, ref, group.windowMinutes) : null
        const row = await addNotification(pool, {
          recipient,
          kind,
          siteKey,
          actor,
          data,
          ref,
          inInbox: prefs.inbox,
          mailState: wantsMail ? (held ? 'held' : 'pending') : 'none',
          mailDueAt: held
        })
        if (!row) continue
        written.push(row.id)
        if (wantsMail && !held) {
          const { rows } = await pool.query(`${WITH_ACTOR} where n.id = $1`, [row.id])
          await deliver(rows)
        }
      } catch (error) {
        log.error('[notifications] could not notify', kind, error?.message ?? error)
      }
    }
    return written
  }

  /**
   * Send every email that is owed now: failed attempts past their back-off, and held groups whose
   * window closed (one letter per recipient + ref + kind). The cron calls this every 30 seconds.
   */
  async function deliverDue() {
    const due = await dueMail(pool)
    const done = new Set()
    for (const row of due) {
      if (done.has(row.id)) continue
      const rows =
        row.mail_state === 'held' && row.ref ? await heldWith(pool, row.account_id, row.ref) : [row]
      const sameKind = rows.filter((r) => r.kind === row.kind)
      for (const r of sameKind) done.add(r.id)
      await deliver(sameKind)
    }
    return { sent: done.size }
  }

  /**
   * Close every open row about one request (`ref`), so no other admin acts on it (T2b). Same
   * discipline as `notify`: never throws into the door that answered the request.
   * @returns {Promise<number>} rows settled.
   */
  async function settle(ref, options = {}) {
    if (!ref) return 0
    try {
      return await settleByRef(pool, ref, options)
    } catch (error) {
      log.error('[notifications] could not settle', ref, error?.message ?? error)
      return 0
    }
  }

  /** Close every open request about a deleted site (`settleBySite`); never throws, like `settle`. */
  async function settleSite(siteKey) {
    if (!siteKey) return 0
    try {
      return await settleBySite(pool, siteKey)
    } catch (error) {
      log.error('[notifications] could not settle site', siteKey, error?.message ?? error)
      return 0
    }
  }

  return { notify, deliverDue, settle, settleSite }
}
