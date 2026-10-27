/**
 * The doors a site's dsh lane calls to sign somebody in — the last thing that still ran on
 * Cloudflare.
 *
 * WHY THEY ARE HERE NOW (16/09/2026). A lane's gateway (`vendor/tracy/dsh-passwords`) serves
 * a site's own address and loopback, where no OAuth provider will send a browser back, so it cannot
 * run a sign-in round of its own. It opened one against `seats.tracy.ai` instead — a Cloudflare
 * Worker over Supabase, hardcoded in `gateway.ts`. That is why a laptop with no Cloudflare account
 * could not sign into a lane, and why six retired Workers still had a seventh keeping the account
 * alive. These five doors are that Worker's contract, answered from this app's own database.
 *
 * THE ROUND, IN ORDER (Google/GitHub):
 *   1. lane  → `POST /auth/link/browser`      → `{nonce, clientSecret, expiresAt}`   (nobody yet)
 *   2. lane sends the person's browser to `/signin?n=<nonce>&provider=…` on this app
 *   3. person proves an address here (session, or OAuth, or the code by mail)
 *   4. lane  → `GET /auth/link/:nonce`        → `{status:'pending'|'approved'|'expired'}`
 *   5. lane  → `POST /auth/link/:nonce/exchange` with the clientSecret → `{email}`   (one shot)
 *   6. lane  → `GET /sites/:key/seats`        → the site's book, to find that address's role
 * And by mail, where nobody leaves the lane's own page: `POST /auth/otp/start` then
 * `POST /auth/otp/verify`, then the same door 6.
 *
 * 🔒 WHO MAY CALL WHAT, AND WHY IT DIFFERS PER DOOR.
 *   - `/auth/link/browser`, `/auth/link/:nonce`, `/auth/link/:nonce/exchange` are UNSIGNED, exactly
 *     as the Worker had them: at step 1 no identity exists to prove, and afterwards the 256-bit
 *     nonce and client secret ARE the credentials. A poll never returns the address, so a guessed
 *     nonce learns nothing; a wrong client secret destroys the round rather than failing politely,
 *     because a wrong secret means the nonce leaked.
 *   - `/auth/otp/*` and `/sites/:key/seats` REQUIRE `x-tracy-actor` — a 60-second assertion signed
 *     with the secret a lane is configured with (`MCP_TRACY_ACTOR_SECRET`, the same value on both
 *     sides). Without that gate, `/auth/otp/start` is an open mail cannon and the roster is a
 *     public list of a customer's colleagues.
 *
 * THE DESKTOP APP REUSES DOORS 1 AND 2 (07/10/2026). The Mac app opens a round with
 * `purpose: "desktop"` and polls it here like a lane, but redeems it for a session cookie at
 * `POST /auth/link/:nonce/session` in `identity/route.js`, never at `/exchange` — the purpose is
 * fixed when the round opens, and each consuming door takes only its own (`074-auth-link-purpose.sql`).
 *
 * WHAT THIS FILE DOES NOT DO: mint a session for the lane. It answers "this address is proven" and
 * "this is the site's book"; the lane decides what that is worth and mints its own local session
 * (`gateway.ts`'s `grantLaneSession`). Identity is never a right here — the same rule `lib/http.js`
 * states for `/auth/me`.
 */
import { Hono } from 'hono'

import { verifyActor } from '../lib/actor.js'
import { json } from '../lib/http.js'
import { sha256Hex } from '../lib/hmac.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { loginMailLimiter } from '../lib/login-mail-rate.js'
import { matchCode } from '../lib/match-code.js'
import { CODE_TTL_MS } from '../lib/policy.js'

/** The Worker's own window, kept: `LINK_TTL_MS` in `workers/seat-registry/src/index.js`. */
export const LINK_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NONCE = /^[a-f0-9]{64}$/
/** Longest device description a lane may send with a round (`POST /auth/link/browser`). */
const DEVICE_MAX = 120
/** Longest address a round may carry: RFC 5321's path limit, the same bound a form would hit. */
const EMAIL_MAX = 254
/** What a round may be opened for (`074-auth-link-purpose.sql`); absent or null = `lane`. */
const PURPOSES = new Set(['lane', 'desktop'])

/** 256 bits of CSPRNG as hex — the shape the lane already expects for both halves of a round. */
export function randomSecret() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * @param {object} deps
 * @param {import('pg').Pool|null} deps.pool
 * @param {object} deps.config
 * @param {object} deps.store - the identity store (`identity/store.js`), for codes and link rounds.
 * @param {object} deps.mail - `{ send, signInCodeMail }`, as `identityRoutes` receives it.
 * @param {object} deps.seats - `{ seatsOfSite, rosterRow }` — the store function and the mapper
 *   `GET /api/team` answers with, injected by the composition root: this module is a domain and may
 *   not import a sibling one (`test/module-graph.test.mjs`).
 * @param {object} deps.otp - `{ generateCode, hashCode }` from `identity/otp.js`, injected for the
 *   same reason: one implementation of "six digits by mail" in this app, not a second copy here.
 * @param {() => number} [deps.now]
 * @param {object} [deps.mailRate] - the limiter `POST /login` counts in (`lib/login-mail-rate.js`),
 *   handed in by the composition root so both doors spend one per-inbox budget. A router built
 *   without one still caps, on its own count.
 * @returns {import('hono').Hono}
 */
export function laneRoutes({
  beta = null,
  pool,
  config,
  store,
  mail,
  seats,
  otp,
  now = Date.now,
  mailRate = loginMailLimiter({ pool, now })
}) {
  const app = new Hono()

  /** The signed lane, or the 401 to return. `null` secret = no lane may call at all. */
  async function requireActor(c) {
    const email = config.actorSecret
      ? await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret, now())
      : null
    return email ?? json(c, { code: 'UNAUTHENTICATED' }, 401)
  }

  // `null`, an array or a number read as "nothing sent", never as a TypeError on `.email`.
  const body = async (c) => {
    const parsed = await c.req.json().catch(() => ({}))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }
  const address = (raw) =>
    String(raw ?? '')
      .trim()
      .toLowerCase()

  // ── 1. Open a round ─────────────────────────────────────────────────────────────────────────
  //
  // The only moment either secret exists in the clear on the wire. The row is stored hashed and
  // carries no address: what the round is FOR is decided later, by whoever approves it.
  //
  // `device` (optional, #661): a short description the lane gives of itself, shown on the approve
  // page as the lane's OWN words — Tracy cannot check it. Absent, null or blank = none (every lane
  // in the field on 30/09/2026 sends `{}`); anything else that is not a string of at most
  // `DEVICE_MAX` characters is refused rather than cut, so a lane learns its description is wrong.
  //
  // `purpose` (optional, 07/10/2026): `"desktop"` opens a round for the Mac app, which redeems it
  // for a session at `POST /auth/link/:nonce/session` (`identity/route.js`) and never at the lane's
  // `/exchange`. Absent or null = `lane`, so every lane in the field is unchanged, and its answer
  // carries exactly the three fields it always did. A desktop round also gets `matchCode`, the code
  // the approve page prints (`lib/match-code.js`). Any other value is refused, never read as a lane.
  //
  // `email` (optional, desktop rounds only, 11/10/2026): the address the person typed in the app's
  // first-run sign-in form, normalised as `/login` normalises it and kept as `auth_link.email_hint`
  // (`090-auth-link-email-hint.sql`). The browser page then offers a code for that address. A hint
  // decides what is OFFERED, never what is approved. Absent, null or blank = none; a value that is
  // not a well-formed address of at most `EMAIL_MAX` characters, or a hint on a lane round, is
  // refused rather than dropped, so the app learns its request is wrong.
  app.post('/auth/link/browser', async (c) => {
    c.header('cache-control', 'no-store')
    const sent = await body(c)
    const purpose = sent.purpose ?? 'lane'
    if (!PURPOSES.has(purpose)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const raw = sent.device ?? ''
    if (typeof raw !== 'string') return json(c, { code: 'INVALID_REQUEST' }, 400)
    // Control characters (newlines included) carry nothing a one-line description needs.
    const device = [...raw]
      .map((ch) => (ch < ' ' || ch === '\x7f' ? ' ' : ch))
      .join('')
      .trim()
    if (device.length > DEVICE_MAX) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const typed = sent.email ?? ''
    if (typeof typed !== 'string') return json(c, { code: 'INVALID_REQUEST' }, 400)
    const emailHint = address(typed) || null
    if (emailHint && (purpose !== 'desktop' || emailHint.length > EMAIL_MAX || !EMAIL.test(emailHint)))
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const nonce = randomSecret()
    const clientSecret = randomSecret()
    const expiresAt = now() + LINK_TTL_MS
    await store.putLink({
      nonceHash: await sha256Hex(nonce),
      clientSecretHash: await sha256Hex(clientSecret),
      expiresAt,
      device,
      purpose,
      ...(emailHint ? { emailHint } : {})
    })
    if (purpose === 'desktop') return c.json({ nonce, clientSecret, expiresAt, matchCode: matchCode(nonce) })
    return c.json({ nonce, clientSecret, expiresAt })
  })

  // ── 2. Ask whether anybody approved it ──────────────────────────────────────────────────────
  //
  // 🔒 UNKNOWN AND EXPIRED ANSWER THE SAME WORD, on purpose: a caller walking nonces must not be
  // able to tell a round that never existed from one that did. The address is never returned here.
  //
  // `denied` (the person pressed Deny on `/signin`) is said only to a DESKTOP round, whose app stops
  // polling on it. A lane's gateway knows three words; its denied round reads `expired`, the word
  // it already acts on.
  app.get('/auth/link/:nonce', async (c) => {
    c.header('cache-control', 'no-store')
    const nonce = c.req.param('nonce')
    if (!NONCE.test(nonce)) return c.json({ status: 'expired' })
    const row = await store.linkByNonce(await sha256Hex(nonce))
    if (!row || row.status === 'consumed' || row.expiresAt < now()) return c.json({ status: 'expired' })
    if (row.status === 'denied') return c.json({ status: row.purpose === 'desktop' ? 'denied' : 'expired' })
    return c.json({ status: row.status === 'approved' ? 'approved' : 'pending' })
  })

  // ── 3. Trade the round for the address ──────────────────────────────────────────────────────
  //
  // 🔒 ONE SHOT, AND A WRONG SECRET BURNS IT. `takeLink` deletes the row before the comparison, so
  // a replay finds nothing and a guesser gets exactly one attempt at 256 bits. A round approved but
  // never exchanged simply expires. A DESKTOP round is invisible here: `takeLink` takes only lane
  // rows, so it answers `LINK_INVALID` and leaves the round to the app's own door.
  app.post('/auth/link/:nonce/exchange', async (c) => {
    c.header('cache-control', 'no-store')
    const nonce = c.req.param('nonce')
    const clientSecret = String((await body(c)).clientSecret ?? '')
    if (!NONCE.test(nonce) || clientSecret === '') return json(c, { code: 'LINK_INVALID' }, 400)
    const row = await store.takeLink(await sha256Hex(nonce))
    if (!row || row.expiresAt < now() || row.status !== 'approved' || row.email === '') {
      return json(c, { code: 'LINK_INVALID' }, 400)
    }
    if (row.clientSecretHash !== (await sha256Hex(clientSecret))) {
      return json(c, { code: 'LINK_INVALID' }, 400)
    }
    return c.json({ email: row.email })
  })

  // ── 4. The mail branch: ask for a code ──────────────────────────────────────────────────────
  //
  // 🔒 THE ANSWER NEVER SAYS WHETHER AN ADDRESS IS KNOWN — `{ok:true}` for every address that was
  // mailed, or the lane's sign-in page becomes a way to enumerate a customer's staff. It is the same
  // code, the same table and the same mail as `/login`: one implementation of "six digits by mail".
  //
  // 🔒 AND THE SAME CAP (#805). Until 03/10/2026 this door mailed for every signed request: a lane,
  // or anything holding the actor secret, could fill one inbox, and each call replaced the code
  // already sent (`putCode` resets the attempt count). It now counts before a code exists or a mail
  // leaves, and answers `429 RATE_LIMITED` — the status the gateway already passes on as 429:
  //   - in `/login`'s per-inbox bucket (five an hour), ONE budget for the two doors;
  //   - in its own per-caller bucket (`lane-mail:`, three hundred an hour), NOT in `/login`'s
  //     thirty: the calling address is the fleet host's, and one host serves every site (ADR 0014),
  //     so `/login`'s person-sized bucket would be shared by every customer site on the machine.
  // Counted only AFTER the caller is proven and the address is well-formed, so a refused request
  // spends nobody's budget. With the beta gate on, the answer over the cap is the gate's own quiet
  // `{ok:true}`, and nothing is queued.
  app.post('/auth/otp/start', async (c) => {
    c.header('cache-control', 'no-store')
    const actor = await requireActor(c)
    if (actor instanceof Response) return actor
    const email = address((await body(c)).email)
    if (!EMAIL.test(email)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    // No transport, or one that says it cannot send (#804: `MAIL` missing outside local preview).
    // Before the cap and before the beta gate's quiet `{ok:true}`, so neither hides it; the answer
    // depends on the deployment only, never on the address, so it tells a caller nothing about one.
    if (!mail?.send || mail.available === false) return json(c, { code: 'MAIL_UNAVAILABLE' }, 503)
    if (await mailRate.overLane(c, email)) {
      if (beta?.access.enabled) return c.json({ ok: true })
      return json(c, { code: 'RATE_LIMITED' }, 429)
    }
    if (beta?.access.enabled) {
      await beta.enqueue(email, undefined, requestLanguage(c))
      return c.json({ ok: true })
    }
    const code = otp.generateCode()
    await store.putCode({
      email,
      codeHash: await otp.hashCode(code, email, config.sessionSecret),
      expiresAt: now() + CODE_TTL_MS
    })
    await mail.send({ to: email, ...mail.signInCodeMail(code, requestLanguage(c)) })
    return c.json({ ok: true })
  })

  // ── 5. The mail branch: type it ─────────────────────────────────────────────────────────────
  //
  // Attempts are bumped BEFORE the comparison, the ordering `identity/route.js`'s `/verify` explains
  // in full: comparing first leaves a window where parallel guesses all read the same count.
  app.post('/auth/otp/verify', async (c) => {
    c.header('cache-control', 'no-store')
    const actor = await requireActor(c)
    if (actor instanceof Response) return actor
    const raw = await body(c)
    const email = address(raw.email)
    const code = String(raw.code ?? '').trim()
    if (!EMAIL.test(email) || code === '') return json(c, { code: 'INVALID_REQUEST' }, 400)
    const row = await store.takeCode(email)
    if (!row || row.expiresAt < now()) {
      if (row) await store.deleteCode(email)
      return json(c, { code: 'BAD_CODE' }, 401)
    }
    const attempts = await store.bumpAttempts(email)
    if (attempts > MAX_ATTEMPTS) {
      await store.deleteCode(email)
      return json(c, { code: 'BAD_CODE' }, 401)
    }
    if (row.codeHash !== (await otp.hashCode(code, email, config.sessionSecret))) {
      return json(c, { code: 'BAD_CODE' }, 401)
    }
    let admission = row.admission ?? { status: 'allow', badge: 'gate off', plans: [], gate: false }
    if (beta?.access.enabled && (!admission.gate || admission.badge === 'seat invite'))
      admission = await beta.access.decide(email)
    // Gate off: `decide` refuses nobody and only reads the JoomlArt plan for `/ops`.
    else if (beta && !beta.access.enabled) admission = await beta.access.decide(email)
    if (admission.status !== 'allow') {
      await store.deleteCode(email)
      return json(c, { code: 'BAD_CODE' }, 401)
    }
    await store.deleteCode(email)
    await store.touchAccount(email, { admission, via: 'email code' })
    return c.json({ ok: true, email })
  })

  // ── 6. The site's book ──────────────────────────────────────────────────────────────────────
  //
  // ⚠ THE PATH IS `/sites/:key/seats`, NOT `/roster`. `gateway.ts:2523` carries a comment about the
  // day that was typed the other way: the seat book answered 404, every sign-in path read it as
  // "this address has no seat", and a door that was refusing the site's OWNER said so in the words
  // of a permission error.
  //
  // The caller is a lane, signed with the actor secret; the lane asks on behalf of an address it has
  // just proven, and `gateway.ts` reads the row for that address out of the answer. A lane that is
  // not configured with the secret gets 401 and the person sees "the seat book cannot be reached",
  // never a session.
  app.get('/sites/:key/seats', async (c) => {
    c.header('cache-control', 'no-store')
    const actor = await requireActor(c)
    if (actor instanceof Response) return actor
    if (!pool) return json(c, { code: 'SEAT_STORE_UNAVAILABLE' }, 502)
    const rows = await seats.seatsOfSite(pool, c.req.param('key'))
    return c.json({ seats: rows.map((row) => seats.rosterRow(row)) })
  })

  // ── 7. "Do the two of us hold the same secret?" ──────────────────────────────────────────────
  //
  // The whole door: verify the assertion, answer yes. It exists because NOTHING ON EITHER SIDE EVER
  // ASKED. `MCP_TRACY_ACTOR_SECRET` is one value that must be the same in two places nobody edits
  // together — this app's env file, and the gateway's `dsh-passwords.env` inside the dsh — and when
  // they drift, every door above answers 401 to a caller that is behaving perfectly. Measured on the
  // dev machine 17/09: the two halves had never matched since the machine was built on 10/09, ten
  // days in which every agent write through `/api/sites/:key/apply` failed with `NOT_SIGNED_IN` and
  // every healthcheck stayed green, because each one only ever probed its own port.
  //
  // 🔒 IT IS NOT AN ORACLE. It tells a caller whether a token it already holds verifies — which the
  // Apply door already tells it, by answering 401 rather than 403. It reads nothing, writes nothing,
  // and names nobody: the address inside the assertion is deliberately not echoed, so a leaked
  // assertion learns no more here than it does anywhere else.
  app.get('/auth/actor-check', async (c) => {
    c.header('cache-control', 'no-store')
    const actor = await requireActor(c)
    if (actor instanceof Response) return actor
    return c.json({ ok: true })
  })

  return app
}
