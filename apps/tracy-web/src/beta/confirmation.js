import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { timingSafeEqual } from 'node:crypto'
import { validateWaitlist } from './route.js'
import { validEmail, normalizeEmail, withDeadline } from '../lib/beta-access.js'
import { signInSource } from '../lib/sign-in-source.js'
import { requestLanguage } from '../lib/i18n/index.js'

/** Private server-to-server door; authenticates the WordPress backend independently of browser sessions. */
/**
 * @param {{ config: object, pool: object, mail: object, confirmationMail: Function }} deps
 *   `confirmationMail` is `mail/confirmation-mail.js`'s builder, wired in `app.js`: a domain imports
 *   only `lib/` and `db/`, never another domain.
 */
export function confirmationRoutes({ config, pool, mail, confirmationMail }) {
  const app = new Hono()
  app.post('/internal/beta/confirmation', bodyLimit({ maxSize: 32768 }), async (c) => {
    c.header('cache-control', 'no-store')
    const secret = config?.beta?.confirmationSecret
    const supplied = c.req.header('authorization') ?? ''
    const expected = `Bearer ${secret}`
    if (
      !secret ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return c.json({ code: 'UNAUTHORIZED' }, 401)
    if (!pool || !mail) return c.json({ code: 'UNAVAILABLE' }, 503)
    const body = await c.req.json().catch(() => null)
    const email = normalizeEmail(body?.email)
    const data = validateWaitlist(body)
    if (!validEmail(email) || !data || data.name.length > 120) return c.json({ code: 'INVALID_REQUEST' }, 400)
    // Only the authenticated WordPress backend may supply the existing rendered template.
    const rendered = body.confirmation
    if (
      rendered &&
      (typeof rendered.html !== 'string' ||
        rendered.html.length > 24000 ||
        typeof rendered.text !== 'string' ||
        rendered.text.length > 8000)
    )
      return c.json({ code: 'INVALID_REQUEST' }, 400)
    const replyTo = body.replyTo ? normalizeEmail(body.replyTo) : null
    if (body.replyTo && !validEmail(replyTo)) return c.json({ code: 'INVALID_REQUEST' }, 400)
    // The form's own answers, kept where Tracy's own form keeps them (`beta/route.js`), so `/ops` ›
    // Beta › Waitlist can show who asked, for what and from which link (06/10/2026). WordPress
    // retries this door every hour until the mail is sent: an identical retry changes nothing, so
    // `updated_at` moves only when the person really sent the form again with other answers. A retry
    // without `utm_*` keeps the source an earlier call carried.
    const source = signInSource(body)
    await pool.query(
      `insert into beta_waitlist (email,name,website,platforms,role,site_count,source) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (email) do update set name = excluded.name, website = excluded.website, platforms = excluded.platforms,
       role = excluded.role, site_count = excluded.site_count, source = coalesce(excluded.source, beta_waitlist.source),
       updated_at = now()
       where (beta_waitlist.name, beta_waitlist.website, beta_waitlist.platforms, beta_waitlist.role,
              beta_waitlist.site_count, beta_waitlist.source)
         is distinct from (excluded.name, excluded.website, excluded.platforms, excluded.role, excluded.site_count,
              coalesce(excluded.source, beta_waitlist.source))`,
      [email, data.name, data.website, JSON.stringify(data.platforms), data.role, data.site_count, source]
    )
    // `deliver: false`: WordPress tells Tracy about a form it will not mail yet (its own daily cap
    // reached), so the person is on the Waitlist screen at once. No mail, no queue row: the plugin
    // calls again, without the flag, when it sends.
    if (body.deliver === false) return c.json({ status: 'stored' })
    const payload = {
      ...(replyTo ? { replyTo } : {}),
      to: email,
      ...confirmationMail(email, data, config.beta.waitlistOrigin, requestLanguage(c)),
      ...(rendered ? { html: rendered.html, text: rendered.text } : {})
    }
    await pool.query(
      'insert into whitelist_confirmation (email,payload) values ($1,$2) on conflict do nothing',
      [email, payload]
    )
    const client = await pool.connect()
    let row
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(731044)')
      // Both ages are judged on the database clock that stamped them, not this process's clock.
      row = (
        await client.query(
          `select *, first_attempt_at <= now() - interval '23 hours' as past_window,
                  locked_until > now() as locked
             from whitelist_confirmation where email=$1 for update`,
          [email]
        )
      ).rows[0]
      if (row.status === 'sent') {
        await client.query('commit')
        return c.json({ status: 'sent', id: row.provider_id })
      }
      // Never resend an ambiguous attempt after Resend's 24-hour idempotency window.
      if (row.past_window) {
        await client.query("update whitelist_confirmation set status='review' where email=$1", [email])
        await client.query('commit')
        return c.json({ status: 'review' }, 409)
      }
      if (row.locked) {
        await client.query('commit')
        return c.json({ status: 'queued' }, 202)
      }
      const budget = await client.query(
        `insert into whitelist_mail_budget (day,reserved) values ((now() at time zone 'UTC')::date,1)
        on conflict (day) do update set reserved=whitelist_mail_budget.reserved+1 where whitelist_mail_budget.reserved<$1 returning reserved`,
        [config.beta.confirmationDaily]
      )
      if (!budget.rowCount) {
        await client.query('commit')
        return c.json({ status: 'queued' }, 202)
      }
      await client.query(
        "update whitelist_confirmation set locked_until=now()+interval '30 seconds',first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 where email=$1",
        [email]
      )
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
    try {
      const idempotencyKey = `tracy-whitelist/${row.id}`
      const id = await withDeadline((signal) => mail.send({ ...row.payload, idempotencyKey, signal }), 10000)
      if (!id) throw new Error('PROVIDER_ACK_MISSING')
      await pool.query(
        "update whitelist_confirmation set status='sent',provider_id=$2,sent_at=now(),locked_until=null where email=$1",
        [email, id]
      )
      return c.json({ status: 'sent', id })
    } catch {
      await pool.query('update whitelist_confirmation set locked_until=null where email=$1', [email])
      return c.json({ status: 'queued' }, 503)
    }
  })
  return app
}
