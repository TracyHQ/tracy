import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requestLanguage, translate } from '../lib/i18n/index.js'
import { mintSession, sessionCookie, sessionFromCookieHeader } from '../lib/session.js'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const CODE = /^[a-f0-9]{64}$/
const TTL_MS = 60_000

/** Installation credentials stay in the launcher; browsers receive single-use codes only. */
export function localAccessRoutes({ config, book, ensureOwner, now = Date.now }) {
  const app = new Hono()
  if (!config.localAccess) return app
  const origin = new URL(config.origin)
  const { secret, installationId } = config.localAccess
  const email = `owner+${installationId}@local.invalid`
  const denied = (c, code, status = 403) => c.json({ code }, status)

  app.use('/auth/local/*', async (c, next) => {
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    c.header('x-content-type-options', 'nosniff')
    c.header('x-frame-options', 'DENY')
    const url = new URL(c.req.url)
    if (url.origin !== origin.origin || (c.req.header('host') ?? url.host) !== origin.host)
      return denied(c, 'LOCAL_HOST_REFUSED')
    return next()
  })

  app.get('/login', async (c) => {
    const email = await sessionFromCookieHeader(c.req.header('cookie'), config.sessionSecret, now())
    return c.redirect(email ? '/' : '/auth/local/open', 302)
  })
  for (const path of ['/login', '/verify']) app.post(path, (c) => denied(c, 'LOCAL_LAUNCHER_REQUIRED', 401))

  app.all('/signin', (c) => denied(c, 'LOCAL_LAUNCHER_REQUIRED', 401))
  app.all('/signin/*', (c) => denied(c, 'LOCAL_LAUNCHER_REQUIRED', 401))
  app.use('/auth/local/exchange', bodyLimit({ maxSize: 1024 }))

  app.post('/auth/local/launch', async (c) => {
    // This is a launcher-to-server call, never a browser credential endpoint.
    if (c.req.header('origin') || c.req.header('sec-fetch-site')) return denied(c, 'LOCAL_LAUNCHER_REQUIRED')
    const offered = c.req.header('authorization') ?? ''
    const expected = `Bearer ${secret}`
    if (
      Buffer.byteLength(offered) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(offered), Buffer.from(expected))
    )
      return denied(c, 'LOCAL_LAUNCHER_REQUIRED', 401)
    const code = randomBytes(32).toString('hex')
    await book.put(digest(code), now() + TTL_MS)
    return c.json({ url: `${origin.origin}/auth/local/open#${code}`, expiresIn: TTL_MS / 1000 })
  })

  app.get('/auth/local/open', (c) => {
    const nonce = randomBytes(18).toString('base64')
    const message = JSON.stringify(translate(requestLanguage(c), 'local.openAgain')).replaceAll(
      '<',
      '\\u003c'
    )
    c.header(
      'content-security-policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
    )
    return c.html(`<!doctype html><meta charset="utf-8"><script nonce="${nonce}">
const code = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
fetch('/auth/local/exchange', {
  method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({code})
}).then(response => {
  if (response.ok) location.replace('/');
  else document.body.textContent = ${message};
}).catch(() => { document.body.textContent = ${message}; });
</script><body></body>`)
  })

  app.post('/auth/local/exchange', async (c) => {
    // There is no session yet, so the ordinary cookie-based CSRF guard is insufficient.
    if (
      c.req.header('origin') !== origin.origin ||
      ![undefined, 'same-origin'].includes(c.req.header('sec-fetch-site'))
    )
      return denied(c, 'LOCAL_ORIGIN_REFUSED')
    if (c.req.header('content-type')?.split(';')[0].trim() !== 'application/json')
      return denied(c, 'LOCAL_JSON_REQUIRED', 415)
    const raw = await c.req.text()
    if (raw.length > 1024) return denied(c, 'LOCAL_CODE_INVALID', 400)
    let code
    try {
      code = JSON.parse(raw).code
    } catch {
      return denied(c, 'LOCAL_CODE_INVALID', 400)
    }
    if (typeof code !== 'string' || !CODE.test(code) || !(await book.take(digest(code), now())))
      return denied(c, 'LOCAL_CODE_EXPIRED', 401)
    await ensureOwner(email)
    const token = await mintSession(email, config.sessionSecret, now())
    c.header('set-cookie', sessionCookie(token, { secure: false }))
    return c.json({ ok: true })
  })
  return app
}

/** Atomic consumption survives restart and concurrent exchanges on separate web processes. */
export function localAccessBook(pool, installationId) {
  return {
    async put(codeHash, expiresAt) {
      await pool.query('delete from local_launch where expires_at <= now()')
      await pool.query(
        'insert into local_launch (code_hash, installation_id, expires_at) values ($1, $2, $3)',
        [codeHash, installationId, new Date(expiresAt)]
      )
    },
    async take(codeHash, now) {
      const result = await pool.query(
        `delete from local_launch where code_hash = $1 and installation_id = $2
         and expires_at > $3 returning code_hash`,
        [codeHash, installationId, new Date(now)]
      )
      return result.rowCount === 1
    }
  }
}
