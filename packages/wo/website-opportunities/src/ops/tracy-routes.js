/**
 * The Operator page's Tracy tab: connect this server to a Tracy account, see whom it is connected as, disconnect.
 * Under `/api/website-opportunities/operator/tracy`:
 *
 *   GET  /             → {state, tracyUrl, userCode?, verificationUri?, verificationUriComplete?, expiresAt?, account?,
 *                         error?}; while a code waits, each read also asks Tracy once when a poll is due
 *   POST /connect      {} → a new code and its link
 *   POST /disconnect   {} → revokes the grant in Tracy and forgets the tokens
 *
 * Only the operator (`host.requireOperator`), and writes carry a JSON body, as on the other operator doors. No answer
 * ever holds a token or the device code: they stay on the server (`../tracy-connection.js`).
 */
import { Hono } from 'hono'
import { requireHost } from '../host.js'
import { OPERATOR_BASE } from './operator-routes.js'

const B = `${OPERATOR_BASE}/tracy`

/**
 * @param {{ host: import('../host.js').WoHost, connection: ReturnType<import('../tracy-connection.js').createTracyConnection>,
 *   log?: { log?: Function } }} deps
 */
export function tracyOperatorRoutes({ host: given, connection, log = console }) {
  const host = requireHost(given, ['json', 'requireOperator'])
  const app = new Hono()
  const answer = (c, body, status = 200) => {
    c.header('cache-control', 'no-store')
    return host.json(c, body, status)
  }

  async function operator(c, { write = false } = {}) {
    const who = await host.requireOperator(c, { write })
    if (typeof who !== 'string') return { deny: who }
    if (write && !/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return { deny: answer(c, { code: 'JSON_REQUIRED', next: 'Send the body as application/json.' }, 415) }
    return { email: who }
  }
  const unavailable = (c, error) =>
    answer(
      c,
      {
        code: error.code ?? 'TRACY_UNAVAILABLE',
        next: error.message || 'Tracy did not answer; try again in a moment.'
      },
      502
    )

  app.get(B, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    try {
      return answer(c, await connection.poll())
    } catch (error) {
      if (error?.code !== 'TRACY_UNAVAILABLE') throw error
      // A missed poll is retried on the next read; the code is still good.
      return answer(c, await connection.status())
    }
  })

  app.post(`${B}/connect`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    if ((await connection.status()).state === 'connected')
      return answer(
        c,
        { code: 'ALREADY_CONNECTED', next: 'Disconnect first to connect another account.' },
        409
      )
    try {
      const out = await connection.connect()
      log.log?.(`[wo operator] Tracy connect started by ${g.email}`)
      return answer(c, out)
    } catch (error) {
      if (!['TRACY_UNAVAILABLE', 'TRACY_CONNECT_REFUSED'].includes(error?.code)) throw error
      return unavailable(c, error)
    }
  })

  app.post(`${B}/disconnect`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const out = await connection.disconnect()
    log.log?.(`[wo operator] Tracy disconnected by ${g.email}`)
    return answer(c, out)
  })

  return app
}
