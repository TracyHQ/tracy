/**
 * REG-PR-1734-session-ttl-seven-days: a signed-in session lasts seven days.
 * S1: SESSION_TTL_S in lib/policy.js is 7 * 24 * 60 * 60. S2: the cookie `sessionCookie()` writes
 * carries Max-Age equal to it, and a token minted now expires SESSION_TTL_S seconds from now.
 * S3: the sliding renewal threshold is still one hour, so the many /auth/me calls of one page do not
 * each write a cookie.
 */
import { checks } from './lib.mjs'

const c = checks()
const policy = await import('../../../apps/tracy-web/src/lib/policy.js')
const session = await import('../../../apps/tracy-web/src/lib/session.js')

c.eq('S1: SESSION_TTL_S is seven days', policy.SESSION_TTL_S, 7 * 24 * 60 * 60)
const cookie = session.sessionCookie('token', { secure: true })
c.eq('S2: Max-Age of the session cookie', /Max-Age=(\d+)/.exec(cookie)?.[1], String(policy.SESSION_TTL_S))
const now = Date.now()
const token = await session.mintSession('reg@example.test', 'reg-secret', now)
const read = await session.sessionWithExpiry(`tracy_sess=${token}`, 'reg-secret', now)
c.eq(
  'S2: a fresh token expires SESSION_TTL_S from mint',
  read?.exp - Math.floor(now / 1000),
  policy.SESSION_TTL_S
)
c.eq('S3: renewal threshold still one hour', policy.SESSION_RENEW_AFTER_S, 60 * 60)
c.done()
