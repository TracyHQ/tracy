/**
 * Tracy's sign-ins: an email with a six-digit code, or straight to Google/GitHub — three doors,
 * one session cookie either way.
 */
import { Hono } from 'hono'
import { signOutCookies } from '../lib/cookies.js'
import { generateCode, hashCode } from './otp.js'
import {
  authorizeUrl,
  exchangeCode,
  randomState,
  stateCookie,
  clearStateCookie,
  OAuthError,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  PROVIDERS
} from './oauth.js'
import { buildRequest, parseResponse } from './joomlart-sso.js'
import {
  mintSession,
  sessionFromCookieHeader,
  endViewSession,
  sessionWithExpiry,
  sessionDueForRenewal,
  sessionCookie,
  cookieDomainFor,
  revokeSessionsIn
} from '../lib/session.js'
import { sha256Hex } from '../lib/hmac.js'
import { json } from '../lib/http.js'
import { parseCookies } from '../lib/cookies.js'
import { clientIp, loginMailLimiter } from '../lib/login-mail-rate.js'
import { matchCode } from '../lib/match-code.js'
import { memoryRateLimiter, overLimitOrClosed } from '../lib/rate.js'
import { personFace } from '../lib/person-face.js'
import { avatarSource } from '../lib/avatar-source.js'
import { avatarPictures } from './avatar.js'
import {
  CODE_TTL_MS,
  DESKTOP_LINK_SESSION_LIMIT_PER_IP_PER_HOUR,
  LOGIN_VISITS_PER_IP_PER_HOUR,
  MAX_ATTEMPTS
} from '../lib/policy.js'
import { safePath } from '../lib/safe-path.js'
import { nextWithRef, referrerOf } from '../lib/referrer.js'
import { requestSource, signInSource, visitReferrer, withSource } from '../lib/sign-in-source.js'
import { hardenPage, renderedPage } from '../lib/security-headers.js'
import { browserCookie, browserIdOf, newBrowserId, roundToken, roundTokenMatches } from './signin-guard.js'
import {
  desktopCodePage,
  desktopConfirmPage,
  desktopMismatchPage,
  deviceApprovedPage,
  deviceConfirmPage,
  deviceDeniedPage,
  loginPage,
  signInFailedPage
} from './pages.js'
import { LANGUAGE_COOKIE, matchLanguage, requestLanguage, translate } from '../lib/i18n/index.js'

export { safePath }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NONCE = /^[a-f0-9]{64}$/
/** An account id (`account.id`, a uuid) — anything else names no account and never reaches SQL. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How long a browser keeps a picture: a day. A new picture comes under a new address anyway. */
const AVATAR_MAX_AGE_S = 86400
/** A client secret as `POST /auth/link/browser` hands it out: 256 bits as hex. */
const CLIENT_SECRET = /^[a-f0-9]{64}$/

/** Key of the sentence a stale or already-approved round shows (`../lib/i18n/strings.js`). */
const LINK_GONE = 'device.linkGone'

/**
 * The JoomlArt template id a `next` asks for, or null: only `/`, `/new` and `/new/` with a
 * `template=` the workspace's own door accepts (`workspace/template-intent.js` — the same three
 * paths and the same id shape, typed out here because identity may not import a sibling domain).
 * @param {string} next a path `safePath` already passed
 */
function templateAskOf(next) {
  let url
  try {
    url = new URL(next, 'http://tracy.invalid')
  } catch {
    return null
  }
  if (!['/', '/new', '/new/'].includes(url.pathname)) return null
  const template = url.searchParams.get('template') ?? ''
  return /^[a-z0-9][a-z0-9-]*$/.test(template) ? template : null
}

/** The identity provider name of a "Login with JoomlArt" sign-in, as the `identity` row says it. */
const JOOMLART = 'joomlart'
/** How long a JoomlArt round may take: the row's life and the `exp` aMember is told to refuse after. */
const JOOMLART_ROUND_MS = 5 * 60 * 1000

/**
 * The beta admission rule for a JoomlArt sign-in (PO decision, plan B3): the person is admitted
 * when aMember's `entitlement` holds at least one item that is `paid` and not expired
 * (`expires_at` null, or a date still ahead of `at`). Answers those items as the admission's
 * `plans` (`{id, name, until}`, the shape `/ops` prints), or `[]` — in which case the sign-in goes
 * through the same gate every other door uses. Strict on purpose: `paid` must be the boolean true,
 * `expires_at` must be null or a parseable date; anything else is not an entitlement.
 * @param {Array<Record<string, unknown>>} entitlement
 * @param {number} at ms since the epoch
 */
function paidEntitlement(entitlement, at) {
  const plans = []
  for (const item of entitlement) {
    if (item.paid !== true) continue
    const ends = item.expires_at
    if (ends !== null && !(typeof ends === 'string' && Date.parse(ends) > at)) continue
    plans.push({
      id: String(item.product_id ?? ''),
      name: String(item.name ?? ''),
      until: typeof ends === 'string' ? ends.slice(0, 10) : 'no end'
    })
  }
  return plans
}

/** A body read as an object whatever arrived — `null`, a number, an array or a parse failure all
 * read as "nothing was sent", never as a TypeError on the first property access. */
function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** A real browser `<form>` submission (`application/x-www-form-urlencoded` or
 * `multipart/form-data`), as opposed to the JSON body `loginScript`'s own `fetch` calls send. */
function isForm(c) {
  const contentType = c.req.header('content-type') ?? ''
  return contentType.includes('form-urlencoded') || contentType.includes('multipart/form-data')
}

/** The `tracy_lang` pick (Settings › Language), as one of the eight languages, or null. */
function pickedLanguage(c) {
  try {
    return matchLanguage(
      decodeURIComponent(parseCookies(c.req.header('cookie') ?? null).get(LANGUAGE_COOKIE) ?? '')
    )
  } catch {
    return null
  }
}

/**
 * The language a request STATES, or null when it states none Tracy speaks (plan T7, Q9). Same order
 * as `requestLanguage` (`?lang=`, the `tracy_lang` pick, `Accept-Language`), minus its last step:
 * the English it falls back to when nothing matched is not a preference, so it must never replace
 * a language the account already holds. A browser that asks for English does state English.
 */
function statedLanguage(c) {
  const lang = requestLanguage(c)
  if (lang !== 'en') return lang
  if (matchLanguage(c.req.query('lang')) === 'en' || pickedLanguage(c) === 'en') return 'en'
  const accepted = String(c.req.header('accept-language') ?? '')
    .split(',')
    .filter((part) => !/;\s*q\s*=\s*0(?:\.0*)?\s*$/i.test(part))
    .map((part) => matchLanguage(part.split(';')[0]))
  return accepted.includes('en') ? 'en' : null
}

export function identityRoutes({
  store,
  mail,
  config,
  now = Date.now,
  pool = null,
  seats = null,
  fetchImpl = fetch,
  beta = null,
  signal = null,
  onOAuthSession = null,
  // #664, #805: the composition root hands the SAME limiter to `lanes/route.js`, so a code asked
  // for there counts here too. A router built without one still caps, on its own count.
  mailRate = loginMailLimiter({ pool, now }),
  // `GET /auth/avatar/:accountId`'s fetch-and-keep half (`./avatar.js`).
  pictures = avatarPictures({ fetchImpl, now }),
  // The shard beta's sign-in hooks (`shards/sign-in.js`: afterSignIn, atLogin), a sibling domain's,
  // handed in by the composition root; null on a shard and on a stand without a database.
  // afterSignIn runs before a session is minted and may answer `503 NO_SHARD_ACCEPTING` instead of
  // null (spec §13 S40). Nothing runs before a code: `POST /login` is untouched (#794).
  shards = null
}) {
  const app = new Hono()
  // Per REQUEST, not per process: which `Domain=` is writable depends on the host the browser
  // actually used, and `SITE_DOMAIN_ALIASES` means that is not always under `sessionDomain`.
  // See `cookieDomainFor`'s own docblock for what a mismatched Domain costs (a sign-in that
  // reports success and leaves the person signed out).
  const optsFor = (c) => ({
    // The name this deployment writes its session under: `tracy_sess`, or a shard's own.
    name: config.sessionCookieName,
    domain: cookieDomainFor(c.req.header('host'), config.sessionDomain),
    secure: config.secure
  })

  /**
   * Remember the language a sign-in or a page load states (`account.language`, ADR 0026 §5), so
   * mail somebody else triggers reaches this person in it. Never fails the request it rides on.
   * @param {string|null} language - null states nothing and writes nothing.
   */
  const rememberLanguage = async (email, language) => {
    if (!email || !language || typeof store.rememberLanguage !== 'function') return
    try {
      await store.rememberLanguage(email, language)
    } catch (error) {
      console.warn(`[identity] language not saved: ${error?.message ?? error}`)
    }
  }

  /**
   * Keep the picture and name the provider's profile carried (09/10/2026: "my email already has an
   * avatar everywhere"). Only a picture from a provider CDN (`avatarSource`) is kept; the store
   * decides what may be replaced. Never fails the sign-in it rides on.
   */
  const rememberProfile = async (accountId, { name = null, picture = null }) => {
    if (!accountId || typeof store.rememberProfile !== 'function') return
    try {
      await store.rememberProfile(accountId, { name, picture: avatarSource(picture) })
    } catch (error) {
      console.warn(`[identity] profile not saved: ${error?.message ?? error}`)
    }
  }

  /** Start a session for `email` on this response — the one way every sign-in door sets it. */
  const startSession = async (c, email) => {
    const token = await mintSession(email, config.sessionSecret, now())
    // Appended, never replacing: the shard hook may have set the person's pointer on this answer first.
    c.header('set-cookie', sessionCookie(token, optsFor(c)), { append: true })
  }

  /**
   * Hono drops what `c.header` set when a handler returns a RAW `Response` (the S40 refusal is one),
   * so the callbacks' clear-state cookie is put on that Response itself: the state nonce is spent
   * and must not stay in the browser.
   */
  const withStateCleared = (c, response) => {
    response.headers.append('set-cookie', clearStateCookie(optsFor(c)))
    return response
  }

  // The desktop redeem door's own count per client address. With a database, the shared
  // `rate_bucket` table and a fail-closed read (`lib/rate.js`); without one, this instance's count.
  const desktopRate = pool ? null : memoryRateLimiter()
  const overDesktopLimit = (c) => {
    const bucket = `desktop-link:${clientIp(c)}`
    const limit = DESKTOP_LINK_SESSION_LIMIT_PER_IP_PER_HOUR
    return pool ? overLimitOrClosed(pool, bucket, limit, now()) : desktopRate.overLimit(bucket, limit, now())
  }

  // What the caller asked for (#796): a browser NAVIGATION carries `text/html` in `Accept`, a
  // `fetch` does not. The same test `workspace/route.js` uses to pick a page over a code.
  const wantsHtml = (c) => (c.req.header('accept') ?? '').includes('text/html')

  /** A sign-in that did not finish: a page with a way back for a navigation, else `null`. */
  const failedPage = (c, reason, status, { provider, next } = {}) =>
    wantsHtml(c)
      ? renderedPage(
          c,
          signInFailedPage({ reason, provider, next, origin: config.origin, lang: requestLanguage(c) }),
          status
        )
      : null

  // Where a person whose address is not admitted yet goes next: the deployment's own whitelist
  // page, the same one the OAuth callback redirects to. Empty while the beta gate is off.
  const waitlistUrl = (() => {
    if (!beta?.access.enabled || !config.beta?.waitlistUrl) return ''
    const target = new URL(config.beta.waitlistUrl)
    if (config.beta.waitlistMode !== 'wordpress') target.searchParams.set('check', '1')
    return target.toString()
  })()

  /**
   * 🔒 A PERSON WHO IS ALREADY SIGNED IN IS SENT ON, NOT ASKED AGAIN. Measured 19/09 on
   * `cowork.tracy.site`: the Design inspiration page linked at `/login?next=/agent?…` for every
   * visitor, and this door answered 200 with a form regardless of the cookie — so the first press
   * of the whole product showed a signed-in person a sign-in screen. `buildUrl`
   * (`packages/web/tracy-design-page/src/templates.mjs`) no longer writes such a link, and this is
   * the other half: every `/login?next=…` already handed out — in the badge on customer sites, in
   * old tabs, in anything shared — stops asking.
   *
   * `next` goes through `safePath`, the same gate `/signin/:provider` and the form post use, so a
   * crafted link cannot turn a held session into an open redirect.
   */
  app.get('/login', async (c) => {
    let next = c.req.query('next')
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    // A `next` on a shard (spec §2.2): kept through the sign-in, or handed to the shard at once.
    const routed = shards ? await shards.atLogin(c, email, next) : null
    if (routed instanceof Response) return routed
    if (routed) next = routed.next
    if (email) return c.redirect(safePath(next ?? '/', config.origin), 302)
    // Where this sign-in came from (`lib/sign-in-source.js`): the link's own `utm_*`, else the ones
    // inside `next`: a guarded page such as `/` or `/new/…` sends a signed-out visitor here with
    // its whole address in `next`. The page carries it on as hidden fields to `POST /login`.
    const source = requestSource(new URL(c.req.url).searchParams, next, config.origin)
    return renderedPage(
      c,
      loginPage({
        lang: requestLanguage(c),
        explicitLang: matchLanguage(c.req.query('lang')),
        next,
        source,
        email: c.req.query('email'),
        origin: config.origin,
        localPreview: config.localLoginPreview,
        oauth: config.oauth,
        waitlistUrl,
        // The desktop app's first run (contract item 1): exactly `1`, anything else is the plain page.
        onboard: c.req.query('onboard') === '1',
        // Why the desktop app came back here; `loginPage` draws only the words it knows.
        reason: c.req.query('reason') ?? null
      })
    )
  })

  /**
   * A signed-out visit to `/login` (`login.visited`, usage). Sent by the page's own script once per tab,
   * never by the GET above: mail scanners fetch every link in a message but run no script, so counting
   * the GET would credit a mail campaign with visits nobody made. With the first sign-ins
   * `account.first_sign_in` already counts, this gives every source its visit-to-sign-in rate.
   *
   * Kept: the four cleaned source values the link carried (`signInSource`) and the host of the page that
   * linked here (`visitReferrer`), either or both or neither; a row with neither is a direct visit. No
   * account, no address, no cookie. The page's own origin only, and at most `LOGIN_VISITS_PER_IP_PER_HOUR`
   * a client address, so a script elsewhere cannot fill the table. Answers 204 whatever it kept: the page
   * never waits on it.
   */
  const loginVisitRate = pool ? null : memoryRateLimiter()
  app.post('/login/visit', async (c) => {
    c.header('cache-control', 'no-store')
    // The page's own script only: `Sec-Fetch-Site` where the browser sends it (an alias host is still
    // same-origin), else `Origin`, the order `lib/csrf.js` reads them in.
    const site = c.req.header('sec-fetch-site')
    if (site ? site !== 'same-origin' : c.req.header('origin') !== config.origin)
      return json(c, { code: 'FORBIDDEN' }, 403)
    const body = await c.req.json().catch(() => null)
    if (!signal || !body || typeof body !== 'object' || Array.isArray(body)) return c.body(null, 204)
    const referrer = visitReferrer(body)
    const data = { ...signInSource(body), ...(referrer ? { referrer } : {}) }
    const bucket = `login-visit:${await sha256Hex(clientIp(c))}`
    const over = pool
      ? await overLimitOrClosed(pool, bucket, LOGIN_VISITS_PER_IP_PER_HOUR, now())
      : loginVisitRate.overLimit(bucket, LOGIN_VISITS_PER_IP_PER_HOUR, now())
    if (over) return json(c, { code: 'RATE_LIMITED' }, 429)
    await signal.record('login.visited', { data })
    return c.body(null, 204)
  })

  /**
   * The two ways a signed-out person starts signing in from `/login`: an email code asked for
   * (`login.code_requested`, `POST /login` accepted) and a provider sign-in begun (`login.oauth_started`,
   * `GET /signin/:provider`). Usage only: next to `login.visited` and `account.first_sign_in` they show,
   * for each source, how many visits went on to start and how many finished. Kept like a visit: the
   * cleaned source values (and the provider), never the address, at most `LOGIN_VISITS_PER_IP_PER_HOUR`
   * a client address. Sign-in never waits on it and never fails because of it.
   */
  const signInStartRate = pool ? null : memoryRateLimiter()
  const recordSignInStart = async (c, kind, data) => {
    if (!signal) return
    try {
      const bucket = `login-start:${await sha256Hex(clientIp(c))}`
      const over = pool
        ? await overLimitOrClosed(pool, bucket, LOGIN_VISITS_PER_IP_PER_HOUR, now())
        : signInStartRate.overLimit(bucket, LOGIN_VISITS_PER_IP_PER_HOUR, now())
      if (!over) await signal.record(kind, { data })
    } catch {
      // A usage row is never worth a failed sign-in.
    }
  }

  // Review round 2, finding 2: both doors below used to answer JSON only, and the page's own
  // forms carried no method/action/name to post with — a sign-in page that needs JavaScript to
  // submit fails silently for anyone whose script did not load, and this is the one page nobody
  // can route around. `isFormPost` tells a REAL browser form submission (what a script-disabled
  // visitor sends) from the JSON body `loginScript`'s own `fetch` calls send; the JSON branch
  // below is BYTE-FOR-BYTE the original behaviour, so every existing JSON-speaking caller (and
  // this file's own progressive-enhancement script) is unaffected.
  app.post('/login', async (c) => {
    c.header('cache-control', 'no-store')
    const isFormPost = isForm(c)
    const raw = asObject(
      isFormPost
        ? await c.req
            .formData()
            .then((form) => Object.fromEntries(form.entries()))
            .catch(() => ({}))
        : await c.req.json().catch(() => ({}))
    )
    const email = String(raw.email ?? '')
      .trim()
      .toLowerCase()
    const next = isFormPost ? String(raw.next ?? '') : undefined
    // The page's hidden `utm_*` fields (a form post, or the script's JSON body), else (for a form
    // post only, the JSON body carries no `next`) the ones inside `next`. Cleaned on every read:
    // nothing that came back from the browser is trusted as it was rendered.
    const source = isFormPost ? requestSource(raw, next, config.origin) : signInSource(raw)

    if (!EMAIL.test(email)) {
      if (isFormPost) {
        return renderedPage(
          c,
          loginPage({
            lang: requestLanguage(c),
            explicitLang: matchLanguage(c.req.query('lang')),
            next,
            source,
            email: raw.email,
            origin: config.origin,
            localPreview: config.localLoginPreview,
            oauth: config.oauth,
            waitlistUrl,
            error: translate(requestLanguage(c), 'login.invalidEmail')
          }),
          400
        )
      }
      return c.json({ code: 'INVALID_EMAIL' }, 400)
    }
    // 🔒 #804: no mail provider (`MAIL` missing outside local preview) is said here, before the cap
    // and before the beta gate's quiet answer, so neither reports a mail that will never leave. No
    // code is written. The answer depends on the deployment only, never on the address.
    if (mail.available === false) {
      if (isFormPost) {
        return renderedPage(
          c,
          loginPage({
            lang: requestLanguage(c),
            explicitLang: matchLanguage(c.req.query('lang')),
            next,
            source,
            email,
            origin: config.origin,
            localPreview: config.localLoginPreview,
            oauth: config.oauth,
            error: translate(requestLanguage(c), 'login.sendFailed')
          }),
          503
        )
      }
      return c.json({ code: 'MAIL_UNAVAILABLE' }, 503)
    }
    // 🔒 #664: before a code exists or a mail leaves. Both buckets are counted on every request,
    // so neither can be emptied by spending the other; the address is the normalised one above, so
    // `Lee@X` and ` lee@x ` are one inbox. A refused request writes no code and touches none: the
    // code table is left as it was, and the answer says nothing about a code (#794).
    if (await mailRate.over(c, email)) {
      if (beta?.access.enabled) {
        if (isFormPost)
          return renderedPage(
            c,
            loginPage({
              lang: requestLanguage(c),
              explicitLang: matchLanguage(c.req.query('lang')),
              next,
              source,
              email,
              origin: config.origin,
              localPreview: config.localLoginPreview,
              oauth: config.oauth,
              waitlistUrl,
              step: 'code'
            })
          )
        return c.json({ ok: true })
      }
      if (isFormPost) {
        return renderedPage(
          c,
          loginPage({
            lang: requestLanguage(c),
            explicitLang: matchLanguage(c.req.query('lang')),
            next,
            source,
            email,
            origin: config.origin,
            localPreview: config.localLoginPreview,
            oauth: config.oauth,
            waitlistUrl,
            error: translate(requestLanguage(c), 'login.rateLimited')
          }),
          429
        )
      }
      return c.json({ code: 'RATE_LIMITED' }, 429)
    }
    await recordSignInStart(c, 'login.code_requested', source ?? {})
    if (beta?.access.enabled) {
      await beta.enqueue(email, undefined, requestLanguage(c), source)
      if (isFormPost)
        return renderedPage(
          c,
          loginPage({
            lang: requestLanguage(c),
            explicitLang: matchLanguage(c.req.query('lang')),
            next,
            source,
            email,
            origin: config.origin,
            localPreview: config.localLoginPreview,
            oauth: config.oauth,
            waitlistUrl,
            step: 'code'
          })
        )
      return c.json({ ok: true })
    }
    const code = generateCode()
    await store.putCode({
      email,
      codeHash: await hashCode(code, email, config.sessionSecret),
      expiresAt: now() + CODE_TTL_MS,
      // With no source the row stays exactly as before (`admission` null, read as "gate off").
      ...(source ? { admission: { status: 'allow', badge: 'gate off', plans: [], gate: false, source } } : {})
    })
    await mail.send({ to: email, ...mail.signInCodeMail(code, requestLanguage(c)) })
    if (isFormPost) {
      return renderedPage(
        c,
        loginPage({
          lang: requestLanguage(c),
          explicitLang: matchLanguage(c.req.query('lang')),
          next,
          source,
          email,
          origin: config.origin,
          localPreview: config.localLoginPreview,
          oauth: config.oauth,
          waitlistUrl,
          step: 'code',
          localCode: config.localLoginPreview ? code : ''
        })
      )
    }
    return c.json({ ok: true, ...(config.localLoginPreview ? { localCode: code } : {}) })
  })

  app.post('/verify', async (c) => {
    c.header('cache-control', 'no-store')
    const isFormPost = isForm(c)
    let email
    let code
    let next
    // Read only to draw the page again on a refusal, so its resend form keeps the source.
    let source = null
    if (isFormPost) {
      const form = await c.req.formData().catch(() => new FormData())
      email = String(form.get('email') ?? '')
        .trim()
        .toLowerCase()
      // Six same-named `code` inputs (`loginPage`'s own six boxes) arrive as six separate form
      // entries — the shape a real browser sends them in, matching the Worker's own
      // `otp-slot` markup. `getAll` reassembles the digits in the order they were posted.
      code = form.getAll('code').join('').trim()
      next = String(form.get('next') ?? '')
      source = signInSource(form)
    } else {
      const body = asObject(await c.req.json().catch(() => ({})))
      email = String(body.email ?? '')
        .trim()
        .toLowerCase()
      code = String(body.code ?? '').trim()
    }

    // `reason` (#796) is set only after the code itself was right: the inbox proved itself and
    // admission then refused the address. That is not a wrong code, and saying "that code did not
    // work" sent the person to ask for another one that would be refused the same way. The status
    // and `code` stay what every failed verify answers; a wrong, stale or burned code carries no
    // `reason`, so nothing about admission is said to somebody who cannot read the inbox.
    const invalid = (status, reason = null) =>
      isFormPost
        ? renderedPage(
            c,
            loginPage({
              lang: requestLanguage(c),
              explicitLang: matchLanguage(c.req.query('lang')),
              next,
              source,
              email,
              origin: config.origin,
              localPreview: config.localLoginPreview,
              oauth: config.oauth,
              waitlistUrl,
              step: 'code',
              showWaitlist: reason === 'NOT_ADMITTED',
              error: translate(
                requestLanguage(c),
                reason === 'NOT_ADMITTED'
                  ? 'login.notAdmitted'
                  : reason === 'ACCESS_UNAVAILABLE'
                    ? 'login.accessUnavailable'
                    : 'login.codeInvalid'
              )
            }),
            status
          )
        : c.json({ code: 'CODE_INVALID', ...(reason ? { reason } : {}) }, status)

    const row = await store.takeCode(email)
    if (!row || row.expiresAt < now()) {
      if (row) await store.deleteCode(email)
      return invalid(401)
    }
    // Bump BEFORE comparing, not after: comparing first (the brief's original order) leaves a
    // window — between reading the row and the hash-comparison's own await — where N parallel
    // guesses all read the same pre-bump count and all get compared, so the cap is unbounded
    // under concurrency. Bumping right here, before any further await, closes it.
    const attempts = await store.bumpAttempts(email)
    if (attempts > MAX_ATTEMPTS) {
      await store.deleteCode(email)
      return invalid(401)
    }
    if (row.codeHash !== (await hashCode(code, email, config.sessionSecret))) {
      return invalid(401)
    }
    let admission = row.admission ?? { status: 'allow', badge: 'gate off', plans: [], gate: false }
    // A fresh decision replaces the whole admission; the source the code was asked with stays.
    if (beta?.access.enabled && (!admission.gate || admission.badge === 'seat invite'))
      admission = withSource(await beta.access.decide(email), admission.source)
    // Gate off: `decide` refuses nobody and only reads the JoomlArt plan for `/ops`.
    else if (beta && !beta.access.enabled)
      admission = withSource(await beta.access.decide(email), admission.source)
    if (admission.status !== 'allow') {
      await store.deleteCode(email)
      // `waitlist` is the one status by which the gate says "not admitted" (`lib/beta-access.js`).
      // Every other answer — `unavailable`, `error`, a status nobody defined — decided nothing
      // about the address, so it is never told to go and ask for a place.
      return invalid(401, admission.status === 'waitlist' ? 'NOT_ADMITTED' : 'ACCESS_UNAVAILABLE')
    }
    await store.deleteCode(email)
    await store.touchAccount(email, { admission, via: 'email code' })
    await rememberLanguage(email, statedLanguage(c))
    // The shard hook decides BEFORE the session is minted (S40): a new person no shard takes gets
    // `503 NO_SHARD_ACCEPTING` and no `tracy_sess`; everybody else gets their pointer, then the session.
    const refusedSignIn = shards ? await shards.afterSignIn(c, email, { json: !isFormPost }) : null
    if (refusedSignIn) return refusedSignIn
    await startSession(c, email)
    if (isFormPost) {
      // A real form post expects a full-page navigation back, not a JSON body — `safePath`
      // (this file's own export, never a second sanitizer) is the same gate `/signin/:provider`
      // and `loginPage`'s script both already route every `next` value through.
      return c.redirect(safePath(next, config.origin), 303)
    }
    return c.json({ ok: true, email })
  })

  // Every page asks this once on load, which makes it the one door that renews a session: a
  // session older than an hour is re-minted, so it lapses only after a week without a page
  // opened (`SESSION_RENEW_AFTER_S` says why, #294).
  app.get('/auth/me', async (c) => {
    const session = await sessionWithExpiry(c.req.header('cookie'), config.sessionSecret, now())
    const email = session?.email ?? null
    // An admin's view (`/ops` › View as user) is the customer's page seen read-only: it is never
    // renewed into a real sign-in, and it counts as nobody's activity or language pick.
    const viewing = Boolean(session?.act)
    if (session && !viewing && sessionDueForRenewal(session.exp, now())) {
      // Same sign-in, same `jti`: signing out with an older copy still ends this one.
      const token = await mintSession(session.email, config.sessionSecret, now(), {
        jti: session.jti ?? undefined
      })
      c.header('set-cookie', sessionCookie(token, optsFor(c)))
    }
    // The viewer's account, read once for both the activity signal and the face. The seat book's
    // lookup carries `display_name` and `avatar_url` (a sibling domain, handed in by the
    // composition root); without a database, the identity store's own `{ id, email }` still gives
    // a face (the email's letter, the account's colour).
    const account = email
      ? ((pool && seats?.accountByEmail
          ? await seats.accountByEmail(pool, email)
          : await store.accountByEmail?.(email)) ?? null)
      : null
    if (email && signal && !viewing) await signal.active(account?.id)
    // A language picked in Settings › Language writes the `tracy_lang` cookie in the browser only
    // (`@tracy/dsh-settings` language-cookie.ts); every page asks this door on load, so the pick
    // reaches the account here, with no door of its own. Only the pick: the device's language is
    // remembered at sign-in, and an absent cookie ("Follow device") changes nothing stored.
    if (account && !viewing) await rememberLanguage(email, pickedLanguage(c))
    const defaultSite = email && pool && seats ? await seats.defaultSiteFor(pool, email) : null
    // `face` (`lib/person-face.js`): the same letter and colour the Team roster and the comment
    // doors give this account, so a comment the viewer is still sending can wear it. Null when
    // nobody is signed in, or the session names an address with no account row.
    const face = account?.id ? personFace({ ...account, email: account.email ?? email }) : null
    // `name`: the account's display name for the account menu, null when there is none to show
    // (a blank name is no name; the identity store's own rows carry none).
    const name = (typeof account?.display_name === 'string' && account.display_name.trim()) || null
    return c.json({ email, defaultSite, face, name, ...(viewing ? { viewAs: { by: session.act } } : {}) })
  })

  // ── GET /auth/avatar/:accountId — a person's picture, served by Tracy (09/10/2026) ───────────
  //
  // The address `personFace` hands out for a stored provider picture (`lib/person-face.js`), so no
  // page asks Google or GitHub itself (`./avatar.js` says why and what is guaranteed). Any signed-in
  // viewer may read any account's picture: faces are already shown to teammates, comment readers
  // and inbox readers, and an account id is not guessable. Nobody signed in → 401. `?v=` is only
  // the browser's cache key and is not read. The answer is private (it needed a session) and
  // cached a day; the address changes with the picture, so a stale one is never shown for long.
  app.get('/auth/avatar/:accountId', async (c) => {
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    if (!email) return json(c, { code: 'NOT_SIGNED_IN' }, 401)
    const accountId = c.req.param('accountId')
    const source =
      UUID.test(accountId) && typeof store.avatarSourceFor === 'function'
        ? await store.avatarSourceFor(accountId)
        : null
    if (!avatarSource(source)) return json(c, { code: 'AVATAR_NOT_FOUND' }, 404)
    const picture = await pictures.get(accountId, source)
    if (!picture) {
      c.header('cache-control', 'no-store')
      return json(c, { code: 'AVATAR_UNAVAILABLE' }, 502)
    }
    const headers = {
      etag: picture.etag,
      'cache-control': `private, max-age=${AVATAR_MAX_AGE_S}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox"
    }
    if ((c.req.header('if-none-match') ?? '').split(/\s*,\s*/).includes(picture.etag))
      return new Response(null, { status: 304, headers })
    return new Response(picture.bytes, {
      status: 200,
      headers: {
        ...headers,
        'content-type': picture.type,
        'content-length': String(picture.bytes.byteLength)
      }
    })
  })

  // A form post answers with a REDIRECT, a fetch with JSON — the same branch `/login` and
  // `/verify` already take, and for the same reason: `noSitesPage` (and any other page a person
  // can reach with JavaScript off) needs a button that leads somewhere, and a `<form>` handed a
  // JSON body leaves the person staring at `{"ok":true}`. `next` is run through `safePath` so the
  // button cannot be turned into an open redirect by a crafted link.
  app.post('/auth/signout', async (c) => {
    // The session, and everything else the person's browser holds for them — the site pointer
    // and every seat-token cookie present. The list is `COOKIE_LEDGER`'s business
    // (`lib/cookies.js`), not this door's: measured 14/09, `tracy_site` outlived sign-out for
    // weeks and put the NEXT account on "Ask to join" for the previous account's site, because
    // the cookie was minted in one file and forgotten by none. One header per value — a browser
    // refuses a comma-joined set-cookie.
    //
    // 🔒 CLEARING THE COOKIE ALONE ENDS NOTHING (J1.3, 11/10/2026): the token is self-contained, so
    // a copy of it kept working — and renewing itself — after sign-out. The sign-in is ended on the
    // server first (`lib/session-revocation.js`). A failed write is logged, never a reason to leave
    // the person's browser signed in.
    try {
      await revokeSessionsIn(c.req.header('cookie'), config.sessionSecret, now())
      // An admin's view (`/ops` › View as user) dies with the admin's sign-in, on the record.
      const view = await endViewSession(c.req.header('cookie'), config.sessionSecret, now())
      if (view && pool)
        await pool.query(
          "insert into audit (actor, action, site_key, detail) values ($1, 'view_as.end', null, $2::jsonb)",
          [view.act, JSON.stringify({ target: view.email, by: 'signout' })]
        )
    } catch (error) {
      console.error(`[identity] sign-out could not end the session on the server: ${error?.message ?? error}`)
    }
    for (const value of signOutCookies(c.req.header('cookie'), config, c.req.header('host'))) {
      c.header('set-cookie', value, { append: true })
    }
    if (!isForm(c)) return c.json({ ok: true })
    const form = await c.req.formData().catch(() => null)
    return c.redirect(safePath(String(form?.get('next') ?? '/login'), config.origin), 303)
  })

  // ── GET /signin?n=<nonce> — ask the person whether to approve a lane's sign-in round ─────────
  //
  // WHERE THIS ADDRESS COMES FROM. A site's dsh cannot run an OAuth round (nothing sends a browser
  // back to a loopback address), so it opens one through `lanes/route.js` and points the person's
  // browser here — `${tracy.origin}/signin?n=<nonce>&provider=<google|github>`, built in
  // `vendor/tracy/dsh-passwords/src/gateway.ts`. Until 16/09/2026 the page that answered was a
  // Cloudflare Worker (`cowork-web`); this app had no `/signin` door at all, so the lane sign-in
  // was broken everywhere the Worker was retired — which is to say, everywhere.
  //
  // 🔒 APPROVING IS AN ACT OF A SIGNED-IN PERSON, NEVER OF THE LINK ITSELF. No session, no approval:
  // the visitor is sent to sign in first (their provider if the lane named one, the address form
  // otherwise) and comes back here with `n=` intact. The nonce alone proves nothing — it is the
  // person's own session cookie that names the address the lane is told about.
  //
  // 🔒 AND THIS GET NEVER APPROVES (#661). The session cookie is `SameSite=Lax` on the whole site
  // domain, so any page under it — a customer's own site included — can make a signed-in browser
  // GET this address with the cookie attached. Until 30/09/2026 that GET alone approved the round,
  // and whoever opened the round exchanged it for the victim's address. Now it only renders the
  // question; the answer is `POST /signin/approve` below, which a foreign page cannot forge.
  app.get('/signin', async (c) => {
    // 🔒 `same-origin`, NOT the `no-referrer` every other page gets. Under `no-referrer` Chrome sends
    // `Origin: null` on a plain HTML form POST (fetch() keeps the real origin; measured 07/10/2026,
    // Chrome 154), and `POST /signin/approve` / `/signin/deny` refuse anything but the real origin —
    // so from #834 (03/10) until this line, no browser could press Approve. `same-origin` still sends
    // no referrer to any other site, so the nonce in this URL leaks nowhere.
    c.set('referrerPolicy', 'same-origin')
    hardenPage(c)
    c.header('cache-control', 'no-store')
    const nonce = c.req.query('n') ?? ''
    if (!NONCE.test(nonce)) return failedPage(c, 'link', 404) ?? c.notFound()
    const provider = c.req.query('provider') ?? ''
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    const nonceHash = await sha256Hex(nonce)
    const row = await store.linkByNonce(nonceHash)
    const open = Boolean(row) && row.status === 'pending' && row.expiresAt >= now()
    // A desktop round that carries the address typed in the app (`email_hint`, contract item 3):
    // with no session, or with a session for ANOTHER address, the browser offers to verify the
    // typed address right here instead of sending the person through `/login`. A provider named in
    // the link (the app's Google button) keeps the provider's road.
    const hint = open && row.purpose === 'desktop' && !provider ? (row.emailHint ?? null) : null
    if (hint && (!email || (email !== hint && c.req.query('use') !== 'session'))) {
      const token = await roundTokenFor(c, nonceHash)
      const page = email
        ? desktopMismatchPage({
            current: email,
            typed: hint,
            nonce,
            device: row.device ?? '',
            code: matchCode(nonce),
            token,
            lang: requestLanguage(c)
          })
        : desktopCodePage({
            email: hint,
            nonce,
            device: row.device ?? '',
            code: matchCode(nonce),
            token,
            otherWay: `/login?next=${encodeURIComponent(`/signin?n=${nonce}`)}`,
            lang: requestLanguage(c)
          })
      return renderedPage(c, page)
    }
    if (!email) {
      const back = `/signin?n=${encodeURIComponent(nonce)}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}`
      const to =
        PROVIDERS.has(provider) && config.oauth?.[provider]
          ? `/signin/${provider}?next=${encodeURIComponent(back)}`
          : `/login?next=${encodeURIComponent(back)}`
      return c.redirect(to, 302)
    }
    if (!open) {
      return renderedPage(
        c,
        deviceApprovedPage({
          email,
          error: translate(requestLanguage(c), LINK_GONE),
          lang: requestLanguage(c)
        }),
        400
      )
    }
    // A desktop round (the Mac app's sign-in) gets its own question: the app's name, the match
    // code its window shows, and a Deny button. A lane round keeps the page it always had.
    if (row.purpose === 'desktop') {
      return renderedPage(
        c,
        desktopConfirmPage({
          email,
          nonce,
          device: row.device ?? '',
          code: matchCode(nonce),
          lang: requestLanguage(c)
        })
      )
    }
    return renderedPage(
      c,
      deviceConfirmPage({ email, nonce, device: row.device ?? '', lang: requestLanguage(c) })
    )
  })

  /**
   * The pre-sign-in form token of one round in this browser (`./signin-guard.js`), planting the
   * browser's id cookie on this response when the browser has none yet. An id already there is
   * reused, so a second tab on another round never invalidates the first tab's forms.
   */
  const roundTokenFor = async (c, nonceHash) => {
    let id = browserIdOf(c.req.header('cookie'))
    if (!id) {
      id = newBrowserId()
      c.header('set-cookie', browserCookie(id, { secure: config.secure }), { append: true })
    }
    return roundToken(config.sessionSecret, nonceHash, id)
  }

  // ── POST /signin/approve — the person pressed "Approve" on the page above ────────────────────
  //
  // 🔒 THREE CHECKS, BEFORE ANYTHING IS WRITTEN (#661):
  //   1. `Origin` must be EXACTLY `config.origin`. A browser attaches it to every cross-site POST
  //      and a page cannot choose its value, so a form on a customer site (same cookie domain,
  //      different origin), a sandboxed frame (`null`) or a stripped request (absent) is refused.
  //      Exact string, not a suffix: `https://cowork.example.evil.net` is not ours.
  //   2. A live session — the address the lane will be told is the person's own, as before.
  //   3. The round is still pending and inside its window, read again here, not trusted from the
  //      GET: the page may have sat open past the round's fifteen minutes. `approveLink` then flips
  //      it only if it is STILL pending, so two presses (or two people) approve it at most once.
  //
  // `/signin/deny` below runs the SAME three checks (`answerRound`), and differs only in what it
  // writes: `denied` instead of `approved`.
  /**
   * The checks both buttons on the approve page share. Answers the refusal page, or
   * `{ email, nonceHash, row }` for a round that may still be answered.
   */
  const answerRound = async (c) => {
    if (c.req.header('origin') !== config.origin) {
      return renderedPage(
        c,
        deviceApprovedPage({
          error: translate(requestLanguage(c), 'device.notFromTracy'),
          lang: requestLanguage(c)
        }),
        403
      )
    }
    const form = isForm(c) ? await c.req.formData().catch(() => null) : null
    const nonce = String(form?.get('n') ?? '')
    if (!NONCE.test(nonce)) {
      return renderedPage(
        c,
        deviceApprovedPage({ error: translate(requestLanguage(c), LINK_GONE), lang: requestLanguage(c) }),
        400
      )
    }
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    if (!email) {
      return renderedPage(
        c,
        deviceApprovedPage({
          error: translate(requestLanguage(c), 'device.sessionEnded'),
          lang: requestLanguage(c)
        }),
        401
      )
    }
    const nonceHash = await sha256Hex(nonce)
    const row = await store.linkByNonce(nonceHash)
    const open = Boolean(row) && row.status === 'pending' && row.expiresAt >= now()
    // The account the page NAMED (`desktopConfirmPage` posts it), normalised; '' from older pages.
    const shown = String(form?.get('email') ?? '')
      .trim()
      .toLowerCase()
    return { email, nonceHash, row: open ? row : null, shown }
  }

  const roundGone = (c, email) =>
    renderedPage(
      c,
      deviceApprovedPage({
        email,
        error: translate(requestLanguage(c), LINK_GONE),
        lang: requestLanguage(c)
      }),
      400
    )

  app.post('/signin/approve', async (c) => {
    hardenPage(c)
    const round = await answerRound(c)
    if (round instanceof Response) return round
    const { email, nonceHash, row, shown } = round
    // 🔒 Council (b): the press approves the account the page named, or nothing. A session that
    // changed to somebody else in another tab since the page was drawn is refused, and so is an
    // approval of a round whose typed address is not this session's without the page that named
    // both (the "Use <current>" choice always posts the address it showed).
    const typed = row?.purpose === 'desktop' ? (row.emailHint ?? null) : null
    if ((shown && shown !== email) || (typed && typed !== email && !shown)) {
      return renderedPage(
        c,
        deviceApprovedPage({
          error: translate(requestLanguage(c), 'device.sessionChanged'),
          lang: requestLanguage(c)
        }),
        409
      )
    }
    if (!row || !(await store.approveLink(nonceHash, email, now()))) return roundGone(c, email)
    return renderedPage(
      c,
      deviceApprovedPage({ email, desktop: row.purpose === 'desktop', lang: requestLanguage(c) })
    )
  })

  // ── POST /signin/deny — the person pressed "Deny" on a desktop round's page ─────────────────────
  //
  // The same checks as `/signin/approve`, in the same order; `denyLink` flips only a round still
  // pending, so a Deny can never undo an approval that already happened. The app's poll then reads
  // `denied` and stops; a lane's poll reads `expired` (`lanes/route.js`).
  app.post('/signin/deny', async (c) => {
    hardenPage(c)
    const round = await answerRound(c)
    if (round instanceof Response) return round
    const { email, nonceHash, row } = round
    if (!row || !(await store.denyLink(nonceHash, now()))) return roundGone(c, email)
    return renderedPage(c, deviceDeniedPage({ lang: requestLanguage(c) }))
  })

  // ── POST /signin/code and POST /signin/verify — the typed address, verified on the round ─────
  //
  // The desktop round's own sign-in (council decision (a); `tasks/todo-desktop-onboard-v2.md`). The
  // app opened the round with the address the person typed (`email_hint`); `GET /signin` showed
  // that address, the match code and a button. These two doors are the button and the code.
  //
  // 🔒 THE RULES, BEFORE ANYTHING IS READ OR WRITTEN (`preSignInRound`):
  //   1. `Origin` must be EXACTLY `config.origin`, session or not — the cross-site guard in
  //      `lib/csrf.js` looks only at requests that carry a session, and these usually carry none.
  //   2. A form body with the round's token (`./signin-guard.js`): HMAC of the round and of this
  //      browser's own host-only id. A page elsewhere has neither; a token from another round's page
  //      does not fit this one.
  //   3. The round is a desktop round, pending, inside its window, and carries an address. The
  //      address the code goes to and the account approved are THE ROUND'S, never the form's.
  //
  // `/signin/code` then counts in `/login`'s per-inbox and per-address budget (`mailRate`), keeps
  // the beta gate (an address the gate does not admit gets the gate's own letter and the same page,
  // so the answer says nothing about admission), and writes a code bound to this round
  // (`091-auth-challenge.sql`), killing the round's previous code in the same transaction.
  //
  // `/signin/verify` counts the try before comparing, compares against the round's live challenge
  // only (a web sign-in code, or another round's code, finds nothing), admits the address again as
  // `/verify` does, and then consumes the challenge AND approves the round in one transaction
  // (`approveWithChallenge`): of two parallel presses one wins. Only then does this browser's
  // session become the typed address — a browser signed in as somebody else stays that person until
  // here (council (b)).
  const preSignInRound = async (c) => {
    const refuse = (key, status) =>
      renderedPage(
        c,
        deviceApprovedPage({ error: translate(requestLanguage(c), key), lang: requestLanguage(c) }),
        status
      )
    if (c.req.header('origin') !== config.origin) return refuse('device.notFromTracy', 403)
    const form = isForm(c) ? await c.req.formData().catch(() => null) : null
    if (!form) return refuse('device.notFromTracy', 403)
    const nonce = String(form.get('n') ?? '')
    if (!NONCE.test(nonce)) return refuse(LINK_GONE, 400)
    const nonceHash = await sha256Hex(nonce)
    const token = String(form.get('t') ?? '')
    if (
      !(await roundTokenMatches(config.sessionSecret, nonceHash, browserIdOf(c.req.header('cookie')), token))
    )
      return refuse('device.notFromTracy', 403)
    const row = await store.linkByNonce(nonceHash)
    if (
      !row ||
      row.purpose !== 'desktop' ||
      row.status !== 'pending' ||
      row.expiresAt < now() ||
      !row.emailHint
    )
      return refuse(LINK_GONE, 400)
    const lang = requestLanguage(c)
    /** The round's page again, at `step`, with an optional (key of an) error. */
    const page = (step, { error = '', status = 200, localCode = '' } = {}) =>
      renderedPage(
        c,
        desktopCodePage({
          email: row.emailHint,
          nonce,
          device: row.device ?? '',
          code: matchCode(nonce),
          token,
          step,
          error: error ? translate(lang, error) : '',
          localCode,
          lang
        }),
        status
      )
    return { form, nonce, nonceHash, row, email: row.emailHint, lang, page }
  }

  /** A code's hash, bound to the round and the address as well as to the deployment's secret. */
  const challengeHash = (code, nonceHash, email) =>
    hashCode(code, `${email}\n${nonceHash}`, config.sessionSecret)

  app.post('/signin/code', async (c) => {
    // The page this answers holds the round's forms: under `no-referrer` Chrome would post them
    // with `Origin: null`, which `preSignInRound` refuses (the #1014 trap, met again on the stand).
    c.set('referrerPolicy', 'same-origin')
    hardenPage(c)
    c.header('cache-control', 'no-store')
    const round = await preSignInRound(c)
    if (round instanceof Response) return round
    const { nonceHash, row, email, lang, page } = round
    if (mail.available === false) return page('send', { error: 'login.sendFailed', status: 503 })
    if (await mailRate.over(c, email)) {
      if (beta?.access.enabled) return page('code')
      return page('send', { error: 'login.rateLimited', status: 429 })
    }
    if (beta?.access.enabled) {
      const admission = await beta.access.decide(email)
      if (admission.status !== 'allow') {
        // The gate's own letter (whitelist or "try later"), and the very page an admitted address
        // gets: no code exists, so whatever is typed is refused, and nothing here said why.
        await beta.enqueue(email, undefined, lang)
        return page('code')
      }
    }
    const code = generateCode()
    await store.putChallenge({
      nonceHash,
      email,
      purpose: 'desktop',
      codeHash: await challengeHash(code, nonceHash, email),
      expiresAt: Math.min(now() + CODE_TTL_MS, row.expiresAt)
    })
    await mail.send({ to: email, ...mail.signInCodeMail(code, lang) })
    return page('code', { localCode: config.localLoginPreview ? code : '' })
  })

  app.post('/signin/verify', async (c) => {
    // The page this answers holds the round's forms: under `no-referrer` Chrome would post them
    // with `Origin: null`, which `preSignInRound` refuses (the #1014 trap, met again on the stand).
    c.set('referrerPolicy', 'same-origin')
    hardenPage(c)
    c.header('cache-control', 'no-store')
    const round = await preSignInRound(c)
    if (round instanceof Response) return round
    const { form, nonceHash, email, lang, page } = round
    const code = form.getAll('code').join('').trim()
    const invalid = (error = 'login.codeInvalid') => page('code', { error, status: 401 })
    const challenge = await store.tryChallenge(nonceHash, now())
    if (!challenge || challenge.purpose !== 'desktop' || challenge.email !== email) return invalid()
    if (challenge.attempts > MAX_ATTEMPTS) {
      await store.killChallenge(challenge.id)
      return invalid()
    }
    if (challenge.codeHash !== (await challengeHash(code, nonceHash, email))) return invalid()
    let admission = { status: 'allow', badge: 'gate off', plans: [], gate: false }
    // Gate off, `decide` refuses nobody and only reads the JoomlArt plan for `/ops`.
    if (beta) admission = await beta.access.decide(email)
    if (admission.status !== 'allow') {
      await store.killChallenge(challenge.id)
      return invalid(admission.status === 'waitlist' ? 'login.notAdmitted' : 'login.accessUnavailable')
    }
    const approved = await store.approveWithChallenge({
      id: challenge.id,
      nonceHash,
      email,
      maxAttempts: MAX_ATTEMPTS,
      now: now()
    })
    if (!approved) return roundGone(c, '')
    await store.touchAccount(email, { admission, via: 'email code' })
    await rememberLanguage(email, statedLanguage(c))
    // The same shard decision as `POST /verify` (S40; the pointer for the person's shard): this
    // session lands in the system browser, a web client that follows a handoff like any other.
    const refusedSignIn = shards ? await shards.afterSignIn(c, email) : null
    if (refusedSignIn) return refusedSignIn
    await startSession(c, email)
    return renderedPage(c, deviceApprovedPage({ email, desktop: true, lang }))
  })

  // ── POST /auth/link/:nonce/session — the desktop app trades its approved round for a session ──
  //
  // WHY THIS DOOR EXISTS. The Mac app (`packages/desktop/tracy-desktop`) sends a Google/GitHub
  // sign-in to the system browser, whose cookie the app never sees. So it opens a desktop round
  // (`POST /auth/link/browser` with `purpose: "desktop"`), the person approves it in that browser,
  // and the app's main process calls here with the client secret only it holds. The answer is the
  // same `tracy_sess` cookie a sign-in sets, in the app's own cookie jar.
  //
  // 🔒 THE RULES, IN ORDER:
  //   1. `Origin` must be EXACTLY `config.origin`; absent is refused too. The app sets it; a page
  //      elsewhere cannot, so no foreign page can sign a browser into the app's account (login
  //      CSRF). Checked by this door itself: it is in `SESSION_FREE_DOORS` (`lib/csrf.js`) because
  //      a stale cookie in the app's jar must not change the answer.
  //   2. JSON only — a form or `text/plain` body is a "simple" request a foreign page could send.
  //   3. A per-address count, before anything is read.
  //   4. ONE statement consumes the round (`redeemDesktopLink`): nonce, secret, purpose, approved
  //      and unexpired all in its `where`. A wrong secret matches nothing and burns nothing — unlike
  //      the lane's `/exchange` — so a guesser cannot cancel somebody's sign-in; the 256-bit secret
  //      and the count above are what stop guessing. Every miss answers the same 404.
  //   5. The address is admitted again exactly as `/verify` admits it, then the session is minted
  //      by `startSession` — the cookie is the one `/verify` sets, attribute for attribute.
  //   6. 204 with no body: the cookie value only ever travels in `Set-Cookie`.
  app.post('/auth/link/:nonce/session', async (c) => {
    c.header('cache-control', 'no-store')
    if (c.req.header('origin') !== config.origin) return json(c, { code: 'ORIGIN_REFUSED' }, 403)
    const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'application/json') return json(c, { code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
    if (await overDesktopLimit(c)) return json(c, { code: 'RATE_LIMITED' }, 429)
    const raw = await c.req.json().catch(() => null)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret : ''
    if (!CLIENT_SECRET.test(clientSecret)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const nonce = c.req.param('nonce')
    if (!NONCE.test(nonce)) return json(c, { code: 'LINK_INVALID' }, 404)
    const redeemed = await store.redeemDesktopLink({
      nonceHash: await sha256Hex(nonce),
      clientSecretHash: await sha256Hex(clientSecret),
      now: now()
    })
    if (!redeemed) return json(c, { code: 'LINK_INVALID' }, 404)
    const { email, device } = redeemed
    let admission = { status: 'allow', badge: 'gate off', plans: [], gate: false }
    // Gate off, `decide` refuses nobody and only reads the JoomlArt plan for `/ops`.
    if (beta) admission = await beta.access.decide(email)
    if (admission.status !== 'allow') {
      const reason = admission.status === 'waitlist' ? 'NOT_ADMITTED' : 'ACCESS_UNAVAILABLE'
      return json(c, { code: 'SIGN_IN_REFUSED', reason }, 403)
    }
    await store.touchAccount(email, { admission, via: 'desktop app' })
    await rememberLanguage(email, statedLanguage(c))
    // The same S40 check and directory decision as `POST /verify`: a new person no shard takes is
    // refused (503 NO_SHARD_ACCEPTING, JSON — the app reads the status, not a page) and gets no
    // session. KNOWN GAP (reported, ADR 0030: the app is a shell of web and is not changed here):
    // the app has no field to carry a shard URL and treats an off-origin redirect as a sign-in
    // leaving (`will-redirect` in tracy-desktop `main.js`), so the pointer is NOT set in its jar
    // (`point: false`) — a person who lives on a shard keeps a master session and sees the master's
    // workspace in the app until the app can follow a handoff. THE SECOND HALF of the same gap: a NEW
    // person who only ever signs in through the desktop app gets a master session, creates sites on
    // the master (`shards/use-shard.js` lets a person with no directory row through) and stays s0 for
    // good — no pointer, no directory row naming a shard. No behaviour change in the beta.
    const refusedSignIn = shards ? await shards.afterSignIn(c, email, { json: true, point: false }) : null
    if (refusedSignIn) return refusedSignIn
    await startSession(c, email)
    // A history line that cannot be written is said on the log, never a reason to refuse the
    // sign-in it describes (the same rule as `auditBook`).
    try {
      await store.recordAudit({
        actor: email,
        action: 'session.start',
        detail: { source: 'desktop_auth_link', device }
      })
    } catch (error) {
      console.warn(`[identity] desktop sign-in audit not written: ${String(error?.message ?? error)}`)
    }
    return c.body(null, 204)
  })

  // ── POST /auth/link/:nonce/cancel — the desktop app ends its own round ─────────────────────
  //
  // The person pressed Cancel on the app's waiting page, or closed the window, while the round was
  // still pending. Without this door the round stayed approvable in the browser for its whole
  // window: the approve page would then say "signed in" for a sign-in no app will ever redeem.
  //
  // 🔒 THE SESSION DOOR'S RULES, IN ITS ORDER: exact `Origin`, JSON only, the same per-address
  // count, a well-formed secret. ONE statement flips a PENDING desktop round whose secret matches to
  // `denied` (`cancelDesktopLink`); everything else is left as it was. Every well-formed request
  // answers the same 204 — flipped, already ended, wrong secret alike — so the door is idempotent
  // and tells a guesser nothing.
  app.post('/auth/link/:nonce/cancel', async (c) => {
    c.header('cache-control', 'no-store')
    if (c.req.header('origin') !== config.origin) return json(c, { code: 'ORIGIN_REFUSED' }, 403)
    const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'application/json') return json(c, { code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
    if (await overDesktopLimit(c)) return json(c, { code: 'RATE_LIMITED' }, 429)
    const raw = await c.req.json().catch(() => null)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret : ''
    if (!CLIENT_SECRET.test(clientSecret)) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const nonce = c.req.param('nonce')
    if (!NONCE.test(nonce)) return json(c, { code: 'LINK_INVALID' }, 404)
    await store.cancelDesktopLink({
      nonceHash: await sha256Hex(nonce),
      clientSecretHash: await sha256Hex(clientSecret),
      now: now()
    })
    return c.body(null, 204)
  })

  // ── GET /signin/email — the onboard page's email form ───────────────────────────────────────
  //
  // `/login?onboard=1` points its email form here (contract item 1). The desktop app catches this
  // navigation before it leaves the window and opens a desktop round carrying the address
  // (`POST /auth/link/browser` with `email`), so in the app this door is never reached. A browser
  // that is not the app lands on `/login` with the address filled in, as before. It sends nothing:
  // a GET never mails a code. REGISTERED BEFORE `/signin/:provider`, which would answer 404.
  app.get('/signin/email', (c) => {
    c.header('cache-control', 'no-store')
    const email = String(c.req.query('email') ?? '')
      .trim()
      .toLowerCase()
    const next = c.req.query('next') ?? ''
    const to = new URLSearchParams()
    if (EMAIL.test(email) && email.length <= 254) to.set('email', email)
    if (next.startsWith('/') && !next.startsWith('//')) {
      const safe = safePath(next, config.origin)
      if (safe !== `${config.origin}/`) to.set('next', safe.slice(config.origin.length))
    }
    const query = to.toString()
    return c.redirect(query ? `/login?${query}` : '/login', 302)
  })

  // ── GET /signin/joomlart — start a "Login with JoomlArt" round ─────────────────────────────
  //
  // REGISTERED BEFORE `/signin/:provider`, or the parameter route would swallow both JoomlArt
  // doors and answer 404 (`PROVIDERS` is google/github and stays so: aMember is not an OAuth
  // provider — no code exchange, no token — but a signed redirect out and a signed redirect back,
  // `./joomlart-sso.js`). What it shares with the OAuth doors is the state row and the
  // `tracy_oauth_state` cookie — the two halves of the login-CSRF check described at
  // `/signin/:provider/callback` — so the nonce IS the state: 32 random bytes, in the row, in the
  // cookie, and inside the payload aMember must sign back. `exp` is the same moment the row dies,
  // told to aMember in unix seconds so it refuses a stale request on its side too.
  //
  // Off (`config.joomlartSso` null) reads as "this door doesn't exist", the same 404 page an
  // unlit OAuth provider gets. `next` is sanitised here, once, and kept on the row: the callback
  // never reads it from the query.
  const joomlartOff = (c) => (config.joomlartSso ? null : (failedPage(c, 'provider', 404) ?? c.notFound()))

  app.get('/signin/joomlart', async (c) => {
    c.header('cache-control', 'no-store')
    const off = joomlartOff(c)
    if (off) return off
    const asked = safePath(c.req.query('next'), config.origin)
    const source = requestSource(new URL(c.req.url).searchParams, asked, config.origin)
    // The page the JoomlArt button sat on rides on the template landing `next`, so the landing can
    // hand it to its Download link (`lib/referrer.js`); it never changes where `next` points.
    const ref = referrerOf({
      ref: c.req.query('ref'),
      referer: c.req.header('referer'),
      origin: config.origin
    })
    const next = nextWithRef(asked, ref, config.origin)
    const nonce = randomState()
    const expiresAt = now() + JOOMLART_ROUND_MS
    await store.putState({ state: nonce, provider: JOOMLART, next, expiresAt, source })
    const { sso, sig } = buildRequest({
      nonce,
      returnUrl: `${config.origin}/signin/joomlart/callback`,
      exp: Math.floor(expiresAt / 1000),
      secret: config.joomlartSso.secret
    })
    const url = new URL(config.joomlartSso.authorizeUrl)
    url.searchParams.set('client', config.joomlartSso.client)
    url.searchParams.set('sso', sso)
    url.searchParams.set('sig', sig)
    c.header('set-cookie', stateCookie(nonce, optsFor(c)))
    return c.redirect(url.toString(), 302)
  })

  // ── GET /signin/joomlart/callback — aMember sends the browser back here ────────────────────
  //
  // Order of the checks, and why:
  //   1. The state cookie must be there — without it nothing below can be the person's own round.
  //   2. The SIGNATURE, over the base64 exactly as it arrived, before any state is spent: a forged
  //      or damaged answer costs nothing, and the real one aMember sends next still finds its row.
  //   3. The row is consumed (`takeState`, one `delete … returning`): of two callbacks carrying the
  //      same answer exactly one finds it, so a captured URL replayed a second later loses.
  //   4. The nonce INSIDE the signed payload must be the cookie's own — the row proves a round was
  //      started, the signature proves aMember answered, only this proves aMember answered THIS
  //      round and not one an attacker started in their own browser.
  //   5. `external_id` and a real, verified email: an unverified address is refused with a sentence
  //      that sends the person to joomlart.com, and no session is minted for it.
  // Every refusal clears the state cookie, carries `cache-control: no-store` and
  // `referrer-policy: no-referrer` (the URL holds the signed payload; no page it lands on may learn
  // it), and never logs `sso` or `sig`.
  app.get('/signin/joomlart/callback', async (c) => {
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    const off = joomlartOff(c)
    if (off) return off
    const refuse = (code, reason, status = 400, next = undefined) =>
      failedPage(c, reason, status, { provider: JOOMLART, next }) ?? json(c, { code }, status)

    const cookieNonce = parseCookies(c.req.header('cookie') ?? null).get(OAUTH_STATE_COOKIE) ?? null
    c.header('set-cookie', clearStateCookie(optsFor(c)))
    if (!cookieNonce) return refuse('OAUTH_STATE_INVALID', 'state')

    const answer = parseResponse({
      sso: c.req.query('sso'),
      sig: c.req.query('sig'),
      secret: config.joomlartSso.secret
    })
    if (!answer) return refuse('SSO_INVALID', 'exchange')

    const row = await store.takeState(cookieNonce) // single-use, regardless of what it says
    if (!row || row.provider !== JOOMLART || row.expiresAt < now() || answer.nonce !== cookieNonce)
      return refuse('OAUTH_STATE_INVALID', 'state')

    const email = answer.email.trim().toLowerCase()
    if (!answer.externalId || !EMAIL.test(email)) return refuse('SSO_INVALID', 'exchange', 400, row.next)
    if (!answer.emailVerified) return refuse('EMAIL_NOT_VERIFIED', 'joomlartEmail', 400, row.next)

    const plans = paidEntitlement(answer.entitlement, now())
    const admission = plans.length
      ? { status: 'allow', badge: 'JoomlArt member', plans, gate: beta?.access.enabled === true }
      : beta
        ? await beta.access.decide(email, { provider: JOOMLART, subject: answer.externalId })
        : { status: 'allow', badge: 'gate off', plans: [] }
    if (admission.status !== 'allow') {
      await beta.enqueue(email, 'JoomlArt', requestLanguage(c))
      const target = new URL(config.beta.waitlistUrl)
      if (config.beta.waitlistMode === 'wordpress') target.searchParams.set('email', email)
      else target.searchParams.set('check', '1')
      return c.redirect(target.toString(), 303)
    }
    const account = await store.upsertOAuthIdentity(JOOMLART, answer.externalId, email, {
      admission: withSource(admission, row.source),
      entitlement: answer.entitlement
    })
    await rememberLanguage(account.email, statedLanguage(c))
    await rememberProfile(account.id, { name: answer.name || null })
    // THE TEMPLATE WAITS ON THE ACCOUNT, NOT ON THIS BROWSER (plan B6). The round was started for
    // `/new?template=<id>` by joomlart.com's Download button; this browser is sent there now, and
    // a Tracy Desktop that signs in as the same person later is sent there too, by the root landing
    // (`workspace/route.js`). The landing page consumes it; seven days, then it is forgotten.
    const waiting = templateAskOf(row.next)
    if (waiting && store.putDesktopIntent) await store.putDesktopIntent(account.id, waiting)
    // A navigation: the shard hook's refusal (S40) is the page itself, and no session is minted.
    const refusedSignIn = shards ? await shards.afterSignIn(c, account.email) : null
    if (refusedSignIn) return withStateCleared(c, refusedSignIn)
    const token = await mintSession(account.email, config.sessionSecret, now())
    c.header('set-cookie', sessionCookie(token, optsFor(c)), { append: true })
    return c.redirect(row.next, 302)
  })

  // ── GET /signin/:provider — start the flow ────────────────────────────────────────────────
  //
  // A provider this deployment never lit up (`config.oauth[provider]` absent) or doesn't know
  // reads as "this door doesn't exist" — 404, the same answer a truly unregistered path gets,
  // rather than a 503 that would tell a prober which providers a probe found half-wired. A
  // navigation gets that 404 as a page with a way to sign in (#796), the SAME page for both cases.
  app.get('/signin/:provider', async (c) => {
    const provider = c.req.param('provider')
    if (!PROVIDERS.has(provider) || !config.oauth?.[provider])
      return failedPage(c, 'provider', 404) ?? c.notFound()
    const next = safePath(c.req.query('next'), config.origin)
    const source = requestSource(new URL(c.req.url).searchParams, next, config.origin)
    const state = randomState()
    await store.putState({ state, provider, next, expiresAt: now() + OAUTH_STATE_TTL_MS, source })
    await recordSignInStart(c, 'login.oauth_started', { provider, ...source })
    c.header('set-cookie', stateCookie(state, optsFor(c)))
    return c.redirect(authorizeUrl(provider, config, state), 302)
  })

  // ── GET /signin/:provider/callback — the provider sends the browser back here ────────────────
  //
  // THE STATE CHECK HAS TWO HALVES, AND BOTH MATTER.
  //
  // 1. The query `state` must match a live, unexpired row in `oauth_state` — unguessable (256
  //    bits of CSPRNG), and consumed the moment it is read (`store.takeState`), so a captured
  //    callback URL cannot be replayed even seconds later.
  // 2. The query `state` must ALSO match the `tracy_oauth_state` cookie planted when the flow
  //    started — the half that (1) alone cannot cover. Without it, an attacker who starts their
  //    OWN flow (a valid `state`+`code` pair for THEIR OWN provider account, freely readable in
  //    their own browser's address bar) could hand that URL to a victim; the victim's browser
  //    would satisfy check (1) — the row is real, unexpired, unused — and the victim would be
  //    signed into the attacker's account (a "login CSRF"). The victim's browser was never handed
  //    the attacker's cookie, so it fails check (2) instead.
  //
  // A REFUSAL IS A PAGE FOR A NAVIGATION, A CODE FOR A FETCH (#796). The provider sends a BROWSER
  // here, so every refusal below used to land a person on `{"code":"OAUTH_STATE_INVALID"}` with no
  // way back. Status and `code` are unchanged; what the provider answered is never shown.
  //
  // A SIGN-IN THE PERSON CANCELLED AT THE PROVIDER HAS ITS OWN SENTENCE (#993), chosen only once
  // both halves of the state check passed: a callback with a bad state is told about the state,
  // whatever `error` it carries.
  app.get('/signin/:provider/callback', async (c) => {
    // As on the JoomlArt callback: the page this sends the browser to must not learn the provider
    // (`accounts.google.com`) as its referrer — `/new` would record it as where a download came from.
    c.header('referrer-policy', 'no-referrer')
    const provider = c.req.param('provider')
    if (!PROVIDERS.has(provider) || !config.oauth?.[provider])
      return failedPage(c, 'provider', 404) ?? c.notFound()
    const refuse = (code, reason, status = 400, next = undefined) =>
      failedPage(c, reason, status, { provider, next }) ?? json(c, { code }, status)

    const queryState = c.req.query('state') ?? ''
    const cookieState = parseCookies(c.req.header('cookie') ?? null).get(OAUTH_STATE_COOKIE) ?? null
    c.header('set-cookie', clearStateCookie(optsFor(c)))
    if (!queryState || !cookieState || queryState !== cookieState) {
      return refuse('OAUTH_STATE_INVALID', 'state')
    }

    const row = await store.takeState(queryState) // single-use, regardless of what it says
    if (!row || row.provider !== provider || row.expiresAt < now()) {
      return refuse('OAUTH_STATE_INVALID', 'state')
    }

    const code = c.req.query('code')
    if (!code) {
      // No code and `error=access_denied`: the person refused on the provider's own screen (#993).
      // Google and GitHub both send exactly this value for it. It is read only here, after the
      // state was checked and consumed, and only to choose the sentence: status and `code` stay
      // what a missing code always got, and nothing else the provider sent is read at all.
      const errors = c.req.queries('error') ?? []
      const cancelled = errors.length === 1 && errors[0] === 'access_denied'
      return refuse('OAUTH_STATE_INVALID', cancelled ? 'cancelled' : 'state', 400, row.next)
    }

    let exchanged
    try {
      exchanged = await exchangeCode(provider, config, code, { fetchImpl })
    } catch (error) {
      if (error instanceof OAuthError) {
        return refuse(error.code, error.code === 'EMAIL_NOT_VERIFIED' ? 'email' : 'exchange', 400, row.next)
      }
      // The request to the provider itself failed (DNS, a reset socket). Nobody is signed in, and
      // the person gets the same way back; the cause goes to the log, never to the answer.
      console.warn(`[oauth] ${provider} exchange did not complete: ${error?.message ?? 'unknown error'}`)
      return refuse('EXCHANGE_FAILED', 'exchange', 502, row.next)
    }

    const admission = beta
      ? await beta.access.decide(exchanged.email, { provider, subject: exchanged.subject })
      : { status: 'allow', badge: 'gate off', plans: [] }
    if (admission.status !== 'allow') {
      await beta.enqueue(exchanged.email, provider === 'google' ? 'Google' : 'GitHub', requestLanguage(c))
      const target = new URL(config.beta.waitlistUrl)
      if (config.beta.waitlistMode === 'wordpress') target.searchParams.set('email', exchanged.email)
      else target.searchParams.set('check', '1')
      return c.redirect(target.toString(), 303)
    }
    const account = await store.upsertOAuthIdentity(provider, exchanged.subject, exchanged.email, {
      admission: withSource(admission, row.source)
    })
    await rememberLanguage(account.email, statedLanguage(c))
    await rememberProfile(account.id, exchanged)
    // A navigation: the shard hook's refusal (S40) is the page itself, and no session is minted.
    const refusedSignIn = shards ? await shards.afterSignIn(c, account.email) : null
    if (refusedSignIn) return withStateCleared(c, refusedSignIn)
    const token = await mintSession(account.email, config.sessionSecret, now())
    c.header('set-cookie', sessionCookie(token, optsFor(c)), { append: true })
    // A widget handoff is attested only after this callback passed both OAuth state checks.
    await onOAuthSession?.({ next: row.next, token })
    return c.redirect(row.next, 302)
  })

  return app
}
