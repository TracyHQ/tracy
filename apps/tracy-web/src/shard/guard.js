// apps/tracy-web/src/shard/guard.js
/**
 * A shard signs nobody in by itself (shard beta, spec §2.2: "a shard sends no OTP and signs
 * nobody up by itself"): every sign-in entry goes to the master's `/login` with `next` back here, and every door
 * that would mail a code or mint a session from a code answers 403 `SIGN_IN_AT_MASTER`. One place
 * for OAuth, SSO, the beta gate and the code mail; no address can be probed on a shard. Mounted
 * only when TRACY_DEPLOYMENT_ROLE=shard, before `identity/route.js` and `lanes/route.js`.
 */
import { json } from '../lib/http.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { safePath } from '../lib/safe-path.js'
import { renderedPage } from '../lib/security-headers.js'
import { sessionFromCookieHeader } from '../lib/session.js'
import { masterLoginUrl } from './handoff.js'
import { signInAtMasterPage } from './pages.js'

const SIGN_IN_PAGES = new Set([
  '/login',
  '/signin',
  '/signin/email',
  '/signin/google',
  '/signin/github',
  '/signin/joomlart',
  // The OAuth and SSO callbacks: a shard holds no provider secret, so none can be completed here.
  '/signin/google/callback',
  '/signin/github/callback',
  '/signin/joomlart/callback'
])
const CODE_DOORS = new Set([
  '/login',
  '/verify',
  '/signin/code',
  '/signin/verify',
  '/auth/otp/start',
  '/auth/otp/verify'
])
const DESKTOP_REDEEM = /^\/auth\/link\/[^/]+\/session$/

export function shardSignInGuard({ config, now = Date.now }) {
  return async (c, next) => {
    const url = new URL(c.req.url)
    const method = c.req.method
    if (method === 'GET' && SIGN_IN_PAGES.has(url.pathname)) {
      // Signed in here already: the door does what it does today (`/login` sends on to `next`).
      if (await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())) return next()
      const back = url.pathname === '/login' ? (c.req.query('next') ?? '/') : `${url.pathname}${url.search}`
      return c.redirect(masterLoginUrl(config, back), 302)
    }
    if (method === 'POST' && (CODE_DOORS.has(url.pathname) || DESKTOP_REDEEM.test(url.pathname))) {
      c.header('cache-control', 'no-store')
      const login = masterLoginUrl(config, '/')
      if (!(c.req.header('accept') ?? '').includes('text/html'))
        return json(c, { code: 'SIGN_IN_AT_MASTER', login }, 403)
      // The page's one form goes to the master: allow that origin in `form-action` for this answer.
      c.set('formAction', config.shard.masterOrigin)
      return renderedPage(
        c,
        signInAtMasterPage({
          masterOrigin: config.shard.masterOrigin,
          next: safePath('/', config.origin),
          lang: requestLanguage(c)
        }),
        403
      )
    }
    return next()
  }
}
