/**
 * One call to dsh's HTTP RPC door, from the server, as a seat.
 *
 * dsh's own client talks to it over a WebSocket and, for one-shot calls, over
 * `POST <mount>/api/<endpoint>` with the same envelope; the seat gateway in front of it reads the
 * seat from the `dsh_gateway_token` cookie and the mount from `x-forwarded-prefix`, and applies
 * the same folder rules it applies to a browser. So this is not a back door: a request here is
 * refused exactly where the same request from the page would be.
 *
 * Why the server makes calls at all (20/09): a session made BEFORE the browser moves can be named
 * on the address it moves to, and the page then loads once and settles — instead of loading bare,
 * making the session on arrival and writing `s/<id>` onto the bar a beat later. Measured on dev:
 * `session/create` answers in 0.2–0.6 s.
 *
 * 🔒 FAIL OPEN, ONCE, QUICKLY. Nothing that calls this may stop on it: a gateway that refuses, a
 * dsh that is down, a timeout or an answer that is not the envelope is `null`, and the caller
 * answers as it did before the call existed. Five seconds, not the door's default — the person is
 * looking at a spinner.
 *
 * @param {object} input
 * @param {string} input.origin - the host's dsh origin (`config.hosts.get(host).dshOrigin`).
 * @param {string} input.mount - the mount the seat is for: `/<siteKey>`, or `/new`.
 * @param {string} input.token - the seat's lane token, as the seat door minted it.
 * @param {string} input.endpoint - `session/create`, `workspace/create`, …
 * @param {object} input.request - the endpoint's `request` argument.
 * @param {typeof fetch} [input.fetchImpl]
 * @param {number} [input.timeoutMs]
 * @returns {Promise<any>} the endpoint's value, or null.
 */
export async function dshRpc({
  origin,
  mount,
  token,
  endpoint,
  request,
  fetchImpl = fetch,
  timeoutMs = 5_000
}) {
  const rpcId = crypto.randomUUID()
  let res
  try {
    res = await fetchImpl(`${origin}${mount}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `dsh_gateway_token=${token}`,
        'x-forwarded-prefix': mount
      },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload: { args: { request } }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    warn(`${endpoint} did not answer: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
  if (!res.ok) {
    warn(`${endpoint} refused: ${res.status}`)
    return null
  }
  const body = await res.json().catch(() => null)
  if (body?.type !== 'server-response' || body.rpcId !== rpcId || body.result?.ok !== true) {
    warn(
      `${endpoint} answered ${body?.result?.ok === false ? `error ${String(body.result.error?.code ?? '')}` : 'an unexpected shape'}`
    )
    return null
  }
  return body.result.value
}

/**
 * One line per refusal, on stderr. The callers fail open by design, and a refusal that leaves no
 * trace is the slowest kind to find: on dev (20/09) the claim's session was refused for an hour
 * before the gateway's ledger, not a log, said why. Never the token, never the request body.
 * @param {string} message
 */
function warn(message) {
  console.warn(`[dsh-rpc] ${message}`)
}

/**
 * The account name a lane token was minted for — the seat's folder under its `home` root is named
 * after it (`dsh-passwords` `seat-home.ts`: `<home>/<username>`). Read, not verified: the gateway
 * verifies the token on every call this name is used in, and a wrong name only makes that call a
 * refusal.
 * @param {string} token
 * @returns {string | null}
 */
export function usernameOfToken(token) {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof claims?.username === 'string' && /^[A-Za-z0-9_-]+$/.test(claims.username)
      ? claims.username
      : null
  } catch {
    return null
  }
}
