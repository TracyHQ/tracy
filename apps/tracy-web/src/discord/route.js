/**
 * The doors Tracy's Discord bot calls (08/10/2026): a member proves the address they use with
 * Tracy, and what they do on the server after that reaches `/ops` as signals.
 *
 * THE ROUND, IN ORDER:
 *   1. member types `/verify email:<address>` → bot → `POST /api/discord/link/start {discordId, email}`
 *      Tracy asks the beta gate about the address (`beta.access.decide`, the rule `/login` admits
 *      by) and, when it would let that address in, mails the six-digit sign-in letter. The answer is
 *      `{ok:true}` either way, so the bot never learns whether an address is a customer.
 *   2. member types `/verify code:<digits>` → bot → `POST /api/discord/link/verify {discordId, discordName, code}`
 *      Right code: the member and the address are linked, `discord.linked` is recorded, and the bot
 *      gives the member the beta role. Wrong, spent or expired: `401 BAD_CODE`.
 *   3. later, `POST /api/discord/events {kind, discordId, discordName, data}` — a new #bug-reports post, a member
 *      leaving — becomes `discord.bug_report` / `discord.left` for a linked member. An unlinked
 *      member is answered `{ok:true, linked:false}` and nothing is recorded: a signal without an
 *      address is one `/ops` cannot act on. `left` also removes the link (below).
 *   `discordName` (optional) is the member's Discord username as the bot sees it, recorded beside
 *   the id so `/ops` and Telegram read a name. The id stays the key: a name can change any day.
 *
 * 🔒 WHO MAY CALL. Only the bot, with `x-tracy-discord-secret` equal to `DISCORD_LINK_SECRET`, the
 * whole authority, as `X-Telegram-Bot-Api-Secret-Token` is for the Customer Service webhook. Without
 * that gate, door 1 is an open mail cannon. No secret configured: every door answers 404, so a
 * deployment that never set up the bot does not even admit the doors exist.
 *
 * WHY THE SIGN-IN LETTER, NOT A LETTER OF ITS OWN. The code proves the same thing a sign-in code
 * does — this person reads this inbox — and a new letter means a new template in every interface
 * language (`docs/references/i18n.md`). The code itself is NOT the sign-in code: it lives in
 * `discord_link_code` (`080-discord-link.sql`), keyed by member, so it neither replaces nor redeems
 * a sign-in waiting in another tab.
 */
import { Hono } from 'hono'

import { json } from '../lib/http.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { loginMailLimiter } from '../lib/login-mail-rate.js'
import { sameSecret } from '../lib/same-secret.js'
import { CODE_TTL_MS, MAX_ATTEMPTS } from '../lib/policy.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** A Discord snowflake: a 64-bit id written in decimal. */
const SNOWFLAKE = /^\d{15,22}$/
const CODE = /^\d{6}$/
/** What the bot may report, and the signal each becomes. */
const EVENTS = { bug_report: 'discord.bug_report', left: 'discord.left' }
const TEXT_MAX = 200
/** Discord caps usernames and display names at 32 characters. */
const NAME_MAX = 32
const URL_MAX = 300

const text = (value, max) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
const discordUrl = (value) =>
  typeof value === 'string' &&
  value.length <= URL_MAX &&
  /^https:\/\/discord\.com\/channels\/[\d/]+$/.test(value)
    ? value
    : undefined

/**
 * @param {object} deps
 * @param {object} deps.config - reads `discord.secret` and `sessionSecret`.
 * @param {object} deps.store - `discord/store.js`.
 * @param {object|null} deps.beta - the composition root's beta login (`lib/beta-login.js`); only its
 *   `access.decide` is read. Absent: every well-formed address is let through, as `/login` does
 *   with the gate off.
 * @param {object|null} deps.mail - `{ send, available, signInCodeMail }`, as the lane door gets it.
 * @param {object} deps.otp - `{ generateCode, hashCode }` from `identity/otp.js`, injected: a domain
 *   may not import a sibling (`test/module-graph.test.mjs`).
 * @param {object} deps.signal - `lib/ops-signal.js`'s service.
 * @param {object} [deps.mailRate] - the shared sign-in mail limiter (`lib/login-mail-rate.js`).
 * @param {() => number} [deps.now]
 */
export function discordRoutes({
  config,
  store,
  beta = null,
  mail,
  otp,
  signal,
  pool = null,
  now = Date.now,
  mailRate = loginMailLimiter({ pool, now })
}) {
  const app = new Hono()
  const secret = config.discord?.secret ?? null

  const body = async (c) => {
    const parsed = await c.req.json().catch(() => ({}))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }
  const refused = (c) =>
    !secret || !sameSecret(c.req.header('x-tracy-discord-secret'), secret) ? c.text('Not found', 404) : null

  app.post('/api/discord/link/start', async (c) => {
    c.header('cache-control', 'no-store')
    const no = refused(c)
    if (no) return no
    const raw = await body(c)
    const discordId = String(raw.discordId ?? '')
    const email = String(raw.email ?? '')
      .trim()
      .toLowerCase()
    if (!SNOWFLAKE.test(discordId) || !EMAIL.test(email)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    // Same order and reason as the lane door: a deployment that cannot mail says so before
    // anything else, and the answer depends on the deployment only, never on the address.
    if (!mail?.send || mail.available === false) return json(c, { code: 'MAIL_UNAVAILABLE' }, 503)
    if (await mailRate.overDiscord(email, discordId)) return json(c, { code: 'RATE_LIMITED' }, 429)
    const admission = beta?.access?.enabled ? await beta.access.decide(email) : { status: 'allow' }
    if (admission.status !== 'allow') return c.json({ ok: true })
    const code = otp.generateCode()
    await store.putCode({
      discordId,
      email,
      codeHash: await otp.hashCode(code, email, config.sessionSecret),
      expiresAt: now() + CODE_TTL_MS
    })
    await mail.send({ to: email, ...mail.signInCodeMail(code, requestLanguage(c)) })
    return c.json({ ok: true })
  })

  // Attempts are bumped BEFORE the comparison, for the reason `identity/route.js`'s `/verify`
  // gives: comparing first lets parallel guesses all read the same count.
  app.post('/api/discord/link/verify', async (c) => {
    c.header('cache-control', 'no-store')
    const no = refused(c)
    if (no) return no
    const raw = await body(c)
    const discordId = String(raw.discordId ?? '')
    const code = String(raw.code ?? '').trim()
    if (!SNOWFLAKE.test(discordId) || !CODE.test(code)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const row = await store.takeCode(discordId)
    if (!row || row.expiresAt < now()) {
      if (row) await store.deleteCode(discordId)
      return json(c, { code: 'BAD_CODE' }, 401)
    }
    if ((await store.bumpAttempts(discordId)) > MAX_ATTEMPTS) {
      await store.deleteCode(discordId)
      return json(c, { code: 'BAD_CODE' }, 401)
    }
    if (row.codeHash !== (await otp.hashCode(code, row.email, config.sessionSecret)))
      return json(c, { code: 'BAD_CODE' }, 401)
    await store.deleteCode(discordId)
    await store.link({ discordId, email: row.email })
    await signal.record('discord.linked', {
      email: row.email,
      data: { discord_id: discordId, discord_name: text(raw.discordName, NAME_MAX) },
      dedupeKey: `discord.linked:${discordId}:${row.email}`
    })
    return c.json({ ok: true })
  })

  app.post('/api/discord/events', async (c) => {
    c.header('cache-control', 'no-store')
    const no = refused(c)
    if (no) return no
    const raw = await body(c)
    const kind = Object.hasOwn(EVENTS, raw.kind) ? EVENTS[raw.kind] : null
    const discordId = String(raw.discordId ?? '')
    if (!kind || !SNOWFLAKE.test(discordId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const email = await store.emailOf(discordId)
    if (!email) return c.json({ ok: true, linked: false })
    const data = raw.data && typeof raw.data === 'object' ? raw.data : {}
    const discordName = text(raw.discordName, NAME_MAX)
    if (kind === 'discord.bug_report') {
      const threadId = String(data.threadId ?? '')
      if (!SNOWFLAKE.test(threadId)) return json(c, { code: 'INVALID_REQUEST' }, 400)
      await signal.record(kind, {
        email,
        data: {
          discord_id: discordId,
          discord_name: discordName,
          thread_id: threadId,
          title: text(data.title, TEXT_MAX),
          url: discordUrl(data.url)
        },
        dedupeKey: `discord.bug_report:${threadId}`
      })
    } else {
      await signal.record(kind, { email, data: { discord_id: discordId, discord_name: discordName } })
      // Leaving drops every role on Discord, the beta role with it. Keeping the link would let a
      // member who comes back without proving anything again still report as linked; dropping it
      // makes "linked" and "holds the beta role" the same set. The signal above keeps the history.
      await store.unlink(discordId)
    }
    return c.json({ ok: true, linked: true })
  })

  return app
}
