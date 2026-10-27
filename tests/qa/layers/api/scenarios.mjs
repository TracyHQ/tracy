// Door scenarios: one named outcome of a flow, played through the real doors of apps/tracy-web.
//
// The 21 edge-tag families fire one request shape at every door. A scenario is the other kind of
// case: a short sequence (ask for a code, read it from the captured mail, verify it, read the
// session back) whose expectation is one observable outcome a person would name. Each scenario:
//   - boots the product's own `buildApp` on the run's database, with the mail captured in memory,
//     an injected clock, and the outbound network replaced by the double the scenario declares
//     (a provider, a host, a resolver) — never a real network, never real DNS;
//   - names the door it judges (`door`, an id of the pinned oracle), its edge tag and its oracle;
//   - returns PASS, FAIL or PENDING through `verdict()`; a failed positive control is PENDING
//     (TEST_INVALID), never a FAIL of the product;
//   - is RED-proven by the mutants of `SCENARIO_MUTANTS` (red.mjs runs them like the others).
// A scenario that cannot be played here says so with `pending: '<reason>'` and has no `run`.
import { readFileSync } from 'node:fs'
import { ENV, FIXTURE, ORIGIN } from './harness.mjs'

const SAME_ORIGIN = { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }
const JSON_HEADERS = { ...SAME_ORIGIN, 'content-type': 'application/json' }
const HTML = { accept: 'text/html,application/xhtml+xml' }
const MINUTE = 60_000

const pass = (reason) => ({ v: 'PASS', reason })
const fail = (reason) => ({ v: 'FAIL', reason })
const invalid = (reason) => ({ v: 'PENDING', reason: `TEST_INVALID: ${reason}` })

/** First expectation that does not hold decides: `[holds, what was seen instead]`. */
function verdict(okReason, expectations, controls = []) {
  for (const [holds, seen] of controls) if (!holds) return invalid(`control failed: ${seen}`)
  for (const [holds, seen] of expectations) if (!holds) return fail(seen)
  return pass(okReason)
}

const cookieOf = (obs, name) => {
  for (const line of String(obs.headers?.['set-cookie'] ?? '').split('\n')) {
    const [pair] = line.split(';')
    if (pair.startsWith(`${name}=`)) return { pair, value: pair.slice(name.length + 1), line }
  }
  return null
}
const sessionOf = (obs) => {
  const c = cookieOf(obs, 'tracy_sess')
  return c && c.value !== '' ? c.pair : null
}
const short = (obs) => `HTTP ${obs.status} ${String(obs.text ?? '').slice(0, 160)}`

/** An unsigned id_token shaped like Google's (the product reads the claims, the provider signs). */
function idToken(claims) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(claims)}.sig`
}

/**
 * A stand-in for the two sign-in providers, matched on host and path. `google: null` refuses the
 * code exchange the way the provider does (400 invalid_grant); `down: true` breaks the connection.
 * `github` is `{ refuse?, emails, user }`: GitHub refuses a code with 200 `{error}` and no token
 * (`refuse: true`); `emails` and `user` are what its two API calls answer for the token it gave.
 */
function providerDouble({ google = null, github = null, down = false } = {}) {
  const calls = []
  return {
    calls,
    fetchImpl: async (input) => {
      const url = new URL(String(input?.url ?? input))
      calls.push(`${url.hostname}${url.pathname}`)
      if (down) throw new Error('qa: provider connection reset')
      const answer = (body, status = 200) => new Response(JSON.stringify(body), { status })
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token')
        return google
          ? answer({ id_token: idToken(google), access_token: 'qa-access' })
          : answer({ error: 'invalid_grant' }, 400)
      if (url.hostname === 'github.com' && url.pathname === '/login/oauth/access_token')
        return github && !github.refuse
          ? answer({ access_token: 'qa-github-access', token_type: 'bearer' })
          : answer({ error: 'bad_verification_code' })
      // The two API calls answer whatever token they are shown: a product that went on after a
      // refused exchange would find an address here, and the scenario would see it sign in.
      if (github && url.hostname === 'api.github.com' && url.pathname === '/user/emails')
        return answer(github.emails)
      if (github && url.hostname === 'api.github.com' && url.pathname === '/user') return answer(github.user)
      throw new Error(`qa: outbound network is blocked in the api layer (${url.hostname})`)
    }
  }
}

const OAUTH_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'qa-google-id',
  GOOGLE_OAUTH_CLIENT_SECRET: `qa-google-secret-${'o'.repeat(24)}`
}
const GITHUB_ENV = {
  GITHUB_OAUTH_CLIENT_ID: 'qa-github-id',
  GITHUB_OAUTH_CLIENT_SECRET: `qa-github-secret-${'o'.repeat(24)}`
}

const inertSeatDoor = {
  mintSeatSession: async () => null,
  revokeSeatAtDoor: async () => ({ ok: true }),
  forgetWorkspaceAtDoor: async () => ({ ok: true }),
  archiveSessionsAtDoor: async () => ({ ok: true })
}

/**
 * Boot the product for one scenario. Everything a scenario may replace is an argument; everything
 * else is what harness.bootApp gives every other case (blocked network, stub host, inert seat door).
 */
function bootScenario(
  env,
  { fetchImpl, extraEnv = {}, dns, host = false, ownDomainProbe, startAt = Date.now() } = {}
) {
  const { product, pool } = env
  const fullEnv = { ...ENV, ...extraEnv }
  const config = product.config.readConfig(fullEnv)
  // `step` moves the clock on every read: a door that waits on its own clock ends its wait.
  const clock = { t: startAt, step: 0 }
  const sent = []
  const blocked = async (input) => {
    throw new Error(`qa: outbound network is blocked in the api layer (${String(input?.url ?? input)})`)
  }
  const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} }
  const app = product.app.buildApp({
    config,
    env: fullEnv,
    log: silent,
    fetchImpl: fetchImpl ?? blocked,
    identity: product.identity.pgIdentityStore(pool),
    pool,
    mail: { send: async (m) => void sent.push(m), available: true },
    sites: product.resolver.dbSitesResolver(pool, config),
    seatDoor: inertSeatDoor,
    now: () => (clock.t += clock.step),
    // The product's own host client, so what leaves for the host is what the product signs and sends.
    // `host: true` is the product's own host client, so what leaves for the host is what the product
    // signs and sends (to the scenario's host double); otherwise the inert host every other case has.
    host: host
      ? { hostCall: product.hostClient.hostCall, hostJob: product.hostClient.hostJob }
      : {
          hostCall: async () => ({ ok: false, status: 503, body: { code: 'QA_HOST_STUB' } }),
          hostJob: async () => ({ ok: false, status: 503, body: { code: 'QA_HOST_STUB' } })
        },
    ...(dns ? { dns } : {}),
    ...(ownDomainProbe ? { ownDomainProbe } : {})
  })
  const send = env.senderFor(app)
  return { send, sent, clock, config }
}

/** The six-digit code of the newest captured letter to `email`, or null. */
const codeFor = (sent, email) =>
  sent
    .filter((m) => m.to === email)
    .at(-1)
    ?.text?.match(/\b\d{6}\b/)?.[0] ?? null

async function askCode(s, email, extra = {}) {
  return s.send({ method: 'POST', path: '/login', headers: JSON_HEADERS, body: { email, ...extra } })
}
const verify = (s, email, code) =>
  s.send({ method: 'POST', path: '/verify', headers: JSON_HEADERS, body: { email, code } })
const me = (s, cookie) => s.send({ method: 'GET', path: '/auth/me', headers: cookie ? { cookie } : {} })

/** Start a sign-in with a provider; returns the state and the browser's state cookie. */
async function startAt(provider, s, next = '/') {
  const start = await s.send({
    method: 'GET',
    path: `/signin/${provider}?next=${encodeURIComponent(next)}`
  })
  const state = start.headers?.location ? new URL(start.headers.location).searchParams.get('state') : null
  return { start, state, cookie: cookieOf(start, 'tracy_oauth_state')?.pair ?? null }
}
const callbackAt = (provider, s, { state, code, cookie, extra = '', headers = {} }) =>
  s.send({
    method: 'GET',
    path: `/signin/${provider}/callback?state=${encodeURIComponent(state ?? '')}${code ? `&code=${code}` : ''}${extra}`,
    headers: { ...(cookie ? { cookie } : {}), ...headers }
  })
const startGoogle = (s, next) => startAt('google', s, next)
const callback = (s, args) => callbackAt('google', s, args)
const startGithub = (s, next) => startAt('github', s, next)
const githubCallback = (s, args) => callbackAt('github', s, args)

const PEOPLE_DOCS = 'apps/tracy-web/src/api-reference/routes/people.js'
// The issue's Expected section and checklist, pinned as a copy in the repository.
const ISSUE_993 = 'tests/qa/oracles/signin/issue-993.md'
const VERIFIED = { email: 'oauth-person@qa.test', email_verified: true, sub: 'qa-google-sub-1' }

/**
 * @type {{ key: string, door: string, tag: string, title: string,
 *   oracle: { source: string, ref: string, invariant: string }, mail?: boolean,
 *   pending?: string, run?: (env: object, note: Function) => Promise<{ v: string, reason: string }> }[]}
 */
export const SCENARIOS = [
  {
    key: 'signin-code-requested',
    door: 'POST /login',
    tag: 'happy',
    title: 'Sign-in: asking for a code mails one six-digit code to that address and says nothing else',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /login',
      invariant: 'a valid address is answered 200 {ok:true}, uncached, and one code is mailed to it'
    },
    mail: true,
    async run(env, note) {
      const s = bootScenario(env)
      const email = 'code-asked@qa.test'
      const asked = note('ask', await askCode(s, email))
      const letters = s.sent.filter((m) => m.to === email)
      return verdict('200 {ok:true}, no-store, one letter with a six-digit code', [
        [asked.status === 200 && asked.json?.ok === true, `POST /login answered ${short(asked)}`],
        [!('localCode' in (asked.json ?? {})), 'the answer carries the code itself'],
        [/no-store/.test(asked.headers['cache-control'] ?? ''), 'the answer is cacheable'],
        [letters.length === 1, `${letters.length} letter(s) were sent to the address, expected 1`],
        [codeFor(s.sent, email) !== null, 'the letter carries no six-digit code'],
        [sessionOf(asked) === null, 'asking for a code already set a session']
      ])
    }
  },
  {
    key: 'signin-code-right',
    door: 'POST /verify',
    tag: 'happy',
    title: 'Sign-in: the mailed code sets one session, and /auth/me names that address',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /verify, GET /auth/me',
      invariant: 'the right code answers 200 {ok:true,email} with a session cookie that /auth/me reads back'
    },
    mail: true,
    async run(env, note) {
      const s = bootScenario(env)
      const email = 'code-right@qa.test'
      const asked = note('ask', await askCode(s, email))
      const code = codeFor(s.sent, email)
      const done = note('verify', await verify(s, email, code))
      const cookie = sessionOf(done)
      const who = cookie ? note('me', await me(s, cookie)) : null
      return verdict(
        '200 {ok:true,email}, tracy_sess set, /auth/me names the address',
        [
          [done.status === 200 && done.json?.ok === true, `POST /verify answered ${short(done)}`],
          [done.json?.email === email, `the answer names ${done.json?.email}`],
          [cookie !== null, 'no tracy_sess cookie was set'],
          [who?.json?.email === email, `/auth/me with that cookie names ${who?.json?.email ?? 'nobody'}`]
        ],
        [[asked.status === 200 && code !== null, `no code was mailed (${short(asked)})`]]
      )
    }
  },
  {
    key: 'signin-code-wrong',
    door: 'POST /verify',
    tag: 'invalid',
    title: 'Sign-in: a wrong code is refused and signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /verify',
      invariant: 'a wrong code answers 401 CODE_INVALID and sets no session'
    },
    mail: true,
    async run(env, note) {
      const s = bootScenario(env)
      // The control runs first and on its own address: a door that verifies nothing would make
      // the refusal below meaningless, and a mutant must not be able to spoil the control.
      const other = 'code-control@qa.test'
      await askCode(s, other)
      const control = note('control', await verify(s, other, codeFor(s.sent, other)))
      const email = 'code-wrong@qa.test'
      await askCode(s, email)
      const code = codeFor(s.sent, email)
      const wrong = code === '000000' ? '111111' : '000000'
      const refused = note('wrong', await verify(s, email, wrong))
      return verdict(
        '401 CODE_INVALID, no session',
        [
          [refused.status === 401, `a wrong code answered ${short(refused)}`],
          [refused.json?.code === 'CODE_INVALID', `the refusal is ${JSON.stringify(refused.json)}`],
          [!('reason' in (refused.json ?? {})), 'a wrong code is told something about admission'],
          [sessionOf(refused) === null, 'a wrong code set a session']
        ],
        [
          [code !== null, 'no code was mailed'],
          [control.status === 200, `a right code did not work (${short(control)})`]
        ]
      )
    }
  },
  {
    key: 'signin-code-expired',
    door: 'POST /verify',
    tag: 'expired-auth',
    title: 'Sign-in: a code older than its ten minutes is refused like a wrong one',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /login (a six-digit code valid for ten minutes), POST /verify',
      invariant: 'the right code presented after its lifetime answers 401 CODE_INVALID and sets no session'
    },
    mail: true,
    async run(env, note) {
      const s = bootScenario(env)
      const fresh = 'code-fresh@qa.test'
      await askCode(s, fresh)
      s.clock.t += 9 * MINUTE
      const control = note('control: nine minutes', await verify(s, fresh, codeFor(s.sent, fresh)))
      const email = 'code-expired@qa.test'
      await askCode(s, email)
      const code = codeFor(s.sent, email)
      s.clock.t += 11 * MINUTE
      const late = note('eleven minutes', await verify(s, email, code))
      return verdict(
        '401 CODE_INVALID eleven minutes after the code was mailed',
        [
          [
            late.status === 401 && late.json?.code === 'CODE_INVALID',
            `an expired code answered ${short(late)}`
          ],
          [sessionOf(late) === null, 'an expired code set a session']
        ],
        [
          [code !== null, 'no code was mailed'],
          [control.status === 200, `a code nine minutes old did not work (${short(control)})`]
        ]
      )
    }
  },
  {
    key: 'signin-code-reused',
    door: 'POST /verify',
    tag: 'repeat',
    title: 'Sign-in: a code that already signed somebody in cannot be used a second time',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /verify',
      invariant: 'a code is single-use: the second verify answers 401 CODE_INVALID and sets no session'
    },
    mail: true,
    async run(env, note) {
      const s = bootScenario(env)
      const email = 'code-reused@qa.test'
      await askCode(s, email)
      const code = codeFor(s.sent, email)
      const first = note('first', await verify(s, email, code))
      const second = note('second', await verify(s, email, code))
      return verdict(
        'the second verify is 401 CODE_INVALID with no session',
        [
          [
            second.status === 401 && second.json?.code === 'CODE_INVALID',
            `the replay answered ${short(second)}`
          ],
          [sessionOf(second) === null, 'the replayed code set a session']
        ],
        [[code !== null && first.status === 200, `the first verify did not sign in (${short(first)})`]]
      )
    }
  },
  {
    key: 'signin-link-other-device',
    door: 'POST /verify',
    tag: 'other-tenant',
    title: 'Sign-in: the emailed link opened on another device',
    oracle: {
      source: ISSUE_993,
      ref: 'Email code: … link opened in another browser',
      invariant: 'a sign-in started on one device and finished on another ends in a stated, safe outcome'
    },
    pending:
      'no approved expectation: the sign-in letter carries a code and no link (apps/tracy-web/src/mail/templates/sign-in-code.html), and the verify door binds a code to no device; whether a code may be used in another browser is not stated by the API reference or by #993, and the device sign-in doors (/signin?n=, /signin/approve) need two browser contexts this layer does not have'
  },
  {
    key: 'signin-provider-success',
    door: 'GET /signin/{provider}/callback',
    tag: 'happy',
    title: 'Sign-in with a provider: a verified address comes back signed in, at the page it was going to',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}, GET /signin/{provider}/callback',
      invariant:
        'a callback carrying the state this browser was given and a code the provider accepts sets a session for the verified address and redirects to next'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: VERIFIED }).fetchImpl
      })
      const { start, state, cookie } = await startGoogle(s, '/acme/')
      note('start', start)
      const back = note('callback', await callback(s, { state, code: 'qa-code', cookie }))
      const session = sessionOf(back)
      const who = session ? note('me', await me(s, session)) : null
      return verdict(
        '302 to next with a session for the verified address',
        [
          [back.status === 302, `the callback answered ${short(back)}`],
          [back.headers.location === `${ORIGIN}/acme/`, `it redirects to ${back.headers.location}`],
          [session !== null, 'no session cookie was set'],
          [who?.json?.email === VERIFIED.email, `/auth/me names ${who?.json?.email ?? 'nobody'}`]
        ],
        [
          [
            start.status === 302 && Boolean(state) && Boolean(cookie),
            `the sign-in did not start (${short(start)})`
          ]
        ]
      )
    }
  },
  {
    key: 'signin-provider-cancelled',
    door: 'GET /signin/{provider}/callback',
    tag: 'invalid',
    title:
      'Sign-in cancelled at the provider: the page says it was cancelled, signs nobody in, and leads back',
    oracle: {
      source: ISSUE_993,
      ref: 'Expected: "A sign-in cancelled at the provider says so … Stale / expired / foreign state keeps today\'s sentence. The state stays single-use."',
      invariant:
        'a callback with error=access_denied and no code shows a page that does not blame time or another browser, sets no session, offers the way back to sign in and burns the state'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: VERIFIED }).fetchImpl
      })
      const { start, state, cookie } = await startGoogle(s, '/acme/')
      const back = note(
        'cancelled',
        await callback(s, { state, cookie, extra: '&error=access_denied', headers: HTML })
      )
      const again = note('same state again', await callback(s, { state, code: 'qa-code', cookie }))
      return verdict(
        'a cancelled sign-in is told as cancelled, with no session and the way back',
        [
          [back.status === 400, `the callback answered ${short(back)}`],
          [sessionOf(back) === null, 'a cancelled sign-in set a session'],
          [/href="\/login[^"]*"/.test(back.text), 'the page has no link back to sign in'],
          [
            sessionOf(again) === null && again.status === 400,
            `the state answered a second time (${short(again)})`
          ],
          [
            !/took too long|another browser/i.test(back.text),
            'the page says "The sign-in took too long, or it was started in another browser" to a person who cancelled at the provider (#993)'
          ]
        ],
        [[start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`]]
      )
    }
  },
  {
    key: 'signin-provider-state-other-browser',
    door: 'GET /signin/{provider}/callback',
    tag: 'other-tenant',
    title: 'Sign-in with a provider: a callback opened in a browser that never started it signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (400 OAUTH_STATE_INVALID)',
      invariant:
        'a valid state without the state cookie of the browser that started it is refused 400 and sets no session'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: VERIFIED }).fetchImpl
      })
      const { start, state } = await startGoogle(s)
      const back = note('no state cookie', await callback(s, { state, code: 'qa-code', cookie: null }))
      return verdict(
        '400 OAUTH_STATE_INVALID, no session',
        [
          [
            back.status === 400 && back.json?.code === 'OAUTH_STATE_INVALID',
            `the callback answered ${short(back)}`
          ],
          [sessionOf(back) === null, 'a session was set for a browser that never started the sign-in']
        ],
        [[start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`]]
      )
    }
  },
  {
    key: 'signin-provider-state-expired',
    door: 'GET /signin/{provider}/callback',
    tag: 'expired-auth',
    title: 'Sign-in with a provider: a callback that arrives after the state expired signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (400 OAUTH_STATE_INVALID)',
      invariant: 'a state older than its ten minutes is refused 400 and sets no session'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: VERIFIED }).fetchImpl
      })
      const { start, state, cookie } = await startGoogle(s)
      s.clock.t += 11 * MINUTE
      const back = note('eleven minutes', await callback(s, { state, code: 'qa-code', cookie }))
      return verdict(
        '400 OAUTH_STATE_INVALID, no session',
        [
          [
            back.status === 400 && back.json?.code === 'OAUTH_STATE_INVALID',
            `the callback answered ${short(back)}`
          ],
          [sessionOf(back) === null, 'an expired state set a session']
        ],
        [[start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`]]
      )
    }
  },
  {
    key: 'signin-provider-refuses',
    door: 'GET /signin/{provider}/callback',
    tag: 'dependency-failure',
    title:
      'Sign-in with a provider: a refused code exchange or a provider that cannot be reached signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (400 … or a provider error code, 502 EXCHANGE_FAILED)',
      invariant:
        'a refused exchange answers 400 EXCHANGE_FAILED and an unreachable provider 502 EXCHANGE_FAILED; neither sets a session nor shows what the provider said'
    },
    async run(env, note) {
      const refusing = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: null }).fetchImpl
      })
      const a = await startGoogle(refusing)
      const refused = note(
        'refused',
        await callback(refusing, { state: a.state, code: 'qa-code', cookie: a.cookie })
      )
      const down = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ down: true }).fetchImpl
      })
      const b = await startGoogle(down)
      const unreachable = note(
        'unreachable',
        await callback(down, { state: b.state, code: 'qa-code', cookie: b.cookie })
      )
      return verdict(
        '400 then 502 EXCHANGE_FAILED, no session, no provider detail',
        [
          [
            refused.status === 400 && refused.json?.code === 'EXCHANGE_FAILED',
            `a refused exchange answered ${short(refused)}`
          ],
          [unreachable.status === 502, `an unreachable provider answered ${short(unreachable)}`],
          [
            unreachable.json?.code === 'EXCHANGE_FAILED',
            `an unreachable provider answered ${short(unreachable)}`
          ],
          [sessionOf(refused) === null && sessionOf(unreachable) === null, 'a failed exchange set a session'],
          [
            !/invalid_grant|connection reset/.test(`${refused.text}${unreachable.text}`),
            "the answer repeats the provider's own words"
          ]
        ],
        [[Boolean(a.state) && Boolean(b.state), 'the sign-in did not start']]
      )
    }
  },
  {
    key: 'signin-provider-unverified-email',
    door: 'GET /signin/{provider}/callback',
    tag: 'invalid',
    title: 'Sign-in with a provider: an address the provider has not verified signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (provider error code)',
      invariant: 'an unverified provider address answers 400 EMAIL_NOT_VERIFIED and sets no session'
    },
    async run(env, note) {
      const claims = { ...VERIFIED, email_verified: false }
      const s = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: claims }).fetchImpl
      })
      const { start, state, cookie } = await startGoogle(s)
      const back = note('unverified', await callback(s, { state, code: 'qa-code', cookie }))
      return verdict(
        '400 EMAIL_NOT_VERIFIED, no session',
        [
          [
            back.status === 400 && back.json?.code === 'EMAIL_NOT_VERIFIED',
            `the callback answered ${short(back)}`
          ],
          [sessionOf(back) === null, 'an unverified address was signed in']
        ],
        [[start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`]]
      )
    }
  },
  {
    key: 'signin-provider-not-offered',
    door: 'GET /signin/{provider}',
    tag: 'invalid',
    title:
      'Sign-in with a provider this deployment does not offer is a 404, for the start and for the callback',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider} (404 for a provider that is not configured)',
      invariant: 'a provider with no credentials on this deployment answers 404 and redirects nowhere'
    },
    async run(env, note) {
      const offered = bootScenario(env, { extraEnv: OAUTH_ENV })
      const control = note('control: offered', await offered.send({ method: 'GET', path: '/signin/google' }))
      const bare = bootScenario(env)
      const start = note('start', await bare.send({ method: 'GET', path: '/signin/google' }))
      const back = note(
        'callback',
        await bare.send({ method: 'GET', path: '/signin/google/callback?state=x&code=y' })
      )
      return verdict(
        '404 for both doors, no redirect, no session',
        [
          [start.status === 404, `the start door answered ${short(start)}`],
          [back.status === 404, `the callback answered ${short(back)}`],
          [!start.headers.location && sessionOf(back) === null, 'the door redirected or signed in']
        ],
        [[control.status === 302, `a configured provider did not start (${short(control)})`]]
      )
    }
  },
  {
    key: 'signin-failure-page-way-back',
    door: 'GET /signin/{provider}/callback',
    tag: 'invalid',
    title: 'The sign-in failure page leads back to sign in, to where the person was going and nowhere else',
    oracle: {
      source: ISSUE_993,
      ref: '`next` handling: a retry from the failure page ends where the person was going; an off-origin `next` is dropped',
      invariant:
        'a navigation that fails after the state was taken gets a page whose one link is /login carrying the same-origin next; an off-origin next never appears in it'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: OAUTH_ENV,
        fetchImpl: providerDouble({ google: null }).fetchImpl
      })
      const a = await startGoogle(s, '/acme/')
      const page = note(
        'refused, next=/acme/',
        await callback(s, { state: a.state, code: 'qa-code', cookie: a.cookie, headers: HTML })
      )
      const b = await startGoogle(s, 'https://evil.invalid/steal')
      const hostile = note(
        'refused, off-origin next',
        await callback(s, { state: b.state, code: 'qa-code', cookie: b.cookie, headers: HTML })
      )
      const want = `/login?next=${encodeURIComponent(`${ORIGIN}/acme/`)}`
      const href = (obs) =>
        /<a class="back" href="([^"]*)"/.exec(obs.text)?.[1]?.replaceAll('&amp;', '&') ?? null
      return verdict(
        'the page links to /login with the same-origin next; an off-origin next is dropped',
        [
          [
            page.status === 400 && /text\/html/.test(page.headers['content-type'] ?? ''),
            `the refusal is ${short(page)}`
          ],
          [href(page) === want, `the way back is ${href(page)}, expected ${want}`],
          [href(hostile) === '/login', `with an off-origin next the way back is ${href(hostile)}`],
          [!/evil\.invalid/.test(hostile.text), 'the off-origin address is on the page'],
          [sessionOf(page) === null && sessionOf(hostile) === null, 'a failed sign-in set a session']
        ],
        [[Boolean(a.state) && Boolean(b.state), 'the sign-in did not start']]
      )
    }
  },
  {
    key: 'signin-session-after-reload',
    door: 'GET /auth/me',
    tag: 'repeat',
    title:
      'A session survives a reload: every /auth/me with the cookie names the person, and none without it',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /auth/me',
      invariant:
        'the door answers 200 with the address of the session cookie each time, and 200 with email null without one'
    },
    mail: true,
    async run(env, note) {
      const s = bootScenario(env)
      const email = 'reload@qa.test'
      await askCode(s, email)
      const done = await verify(s, email, codeFor(s.sent, email))
      const cookie = sessionOf(done)
      const first = note('first load', await me(s, cookie))
      s.clock.t += 30 * MINUTE
      const second = note('reload, 30 minutes later', await me(s, cookie))
      const guest = note('no cookie', await me(s, null))
      return verdict(
        'the same address on each load; a guest reads email null',
        [
          [first.status === 200 && first.json?.email === email, `the first load read ${short(first)}`],
          [second.status === 200 && second.json?.email === email, `the reload read ${short(second)}`],
          [
            guest.status === 200 && guest.json?.email === null,
            `without a cookie the door read ${short(guest)}`
          ]
        ],
        [[cookie !== null, `sign-in did not set a session (${short(done)})`]]
      )
    }
  },
  {
    key: 'signin-signout',
    door: 'POST /auth/signout',
    tag: 'cleanup',
    title: 'Sign-out clears the session cookie in the browser',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /auth/signout',
      invariant: 'the door answers 200 {ok:true} and expires the session cookie'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const cookie = await env.principals.cookie(FIXTURE.owner)
      const before = note('control: signed in', await me(s, cookie))
      const out = note(
        'signout',
        await s.send({ method: 'POST', path: '/auth/signout', headers: { ...SAME_ORIGIN, cookie } })
      )
      const cleared = cookieOf(out, 'tracy_sess')
      return verdict(
        '200 {ok:true} and tracy_sess expired',
        [
          [out.status === 200 && out.json?.ok === true, `sign-out answered ${short(out)}`],
          [cleared !== null && cleared.value === '', 'the answer does not empty tracy_sess'],
          [/max-age=0/i.test(cleared?.line ?? ''), `the cookie is not expired: ${cleared?.line}`]
        ],
        [[before.json?.email === FIXTURE.owner, `the fixture session was not read (${short(before)})`]]
      )
    }
  }
]

// ── publish and own domain ────────────────────────────────────────────────────────────────────
const SITE = encodeURIComponent(FIXTURE.siteA)
const LABEL = 'qa-a'
// Under an ICANN suffix (the address door refuses anything else, `ownable` in sites/address.js), and a
// subdomain, since a bare domain is refused. example.com is reserved (RFC 2606): never a customer's.
const DOMAIN = 'shop.example.com'
const TUNNEL = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com'
const PUBLISH_CASE = 'tests/regression/cases/REG-PR-948-site-publish-flow.json'
const CHANGELOG = 'docs/references/api-changelog.md'
/** The closing line `go-live.sh` prints when every step went through. */
const closing = (op) => `TRACY_RESULT go_live=${op} label=${LABEL} platform=joomla\n`

/**
 * A stand-in for tracy-host, answering what the product asks through its own signed client:
 * `POST /_host/go-live` (one job per job key), `POST /_host/routing-target`, `GET /_host/jobs/<id>`.
 * `jobs[id]` is the record a later read gets; `unreachable` breaks the connection for go-live.
 */
function hostDouble({ target = TUNNEL, unreachable = false } = {}) {
  const calls = []
  const site = []
  const jobs = {}
  const keyed = new Map()
  return {
    calls,
    site,
    jobs,
    goLive: () => calls.filter((c) => c.path === '/_host/go-live').map((c) => c.body),
    fetchImpl: async (input, init) => {
      const url = new URL(String(input?.url ?? input))
      const body = url.pathname.startsWith('/_host/') && init?.body ? JSON.parse(init.body) : null
      if (url.pathname.startsWith('/_host/')) calls.push({ path: url.pathname, body })
      if (url.pathname === '/_host/go-live') {
        if (unreachable) throw new Error('qa: host connection reset')
        if (keyed.has(body.jobKey))
          return Response.json({ jobId: keyed.get(body.jobKey), reused: true }, { status: 202 })
        const id = `golive-${keyed.size + 1}`
        keyed.set(body.jobKey, id)
        jobs[id] = { state: 'queued', step: `go-live:${body.op}` }
        return Response.json({ jobId: id }, { status: 202 })
      }
      if (url.pathname === '/_host/routing-target')
        return target === null
          ? Response.json({ code: 'NOT_CONFIGURED' }, { status: 501 })
          : Response.json({ target })
      if (url.pathname.startsWith('/_host/jobs/')) {
        const record = jobs[url.pathname.slice('/_host/jobs/'.length)]
        return record ? Response.json(record) : Response.json({ code: 'NOT_FOUND' }, { status: 404 })
      }
      if (url.pathname.startsWith('/_host/')) return new Response(null, { status: 404 })
      // Anything else is the site's own copy, asked through Tracy's proxy: kept with the headers it
      // was sent, and answered with a page.
      const headers = {}
      new Headers(init?.headers ?? input?.headers ?? {}).forEach((v, k) => (headers[k] = v))
      site.push({ url: url.href, headers })
      return new Response('<!doctype html><title>QA site</title><p>home</p>', {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }
  }
}

/**
 * A probe of the real domain (`sites/domain-probe.js` `probeDomain`) the scenario answers itself:
 * each look takes the next reading, the last one repeating. It stands for the network between Tracy
 * and the customer's domain; what a reading MEANS for the domain is the product's own code.
 */
function probeDouble(readings) {
  const asked = []
  const queue = [...readings]
  return {
    asked,
    probe: async (row) => {
      asked.push(row.name)
      return queue.length > 1 ? queue.shift() : queue[0]
    }
  }
}

/** A resolver the scenario answers itself: `{ txt: { name: [[value]] }, cname: { name: [target] } }`. */
function dnsDouble(records = { txt: {}, cname: {} }) {
  const asked = []
  const answer = (kind) => async (name) => {
    asked.push(`${kind} ${name}`)
    const found = records[kind]?.[name]
    if (found === undefined)
      throw Object.assign(new Error('qa: no such record'), { code: kind === 'txt' ? 'ENOTFOUND' : 'ENODATA' })
    return found
  }
  return { asked, records, dns: { resolveTxt: answer('txt'), resolveCname: answer('cname') } }
}

async function publishStand(env, { hostOptions, records, probe } = {}) {
  const host = hostDouble(hostOptions)
  const resolver = dnsDouble(records)
  const s = bootScenario(env, {
    fetchImpl: host.fetchImpl,
    dns: resolver.dns,
    host: true,
    ...(probe ? { ownDomainProbe: probe.probe } : {})
  })
  const as = async (who) => ({ cookie: await env.principals.cookie(FIXTURE[who]) })
  const post = async (who, path, body, method = 'POST') =>
    s.send({ method, path, headers: { ...JSON_HEADERS, ...(await as(who)) }, body })
  const get = async (who, path) => s.send({ method: 'GET', path, headers: await as(who) })
  const state = async (who = 'owner') => (await get(who, `/api/sites/${SITE}/state`)).json ?? {}
  const flag = async () =>
    (await env.pool.query('select publish from site where site_key = $1', [FIXTURE.siteA])).rows[0]?.publish
  return { s, host, resolver, post, get, state, flag }
}
const goLive = (stand, who, op) => stand.post(who, `/api/sites/${SITE}/go-live`, { op })
const connect = (stand, who, name = DOMAIN) =>
  stand.post(who, `/api/sites/${SITE}/address`, { name, kind: 'custom' }, 'PUT')
const checkDns = (stand, who, name = DOMAIN) => stand.post(who, `/api/sites/${SITE}/address/verify`, { name })
const checkOf = (obs, record) => obs.json?.pending?.checks?.find((c) => c.record === record) ?? {}
/** A finished `go-live.sh` that installed the route of the own domain (its `==> ingress:` line). */
const routedJob = () => ({
  state: 'done',
  step: 'go-live:live',
  exitCode: 0,
  output: `==> go-live\n==> ingress: ${DOMAIN} → tracy-web (route installed)\n${closing('live')}`
})
/**
 * Save the own domain, put its TXT where the resolver answers it, and publish: the publish reads both
 * records and carries the domain. `routed` (default) ends the host's job with the route installed.
 */
async function publishWithDomain(stand, records, { routed = true } = {}) {
  const saved = await connect(stand, 'owner')
  records.txt[`_tracy.${DOMAIN}`] = [[saved.json?.pending?.verification?.value]]
  const live = await goLive(stand, 'owner', 'live')
  if (routed && live.json?.jobId) stand.host.jobs[live.json.jobId] = routedJob()
  return live
}

const PUBLISH_SCENARIOS = [
  {
    key: 'publish-live-then-back-to-draft',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'happy',
    title:
      'Publish: draft → Publish → Live → Back to draft, the flag following the host and never ahead of it',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'FLAG: "going live: 202 with the job, the flag stays draft while the job runs"; back to draft',
      invariant:
        'Publish answers 202 with the site still a draft; it reads published only once the host job is done with its closing line; Back to draft lowers the flag at once and the finished job leaves a draft with no operation'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const before = await stand.state()
      const live = note('publish', await goLive(stand, 'owner', 'live'))
      const during = await stand.state()
      stand.host.jobs[live.json?.jobId] = {
        state: 'done',
        step: 'go-live:live',
        exitCode: 0,
        output: closing('live')
      }
      const after = await stand.state()
      const draft = note('back to draft', await goLive(stand, 'owner', 'draft'))
      const lowered = await stand.flag()
      stand.host.jobs[draft.json?.jobId] = {
        state: 'done',
        step: 'go-live:draft',
        exitCode: 0,
        output: closing('draft')
      }
      const end = await stand.state()
      return verdict(
        'draft → 202 (still draft) → published after the closing line → 202 back to draft → draft',
        [
          [live.status === 202 && live.json?.state === 'running', `Publish answered ${short(live)}`],
          [
            live.json?.publish === 'draft' && during.publish === 'draft',
            'the site read published while the job was still running'
          ],
          [
            during.operation?.op === 'live' && during.operation?.state === 'running',
            `the running operation reads ${JSON.stringify(during.operation)}`
          ],
          [
            after.publish === 'published' && after.operation === null,
            `after the job ended the state reads ${JSON.stringify({ publish: after.publish, operation: after.operation })}`
          ],
          [
            draft.status === 202 && draft.json?.publishFlipped === true,
            `Back to draft answered ${short(draft)}`
          ],
          [lowered === 'draft', `the flag is ${lowered} while the draft job runs`],
          [
            end.publish === 'draft' && end.operation === null,
            `at the end the state reads ${JSON.stringify({ publish: end.publish, operation: end.operation })}`
          ]
        ],
        [
          [
            before.publish === 'draft' && before.mayPublish === true,
            `the fixture site is not a draft its owner may publish (${JSON.stringify(before)})`
          ]
        ]
      )
    }
  },
  {
    key: 'publish-done-without-closing-line',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'dependency-failure',
    title: 'Publish: a host job recorded done without the closing line of its script does not open the site',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'CLOSINGLINE: "a job the host calls done without the closing line of its script is not believed"',
      invariant: 'the site stays a draft and the operation reads failed with JOB_NO_RESULT'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const live = note('publish', await goLive(stand, 'owner', 'live'))
      stand.host.jobs[live.json?.jobId] = {
        state: 'done',
        step: 'go-live:live',
        exitCode: 0,
        output: 'all steps ran\n'
      }
      const after = await stand.state()
      return verdict(
        'the site stays a draft; the operation failed with JOB_NO_RESULT',
        [
          [after.publish === 'draft' && (await stand.flag()) === 'draft', `the site reads ${after.publish}`],
          [
            after.operation?.state === 'failed' && after.operation?.code === 'JOB_NO_RESULT',
            `the operation reads ${JSON.stringify(after.operation)}`
          ]
        ],
        [[live.status === 202, `Publish was not taken (${short(live)})`]]
      )
    }
  },
  {
    key: 'publish-roles',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'wrong-role',
    title: 'Publish: Owner and Editor may publish; a Viewer is refused before the host hears of it',
    oracle: {
      source: 'apps/tracy-web/src/seats/roles.js',
      ref: 'actingEditor: "Edit rights: change the site through Tracy, publish, restore"; API reference go-live "Owner or editor only (403 NOT_SITE_EDITOR)"',
      invariant:
        'a Viewer press answers 403 NOT_SITE_EDITOR with nothing asked of the host; an Editor press is taken'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      // The control first: its operation then holds the site, so a press that got past the role
      // gate would be told PUBLISH_BUSY, never NOT_SITE_EDITOR.
      const editor = note('control: editor', await goLive(stand, 'editor', 'live'))
      const askedBefore = stand.host.goLive().length
      const viewer = note('viewer', await goLive(stand, 'viewer', 'live'))
      const asked = stand.host.goLive().length - askedBefore
      const view = await stand.state('viewer')
      return verdict(
        '403 NOT_SITE_EDITOR for a Viewer, host not asked, mayPublish false',
        [
          [
            viewer.status === 403 && viewer.json?.code === 'NOT_SITE_EDITOR',
            `a Viewer press answered ${short(viewer)}`
          ],
          [asked === 0, `the host was asked ${asked} time(s) for a refused press`],
          [view.mayPublish === false, `the state tells a Viewer mayPublish ${view.mayPublish}`]
        ],
        [[editor.status === 202, `an Editor press was not taken (${short(editor)})`]]
      )
    }
  },
  {
    key: 'publish-double-press',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'concurrent',
    title: 'Publish: four presses at once start one job; the others are told the site is busy',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'GUARD: "a double click, a second tab: two presses at once start ONE job"',
      invariant:
        'exactly one press answers 202, every other 409 PUBLISH_BUSY, and the host is asked under one job key'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const all = await Promise.all([1, 2, 3, 4].map(() => goLive(stand, 'owner', 'live')))
      all.forEach((o, i) => note(`press ${i + 1}`, o))
      const statuses = all.map((o) => o.status).sort()
      const busy = all.filter((o) => o.status === 409)
      const keys = new Set(stand.host.goLive().map((b) => b.jobKey))
      return verdict('one 202, three 409 PUBLISH_BUSY, one job key', [
        [
          JSON.stringify(statuses) === '[202,409,409,409]',
          `the four presses answered ${JSON.stringify(statuses)}`
        ],
        [
          busy.every((o) => o.json?.code === 'PUBLISH_BUSY'),
          `a refused press said ${JSON.stringify(busy.map((o) => o.json?.code))}`
        ],
        [keys.size === 1, `the host was asked under ${keys.size} job key(s)`]
      ])
    }
  },
  {
    key: 'publish-host-unreachable',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'dependency-failure',
    title: 'Publish: no answer from the host is neither a success nor a failure; the operation is held',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'UNCONFIRMED: "no answer from the host: nothing is called a success or a failure"',
      invariant:
        'the door answers 504 HOST_UNREACHABLE, the site stays a draft with a held unconfirmed operation, and a second press is 409 PUBLISH_BUSY'
    },
    async run(env, note) {
      const stand = await publishStand(env, { hostOptions: { unreachable: true } })
      const live = note('publish', await goLive(stand, 'owner', 'live'))
      const after = await stand.state()
      const again = note('second press', await goLive(stand, 'owner', 'live'))
      return verdict('504 HOST_UNREACHABLE, draft, operation held unconfirmed, second press 409', [
        [live.status === 504 && live.json?.code === 'HOST_UNREACHABLE', `Publish answered ${short(live)}`],
        [after.publish === 'draft', `the site reads ${after.publish}`],
        [
          after.operation?.state === 'running' && after.operation?.confirmed === false,
          `the operation reads ${JSON.stringify(after.operation)}`
        ],
        [
          again.status === 409 && again.json?.code === 'PUBLISH_BUSY',
          `a second press answered ${short(again)}`
        ]
      ])
    }
  },
  {
    key: 'publish-domains-field-refused',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'invalid',
    title: 'Publish: a domain typed into the publish request is refused by name and never reaches the host',
    oracle: {
      source: CHANGELOG,
      ref: 'go-live: `domains` is refused (DOMAINS_NOT_SUPPORTED)',
      invariant: 'a body carrying `domains` answers 400 DOMAINS_NOT_SUPPORTED with nothing asked of the host'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const res = note(
        'publish with domains',
        await stand.post('owner', `/api/sites/${SITE}/go-live`, { op: 'live', domains: ['evil.example'] })
      )
      const asked = stand.host.goLive().length
      const control = note('control', await goLive(stand, 'owner', 'live'))
      return verdict(
        '400 DOMAINS_NOT_SUPPORTED, host not asked',
        [
          [
            res.status === 400 && res.json?.code === 'DOMAINS_NOT_SUPPORTED',
            `the door answered ${short(res)}`
          ],
          [asked === 0, `the host was asked ${asked} time(s)`]
        ],
        [[control.status === 202, `a plain Publish was not taken (${short(control)})`]]
      )
    }
  },
  {
    key: 'domain-connect-owner',
    door: 'PUT /api/sites/{key}/address',
    tag: 'happy',
    title:
      'Connect domain as Owner: the two records to create are shown, and nothing reads as checked before a lookup',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'part 2: "DNS shown only as measured"; api-changelog PUT /api/sites/{key}/address (kind)',
      invariant:
        'the Owner gets 202 with the domain pending, a TXT record at _tracy.<name>, the CNAME target the host names, both checks unchecked, and no lookup made'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const saved = note('connect', await connect(stand, 'owner'))
      const d = saved.json?.pending ?? {}
      return verdict('202 pending with the TXT and CNAME records, both unchecked, resolver not asked', [
        [saved.status === 202 && saved.json?.state === 'pending', `Connect answered ${short(saved)}`],
        [
          d.name === DOMAIN && d.state === 'pending',
          `the domain reads ${JSON.stringify({ name: d.name, state: d.state })}`
        ],
        [
          d.verification?.type === 'TXT' && d.verification?.name === `_tracy.${DOMAIN}`,
          `the ownership record is ${JSON.stringify(d.verification)}`
        ],
        [/^[0-9a-f]{48}$/.test(d.verification?.value ?? ''), 'the ownership value is not a 48-hex token'],
        [
          d.routing?.type === 'CNAME' && d.routing?.value === TUNNEL,
          `the routing record is ${JSON.stringify(d.routing)}`
        ],
        [
          (d.checks ?? []).length === 2 && d.checks.every((c) => c.status === 'unchecked'),
          `the checks read ${JSON.stringify((d.checks ?? []).map((c) => c.status))}`
        ],
        [
          d.readiness?.ownership === false && d.readiness?.routing === false,
          'a record reads ready before any lookup'
        ],
        [stand.resolver.asked.length === 0, `DNS was asked on save: ${stand.resolver.asked.join(', ')}`]
      ])
    }
  },
  {
    key: 'domain-connect-non-owner',
    door: 'PUT /api/sites/{key}/address',
    tag: 'wrong-role',
    title: 'Connect domain as a non-owner: Editor and Viewer are refused, and no name is reserved',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'part 2 (own domain); T-ADDR "only the Owner connects, checks or removes a domain"',
      invariant:
        'every seat but the Owner gets 403 NOT_SITE_OWNER from the address door and the site holds no domain afterwards'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const tries = []
      for (const who of ['editor', 'viewer']) tries.push([who, note(who, await connect(stand, who))])
      const rows = await env.pool.query("select 1 from site_name where site_key = $1 and kind = 'custom'", [
        FIXTURE.siteA
      ])
      const control = note('control: owner', await connect(stand, 'owner'))
      return verdict(
        '403 NOT_SITE_OWNER for Editor and Viewer; nothing reserved',
        [
          ...tries.map(([who, o]) => [
            o.status === 403 && o.json?.code === 'NOT_SITE_OWNER',
            `${who} got ${short(o)}`
          ]),
          [rows.rowCount === 0, `${rows.rowCount} domain row(s) exist after refused presses`]
        ],
        [[control.status === 202, `the Owner could not connect either (${short(control)})`]]
      )
    }
  },
  {
    key: 'domain-switch-off',
    door: 'PUT /api/ops/ui',
    tag: 'happy',
    title:
      'Switching `site-connect-domain` off in /ops lists it as hidden for every page, and on again unlists it',
    oracle: {
      source: 'packages/core/tracy-core/src/ui-switches/catalogue.json',
      ref: 'switch `site-connect-domain` (group right-tabs, defaultOn true); API reference PUT /api/ops/ui, GET /api/ui',
      invariant:
        'a staff press {site-connect-domain:false} makes GET /api/ui list the id in `hidden`; pressing true removes it; the default is shown'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const staff = { ...JSON_HEADERS, cookie: await env.principals.cookie(FIXTURE.staff) }
      const press = (on) =>
        s.send({
          method: 'PUT',
          path: '/api/ops/ui',
          headers: staff,
          body: { switches: { 'site-connect-domain': on } }
        })
      const read = async () => (await s.send({ method: 'GET', path: '/api/ui' })).json?.hidden
      const before = await read()
      const off = note('off', await press(false))
      const hidden = await read()
      const on = note('on', await press(true))
      const shown = await read()
      return verdict(
        'hidden lists site-connect-domain after the off press and not after the on press',
        [
          [off.status === 200, `the off press answered ${short(off)}`],
          [
            Array.isArray(hidden) && hidden.includes('site-connect-domain'),
            `GET /api/ui hidden reads ${JSON.stringify(hidden)}`
          ],
          [
            on.status === 200 && Array.isArray(shown) && !shown.includes('site-connect-domain'),
            `after the on press hidden reads ${JSON.stringify(shown)}`
          ]
        ],
        [
          [
            Array.isArray(before) && !before.includes('site-connect-domain'),
            `the switch is not shown by default (${JSON.stringify(before)})`
          ]
        ]
      )
    }
  },
  {
    key: 'domain-dns-missing',
    door: 'POST /api/sites/{key}/address/verify',
    tag: 'empty',
    title:
      'Check DNS with no record yet: both records read missing, with what the lookup said, and nothing is ready',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'part 2: "DNS shown only as measured"',
      invariant:
        'a name with no TXT and no CNAME reads ownership missing (NXDOMAIN) and routing missing (NODATA); the domain stays pending'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const saved = await connect(stand, 'owner')
      const checked = note('check dns', await checkDns(stand, 'owner'))
      const own = checkOf(checked, 'ownership')
      const route = checkOf(checked, 'routing')
      return verdict(
        'ownership missing (NXDOMAIN), routing missing (NODATA), still pending',
        [
          [
            checked.status === 202 && checked.json?.state === 'pending',
            `Check DNS answered ${short(checked)}`
          ],
          [own.status === 'missing' && own.error === 'NXDOMAIN', `ownership reads ${JSON.stringify(own)}`],
          [route.status === 'missing' && route.error === 'NODATA', `routing reads ${JSON.stringify(route)}`],
          [
            checked.json?.pending?.readiness?.ownership === false &&
              checked.json?.pending?.readiness?.routing === false,
            'a missing record reads ready'
          ]
        ],
        [
          [saved.status === 202, `the domain was not saved (${short(saved)})`],
          [stand.resolver.asked.length > 0, 'the stub resolver was never asked']
        ]
      )
    }
  },
  {
    key: 'domain-dns-wrong-record',
    door: 'POST /api/sites/{key}/address/verify',
    tag: 'invalid',
    title:
      'Check DNS with the wrong records: each reads wrong with the value the lookup returned, and nothing is ready',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'part 2: "DNS shown only as measured"',
      invariant:
        'a TXT with another value and a CNAME to another name read wrong with the observed values; the domain stays pending and not ready'
    },
    async run(env, note) {
      const records = {
        txt: { [`_tracy.${DOMAIN}`]: [['not-the-token']] },
        cname: { [DOMAIN]: ['elsewhere.example'] }
      }
      const stand = await publishStand(env, { records })
      const saved = await connect(stand, 'owner')
      const checked = note('check dns', await checkDns(stand, 'owner'))
      const own = checkOf(checked, 'ownership')
      const route = checkOf(checked, 'routing')
      return verdict(
        'ownership wrong and routing wrong, each with the observed value',
        [
          [
            own.status === 'wrong' && (own.observed ?? []).includes('not-the-token'),
            `ownership reads ${JSON.stringify(own)}`
          ],
          [
            route.status === 'wrong' && (route.observed ?? []).includes('elsewhere.example'),
            `routing reads ${JSON.stringify(route)}`
          ],
          [checked.json?.state === 'pending', `the domain reads ${checked.json?.state}`],
          [
            checked.json?.pending?.readiness?.ownership === false &&
              checked.json?.pending?.readiness?.routing === false,
            'a wrong record reads ready'
          ]
        ],
        [
          [
            saved.status === 202 && checked.status === 202,
            `the doors answered ${short(saved)} / ${short(checked)}`
          ]
        ]
      )
    }
  },
  {
    key: 'domain-dns-right-record',
    door: 'POST /api/sites/{key}/address/verify',
    tag: 'happy',
    title:
      'Check DNS with the right records: both read ok, and the domain still waits for a publish to connect it',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'part 2: "the site\'s own domain through the same operation"',
      invariant:
        'a TXT holding the token and a CNAME to the host target read ok and ready; the domain stays pending until a publish carries it'
    },
    async run(env, note) {
      const records = { txt: {}, cname: { [DOMAIN]: [TUNNEL] } }
      const stand = await publishStand(env, { records })
      const saved = await connect(stand, 'owner')
      records.txt[`_tracy.${DOMAIN}`] = [[saved.json?.pending?.verification?.value]]
      const checked = note('check dns', await checkDns(stand, 'owner'))
      const own = checkOf(checked, 'ownership')
      const route = checkOf(checked, 'routing')
      return verdict(
        'ownership ok, routing ok, ready, still pending',
        [
          [own.status === 'ok', `ownership reads ${JSON.stringify(own)}`],
          [route.status === 'ok', `routing reads ${JSON.stringify(route)}`],
          [
            checked.json?.pending?.readiness?.ownership === true &&
              checked.json?.pending?.readiness?.routing === true,
            `readiness reads ${JSON.stringify(checked.json?.pending?.readiness)}`
          ],
          [checked.json?.state === 'pending', `a proven record alone made the domain ${checked.json?.state}`]
        ],
        [
          [
            saved.status === 202 && checked.status === 202,
            `the doors answered ${short(saved)} / ${short(checked)}`
          ]
        ]
      )
    }
  },
  {
    key: 'domain-already-taken',
    door: 'PUT /api/sites/{key}/address',
    tag: 'other-tenant',
    title: 'Connect domain: a name another site already holds is refused, and availability says it is taken',
    oracle: {
      source: PUBLISH_CASE,
      ref: 'part 2 (own domain); T-ADDR "a reading written for one site is never read as another site\'s"',
      invariant:
        'the second site gets 409 NAME_TAKEN from the address door and available:false NAME_TAKEN from availability'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const other = encodeURIComponent(FIXTURE.siteB)
      const first = note(
        'control: site B saves the name',
        await stand.post('outsider', `/api/sites/${other}/address`, { name: DOMAIN, kind: 'custom' }, 'PUT')
      )
      const taken = note('site A saves the same name', await connect(stand, 'owner'))
      const free = note(
        'availability',
        await stand.get('owner', `/api/sites/${SITE}/address/availability?name=${DOMAIN}&kind=custom`)
      )
      const rows = await env.pool.query("select 1 from site_name where site_key = $1 and kind = 'custom'", [
        FIXTURE.siteA
      ])
      return verdict(
        '409 NAME_TAKEN; availability available:false NAME_TAKEN; nothing reserved for the second site',
        [
          [taken.status === 409 && taken.json?.code === 'NAME_TAKEN', `the second site got ${short(taken)}`],
          [
            free.status === 200 && free.json?.available === false && free.json?.code === 'NAME_TAKEN',
            `availability said ${short(free)}`
          ],
          [rows.rowCount === 0, 'the second site holds the name']
        ],
        [[first.status === 202, `the first site could not save the name (${short(first)})`]]
      )
    }
  },
  {
    key: 'domain-bare-name-refused',
    door: 'PUT /api/sites/{key}/address',
    tag: 'invalid',
    title: 'Connect a bare domain: refused with the www name to enter instead, and nothing reserved',
    oracle: {
      source: 'apps/tracy-web/src/sites/address.js',
      ref: '`ownable`: "DOMAIN_APEX_UNSUPPORTED, with `www.` of it to enter instead"; #1037',
      invariant:
        'example.com answers 400 DOMAIN_APEX_UNSUPPORTED naming www.example.com, availability says the same, no row is written; www.example.com is available'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      // Asked first: the limit of one name would hide it once a wrong reservation was made.
      const control = note(
        'control: availability of the www name',
        await stand.get('owner', `/api/sites/${SITE}/address/availability?name=www.example.com&kind=custom`)
      )
      const bare = note('bare name', await connect(stand, 'owner', 'example.com'))
      const asked = note(
        'availability of the bare name',
        await stand.get('owner', `/api/sites/${SITE}/address/availability?name=example.com&kind=custom`)
      )
      const rows = await env.pool.query(
        "select name from site_name where site_key = $1 and kind = 'custom'",
        [FIXTURE.siteA]
      )
      const told = (o) =>
        o.json?.code === 'DOMAIN_APEX_UNSUPPORTED' &&
        o.json?.name === 'example.com' &&
        o.json?.suggestion === 'www.example.com'
      return verdict(
        '400 DOMAIN_APEX_UNSUPPORTED with suggestion www.example.com; nothing reserved',
        [
          [bare.status === 400 && told(bare), `the bare name got ${short(bare)}`],
          [asked.status === 400 && told(asked), `availability said ${short(asked)}`],
          [rows.rowCount === 0, `a refused name left ${JSON.stringify(rows.rows)}`]
        ],
        [
          [
            control.status === 200 && control.json?.available === true,
            `the www name is not offered either (${short(control)})`
          ]
        ]
      )
    }
  },
  {
    key: 'domain-connected-only-after-probe',
    door: 'GET /api/sites/{key}/settings',
    tag: 'happy',
    title:
      'Own domain: published with both records right it stays pending, saying why, until a probe of the domain answers as the site',
    oracle: {
      source: 'apps/tracy-web/src/sites/address.js',
      ref: '`shownConnected` and `connectionOf` (unchecked · waiting · failed · ok); `confirmOwnDomains`: "CONNECTED on its own proof, and on nothing else (#1037)"',
      invariant:
        'pending/unchecked while the host job runs; pending/failed TLS_INVALID once routed with a failed probe; connected only after a probe reads ok'
    },
    async run(env, note) {
      const records = { txt: {}, cname: { [DOMAIN]: [TUNNEL] } }
      const probe = probeDouble([{ status: 'failed', error: 'TLS_INVALID' }, { status: 'ok' }])
      const stand = await publishStand(env, { records, probe })
      const domainView = async () =>
        (await stand.get('owner', `/api/sites/${SITE}/settings`)).json?.addressChange ?? {}
      const live = await publishWithDomain(stand, records, { routed: false })
      const running = note('while the job runs', await domainView())
      stand.host.jobs[live.json?.jobId] = routedJob()
      await stand.state()
      const failed = note('routed, probe failed', await domainView())
      const rowAfterFail = note(
        'row after the failed probe',
        (await env.pool.query('select state, connected_at from site_name where name = $1', [DOMAIN])).rows[0]
      )
      const checked = note('check dns: probe ok', await checkDns(stand, 'owner'))
      const after = note('after the probe', await domainView())
      return verdict(
        'pending (unchecked) → pending (failed TLS_INVALID) → connected (ok)',
        [
          [
            running.status === 'pending' && running.pending?.connection?.status === 'unchecked',
            `while the job ran the domain read ${JSON.stringify(running.pending ?? running.connected)}`
          ],
          [
            failed.status === 'pending' &&
              failed.pending?.state === 'pending' &&
              failed.pending?.connection?.status === 'failed' &&
              failed.pending?.connection?.error === 'TLS_INVALID' &&
              failed.pending?.readiness?.tls === false,
            `after a failed probe the domain read ${JSON.stringify(failed.pending ?? failed.connected)}`
          ],
          [
            rowAfterFail?.state === 'pending' && rowAfterFail?.connected_at === null,
            `after a failed probe the row was ${JSON.stringify(rowAfterFail)}`
          ],
          [
            checked.json?.state === 'connected',
            `Check DNS after a probe that answered said ${short(checked)}`
          ],
          [
            after.status === 'ready' &&
              after.connected?.[0]?.name === DOMAIN &&
              after.connected?.[0]?.connection?.status === 'ok',
            `after the probe answered the domain read ${JSON.stringify(after)}`
          ]
        ],
        [
          [live.status === 202, `Publish was not taken (${short(live)})`],
          [
            stand.host.goLive()[0]?.domains?.includes(DOMAIN),
            `the publish did not carry the domain (${JSON.stringify(stand.host.goLive()[0])})`
          ],
          [probe.asked.length >= 2, `the probe was asked ${probe.asked.length} time(s)`]
        ]
      )
    }
  },
  {
    key: 'domain-forged-tracy-headers',
    door: 'GET /',
    tag: 'anonymous',
    title:
      "Own domain: x-tracy-* headers and a Tracy session sent by a visitor never reach the site, so the CMS opens nobody's session",
    oracle: {
      source: 'apps/tracy-web/src/bar/site-proxy.js',
      ref: '`originRequest`: "ON A CUSTOMER\'S OWN DOMAIN NOTHING NAMED `x-tracy-*` COMES FROM THE CLIENT"; bar/route.js `serveOwnDomain`: "No session is read"',
      invariant:
        "a GET on the connected domain with forged x-tracy-email/role/tier, an unknown x-tracy-* header and the Owner's tracy_sess reaches the site with no x-tracy-* header and no tracy_sess, and sets no Tracy cookie"
    },
    async run(env, note) {
      const records = { txt: {}, cname: { [DOMAIN]: [TUNNEL] } }
      const stand = await publishStand(env, { records, probe: probeDouble([{ status: 'ok' }]) })
      await env.pool.query('update site set address = $2 where site_key = $1', [
        FIXTURE.siteA,
        `http://${LABEL}.localhost:8080/`
      ])
      const live = await publishWithDomain(stand, records)
      await stand.state()
      const cookie = await env.principals.cookie(FIXTURE.owner)
      const before = stand.host.site.length
      const res = note(
        'forged visit',
        await stand.s.send({
          method: 'GET',
          path: '/',
          where: `https://${DOMAIN}`,
          headers: {
            cookie,
            'x-tracy-email': FIXTURE.owner,
            'x-tracy-role': 'owner',
            'x-tracy-tier': 'admin',
            'x-tracy-session-of': FIXTURE.owner
          }
        })
      )
      const reached = stand.host.site.slice(before)
      const sent = reached[0]?.headers ?? {}
      const forged = Object.keys(sent).filter((k) => k.toLowerCase().startsWith('x-tracy-'))
      return verdict(
        'the site was asked with no x-tracy-* header and no tracy_sess; no Tracy cookie set',
        [
          [forged.length === 0, `the site was sent ${JSON.stringify(forged.map((k) => [k, sent[k]]))}`],
          [!/tracy_sess=/.test(sent.cookie ?? ''), `the site was sent the cookie ${sent.cookie}`],
          [!/tracy_/.test(res.headers['set-cookie'] ?? ''), `the answer set ${res.headers['set-cookie']}`]
        ],
        [
          [live.status === 202, `Publish was not taken (${short(live)})`],
          [
            res.status === 200 && reached.length === 1,
            `the domain answered ${short(res)} after asking the site ${reached.length} time(s)`
          ]
        ]
      )
    }
  },
  {
    key: 'domain-legacy-route-moved',
    door: 'GET /api/sites/{key}/settings',
    tag: 'happy',
    title:
      'Own domain connected before #1037: it reads pending while served, the sweep republishes it with no press, and it is connected again only on a probe',
    oracle: {
      source: 'apps/tracy-web/src/cron.js',
      ref: '`sweepLegacyOwnDomains`: "every such name (`active`, `routed_at` null) of a published site is taken through the NORMAL publish path, by this sweep"; address.js `connectionOf` route: direct',
      invariant:
        'an active name with no route mark reads pending/waiting route direct; one sweep starts one live operation carrying it; its routed job and a probe that answers make it connected'
    },
    async run(env, note) {
      const records = { txt: {}, cname: { [DOMAIN]: [TUNNEL] } }
      const probe = probeDouble([{ status: 'ok' }])
      const stand = await publishStand(env, { records, probe })
      const domainView = async () =>
        (await stand.get('owner', `/api/sites/${SITE}/settings`)).json?.addressChange ?? {}
      const first = await publishWithDomain(stand, records)
      await stand.state()
      const connected = await domainView()
      // What a domain connected by the old rule looks like (#1037's migration leaves such rows as
      // they were): active, with no route mark, no attempt secret and no probe. No door writes this
      // any more, so it is the one row a scenario has to set by hand.
      await env.pool.query(
        `update site_name set routed_at = null, connected_at = null, probe_secret = null, probe_reading = null,
                probed_at = null, probe_next_at = null
          where site_key = $1 and name = $2`,
        [FIXTURE.siteA, DOMAIN]
      )
      const legacy = note('legacy row', await domainView())
      const askedBefore = stand.host.goLive().length
      const swept = note(
        'sweep',
        await env.product.cron.sweepLegacyOwnDomains(env.pool, stand.s.config, {
          fetchImpl: stand.host.fetchImpl,
          log: { warn() {}, error() {}, info() {}, log() {} }
        })
      )
      const handed = stand.host.goLive().slice(askedBefore)
      const jobId = Object.keys(stand.host.jobs).at(-1)
      stand.host.jobs[jobId] = routedJob()
      await stand.state()
      const after = note('after the routed job and the probe', await domainView())
      return verdict(
        'legacy reads pending (waiting, route direct); one sweep hands it to the host; connected again after the probe',
        [
          [
            legacy.status === 'pending' &&
              legacy.pending?.name === DOMAIN &&
              legacy.pending?.connection?.status === 'waiting' &&
              legacy.pending?.connection?.route === 'direct',
            `the legacy row read ${JSON.stringify(legacy.pending ?? legacy.connected)}`
          ],
          [
            swept.started === 1 && handed.length === 1 && handed[0]?.domains?.includes(DOMAIN),
            `the sweep said ${JSON.stringify(swept)} and handed ${JSON.stringify(handed)}`
          ],
          [
            after.status === 'ready' && after.connected?.[0]?.connection?.status === 'ok',
            `after the moved route was probed the domain read ${JSON.stringify(after)}`
          ]
        ],
        [
          [
            first.status === 202 && connected.connected?.[0]?.name === DOMAIN,
            `the domain was never connected the normal way first (${short(first)}, ${JSON.stringify(connected)})`
          ]
        ]
      )
    }
  },
  {
    key: 'delete-while-publishing',
    door: 'DELETE /api/sites/{key}',
    tag: 'concurrent',
    title: 'Delete while a publish holds the site: refused whole, the site kept, no teardown asked',
    oracle: {
      source: PUBLISH_CASE,
      ref: '"a site is not deleted beside an operation of its own: refused whole while one holds it"',
      invariant:
        'the delete answers 409 PUBLISH_BUSY, the site row stays and the host is asked for no teardown'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      const live = note('control: publish running', await goLive(stand, 'owner', 'live'))
      const del = note('delete', await stand.post('owner', `/api/sites/${SITE}`, undefined, 'DELETE'))
      const rows = await env.pool.query('select 1 from site where site_key = $1', [FIXTURE.siteA])
      const teardowns = stand.host.goLive().filter((b) => b.op === 'teardown').length
      return verdict(
        '409 PUBLISH_BUSY, the site row kept, no teardown asked',
        [
          [del.status === 409 && del.json?.code === 'PUBLISH_BUSY', `the delete answered ${short(del)}`],
          [rows.rowCount === 1, 'the site row is gone'],
          [teardowns === 0, `the host was asked for ${teardowns} teardown(s)`]
        ],
        [[live.status === 202, `the publish was not taken (${short(live)})`]]
      )
    }
  },
  {
    key: 'publish-while-deleting',
    door: 'POST /api/sites/{key}/go-live',
    tag: 'concurrent',
    title:
      'Publish while a delete holds the site: refused, and the delete keeps the site until the host says it is gone',
    oracle: {
      source: CHANGELOG,
      ref: 'DELETE /api/sites/{key}: 202 DELETE_PENDING; `operation.op` delete',
      invariant:
        'a delete whose teardown is still running answers 202 DELETE_PENDING with the site kept; a publish pressed meanwhile is 409 PUBLISH_BUSY'
    },
    async run(env, note) {
      const stand = await publishStand(env)
      // The delete door waits on its own clock for the teardown; each read moves it ten seconds on.
      stand.s.clock.step = 10_000
      const del = note('delete', await stand.post('owner', `/api/sites/${SITE}`, undefined, 'DELETE'))
      stand.s.clock.step = 0
      const live = note('publish', await goLive(stand, 'owner', 'live'))
      const rows = await env.pool.query('select 1 from site where site_key = $1', [FIXTURE.siteA])
      const state = await stand.state()
      return verdict(
        'the publish is 409 PUBLISH_BUSY while the delete holds the site',
        [
          [live.status === 409 && live.json?.code === 'PUBLISH_BUSY', `the publish answered ${short(live)}`],
          [rows.rowCount === 1, 'the site row went before the host said the site was gone'],
          [state.operation?.op === 'delete', `the operation reads ${JSON.stringify(state.operation)}`]
        ],
        [
          [
            del.status === 202 && del.json?.code === 'DELETE_PENDING',
            `the delete did not stay pending (${short(del)})`
          ]
        ]
      )
    }
  }
]

const PUBLISH_MUTANTS = [
  {
    id: 'S20-flag-never-raised',
    description: 'a finished go-live leaves the publish flag as it was',
    file: 'src/sites/publish-store.js',
    find: "`update site set publish = 'published' where site_key = $1 returning site_key`",
    replace: '`update site set publish = publish where site_key = $1 returning site_key`',
    scenarios: ['publish-live-then-back-to-draft']
  },
  {
    id: 'S21-done-believed-without-closing-line',
    description: 'a job recorded done is believed without the closing line of its script',
    file: 'src/sites/publish-store.js',
    find: "  if (!said.includes(resultLine(op.op, sites[0].label)))\n    return end('failed', PUBLISH_CODES.noResult, said.trim())",
    replace: "  if (false) return end('failed', PUBLISH_CODES.noResult, said.trim())",
    scenarios: ['publish-done-without-closing-line']
  },
  {
    id: 'S22-publish-role-gate-open',
    description: 'every seat may publish',
    file: 'src/sites/publish.js',
    find: "    if (!actingEditor(auth.grant)) return json(c, { code: 'NOT_SITE_EDITOR' }, 403)\n    const site = await siteByKey(pool, siteKey)\n    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)\n    const body = await c.req.json().catch(() => null)\n    if (!body || typeof body !== 'object' || Array.isArray(body))\n      return json(c, { code: 'INVALID_REQUEST' }, 400)\n    // Refused on the field being there at all",
    replace:
      "    const site = await siteByKey(pool, siteKey)\n    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)\n    const body = await c.req.json().catch(() => null)\n    if (!body || typeof body !== 'object' || Array.isArray(body))\n      return json(c, { code: 'INVALID_REQUEST' }, 400)\n    // Refused on the field being there at all",
    scenarios: ['publish-roles']
  },
  {
    id: 'S23-reservation-overwrites-a-held-site',
    description: 'a new operation takes a site another operation still holds (both guards out)',
    file: 'src/sites/publish-store.js',
    find: "       where o.state not in ('starting', 'running')\n     returning *`",
    replace: '       where true\n     returning *`',
    also: [
      {
        file: 'src/sites/publish-store.js',
        find: '      if (holds) return { busy: holds }\n',
        replace: "      if (holds === 'gone') return { busy: holds }\n"
      }
    ],
    scenarios: ['publish-double-press', 'delete-while-publishing', 'publish-while-deleting']
  },
  {
    id: 'S24-unreachable-host-reads-ok',
    description: 'a host that never answered is reported as taken',
    file: 'src/sites/publish.js',
    find: "if ('unconfirmed' in outcome) return json(c, { code: PUBLISH_CODES.unreachable, ...flipped }, 504)",
    replace:
      "if ('unconfirmed' in outcome) return json(c, { code: PUBLISH_CODES.unreachable, ...flipped }, 202)",
    scenarios: ['publish-host-unreachable']
  },
  {
    id: 'S25-domains-field-accepted',
    description: 'the publish door no longer refuses a `domains` field',
    file: 'src/sites/publish.js',
    find: "    if (Object.hasOwn(body, 'domains')) return json(c, { code: 'DOMAINS_NOT_SUPPORTED' }, 400)\n",
    replace: '',
    scenarios: ['publish-domains-field-refused']
  },
  {
    id: 'S26-saved-domain-reads-connected',
    description: 'a domain that was only saved reads connected',
    file: 'src/sites/address.js',
    find: "const shownConnected = (row) => row.state === 'active' && Boolean(row.connected_at)",
    replace: "const shownConnected = (row) => row.state === 'active' || row.state === 'pending'",
    scenarios: ['domain-connect-owner', 'domain-legacy-route-moved']
  },
  {
    id: 'S27-address-owner-gate-open',
    description: 'every seat may change the site address',
    file: 'src/sites/address.js',
    find: "if (auth.grant.role !== 'owner') return { error: c.json({ code: 'NOT_SITE_OWNER' }, 403) }",
    replace: '',
    scenarios: ['domain-connect-non-owner']
  },
  {
    id: 'S33-bare-domain-accepted',
    description: 'a bare domain is reserved like a subdomain',
    file: 'src/sites/address.js',
    find: "  if (parsed.domain === found.name)\n    return {\n      refusal: 'DOMAIN_APEX_UNSUPPORTED',",
    replace: "  if (false)\n    return {\n      refusal: 'DOMAIN_APEX_UNSUPPORTED',",
    scenarios: ['domain-bare-name-refused']
  },
  {
    id: 'S34-failed-probe-connects',
    description: 'a probe that failed still connects the domain',
    file: 'src/sites/address.js',
    find: "    const ok = reading?.status === 'ok'",
    replace: '    const ok = Boolean(reading)',
    scenarios: ['domain-connected-only-after-probe']
  },
  {
    id: 'S35-unknown-tracy-header-passes',
    description:
      'a client-sent x-tracy-* header the explicit list does not name reaches the site of an own domain',
    file: 'src/bar/site-proxy.js',
    find: '    for (const name of forged) headers.delete(name)\n',
    replace: '',
    scenarios: ['domain-forged-tracy-headers']
  },
  {
    id: 'S36-legacy-sweep-takes-nothing',
    description: 'the sweep never picks up a domain connected by the old rule',
    file: 'src/cron.js',
    find: "        where n.kind = 'custom' and n.state = 'active' and n.routed_at is null\n          and s.publish = 'published'\n          and (n.migrate_next_at",
    replace:
      "        where false and n.kind = 'custom' and n.state = 'active' and n.routed_at is null\n          and s.publish = 'published'\n          and (n.migrate_next_at",
    scenarios: ['domain-legacy-route-moved']
  },
  {
    id: 'S28-ui-switch-press-not-saved',
    description: 'a switch press is acknowledged and not stored',
    file: 'src/ops/ui.js',
    find: '    await saveUiSwitches(pool, press.switches, g.who.email)\n',
    replace: '',
    scenarios: ['domain-switch-off']
  },
  {
    id: 'S29-missing-txt-reads-ok',
    description: 'a TXT lookup that found no name reads as the right record',
    file: 'src/sites/address.js',
    find: "    return { status: 'missing', observed: [], error: result.error }",
    replace: "    return { status: 'ok', observed: [] }",
    scenarios: ['domain-dns-missing']
  },
  {
    id: 'S30-any-txt-proves-ownership',
    description: 'any TXT value proves ownership',
    file: 'src/sites/address.js',
    find: "return { status: owned ? 'ok' : 'wrong', observed:",
    replace: "return { status: 'ok', observed:",
    scenarios: ['domain-dns-wrong-record']
  },
  {
    id: 'S31-right-txt-reads-wrong',
    description: 'the right TXT value is not recognised',
    file: 'src/sites/address.js',
    find: "return { status: owned ? 'ok' : 'wrong', observed:",
    replace: "return { status: 'wrong', observed:",
    scenarios: ['domain-dns-right-record']
  },
  {
    id: 'S32-taken-name-given-away',
    description: 'a name another site holds is not refused',
    file: 'src/sites/address.js',
    find: "      if (row.site_key !== site.site_key) return c.json({ code: 'NAME_TAKEN' }, 409)\n",
    replace: '',
    scenarios: ['domain-already-taken']
  }
]

// ── Add site questions, AI rewrite, waitlist, sign-in source, the footer's way back ───────────
const SITES_DOCS = 'apps/tracy-web/src/api-reference/routes/sites.js'
const QUESTIONS_CASE = 'tests/regression/cases/REG-PR-998-add-site-questions-sheet.json'
const WAITLIST_CASE = 'tests/regression/cases/REG-PR-972-ops-waitlist.json'
const SOURCE_CASE = 'tests/regression/cases/REG-PR-936-sign-in-source.json'
const FOOTER_CASE = 'tests/regression/cases/REG-PR-973-mail-footer-terms.json'
const MODEL_ENV = {
  MODEL_API_KEY: 'qa-model-key',
  MODEL_BASE_URL: 'https://model.example/v1',
  MODEL_WORDS: 'qa-m'
}

/** A stand-in for the text model: answers every chat call with `text`. */
function modelDouble(text) {
  const calls = []
  return {
    calls,
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input?.url ?? input), body: init?.body ? JSON.parse(init.body) : null })
      return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 })
    }
  }
}

// A viewer with no seat (the wizard's new customer): a person who has a site is handed on to it.
const viewer = async (env, who = 'nobody') => ({ cookie: await env.principals.cookie(FIXTURE[who]) })
const rewrite = async (env, s, text) =>
  s.send({
    method: 'POST',
    path: `/api/sites/brief/rewrite`,
    headers: { ...JSON_HEADERS, ...(await viewer(env)) },
    body: { text }
  })

/** A quickstart release and its own question set, as a read of the release leaves them on a server. */
/** The CMS standard file the image carries — the one set D11 serves, read straight from git. */
const standardFile = (platform) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../apps/tracy-web/src/questions/${platform}.json`, import.meta.url),
      'utf8'
    )
  )

async function seedQuickstartSet(pool) {
  const tag = 'qa-business/emdash'
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({
        name: 'QA Business',
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        label: 'QA Business',
        version: '1.0.0',
        cms: '0.37.0',
        install: {
          source: { file: 'q.zip', sha256: 'a'.repeat(64) },
          state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
        }
      })
    ]
  )
  await pool.query(
    `insert into question_set (id, owner, name, source, version, sha256, doc)
     values ($1, $2, 'Released 1.0.0', 'released', '1.0.0', 'aa', $3::jsonb)`,
    [
      `${tag}@aa`,
      tag,
      JSON.stringify({
        schemaVersion: 'tracy-questions/v1',
        owner: tag,
        languages: ['en', 'vi'],
        questions: [
          {
            id: 'name',
            kind: 'text',
            step: 1,
            label: { en: 'Company name', vi: 'Tên công ty' },
            feeds: ['site.name']
          },
          { id: 'sector', kind: 'text', step: 2, label: { en: 'Sector', vi: 'Ngành' }, feeds: ['agent'] }
        ]
      })
    ]
  )
  return tag
}

/** Two flat objects with the same keys and values, whatever order the database returned them in. */
const sameKeys = (a, b) =>
  Boolean(a) && JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

const admissionOf = async (pool, email) =>
  (await pool.query('select beta_admission from account where email = $1', [email])).rows[0]
    ?.beta_admission ?? null

async function signInWith(env, email, extra) {
  const s = bootScenario(env)
  const asked = await askCode(s, email, extra)
  const done = await verify(s, email, codeFor(s.sent, email))
  return { asked, done, admission: await admissionOf(env.pool, email) }
}

const MORE_SCENARIOS = [
  {
    key: 'questions-standard-tier',
    door: 'GET /api/sites/questions',
    tag: 'happy',
    title:
      "Site questions, tier three: with no quickstart set and no default chosen, the CMS's standard file is asked",
    oracle: {
      source: QUESTIONS_CASE,
      ref: 'questions_door: GET /api/sites/questions; CLAUDE.md §1 "three tiers"',
      invariant:
        'a signed-in viewer asking for a CMS with no set of its own gets source standard, no quickstart, a non-empty list and the hash of the set'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const res = note(
        'wordpress',
        await s.send({
          method: 'GET',
          path: `/api/sites/questions?platform=wordpress`,
          headers: await viewer(env)
        })
      )
      const guest = note(
        'signed out',
        await s.send({ method: 'GET', path: `/api/sites/questions?platform=wordpress` })
      )
      const ids = (res.json?.questions ?? []).map((q) => q.id)
      return verdict('source standard, questions with name and about, set hash; 401 signed out', [
        [res.status === 200 && res.json?.source === 'standard', `the door answered ${short(res)}`],
        [res.json?.quickstart === null, `quickstart reads ${res.json?.quickstart}`],
        [ids.includes('name') && ids.includes('about'), `the questions are ${JSON.stringify(ids)}`],
        [/^[0-9a-f]{64}$/.test(res.json?.set?.contentHash ?? ''), 'the set carries no content hash'],
        [guest.status === 401, `a signed-out read answered ${short(guest)}`]
      ])
    }
  },
  {
    key: 'foreign-bearer-leaves-other-keys',
    door: 'GET /v1/sites/{key}',
    tag: 'other-tenant',
    title: "A key refused on another customer's site marks only itself used, never that customer's key",
    oracle: {
      source: 'CONTEXT.md',
      ref: "ADR 0014: one customer never reaches another customer's site",
      invariant:
        "site B's key addressing site A is refused, and no row of A's — its key included — changes; only the caller's own last_used_at may move"
    },
    async run(env, note) {
      const ids = env.ids
      // Both keys unused, so the caller's touch is not held back by the throttle and a write that
      // reaches past the caller's own row has something to change.
      await env.pool.query('update api_key set last_used_at = null where id = any($1::text[])', [
        [ids.keyOwnerA.id, ids.keyOutsiderB.id].map(String)
      ])
      const own = [ids.keyOutsiderB.id]
      const before = await env.fingerprint(own)
      const s = bootScenario(env)
      const res = note(
        "site B's key on site A",
        await s.send({
          method: 'GET',
          path: `/v1/sites/${encodeURIComponent(FIXTURE.siteA)}`,
          where: 'api',
          headers: { authorization: `Bearer ${ids.keyOutsiderB.key}` }
        })
      )
      const after = await env.fingerprint(own)
      const { rows } = await env.pool.query(
        'select id::text as id, last_used_at from api_key where id = any($1::text[])',
        [[ids.keyOwnerA.id, ids.keyOutsiderB.id].map(String)]
      )
      const usedAt = (id) => rows.find((r) => r.id === String(id))?.last_used_at ?? null
      return verdict(
        "refused; site A's key and every other row unchanged",
        [
          [res.status >= 400 && res.status < 500, `the foreign key was answered ${short(res)}`],
          [usedAt(ids.keyOwnerA.id) === null, "site A's key was marked used by site B's request"],
          [before.api_key === after.api_key, `api_key ${before.api_key}→${after.api_key}`]
        ],
        [
          [
            usedAt(ids.keyOutsiderB.id) !== null,
            "the caller's own key was not marked used, so nothing was written to witness"
          ]
        ]
      )
    }
  },
  {
    key: 'questions-quickstart-tier',
    door: 'GET /api/sites/questions',
    tag: 'happy',
    title:
      "Site questions this round: a quickstart's own released set is kept but not served; the CMS standard set is",
    oracle: {
      source: 'apps/tracy-web/src/lib/build-questions.js',
      ref: 'header: "ONE SOURCE THIS ROUND: THE IMAGE\'S STANDARD FILE FOR THE CMS (D11, 07/10/2026, #1013)"',
      invariant:
        "with a released set stored for the quickstart, the door answers source standard and none of that set's questions"
    },
    async run(env, note) {
      await seedQuickstartSet(env.pool)
      const s = bootScenario(env)
      const res = note(
        'emdash, vi',
        await s.send({
          method: 'GET',
          path: `/api/sites/questions?platform=emdash&lang=vi`,
          headers: await viewer(env)
        })
      )
      const ids = (res.json?.questions ?? []).map((x) => x.id)
      const standardIds = new Set(standardFile('emdash').questions.map((q) => q.id))
      return verdict('source standard; the stored set (name, sector) is not what is asked', [
        [res.status === 200 && res.json?.source === 'standard', `the door answered ${short(res)}`],
        [res.json?.owner === 'emdash', `the set's owner reads ${res.json?.owner}`],
        [
          ids.includes('name') && ids.every((id) => standardIds.has(id)),
          `the questions are not drawn from the EmDash standard file: ${JSON.stringify(ids)}`
        ],
        [
          !ids.includes('sector'),
          `the questions include the stored set's \`sector\`: ${JSON.stringify(ids)}`
        ],
        [
          (res.json?.questions ?? []).every((x) => x.label !== 'Tên công ty'),
          "a label reads the stored set's 'Tên công ty'"
        ]
      ])
    }
  },
  {
    key: 'questions-cms-default-tier',
    door: 'GET /api/sites/questions',
    tag: 'happy',
    title: 'Site questions, tier two: the CMS default an administrator chose in /ops is asked',
    oracle: {
      source: QUESTIONS_CASE,
      ref: 'CLAUDE.md §1 "the CMS default chosen in /ops"',
      invariant:
        'with a default chosen for the CMS and no set of its own, the door answers source default and names the chosen quickstart'
    },
    pending:
      'not served this round: the questions door reads only the CMS standard file (D11, apps/tracy-web/src/lib/build-questions.js header "ONE SOURCE THIS ROUND"), so a default chosen in /ops changes nothing a customer is asked; the scenario returns when per-template questions do'
  },
  {
    key: 'questions-unsupported-platform',
    door: 'GET /api/sites/questions',
    tag: 'invalid',
    title: 'Site questions for a CMS Tracy does not build are refused by name',
    oracle: {
      source: SITES_DOCS,
      ref: 'GET /api/sites/questions (400 UNSUPPORTED_PLATFORM)',
      invariant: 'a platform outside the three answers 400 UNSUPPORTED_PLATFORM'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const headers = await viewer(env)
      const control = note(
        'control',
        await s.send({ method: 'GET', path: `/api/sites/questions?platform=joomla`, headers })
      )
      const res = note(
        'drupal',
        await s.send({ method: 'GET', path: `/api/sites/questions?platform=drupal`, headers })
      )
      return verdict(
        '400 UNSUPPORTED_PLATFORM',
        [
          [res.status === 400 && res.json?.code === 'UNSUPPORTED_PLATFORM', `the door answered ${short(res)}`]
        ],
        [[control.status === 200, `a supported platform was not answered (${short(control)})`]]
      )
    }
  },
  {
    key: 'create-site-answers-reach-brief',
    door: 'POST /api/sites',
    tag: 'happy',
    title: "Create site with answers: they reach the site's brief, judged against the set that was shown",
    oracle: {
      source: QUESTIONS_CASE,
      ref: 'create_door: POST /api/sites (brief)',
      invariant:
        "the answers sent with Create site are stored as the site's brief; unknown ids and unoffered options are dropped"
    },
    pending:
      'not scripted: creating a site asks the host to provision it, and the brief is written by the `briefs` dependency the composition root wires; the product test that covers this door ("POST /api/sites with answers by question id", apps/tracy-web/test/sites-route.test.mjs) replaces both with doubles (fakeNetwork, fakeBriefs), so the site_brief row itself is asserted by no test. The fence of REG-PR-998 says the same: "Not exercised: the real create door"'
  },
  {
    key: 'rewrite-writes',
    door: 'POST /api/sites/brief/rewrite',
    tag: 'happy',
    title: "AI rewrite: the model's sentence comes back, counted against the customer's own words",
    oracle: {
      source: SITES_DOCS,
      ref: 'POST /api/sites/brief/rewrite',
      invariant:
        'a signed-in viewer gets 200 {text, words, sourceWords, mode:rewrite} holding the model sentence'
    },
    async run(env, note) {
      const model = modelDouble('A family-run bakery selling fresh bread and cakes')
      const s = bootScenario(env, { extraEnv: MODEL_ENV, fetchImpl: model.fetchImpl })
      const res = note('rewrite', await rewrite(env, s, 'We are a family bakery that sells bread and cakes'))
      return verdict('200 with the rewritten sentence, 9 words against 10', [
        [res.status === 200, `the door answered ${short(res)}`],
        [
          res.json?.text === 'A family-run bakery selling fresh bread and cakes',
          `the text reads ${res.json?.text}`
        ],
        [
          res.json?.words === 9 && res.json?.sourceWords === 10 && res.json?.mode === 'rewrite',
          `the counts read ${JSON.stringify(res.json)}`
        ],
        [model.calls.length === 1, `the model was asked ${model.calls.length} time(s)`]
      ])
    }
  },
  {
    key: 'rewrite-not-switched-on',
    door: 'POST /api/sites/brief/rewrite',
    tag: 'dependency-failure',
    title: 'AI rewrite on a deployment with no model says plainly that it is not switched on',
    oracle: {
      source: SITES_DOCS,
      ref: 'POST /api/sites/brief/rewrite (503 MODEL_NOT_CONFIGURED)',
      invariant:
        'with no model configured the door answers 503 MODEL_NOT_CONFIGURED and asks nothing of a model'
    },
    async run(env, note) {
      const model = modelDouble('unused')
      const s = bootScenario(env, { fetchImpl: model.fetchImpl })
      const res = note('rewrite', await rewrite(env, s, 'A family bakery in town'))
      return verdict('503 MODEL_NOT_CONFIGURED, model not asked', [
        [res.status === 503 && res.json?.code === 'MODEL_NOT_CONFIGURED', `the door answered ${short(res)}`],
        [model.calls.length === 0, 'a model was asked']
      ])
    }
  },
  {
    key: 'rewrite-limit-reached',
    door: 'POST /api/sites/brief/rewrite',
    tag: 'boundary',
    title:
      'AI rewrite is capped per person per hour: the press over the limit is refused and told when to come back',
    oracle: {
      source: SITES_DOCS,
      ref: 'POST /api/sites/brief/rewrite (429 RATE_LIMITED, Retry-After)',
      invariant:
        'thirty rewrites in an hour are answered; the next is 429 RATE_LIMITED with Retry-After and no model call'
    },
    async run(env, note) {
      const model = modelDouble('A family-run bakery selling fresh bread and cakes')
      const s = bootScenario(env, { extraEnv: MODEL_ENV, fetchImpl: model.fetchImpl })
      let last = null
      for (let i = 0; i < 30; i++)
        last = await rewrite(env, s, 'We are a family bakery that sells bread and cakes')
      note('thirtieth', last)
      const asked = model.calls.length
      const over = note(
        'thirty-first',
        await rewrite(env, s, 'We are a family bakery that sells bread and cakes')
      )
      return verdict(
        '429 RATE_LIMITED with Retry-After on the thirty-first press, model not asked',
        [
          [
            over.status === 429 && over.json?.code === 'RATE_LIMITED',
            `the thirty-first press answered ${short(over)}`
          ],
          [Number(over.headers['retry-after']) > 0, `Retry-After reads ${over.headers['retry-after']}`],
          [model.calls.length === asked, 'the refused press still reached the model']
        ],
        [[last.status === 200, `the thirtieth press was not answered (${short(last)})`]]
      )
    }
  },
  {
    key: 'rewrite-failed',
    door: 'POST /api/sites/brief/rewrite',
    tag: 'dependency-failure',
    title: 'AI rewrite: a model answer that stays over the length limit is a failure, never a cut sentence',
    oracle: {
      source: SITES_DOCS,
      ref: 'POST /api/sites/brief/rewrite (502 REWRITE_UNUSABLE)',
      invariant: 'an unusable model answer is 502 REWRITE_UNUSABLE and carries no text'
    },
    async run(env, note) {
      const wordy = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
      const s = bootScenario(env, { extraEnv: MODEL_ENV, fetchImpl: modelDouble(wordy).fetchImpl })
      const res = note('rewrite', await rewrite(env, s, 'A family bakery in town'))
      return verdict('502 REWRITE_UNUSABLE, no text', [
        [res.status === 502 && res.json?.code === 'REWRITE_UNUSABLE', `the door answered ${short(res)}`],
        [!('text' in (res.json ?? {})), 'a failed rewrite still carries text']
      ])
    }
  },
  {
    key: 'waitlist-staff-list',
    door: 'GET /api/ops/beta/waitlist',
    tag: 'happy',
    title:
      'Waitlist: a form the tracy.ai page relays is kept, mails nothing when held, and shows as one row to staff',
    oracle: {
      source: WAITLIST_CASE,
      ref: 'S1: "deliver:false answers 200 {status: stored} and mails nothing"; S3 rows',
      invariant:
        'POST /internal/beta/confirmation with deliver:false answers 200 {status:stored} with no mail; GET /api/ops/beta/waitlist then lists that address once with its form answers and cleaned source'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const email = 'held@qa-waitlist.test'
      const relay = note(
        'relay',
        await s.send({
          method: 'POST',
          path: '/internal/beta/confirmation',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${ENV.WHITELIST_CONFIRMATION_SECRET}`
          },
          body: {
            email,
            name: 'Held Person',
            platforms: ['WordPress'],
            role: 'own',
            site_count: 'one',
            deliver: false,
            utm_source: 'Pricing',
            utm_content: 'plan-card'
          }
        })
      )
      const list = note(
        'staff list',
        await s.send({
          method: 'GET',
          path: '/api/ops/beta/waitlist?days=30',
          headers: await viewer(env, 'staff')
        })
      )
      const rows = (list.json?.rows ?? []).filter((r) => r.email === email)
      return verdict('200 {status:stored}, no mail, one row with the form and its source', [
        [relay.status === 200 && relay.json?.status === 'stored', `the relay answered ${short(relay)}`],
        [s.sent.length === 0, `${s.sent.length} letter(s) were sent for a held form`],
        [list.status === 200 && rows.length === 1, `the staff list answered ${short(list)}`],
        [rows[0]?.form?.name === 'Held Person', `the row's form reads ${JSON.stringify(rows[0]?.form)}`],
        [
          rows[0]?.form?.source?.source === 'pricing' && rows[0]?.form?.source?.content === 'plan-card',
          `the row's source reads ${JSON.stringify(rows[0]?.form?.source)}`
        ],
        [
          rows[0]?.confirmation === null,
          `a held form reads as mailed: ${JSON.stringify(rows[0]?.confirmation)}`
        ],
        [
          list.json?.totals?.form === 1 && list.json?.totals?.people === 1,
          `the totals read ${JSON.stringify(list.json?.totals)}`
        ]
      ])
    }
  },
  {
    key: 'waitlist-empty-window',
    door: 'GET /api/ops/beta/waitlist',
    tag: 'empty',
    title: 'Waitlist: nobody in the window is an empty list, not an error',
    oracle: {
      source: WAITLIST_CASE,
      ref: 'product test "waitlist: nobody in the window answers an empty list"',
      invariant: 'staff get 200 with every total 0 and no rows'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const list = note(
        'staff list',
        await s.send({
          method: 'GET',
          path: '/api/ops/beta/waitlist?days=7',
          headers: await viewer(env, 'staff')
        })
      )
      const totals = Object.values(list.json?.totals ?? { x: 1 })
      return verdict('200, totals all 0, rows empty', [
        [list.status === 200, `the door answered ${short(list)}`],
        [
          totals.length > 0 && totals.every((n) => n === 0),
          `the totals read ${JSON.stringify(list.json?.totals)}`
        ],
        [Array.isArray(list.json?.rows) && list.json.rows.length === 0, 'rows is not an empty list']
      ])
    }
  },
  {
    key: 'waitlist-not-staff',
    door: 'GET /api/ops/beta/waitlist',
    tag: 'wrong-role',
    title:
      'Waitlist: a signed-in person with no staff seat is refused, and a signed-out one is sent to sign in',
    oracle: {
      source: WAITLIST_CASE,
      ref: 'S5: "As an account with no tracy_admin seat, GET /api/ops/beta/waitlist"',
      invariant:
        'a site owner without a tracy_admin seat gets 403 and no rows; nobody signed in is redirected to /login'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const control = note(
        'control: staff',
        await s.send({ method: 'GET', path: '/api/ops/beta/waitlist', headers: await viewer(env, 'staff') })
      )
      const owner = note(
        'site owner',
        await s.send({ method: 'GET', path: '/api/ops/beta/waitlist', headers: await viewer(env, 'owner') })
      )
      const guest = note('signed out', await s.send({ method: 'GET', path: '/api/ops/beta/waitlist' }))
      return verdict(
        '403 for a site owner, 302 to /login for nobody',
        [
          [owner.status === 403 && !/rows/.test(owner.text), `a site owner got ${short(owner)}`],
          [
            guest.status === 302 && String(guest.headers.location ?? '').startsWith('/login'),
            `nobody signed in got ${short(guest)} → ${guest.headers.location}`
          ]
        ],
        [[control.status === 200, `staff were not answered (${short(control)})`]]
      )
    }
  },
  {
    key: 'waitlist-relay-wrong-secret',
    door: 'POST /internal/beta/confirmation',
    tag: 'expired-auth',
    title: 'Waitlist relay: a call without the shared secret stores nothing and mails nothing',
    oracle: {
      source: WAITLIST_CASE,
      ref: 'S1 (Bearer secret); product test "private auth, validation, stable retry payload and duplicate acknowledgement"',
      invariant: 'a wrong or missing Bearer secret answers 401 UNAUTHORIZED with no row and no mail'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const body = {
        email: 'intruder@qa-waitlist.test',
        name: 'X',
        platforms: ['WordPress'],
        role: 'own',
        site_count: 'one'
      }
      const wrong = note(
        'wrong secret',
        await s.send({
          method: 'POST',
          path: '/internal/beta/confirmation',
          headers: { 'content-type': 'application/json', authorization: 'Bearer not-the-secret' },
          body
        })
      )
      const none = note(
        'no secret',
        await s.send({
          method: 'POST',
          path: '/internal/beta/confirmation',
          headers: { 'content-type': 'application/json' },
          body
        })
      )
      const rows = await env.pool.query('select 1 from beta_waitlist where email = $1', [body.email])
      return verdict('401 UNAUTHORIZED twice, nothing stored, nothing mailed', [
        [wrong.status === 401 && wrong.json?.code === 'UNAUTHORIZED', `a wrong secret got ${short(wrong)}`],
        [none.status === 401, `no secret got ${short(none)}`],
        [rows.rowCount === 0 && s.sent.length === 0, 'the refused call stored a row or sent mail']
      ])
    }
  },
  {
    key: 'waitlist-form-screen',
    door: 'POST /internal/beta/confirmation',
    tag: 'happy',
    title: 'Waitlist: the form a turned-away person fills in',
    oracle: {
      source: WAITLIST_CASE,
      ref: 'title: "…or on the tracy.ai whitelist form"',
      invariant: 'the form posts its answers to the relay door'
    },
    pending:
      'not in this repository: the whitelist form is the tracy.ai WordPress page (BETA_WAITLIST_URL, apps/tracy-web/src/config.js); only its relay door and the staff screen live here, so no local screen exists to drive'
  },
  {
    key: 'signin-source-recorded',
    door: 'POST /login',
    tag: 'happy',
    title: 'A first sign-in from a campaign link records where it came from',
    oracle: {
      source: SOURCE_CASE,
      ref: 'title: "A first sign-in records the utm_* of the link it came from … and nothing when there is none"',
      invariant:
        "the four utm_* values sent with the code request are on the new account's admission as its source"
    },
    mail: true,
    async run(env, note) {
      const email = 'from-campaign@qa.test'
      const utm = {
        utm_source: 'joomlart',
        utm_medium: 'email',
        utm_campaign: 'tracy-beta-2026-10',
        utm_content: 'members-cta'
      }
      const r = await signInWith(env, email, utm)
      note('verify', r.done)
      const want = {
        source: 'joomlart',
        medium: 'email',
        campaign: 'tracy-beta-2026-10',
        content: 'members-cta'
      }
      return verdict(
        'the account carries source joomlart · email · tracy-beta-2026-10 · members-cta',
        [
          [
            sameKeys(r.admission?.source, want),
            `the account's source reads ${JSON.stringify(r.admission?.source)}`
          ]
        ],
        [[r.done.status === 200, `the sign-in did not finish (${short(r.done)})`]]
      )
    }
  },
  {
    key: 'signin-source-cleaned',
    door: 'POST /login',
    tag: 'invalid',
    title: 'A sign-in source is cleaned at the door: markup is stripped and an unknown medium becomes other',
    oracle: {
      source: SOURCE_CASE,
      ref: 'S5: "/?utm_source=%3Cscript%3Ealert(1)%3C%2Fscript%3E&utm_medium=Newsletter&ref=x"',
      invariant:
        'only a-z 0-9 . _ - survive in a value, medium outside the closed set reads other, and keys other than the four utm_* are ignored'
    },
    mail: true,
    async run(env, note) {
      const email = 'tampered@qa.test'
      const r = await signInWith(env, email, {
        utm_source: '<script>alert(1)</script>',
        utm_medium: 'Newsletter',
        ref: 'x',
        utm_term: 'kept-out'
      })
      note('verify', r.done)
      return verdict(
        'source scriptalert1script, medium other, nothing else',
        [
          [
            sameKeys(r.admission?.source, { source: 'scriptalert1script', medium: 'other' }),
            `the account's source reads ${JSON.stringify(r.admission?.source)}`
          ]
        ],
        [[r.done.status === 200, `the sign-in did not finish (${short(r.done)})`]]
      )
    }
  },
  {
    key: 'signin-source-absent',
    door: 'POST /login',
    tag: 'empty',
    title: 'A first sign-in with no campaign link records no source at all',
    oracle: {
      source: SOURCE_CASE,
      ref: 'S4: "open / with no utm and sign in"',
      invariant: 'with no utm_* the account has no source key (not an empty one)'
    },
    mail: true,
    async run(env, note) {
      const r = await signInWith(env, 'no-campaign@qa.test')
      note('verify', r.done)
      return verdict(
        'no source key on the account',
        [
          [
            !r.admission || !('source' in r.admission),
            `the account's admission reads ${JSON.stringify(r.admission)}`
          ]
        ],
        [[r.done.status === 200, `the sign-in did not finish (${short(r.done)})`]]
      )
    }
  },
  {
    key: 'root-keeps-source-and-destination',
    door: 'GET /',
    tag: 'happy',
    title:
      'A signed-out visit to / keeps the campaign source and the place the link was going through sign-in',
    oracle: {
      source: FOOTER_CASE,
      ref: 'expect: "A signed-out GET /?settings=notifications redirects to /login?next=%2F%3Fsettings%3Dnotifications … /?utm_source=joomlart stays /login?utm_source=joomlart"',
      invariant:
        'GET / signed out is 302 to /login; a utm-only link keeps its cleaned utm on the query; anything else rides inside next'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const go = async (path) => note(path, await s.send({ method: 'GET', path, headers: HTML }))
      const bare = await go('/')
      const utm = await go('/?utm_source=joomlart')
      const settings = await go('/?settings=notifications')
      return verdict('/ → /login; utm kept; the mail link kept in next', [
        [
          bare.status === 302 && bare.headers.location === '/login',
          `/ answered ${bare.status} → ${bare.headers.location}`
        ],
        [
          utm.headers.location === '/login?utm_source=joomlart',
          `/?utm_source=joomlart → ${utm.headers.location}`
        ],
        [
          settings.headers.location === '/login?next=%2F%3Fsettings%3Dnotifications',
          `/?settings=notifications → ${settings.headers.location}`
        ]
      ])
    }
  },
  {
    key: 'turn-undo-doors',
    door: 'POST /api/sites/{key}/turns/undo',
    tag: 'happy',
    title: 'Undo a chat request: undone, blocked, not the latest, nothing to undo',
    oracle: {
      source: 'tests/regression/cases/REG-PR-970-site-changes-undo.json',
      ref: 'doorUndo: POST /api/sites/:key/turns/undo',
      invariant:
        'the latest request is undone (files then content); an edit made after it blocks the undo and nothing is written'
    },
    pending:
      'not scripted: the undo engine reads turn moments and restores through host jobs over a git history of the site (webroot-turn-moments, webroot-undo-check, restore, apply.revert); the product test builds that world itself (`world(pool)` in apps/tracy-web/test/turn-undo-route.test.mjs) and this layer has no host double for it yet. The door answers are covered there: "the latest turn: GET says Undo, POST undoes its files then its content", "an admin edit after the turn: POST is refused BLOCKED and writes nothing", "scope turn on an older turn is NOT_LATEST"'
  }
]

const MORE_MUTANTS = [
  {
    id: 'S55-key-touch-reaches-every-key',
    description: 'a key marked used also marks every other key used',
    file: 'src/lib/api-key.js',
    find: "'update api_key set last_used_at = $2 where id = $1'",
    replace: "'update api_key set last_used_at = $2 where id = $1 or id is not null'",
    scenarios: ['foreign-bearer-leaves-other-keys']
  },
  {
    id: 'S53-relay-secret-unchecked',
    description: 'the waitlist relay no longer refuses a call without the shared secret',
    file: 'src/beta/confirmation.js',
    find: "      return c.json({ code: 'UNAUTHORIZED' }, 401)\n    if (!pool || !mail)",
    replace: '      void 0\n    if (!pool || !mail)',
    scenarios: ['waitlist-relay-wrong-secret']
  },
  {
    id: 'S54-empty-waitlist-counts-somebody',
    description: 'an empty window still reports one person',
    file: 'src/ops/beta.js',
    find: 'totals: { people: 0, turnedAway: 0, form: 0, both: 0, signedIn: 0 },\n        rows: []',
    replace: 'totals: { people: 1, turnedAway: 0, form: 0, both: 0, signedIn: 0 },\n        rows: []',
    scenarios: ['waitlist-empty-window']
  },
  {
    id: 'S40-questions-tier-mislabelled',
    description: "the CMS's own file is reported as a quickstart's set",
    file: 'src/lib/build-questions.js',
    find: "    source: 'standard',\n    owner: platform,",
    replace: "    source: 'quickstart',\n    owner: platform,",
    scenarios: ['questions-standard-tier']
  },
  {
    id: 'S41-quickstart-set-claimed',
    description: "a site built from a quickstart is told its questions are that quickstart's set",
    file: 'src/lib/build-questions.js',
    find: "    source: 'standard',\n    owner: platform,",
    replace: "    source: quickstart ? 'quickstart' : 'standard',\n    owner: platform,",
    scenarios: ['questions-quickstart-tier']
  },
  {
    id: 'S56-quickstart-asked-nothing',
    description: 'a site built from a quickstart is served the standard label with no questions',
    file: 'src/lib/build-questions.js',
    find: '    questions: questionsFor(doc, lang).map((q, i) => withServedFields(q, doc.questions[i])),',
    replace: '    questions: [],',
    scenarios: ['questions-quickstart-tier']
  },
  {
    id: 'S42-any-platform-has-questions',
    description: 'the questions door no longer refuses an unknown CMS',
    file: 'src/sites/route.js',
    find: "    if (!CREATE_PLATFORMS.has(platform)) return json(c, { code: 'UNSUPPORTED_PLATFORM' }, 400)\n    const lang = (c.req.query('lang') ?? 'en').slice(0, 10)",
    replace: "    const lang = (c.req.query('lang') ?? 'en').slice(0, 10)",
    scenarios: ['questions-unsupported-platform']
  },
  {
    id: 'S43-rewrite-returns-no-text',
    description: 'a rewrite is acknowledged with an empty sentence',
    file: 'src/sites/route.js',
    find: '{ text: done.text, words: done.words, sourceWords: done.sourceWords, mode: done.mode },',
    replace: "{ text: '', words: done.words, sourceWords: done.sourceWords, mode: done.mode },",
    scenarios: ['rewrite-writes']
  },
  {
    id: 'S44-missing-model-not-said',
    description: 'a deployment with no model answers the rewrite door 200',
    file: 'src/sites/route.js',
    find: "        { code: 'MODEL_NOT_CONFIGURED', message: 'Rewriting with AI is not switched on here yet.' },\n        503",
    replace:
      "        { code: 'MODEL_NOT_CONFIGURED', message: 'Rewriting with AI is not switched on here yet.' },\n        200",
    scenarios: ['rewrite-not-switched-on']
  },
  {
    id: 'S45-rewrite-cap-off',
    description: 'the hourly cap of the rewrite door is not applied',
    file: 'src/sites/route.js',
    find: "    if (rate.over) {\n      c.header('Retry-After', String(rate.retryAfterS))\n      return json(c, { code: 'RATE_LIMITED' }, 429)\n    }\n    // 🔒 One press may not run for minutes",
    replace: '    // 🔒 One press may not run for minutes',
    scenarios: ['rewrite-limit-reached']
  },
  {
    id: 'S46-unusable-rewrite-reads-ok',
    description: 'an unusable model answer is answered 200',
    file: 'src/sites/route.js',
    find: 'if (!done.ok) return json(c, { code: done.code, message: done.message }, 502)',
    replace: "if (!done.ok) return json(c, { code: done.code, message: done.message, text: '' }, 200)",
    scenarios: ['rewrite-failed']
  },
  {
    id: 'S47-held-form-is-mailed-or-lost',
    description: 'deliver:false is ignored: the relay goes on to the confirmation mail',
    file: 'src/beta/confirmation.js',
    find: "    if (body.deliver === false) return c.json({ status: 'stored' })\n",
    replace: '',
    scenarios: ['waitlist-staff-list']
  },
  {
    id: 'S48-staff-gate-open',
    description: 'a signed-in person with no tracy_admin seat is staff',
    file: 'src/ops/admit.js',
    find: 'if (!role) return null\n  return { email, role }',
    replace: "if (!role) return { email, role: 'owner' }\n  return { email, role }",
    scenarios: ['waitlist-not-staff']
  },
  {
    id: 'S49-source-not-kept',
    description: 'the source a code was asked with is not stored with the code',
    file: 'src/identity/route.js',
    find: "...(source ? { admission: { status: 'allow', badge: 'gate off', plans: [], gate: false, source } } : {})",
    replace: '...{}',
    scenarios: ['signin-source-recorded']
  },
  {
    id: 'S50-medium-not-held-to-the-set',
    description: 'a medium outside the closed set is kept as typed',
    file: 'src/lib/sign-in-source.js',
    find: "source[key] = key === 'medium' && !MEDIUMS.includes(value) ? 'other' : value",
    replace: 'source[key] = value',
    scenarios: ['signin-source-cleaned']
  },
  {
    id: 'S51-empty-source-recorded',
    description: 'a link with no utm_* still yields a source object',
    file: 'src/lib/sign-in-source.js',
    find: 'return Object.keys(source).length ? source : null',
    replace: 'return source',
    scenarios: ['signin-source-absent']
  },
  {
    id: 'S52-root-drops-the-destination',
    description: 'a signed-out visit to / forgets where the link was going',
    file: 'src/workspace/route.js',
    find: 'const query = [destination && `next=${encodeURIComponent(url.pathname + url.search)}`, source]',
    replace: 'const query = [false, source]',
    scenarios: ['root-keeps-source-and-destination']
  }
]

// ── sign-in: GitHub, the /signin link and the device round (#993 checklist) ─────────────────────
// GitHub has its own exchange (a token, then two API calls; the address is the primary VERIFIED one,
// the subject the numeric account id), so every provider outcome is played for it too, not assumed
// from Google's. The device round is opened the way a site's dsh opens it (`POST /auth/link/browser`).
const ERROR_CASE = 'tests/regression/cases/REG-037-error-next-step.json'
const GH_PERSON = {
  emails: [
    { email: 'old-address@qa.test', primary: false, verified: true },
    { email: 'GitHub-Person@qa.test', primary: true, verified: true }
  ],
  user: { id: 424242, login: 'qa-github-person' }
}
const GH_EMAIL = 'github-person@qa.test'
const FORM = { ...SAME_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }
const NEVER_ISSUED = 'ab'.repeat(32)

/** Open a device round the way a site's dsh does; `nonce` is null when the door refused. */
async function openRound(s, device) {
  const opened = await s.send({
    method: 'POST',
    path: '/auth/link/browser',
    headers: { 'content-type': 'application/json' },
    body: device === undefined ? {} : { device }
  })
  return { opened, nonce: opened.json?.nonce ?? null, clientSecret: opened.json?.clientSecret ?? null }
}
const roundStatus = async (s, nonce) =>
  (await s.send({ method: 'GET', path: `/auth/link/${nonce}` })).json?.status ?? null
const confirmPage = (s, nonce, cookie) =>
  s.send({ method: 'GET', path: `/signin?n=${nonce}`, headers: { ...HTML, ...(cookie ? { cookie } : {}) } })
const approve = (s, nonce, { cookie, headers = FORM } = {}) =>
  s.send({
    method: 'POST',
    path: '/signin/approve',
    headers: { ...headers, ...HTML, ...(cookie ? { cookie } : {}) },
    body: `n=${nonce}`
  })
const hasApproveForm = (obs) => /<form[^>]+action="\/signin\/approve"/.test(obs.text ?? '')

const SIGNIN_MORE_SCENARIOS = [
  {
    key: 'signin-github-success',
    door: 'GET /signin/{provider}/callback',
    tag: 'happy',
    title:
      'Sign-in with GitHub: the primary verified address of the account comes back signed in, at the page it was going to',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider} (`google` or `github`), GET /signin/{provider}/callback',
      invariant:
        "a GitHub callback carrying this browser's state and a code GitHub accepts sets a session for the account's primary verified address and redirects to next"
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: GITHUB_ENV,
        fetchImpl: providerDouble({ github: GH_PERSON }).fetchImpl
      })
      const { start, state, cookie } = await startGithub(s, '/acme/')
      note('start', start)
      const back = note('callback', await githubCallback(s, { state, code: 'qa-code', cookie }))
      const session = sessionOf(back)
      const who = session ? note('me', await me(s, session)) : null
      return verdict(
        '302 to next with a session for the primary verified address',
        [
          [back.status === 302, `the callback answered ${short(back)}`],
          [back.headers.location === `${ORIGIN}/acme/`, `it redirects to ${back.headers.location}`],
          [session !== null, 'no session cookie was set'],
          [who?.json?.email === GH_EMAIL, `/auth/me names ${who?.json?.email ?? 'nobody'}`]
        ],
        [
          [
            start.status === 302 &&
              (start.headers.location ?? '').startsWith('https://github.com/login/oauth/authorize?') &&
              Boolean(state) &&
              Boolean(cookie),
            `the GitHub sign-in did not start (${short(start)} ${start.headers.location ?? ''})`
          ]
        ]
      )
    }
  },
  {
    key: 'signin-github-cancelled',
    door: 'GET /signin/{provider}/callback',
    tag: 'invalid',
    title: 'Sign-in cancelled at GitHub: the page says it was cancelled, signs nobody in, and leads back',
    oracle: {
      source: ISSUE_993,
      ref: 'Expected: "A sign-in cancelled at the provider says so: cancelled at {provider} …"; checklist: "Google and GitHub: … cancelled at the provider"',
      invariant:
        'a GitHub callback with error=access_denied and no code shows a page that does not blame time or another browser, sets no session, offers the way back to sign in and burns the state'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: GITHUB_ENV,
        fetchImpl: providerDouble({ github: GH_PERSON }).fetchImpl
      })
      const { start, state, cookie } = await startGithub(s, '/acme/')
      const back = note(
        'cancelled',
        await githubCallback(s, {
          state,
          cookie,
          extra: '&error=access_denied&error_description=The+user+has+denied+access',
          headers: HTML
        })
      )
      const again = note('same state again', await githubCallback(s, { state, code: 'qa-code', cookie }))
      return verdict(
        'a sign-in cancelled at GitHub is told as cancelled, with no session and the way back',
        [
          [back.status === 400, `the callback answered ${short(back)}`],
          [sessionOf(back) === null, 'a cancelled sign-in set a session'],
          [/href="\/login[^"]*"/.test(back.text), 'the page has no link back to sign in'],
          [!/denied access/i.test(back.text), "the page repeats the provider's own words"],
          [
            sessionOf(again) === null && again.status === 400,
            `the state answered a second time (${short(again)})`
          ],
          [
            !/took too long|another browser/i.test(back.text),
            'the page says "The sign-in took too long, or it was started in another browser" to a person who cancelled at GitHub (#993)'
          ]
        ],
        [[start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`]]
      )
    }
  },
  {
    key: 'signin-github-state-other-browser',
    door: 'GET /signin/{provider}/callback',
    tag: 'other-tenant',
    title: 'Sign-in with GitHub: a callback opened in a browser that never started it signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (400 OAUTH_STATE_INVALID)',
      invariant:
        'a valid GitHub state without the state cookie of the browser that started it, or with the cookie of another sign-in, is refused 400 and sets no session'
    },
    async run(env, note) {
      const s = bootScenario(env, {
        extraEnv: GITHUB_ENV,
        fetchImpl: providerDouble({ github: GH_PERSON }).fetchImpl
      })
      const mine = await startGithub(s)
      const theirs = await startGithub(s)
      const bare = note(
        'no state cookie',
        await githubCallback(s, { state: theirs.state, code: 'qa-code', cookie: null })
      )
      const foreign = note(
        "another sign-in's cookie",
        await githubCallback(s, { state: theirs.state, code: 'qa-code', cookie: mine.cookie })
      )
      return verdict(
        '400 OAUTH_STATE_INVALID both times, no session',
        [
          [
            bare.status === 400 && bare.json?.code === 'OAUTH_STATE_INVALID',
            `without the cookie the callback answered ${short(bare)}`
          ],
          [
            foreign.status === 400 && foreign.json?.code === 'OAUTH_STATE_INVALID',
            `with another sign-in's cookie the callback answered ${short(foreign)}`
          ],
          [
            sessionOf(bare) === null && sessionOf(foreign) === null,
            'a session was set for a browser that never started the sign-in'
          ]
        ],
        [
          [
            mine.start.status === 302 && Boolean(mine.state) && Boolean(theirs.state),
            `the sign-in did not start (${short(mine.start)})`
          ]
        ]
      )
    }
  },
  {
    key: 'signin-github-state-expired',
    door: 'GET /signin/{provider}/callback',
    tag: 'expired-auth',
    title: 'Sign-in with GitHub: a callback that arrives after the state expired signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (400 OAUTH_STATE_INVALID)',
      invariant: 'a GitHub state older than its ten minutes is refused 400 and sets no session'
    },
    async run(env, note) {
      const double = providerDouble({ github: GH_PERSON })
      const s = bootScenario(env, { extraEnv: GITHUB_ENV, fetchImpl: double.fetchImpl })
      const fresh = await startGithub(s)
      s.clock.t += 9 * MINUTE
      const control = note(
        'control: nine minutes',
        await githubCallback(s, { state: fresh.state, code: 'qa-code', cookie: fresh.cookie })
      )
      const { start, state, cookie } = await startGithub(s)
      s.clock.t += 11 * MINUTE
      const asked = double.calls.length
      const back = note('eleven minutes', await githubCallback(s, { state, code: 'qa-code', cookie }))
      return verdict(
        '400 OAUTH_STATE_INVALID, no session, GitHub never asked',
        [
          [
            back.status === 400 && back.json?.code === 'OAUTH_STATE_INVALID',
            `the callback answered ${short(back)}`
          ],
          [sessionOf(back) === null, 'an expired state set a session'],
          [double.calls.length === asked, 'the code of an expired sign-in was sent to GitHub']
        ],
        [
          [start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`],
          [control.status === 302, `a state nine minutes old did not work (${short(control)})`]
        ]
      )
    }
  },
  {
    key: 'signin-github-refuses',
    door: 'GET /signin/{provider}/callback',
    tag: 'dependency-failure',
    title: 'Sign-in with GitHub: a refused code exchange or a GitHub that cannot be reached signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (400 … or a provider error code, 502 EXCHANGE_FAILED)',
      invariant:
        'a code GitHub refuses answers 400 EXCHANGE_FAILED and an unreachable GitHub 502 EXCHANGE_FAILED; neither sets a session nor shows what GitHub said'
    },
    async run(env, note) {
      const refusing = bootScenario(env, {
        extraEnv: GITHUB_ENV,
        fetchImpl: providerDouble({ github: { ...GH_PERSON, refuse: true } }).fetchImpl
      })
      const a = await startGithub(refusing)
      const refused = note(
        'refused',
        await githubCallback(refusing, { state: a.state, code: 'qa-code', cookie: a.cookie })
      )
      const down = bootScenario(env, {
        extraEnv: GITHUB_ENV,
        fetchImpl: providerDouble({ down: true }).fetchImpl
      })
      const b = await startGithub(down)
      const unreachable = note(
        'unreachable',
        await githubCallback(down, { state: b.state, code: 'qa-code', cookie: b.cookie })
      )
      return verdict(
        '400 then 502 EXCHANGE_FAILED, no session, no provider detail',
        [
          [
            refused.status === 400 && refused.json?.code === 'EXCHANGE_FAILED',
            `a refused exchange answered ${short(refused)}`
          ],
          [
            unreachable.status === 502 && unreachable.json?.code === 'EXCHANGE_FAILED',
            `an unreachable GitHub answered ${short(unreachable)}`
          ],
          [sessionOf(refused) === null && sessionOf(unreachable) === null, 'a failed exchange set a session'],
          [
            !/bad_verification_code|connection reset/.test(`${refused.text}${unreachable.text}`),
            "the answer repeats the provider's own words"
          ]
        ],
        [[Boolean(a.state) && Boolean(b.state), 'the sign-in did not start']]
      )
    }
  },
  {
    key: 'signin-github-unverified-email',
    door: 'GET /signin/{provider}/callback',
    tag: 'invalid',
    title: 'Sign-in with GitHub: an account whose primary address is not verified signs nobody in',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider}/callback (provider error code)',
      invariant:
        'a GitHub account with no primary verified address answers 400 EMAIL_NOT_VERIFIED and sets no session, whatever other verified addresses it lists'
    },
    async run(env, note) {
      const unverified = {
        ...GH_PERSON,
        emails: [
          { email: 'old-address@qa.test', primary: false, verified: true },
          { email: 'GitHub-Person@qa.test', primary: true, verified: false }
        ]
      }
      const s = bootScenario(env, {
        extraEnv: GITHUB_ENV,
        fetchImpl: providerDouble({ github: unverified }).fetchImpl
      })
      const { start, state, cookie } = await startGithub(s)
      const back = note('unverified', await githubCallback(s, { state, code: 'qa-code', cookie }))
      const accounts = await env.pool.query('select email from account where email = any($1)', [
        [GH_EMAIL, 'old-address@qa.test']
      ])
      return verdict(
        '400 EMAIL_NOT_VERIFIED, no session, no account',
        [
          [
            back.status === 400 && back.json?.code === 'EMAIL_NOT_VERIFIED',
            `the callback answered ${short(back)}`
          ],
          [sessionOf(back) === null, 'an unverified address was signed in'],
          [
            accounts.rows.length === 0,
            `an account was made for ${accounts.rows.map((r) => r.email).join(', ')}`
          ]
        ],
        [[start.status === 302 && Boolean(state), `the sign-in did not start (${short(start)})`]]
      )
    }
  },
  {
    key: 'signin-github-not-offered',
    door: 'GET /signin/{provider}',
    tag: 'invalid',
    title:
      'Sign-in with GitHub on a deployment that offers only Google is a 404, for the start and for the callback',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin/{provider} (404 for a provider that is not configured)',
      invariant:
        'the two providers are offered independently: with only Google configured, GitHub answers 404 for both doors and redirects nowhere, as a page with the way back for a navigation'
    },
    async run(env, note) {
      const s = bootScenario(env, { extraEnv: OAUTH_ENV })
      const control = note('control: google', await s.send({ method: 'GET', path: '/signin/google' }))
      const start = note('start', await s.send({ method: 'GET', path: '/signin/github' }))
      const back = note(
        'callback',
        await s.send({ method: 'GET', path: '/signin/github/callback?state=x&code=y' })
      )
      const page = note(
        'start, as a navigation',
        await s.send({ method: 'GET', path: '/signin/github', headers: HTML })
      )
      return verdict(
        '404 for both doors, no redirect, no session; a navigation gets the way back',
        [
          [start.status === 404, `the start door answered ${short(start)}`],
          [back.status === 404, `the callback answered ${short(back)}`],
          [!start.headers.location && sessionOf(back) === null, 'the door redirected or signed in'],
          [
            page.status === 404 && /<a class="back" href="\/login"/.test(page.text),
            `a navigation got ${short(page)}`
          ]
        ],
        [[control.status === 302, `the configured provider did not start (${short(control)})`]]
      )
    }
  },
  {
    key: 'signin-link-malformed',
    door: 'GET /signin',
    tag: 'invalid',
    title: 'A malformed /signin link is a 404 page with the way back; it asks nobody to approve anything',
    oracle: {
      source: ERROR_CASE,
      ref: 'expect: "a malformed /signin link, an unavailable provider … are translated pages with a link that leads to Tracy"; issue #993 checklist: "malformed `/signin` link"',
      invariant:
        'a /signin address whose n is not a 64-hex round id answers 404, signed in or not: a page with one link back to sign in for a navigation, and never the approve form or a redirect into a sign-in'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const cookie = await env.principals.cookie(FIXTURE.owner)
      // The door is alive: a well-formed id without a session is sent to sign in first.
      const control = note('control: well-formed, signed out', await confirmPage(s, NEVER_ISSUED, null))
      const shapes = {
        'no n': '/signin',
        'short n': '/signin?n=abc123',
        'upper-case hex': `/signin?n=${'AB'.repeat(32)}`,
        'one character too long': `/signin?n=${NEVER_ISSUED}0`,
        'markup in n': `/signin?n=${encodeURIComponent('"><script>alert(1)</script>')}`
      }
      const expectations = []
      for (const [name, path] of Object.entries(shapes)) {
        const guest = note(`${name}, signed out`, await s.send({ method: 'GET', path, headers: HTML }))
        const member = note(
          `${name}, signed in`,
          await s.send({ method: 'GET', path, headers: { ...HTML, cookie } })
        )
        for (const [who, obs] of [
          ['signed out', guest],
          ['signed in', member]
        ]) {
          expectations.push(
            [obs.status === 404, `${name} (${who}) answered ${short(obs)}`],
            [!obs.headers.location, `${name} (${who}) redirects to ${obs.headers.location}`],
            [/<a class="back" href="\/login"/.test(obs.text), `${name} (${who}): no link back to sign in`],
            [!hasApproveForm(obs), `${name} (${who}): the page offers to approve a sign-in`],
            [!/<script>alert\(1\)/.test(obs.text), `${name} (${who}): the link is echoed as markup`]
          )
        }
      }
      const fetched = note(
        'short n, not a navigation',
        await s.send({ method: 'GET', path: '/signin?n=abc123' })
      )
      expectations.push([fetched.status === 404, `a fetch of a malformed link answered ${short(fetched)}`])
      return verdict('404 with the way back for every malformed shape, signed in or not', expectations, [
        [
          control.status === 302 && (control.headers.location ?? '').startsWith('/login?next='),
          `a well-formed link without a session answered ${short(control)} ${control.headers.location ?? ''}`
        ]
      ])
    }
  },
  {
    key: 'signin-device-confirm-page',
    door: 'GET /signin',
    tag: 'happy',
    title:
      'Device sign-in, confirm page: it names the address and the requesting device, and opening it approves nothing',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin: "With a session, shows which address would be signed in and what the requesting device said about itself, with one button that posts to POST /signin/approve; opening this page approves nothing"',
      invariant:
        'a signed-in person opening a pending round gets 200 with their address, the device description and one approve form carrying the round id; the round is still pending afterwards'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const cookie = await env.principals.cookie(FIXTURE.owner)
      const device = 'QA laptop <Firefox>'
      const { opened, nonce } = await openRound(s, device)
      note('open the round', opened)
      const page = note('confirm page', await confirmPage(s, nonce, cookie))
      const again = note('confirm page, reloaded', await confirmPage(s, nonce, cookie))
      const status = nonce ? await roundStatus(s, nonce) : null
      return verdict(
        '200 with the address, the device as text and the approve form; the round stays pending',
        [
          [page.status === 200, `the confirm page answered ${short(page)}`],
          [page.text.includes(FIXTURE.owner), 'the page does not name the address that would be signed in'],
          [page.text.includes('QA laptop &lt;Firefox&gt;'), 'the page does not show the device description'],
          [!page.text.includes('<Firefox>'), 'the device description is drawn as markup'],
          [
            hasApproveForm(page) && page.text.includes(`name="n" value="${nonce}"`),
            'the page has no approve form carrying the round id'
          ],
          [
            /frame-ancestors 'none'|DENY/i.test(
              `${page.headers['content-security-policy'] ?? ''}${page.headers['x-frame-options'] ?? ''}`
            ),
            'the page can be framed'
          ],
          [again.status === 200, `a reload answered ${short(again)}`],
          [status === 'pending', `after opening the page twice the round reads ${status}`]
        ],
        [[opened.status === 200 && Boolean(nonce), `the round did not open (${short(opened)})`]]
      )
    }
  },
  {
    key: 'signin-device-approved',
    door: 'POST /signin/approve',
    tag: 'happy',
    title:
      'Device sign-in, approved page: pressing Approve approves the round once, for the signed-in address',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /signin/approve: "Marks the pending round n approved for the signed-in address … A round is approved at most once"; POST /auth/link/browser',
      invariant:
        'the form post of a signed-in person answers 200 and the round reads approved; the device that opened it trades it for that address; a second press answers 400'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const cookie = await env.principals.cookie(FIXTURE.owner)
      const { opened, nonce, clientSecret } = await openRound(s, 'QA laptop')
      const before = nonce ? await roundStatus(s, nonce) : null
      const done = note('approve', await approve(s, nonce, { cookie }))
      const after = nonce ? await roundStatus(s, nonce) : null
      const second = note('approve again', await approve(s, nonce, { cookie }))
      const traded = note(
        'the device trades the round',
        await s.send({
          method: 'POST',
          path: `/auth/link/${nonce}/exchange`,
          headers: { 'content-type': 'application/json' },
          body: { clientSecret }
        })
      )
      return verdict(
        '200, the round reads approved, the device gets the address, a second press is 400',
        [
          [done.status === 200, `the approval answered ${short(done)}`],
          [done.text.includes(FIXTURE.owner), 'the approved page does not name the address'],
          [!hasApproveForm(done), 'the approved page still offers the approve button'],
          [after === 'approved', `after the approval the round reads ${after}`],
          [second.status === 400, `a second press answered ${short(second)}`],
          [
            traded.status === 200 && traded.json?.email === FIXTURE.owner,
            `the device was given ${short(traded)}`
          ]
        ],
        [
          [opened.status === 200 && Boolean(nonce), `the round did not open (${short(opened)})`],
          [before === 'pending', `before the approval the round read ${before}`]
        ]
      )
    }
  },
  {
    key: 'signin-device-invalid-link',
    door: 'GET /signin',
    tag: 'expired-auth',
    title:
      'Device sign-in, invalid link: a round that was never opened, has expired or is already approved cannot be approved',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'GET /signin: "400 when the round expired or was already approved"; POST /signin/approve: "400 for a malformed, unknown, expired or already-approved round"; POST /auth/link/browser: "valid for 15 minutes"',
      invariant:
        'for an unknown, an expired and an already-approved round the confirm page answers 400 with no approve form, and the approve door answers 400 and approves nothing'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const cookie = await env.principals.cookie(FIXTURE.owner)
      const live = await openRound(s, 'QA laptop')
      s.clock.t += 14 * MINUTE
      const control = note('control: fourteen minutes', await confirmPage(s, live.nonce, cookie))
      const unknownPage = note('never opened: page', await confirmPage(s, NEVER_ISSUED, cookie))
      const unknownPost = note('never opened: approve', await approve(s, NEVER_ISSUED, { cookie }))
      const old = await openRound(s, 'QA laptop')
      s.clock.t += 16 * MINUTE
      const expiredPage = note('sixteen minutes: page', await confirmPage(s, old.nonce, cookie))
      const expiredPost = note('sixteen minutes: approve', await approve(s, old.nonce, { cookie }))
      const expiredStatus = old.nonce ? await roundStatus(s, old.nonce) : null
      const used = await openRound(s, 'QA laptop')
      const first = await approve(s, used.nonce, { cookie })
      const usedPage = note('already approved: page', await confirmPage(s, used.nonce, cookie))
      const refusals = [
        ['a round never opened (page)', unknownPage],
        ['a round never opened (approve)', unknownPost],
        ['an expired round (page)', expiredPage],
        ['an expired round (approve)', expiredPost],
        ['an approved round (page)', usedPage]
      ]
      return verdict(
        '400 with no approve form for an unknown, an expired and an already-approved round',
        [
          ...refusals.flatMap(([name, obs]) => [
            [obs.status === 400, `${name} answered ${short(obs)}`],
            [!hasApproveForm(obs), `${name} still offers the approve button`]
          ]),
          [expiredStatus === 'expired', `an expired round that was pressed reads ${expiredStatus}`]
        ],
        [
          [live.opened.status === 200 && Boolean(old.nonce) && Boolean(used.nonce), 'a round did not open'],
          [
            control.status === 200 && hasApproveForm(control),
            `a round fourteen minutes old is not offered (${short(control)})`
          ],
          [first.status === 200, `the first approval did not go through (${short(first)})`]
        ]
      )
    }
  },
  {
    key: 'signin-device-approve-refused',
    door: 'POST /signin/approve',
    tag: 'csrf-origin',
    title:
      'Device sign-in: an approval that does not come from the Tracy page, or comes without a session, approves nothing',
    oracle: {
      source: PEOPLE_DOCS,
      ref: 'POST /signin/approve: "Refused with 403 unless the Origin header is exactly this app\'s own origin, 401 without a live session"',
      invariant:
        'a post with a foreign, a look-alike, a null or no Origin answers 403 and one without a session 401; the round is still pending after each'
    },
    async run(env, note) {
      const s = bootScenario(env)
      const cookie = await env.principals.cookie(FIXTURE.owner)
      const { opened, nonce } = await openRound(s, 'QA laptop')
      const form = { 'content-type': 'application/x-www-form-urlencoded' }
      const origins = {
        'a customer site': { ...form, origin: 'https://shop.qa-customer.example' },
        'a look-alike origin': { ...form, origin: `${ORIGIN}.evil.invalid` },
        'a sandboxed frame': { ...form, origin: 'null' },
        'no Origin': form
      }
      const expectations = []
      for (const [name, headers] of Object.entries(origins)) {
        const obs = note(name, await approve(s, nonce, { cookie, headers }))
        const status = nonce ? await roundStatus(s, nonce) : null
        expectations.push(
          [obs.status === 403, `an approval from ${name} answered ${short(obs)}`],
          [status === 'pending', `after an approval from ${name} the round reads ${status}`]
        )
      }
      const guest = note('no session', await approve(s, nonce, {}))
      const afterGuest = nonce ? await roundStatus(s, nonce) : null
      expectations.push(
        [guest.status === 401, `an approval without a session answered ${short(guest)}`],
        [afterGuest === 'pending', `after an approval without a session the round reads ${afterGuest}`]
      )
      // The round was refused, not spoiled: the person's own press still goes through. This is an
      // expectation, not a control: a refused post that approved the round is what makes it fail.
      const own = note('the real press', await approve(s, nonce, { cookie }))
      expectations.push([
        own.status === 200,
        `after the refused posts the person's own press answered ${short(own)}`
      ])
      return verdict(
        '403 for every foreign origin, 401 without a session, the round still pending',
        expectations,
        [[opened.status === 200 && Boolean(nonce), `the round did not open (${short(opened)})`]]
      )
    }
  }
]

const SIGNIN_MORE_MUTANTS = [
  {
    id: 'S60-github-signs-in-another-address',
    description: 'the GitHub exchange names the first listed address instead of the primary verified one',
    file: 'src/identity/oauth.js',
    find: 'const primary = Array.isArray(emails) ? emails.find((e) => e?.primary && e?.verified) : null',
    replace: 'const primary = Array.isArray(emails) ? emails.find((e) => e?.verified) : null',
    scenarios: ['signin-github-success', 'signin-github-unverified-email']
  },
  {
    id: 'S61-github-refusal-not-read',
    description: 'a code GitHub refuses is not noticed: the exchange goes on to the API calls',
    file: 'src/identity/oauth.js',
    find: "  if (!tokenResponse.ok || typeof tokenPayload?.access_token !== 'string') {\n    throw new OAuthError('EXCHANGE_FAILED')\n  }\n  const headers = githubHeaders(tokenPayload.access_token)",
    replace: '  const headers = githubHeaders(tokenPayload?.access_token)',
    scenarios: ['signin-github-refuses']
  },
  {
    id: 'S62-malformed-signin-link-goes-on',
    description: 'a /signin address with a malformed round id is treated like a round',
    file: 'src/identity/route.js',
    find: "    if (!NONCE.test(nonce)) return failedPage(c, 'link', 404) ?? c.notFound()\n",
    replace: '',
    scenarios: ['signin-link-malformed']
  },
  {
    id: 'S63-confirm-page-hides-the-device',
    description: 'the confirm page no longer shows what the requesting device said about itself',
    file: 'src/identity/route.js',
    find: "deviceConfirmPage({ email, nonce, device: row.device ?? '', lang: requestLanguage(c) })",
    replace: "deviceConfirmPage({ email, nonce, device: '', lang: requestLanguage(c) })",
    scenarios: ['signin-device-confirm-page']
  },
  {
    id: 'S64-approve-writes-nothing',
    description: 'the approved page is shown without the round being approved',
    file: 'src/identity/route.js',
    find: '    if (!row || !(await store.approveLink(nonceHash, email))) return roundGone(c, email)',
    replace: '    if (!row) return roundGone(c, email)',
    scenarios: ['signin-device-approved']
  },
  {
    id: 'S65-confirm-page-ignores-expiry',
    description: 'the confirm page offers a round past its fifteen minutes',
    file: 'src/identity/route.js',
    find: "    if (!row || row.status !== 'pending' || row.expiresAt < now()) {\n      return renderedPage(\n        c,\n        deviceApprovedPage({\n          email,",
    replace:
      "    if (!row || row.status !== 'pending') {\n      return renderedPage(\n        c,\n        deviceApprovedPage({\n          email,",
    scenarios: ['signin-device-invalid-link']
  },
  {
    id: 'S66-approve-from-any-origin',
    description: 'the approve door no longer checks where the form was posted from',
    file: 'src/identity/route.js',
    find: "    if (c.req.header('origin') !== config.origin) {\n      return renderedPage(\n        c,\n        deviceApprovedPage({\n          error: translate(requestLanguage(c), 'device.notFromTracy'),",
    replace:
      "    if (false) {\n      return renderedPage(\n        c,\n        deviceApprovedPage({\n          error: translate(requestLanguage(c), 'device.notFromTracy'),",
    scenarios: ['signin-device-approve-refused']
  },
  {
    id: 'S67-cancel-read-as-broken-state',
    description: 'a sign-in the person cancelled at the provider is told as a broken link',
    file: 'src/identity/route.js',
    find: "      const cancelled = errors.length === 1 && errors[0] === 'access_denied'\n",
    replace: '      const cancelled = false\n',
    scenarios: ['signin-provider-cancelled', 'signin-github-cancelled']
  }
]

/** Mutants of product code that the scenarios must catch (same shape as red.mjs MUTANTS). */
export const SCENARIO_MUTANTS = Object.freeze([
  ...PUBLISH_MUTANTS,
  ...MORE_MUTANTS,
  ...SIGNIN_MORE_MUTANTS,
  {
    id: 'S01-login-mails-nothing',
    description: 'the code is stored and never mailed',
    file: 'src/identity/route.js',
    find: '    await mail.send({ to: email, ...mail.signInCodeMail(code, requestLanguage(c)) })\n    if (isFormPost) {',
    replace: '    if (isFormPost) {',
    scenarios: ['signin-code-requested']
  },
  {
    id: 'S02-verify-sets-no-session',
    description: 'a right code is acknowledged without a session cookie',
    file: 'src/identity/route.js',
    find: '    await startSession(c, email)\n    if (isFormPost) {',
    replace: '    if (isFormPost) {',
    scenarios: ['signin-code-right']
  },
  {
    id: 'S03-verify-skips-code-compare',
    description: 'any six digits verify once a code row exists',
    file: 'src/identity/route.js',
    find: 'if (row.codeHash !== (await hashCode(code, email, config.sessionSecret))) {',
    replace: 'if (false) {',
    scenarios: ['signin-code-wrong']
  },
  {
    id: 'S04-verify-ignores-expiry',
    description: 'a code never expires',
    file: 'src/identity/route.js',
    find: '    if (!row || row.expiresAt < now()) {\n      if (row) await store.deleteCode(email)',
    replace: '    if (!row) {\n      if (row) await store.deleteCode(email)',
    scenarios: ['signin-code-expired']
  },
  {
    id: 'S05-verify-keeps-used-code',
    description: 'a verified code is not burned',
    file: 'src/identity/route.js',
    find: "    await store.deleteCode(email)\n    await store.touchAccount(email, { admission, via: 'email code' })",
    replace: "    await store.touchAccount(email, { admission, via: 'email code' })",
    scenarios: ['signin-code-reused']
  },
  {
    id: 'S06-callback-sets-no-session',
    description: 'a finished provider sign-in redirects without a session cookie',
    file: 'src/identity/route.js',
    find: "    c.header('set-cookie', sessionCookie(token, optsFor(c)), { append: true })\n    return c.redirect(row.next, 302)",
    replace: '    return c.redirect(row.next, 302)',
    scenarios: ['signin-provider-success']
  },
  {
    id: 'S07-callback-ignores-state-cookie',
    description: 'the callback no longer compares the state with the cookie of the browser that started it',
    file: 'src/identity/route.js',
    find: 'if (!queryState || !cookieState || queryState !== cookieState) {',
    replace: 'if (!queryState) {',
    scenarios: ['signin-provider-state-other-browser', 'signin-github-state-other-browser']
  },
  {
    id: 'S08-callback-ignores-state-expiry',
    description: 'a state never expires',
    file: 'src/identity/route.js',
    find: 'if (!row || row.provider !== provider || row.expiresAt < now()) {',
    replace: 'if (!row || row.provider !== provider) {',
    scenarios: ['signin-provider-state-expired', 'signin-github-state-expired']
  },
  {
    id: 'S09-unreachable-provider-reads-ok',
    description: 'an unreachable provider is answered 200',
    file: 'src/identity/route.js',
    find: "return refuse('EXCHANGE_FAILED', 'exchange', 502, row.next)",
    replace: "return refuse('EXCHANGE_FAILED', 'exchange', 200, row.next)",
    scenarios: ['signin-provider-refuses']
  },
  {
    id: 'S10-unverified-email-accepted',
    description: "Google's email_verified claim is not read",
    file: 'src/identity/oauth.js',
    find: "if (claims.email_verified !== true && claims.email_verified !== 'true') {",
    replace: 'if (false) {',
    scenarios: ['signin-provider-unverified-email']
  },
  {
    id: 'S11-unconfigured-provider-starts',
    description: 'the start door no longer checks that the provider is configured',
    file: 'src/identity/route.js',
    find: "if (!PROVIDERS.has(provider) || !config.oauth?.[provider])\n      return failedPage(c, 'provider', 404) ?? c.notFound()\n    const refuse",
    replace:
      "if (!PROVIDERS.has(provider)) return failedPage(c, 'provider', 404) ?? c.notFound()\n    const refuse",
    scenarios: ['signin-provider-not-offered', 'signin-github-not-offered']
  },
  {
    id: 'S12-failure-page-drops-next',
    description: 'the way back from the failure page forgets where the person was going',
    file: 'src/identity/pages.js',
    find: "safeNext === safePath(undefined, origin) ? '/login' :",
    replace: "true ? '/login' :",
    scenarios: ['signin-failure-page-way-back']
  },
  {
    id: 'S13-auth-me-names-nobody',
    description: '/auth/me reads every session as a guest',
    file: 'src/identity/route.js',
    find: 'const email = session?.email ?? null\n    if (session && sessionDueForRenewal(session.exp, now())) {',
    replace: 'const email = null\n    if (session && sessionDueForRenewal(session.exp, now())) {',
    scenarios: ['signin-session-after-reload']
  },
  {
    id: 'S14-signout-keeps-session-cookie',
    description: 'sign-out answers ok and leaves the session cookie in the browser',
    file: 'src/identity/route.js',
    find: "    c.header('set-cookie', clearSessionCookie(optsFor(c)))\n",
    replace: '',
    scenarios: ['signin-signout']
  }
])

SCENARIOS.push(...PUBLISH_SCENARIOS, ...MORE_SCENARIOS, ...SIGNIN_MORE_SCENARIOS)

export const scenarioByKey = new Map(SCENARIOS.map((s) => [s.key, s]))

/** The case manifests of the scenarios, in the shape every api case has (plus `scenario`). */
export function scenarioManifests(doors, src) {
  const known = new Map(doors.map((d) => [d.id, d]))
  return SCENARIOS.map((s) => {
    const door = known.get(s.door)
    if (!door) throw new Error(`scenario ${s.key}: door ${s.door} is not in the pinned oracle`)
    return {
      id: `QA-API-scenario-${s.key}`,
      itemIds: [door.id],
      membership: door.public ? 'public' : 'internal-only',
      requirement: s.title,
      oracle: {
        source: s.oracle.source === PEOPLE_DOCS ? `${src.docs}; ${s.oracle.source}` : s.oracle.source,
        ref: s.oracle.ref,
        invariant: s.oracle.invariant
      },
      edgeTags: [s.tag],
      variant: `scenario:${s.key}`,
      scenario: s.key,
      targets: ['local'],
      effects: {
        reads: ['owned-postgres:per-run database'],
        writes: ['owned-postgres:per-run database'],
        mail: Boolean(s.mail),
        model: false,
        containers: false
      },
      prerequisites: ['docker', 'owned-postgres'],
      assertionIds: [`scenario.${s.key}`],
      redProof: null,
      legacyIds: []
    }
  })
}

/** Play one scenario manifest. `env` is the executor's environment (runner.mjs `shared`). */
export async function runScenario(manifest, env) {
  const scenario = scenarioByKey.get(manifest.scenario)
  if (!scenario)
    return { v: 'PENDING', reason: `TEST_INVALID: unknown scenario ${manifest.scenario}`, observations: [] }
  if (!scenario.run) return { v: 'PENDING', reason: scenario.pending, observations: [] }
  const seen = []
  const note = (label, o) => (
    seen.push({
      label,
      status: o.status,
      ms: o.ms,
      text: (o.text ?? '').slice(0, 240),
      error: o.error,
      location: o.headers?.location
    }),
    o
  )
  const outcome = await scenario.run(env, note)
  return { ...outcome, observations: seen }
}
