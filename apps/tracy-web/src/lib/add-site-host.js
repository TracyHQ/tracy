/**
 * One call from this server to the add-site host half of the creation workspace's dsh
 * (`packages/site/tracy-add-site/src/host/hold-door.ts`): hold, release or forget a site whose
 * unfinished import is being removed (`sites/import-remove.js`).
 *
 * The same road `dsh-rpc.js` takes to dsh: a lane session for the person, minted by the seat door
 * (`mintSeatSession`) and sent as `dsh_gateway_token`, on the mount the import ran in (`/new`). The
 * gateway lets the request through as it would the person's own page. That alone would let any
 * signed-in person ask, so the call is also signed with the host's seat secret (`signSeatCall`, the
 * seat door's HMAC), and the host half answers nothing that is not.
 *
 * 🔒 FAIL CLOSED. No host, no secret, no session, no answer, a redirect, an answer that is not JSON:
 * `{ok: false}`, and the caller deletes nothing.
 */
import { onboardingGrant, ONBOARDING_MOUNT } from '../workspace/scope.js'
import { signSeatCall } from '../workspace/seat-door.js'

const HOLD_PATH = '/api/tracy-add-site/hold'

/**
 * @param {{config: any, seatDoor: {mintSeatSession?: Function}, fetchImpl?: typeof fetch,
 *   host: string, email: string, op: 'hold' | 'release' | 'forget', siteKey: string, quietForMs?: number,
 *   timeoutMs?: number}} input
 * @returns {Promise<{ok: boolean, status: number, body: any}>}
 */
export async function addSiteHostCall({
  config,
  seatDoor,
  fetchImpl = fetch,
  host,
  email,
  op,
  siteKey,
  quietForMs,
  timeoutMs = 10_000
}) {
  const unreachable = { ok: false, status: 0, body: null }
  // 🔒 THE HOST ON THE SITE'S ROW, never today's default: the read ran in the creation workspace of
  // the host that was the default when the import was claimed, which is the one the claim wrote
  // (`claimOwnership`). Asking a newer default would hear "no read here" while one runs on the old
  // host. A row with no host, or a host this deployment no longer knows: no answer.
  const h = typeof host === 'string' && host ? config.hosts?.get?.(host) : null
  if (!h?.dshOrigin || !h?.seatSecret || typeof seatDoor?.mintSeatSession !== 'function') return unreachable
  let token = null
  try {
    token = await seatDoor.mintSeatSession({
      origin: h.dshOrigin,
      secret: h.seatSecret,
      grant: onboardingGrant(email, config),
      fetchImpl
    })
  } catch {
    return unreachable
  }
  if (typeof token !== 'string' || token === '') return unreachable
  const body = JSON.stringify({ op, siteKey, ...(quietForMs ? { quietForMs } : {}) })
  const signed = await signSeatCall({ secret: h.seatSecret, path: HOLD_PATH, body })
  let res
  try {
    res = await fetchImpl(`${h.dshOrigin}${ONBOARDING_MOUNT}${HOLD_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `dsh_gateway_token=${token}`,
        'x-forwarded-prefix': ONBOARDING_MOUNT,
        ...signed
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch {
    return unreachable
  }
  const parsed = await res.json().catch(() => null)
  return { ok: res.ok && parsed !== null, status: parsed === null ? 0 : res.status, body: parsed }
}
