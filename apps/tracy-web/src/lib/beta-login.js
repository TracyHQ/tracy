import { withDeadline } from './beta-access.js'
import { signBetaToken } from './beta-token.js'
import { matchLanguage } from './i18n/index.js'
import { memoryRateLimiter, overLimit, overLimitOrClosed } from './rate.js'
import { withSource } from './sign-in-source.js'

const WAITLIST_MAIL_WINDOW_MS = 86_400_000

/** Admission is queued before answering the browser. Errors disclose neither email nor key. */
export function createBetaLogin({
  pool = null,
  access,
  identity,
  mail,
  otp,
  config,
  signal,
  now = Date.now,
  log = console
}) {
  const queued = new Map()
  const latest = new Map()
  const rate = memoryRateLimiter()
  let draining = null
  let stopped = false
  let timer = null

  /** `lang`: the language of the request that queued the job (#753); the mail goes out in it.
   * `source`: where the sign-in came from (`./sign-in-source.js`), kept on the code's admission so
   * `/verify` hands it to the first-sign-in signal. */
  async function sendOutcome(email, admission, via, requestId, lang = 'en', source = null, current = true) {
    if (admission.status === 'allow') {
      if (!current) return
      const code = otp.generateCode()
      await identity.putCode({
        email,
        codeHash: await otp.hashCode(code, email, config.sessionSecret),
        expiresAt: now() + 10 * 60_000,
        admission: withSource(admission, source)
      })
      await withDeadline(() => mail.send({ to: email, ...mail.signInCodeMail(code, lang) }), 10000)
      return
    }
    const unavailable = admission.status === 'unavailable' || admission.status === 'error'
    // A blocked admission belongs to its request, independent of mail delivery and its rate cap.
    if (!unavailable)
      await signal.record('beta.waitlist', { email, data: { via }, dedupeKey: `waitlist:${requestId}` })
    // Superseded decisions still count, but only the latest request may replace codes or send mail.
    if (!current) return
    // Revoke an earlier code too: a negative decision must not leave a bypass behind.
    await identity.deleteCode(email)
    const url = new URL(config.beta.waitlistUrl)
    // WordPress owns public submissions and confirmations. Its `?email=` prefill stays out of the
    // letter (spam audit 05/10/2026): a link carrying the reader's own address reads as tracking,
    // so the reader types it once. The OAuth refusal redirect (`identity/route.js`) still prefills.
    if (config.beta.waitlistMode !== 'wordpress')
      url.searchParams.set('t', await signBetaToken(email, config.sessionSecret, now()))
    // One whitelist letter per address per day (spam audit 05/10/2026): each sign-in attempt used
    // to mail the same letter again, six to one address within minutes, and Gmail learns from a
    // reader who ignores the copies. Fails OPEN: a bucket the database cannot count still mails.
    const bucket = `beta-waitlist-mail:${unavailable ? 'unavailable' : 'join'}:${email}`
    const repeated = pool
      ? await overLimit(pool, bucket, 1, now(), WAITLIST_MAIL_WINDOW_MS).catch(() => false)
      : rate.overLimit(bucket, 1, now(), WAITLIST_MAIL_WINDOW_MS)
    if (repeated) return
    await withDeadline(
      () => mail.send({ to: email, ...mail.betaMail({ url: url.toString(), unavailable, lang }) }),
      10000
    )
  }

  async function drain() {
    if (stopped) return
    if (draining) return draining
    draining = (async () => {
      let rows
      if (pool) {
        await pool.query('delete from beta_login_latest where expires_at <= now()')
      } else {
        for (const [email, job] of latest) if (job.expiresAt <= now()) latest.delete(email)
      }
      if (pool)
        rows = (
          await pool.query(
            `with due as (select request_id from beta_login_job where next_at <= now() and expires_at > now()
         and (locked_until is null or locked_until < now()) order by next_at for update skip locked limit 4)
         update beta_login_job j set locked_until = now() + interval '30 seconds', attempts = attempts + 1
         from due where j.request_id = due.request_id returning j.*`
          )
        ).rows
      else {
        for (const [requestId, job] of queued) if (job.expires_at <= now()) queued.delete(requestId)
        rows = [...queued.values()].filter((job) => job.next_at <= now()).slice(0, 4)
      }
      await Promise.all(
        rows.map(async (job) => {
          try {
            const admission = await access.decide(job.email)
            const newest = pool
              ? (await pool.query('select request_id from beta_login_latest where email = $1', [job.email]))
                  .rows[0]?.request_id
              : latest.get(job.email)?.requestId
            await sendOutcome(
              job.email,
              admission,
              job.via,
              job.request_id,
              job.lang ?? 'en',
              job.source ?? null,
              newest == null || newest === job.request_id
            )
            if (pool) {
              await pool.query('delete from beta_login_job where request_id = $1', [job.request_id])
            } else queued.delete(job.request_id)
          } catch {
            log.warn('[beta] login email delivery failed; queued for retry')
            if (pool)
              await pool.query(
                `update beta_login_job set locked_until = null, error = 'DELIVERY_FAILED', next_at = now() + interval '30 seconds' where request_id = $1`,
                [job.request_id]
              )
            else if (queued.has(job.request_id)) job.next_at = now() + 30000
          }
        })
      )
    })().finally(() => {
      draining = null
      if (!pool && !stopped && queued.size) {
        clearTimeout(timer)
        timer = setTimeout(() => drain().catch(() => log.warn('[beta] login queue unavailable')), 1000)
        timer.unref?.()
      }
    })
    return draining
  }

  return {
    access,
    drain,
    sendOutcome,
    async enqueue(email, via = 'email code', language = 'en', source = null) {
      const lang = matchLanguage(language) ?? 'en'
      const limited = pool
        ? await overLimitOrClosed(pool, `beta-email:${email}`, 5, now())
        : rate.overLimit(`beta-email:${email}`, 5, now())
      if (limited) return
      const requestId = crypto.randomUUID()
      if (pool) {
        await pool.query('delete from beta_login_latest where expires_at <= now()')
        await pool.query(
          `with queued as (
             insert into beta_login_job (email,request_id,via,lang,source,expires_at)
             values ($1,$2,$3,$4,$5,now() + interval '10 minutes')
             returning email, request_id, expires_at)
           insert into beta_login_latest (email,request_id,expires_at)
           select email, request_id, expires_at from queued
           on conflict (email) do update set request_id = excluded.request_id, expires_at = excluded.expires_at`,
          [email, requestId, via, lang, source]
        )
      } else {
        for (const [address, job] of latest) if (job.expiresAt <= now()) latest.delete(address)
        latest.set(email, { requestId, expiresAt: now() + 600000 })
        queued.set(requestId, {
          email,
          request_id: requestId,
          via,
          lang,
          source,
          next_at: now(),
          expires_at: now() + 600000
        })
      }
      clearTimeout(timer)
      timer = setTimeout(() => drain().catch(() => log.warn('[beta] login queue unavailable')), 0)
      timer.unref?.()
    },
    async stop() {
      stopped = true
      clearTimeout(timer)
      await draining
    }
  }
}
