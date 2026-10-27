/** One small foreground signal from the desktop window, beside its existing install-link door. */
import { createHash } from 'node:crypto'
import {
  DESKTOP_OPENED_MAX_BYTES,
  DESKTOP_OPENED_PER_HOUR,
  DESKTOP_OPENED_PER_IP_HOUR,
  parseDesktopOpened,
  recordDesktopOpened
} from '../lib/desktop-opened.js'
import { viewer } from '../lib/http.js'
import { clientIp } from '../lib/login-mail-rate.js'
import { overLimitOrClosed } from '../lib/rate.js'

/** Read actual bytes up to the cap, including chunked bodies or an incorrect Content-Length. */
async function readOpenedBody(request) {
  if (Number(request.headers.get('content-length')) > DESKTOP_OPENED_MAX_BYTES) return null
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > DESKTOP_OPENED_MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function mountDesktopOpened(app, { pool, config, now = Date.now }) {
  app.post('/api/desktop/installs/opened', async (c) => {
    c.header('cache-control', 'no-store')
    if ((c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json')
      return c.json({ code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
    const text = await readOpenedBody(c.req.raw).catch(() => '')
    if (text === null) return c.json({ code: 'OPENED_TOO_LARGE' }, 413)
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      // Invalid JSON is refused by the same strict shape check below.
    }
    const opened = parseDesktopOpened(body, now())
    if (!opened.ok) return c.json({ code: opened.code }, 400)
    const ip = createHash('sha256').update(clientIp(c)).digest('hex')
    const [copyOver, ipOver] = await Promise.all([
      overLimitOrClosed(pool, `desktop-opened:${opened.installId}`, DESKTOP_OPENED_PER_HOUR, now()),
      overLimitOrClosed(pool, `desktop-opened-ip:${ip}`, DESKTOP_OPENED_PER_IP_HOUR, now())
    ])
    if (copyOver || ipOver) {
      c.header('retry-after', String(Math.max(1, Math.ceil((3_600_000 - (now() % 3_600_000)) / 1000))))
      return c.json({ code: 'RATE_LIMITED' }, 429)
    }
    try {
      await recordDesktopOpened(pool, opened, await viewer(c, config))
      return c.body(null, 204)
    } catch {
      return c.json({ code: 'OPENED_UNAVAILABLE' }, 503)
    }
  })
}
