import { dshRpc } from './dsh-rpc.js'
import { siteSeatGrant } from './seat-grant.js'
import { callSeatDoor } from '../workspace/seat-door.js'
import { siteSessionBaseline } from './dsh-workspace-baseline.js'

/**
 * The session a claimed site's build will open in, made BEFORE the browser moves there — so the
 * address the claim hands back already names it and the site page loads once and settles.
 *
 * Measured 20/09 on dev (tasks/pa-dia-chi-mot-duong-cho-site.md §7): a create landed on
 * `/<site>/?…`, then dsh wrote `s/<id>` onto the bar a beat later; the whole journey was six
 * address changes, and the ask was "1–2". This is the only way to lose the write after the
 * load: know the id first. dsh takes commands over the same HTTP RPC door its own client uses
 * (`POST <mount>/api/<endpoint>`, `{type:'client-request', rpcId, method, payload:{args:{request}}}`),
 * behind the seat gateway — so the call is made on a seat minted for the site, exactly as the
 * browser's would be, and the gateway applies the same folder rules (`cwd` is what it checks;
 * `workspaceId` alone is refused until that seat has seen a workspace baseline, measured 20/09).
 *
 * 🔒 FAIL OPEN, ONCE, QUICKLY. Nothing here may stop a claim: a gateway that refuses, a dsh that
 * is down, or an answer that is not the envelope returns null, and the claim answers the site
 * root as it did before — where dsh makes the session on arrival. Five seconds, not the door's
 * default, because the person is looking at a spinner.
 * Also how "Hand to the agent" (Website Opportunities) opens the chat its prompt goes into.
 * @param {{
 *   config: any,
 *   seatDoor: { mintSeatSession?: Function },
 *   fetchImpl?: typeof fetch,
 *   site: { host?: string | null, label: string, site_key: string, platform: string },
 *   email: string
 * }} input - `site` is the site row; the seat minted is `email`'s, as owner.
 * @returns {Promise<string | null>} the session id, or null.
 */
export async function siteSessionAhead({ config, seatDoor, fetchImpl = fetch, site, email, sessionId }) {
  if (sessionId) {
    // A browser cannot choose an ungranted identity. The signed door allocates this server-held ID
    // and records its exclusive owner only after native creation succeeds; never fall back to a random chat.
    const h = config.hosts?.get?.(site.host ?? config.defaultHost)
    if (!h?.dshOrigin || !h?.seatSecret) return null
    try {
      const answer = await callSeatDoor({
        origin: h.dshOrigin,
        secret: h.seatSecret,
        path: '/gateway/seat/session',
        payload: {
          ...siteSeatGrant({ email, role: 'owner', label: site.label, siteKey: site.site_key }),
          siteSession: { sessionId, agentPreset: `designer-${site.platform}` }
        },
        fetchImpl,
        signal: AbortSignal.timeout(10_000)
      })
      return answer.ok && answer.body?.siteSession?.sessionId === sessionId ? sessionId : null
    } catch {
      return null
    }
  }
  const rpc = await siteSeatRpc({ config, seatDoor, fetchImpl, site, email })
  if (!rpc) return null
  const label = site.label
  try {
    // The folder is registered as a workspace first — idempotent — and the session is made BY
    // WORKSPACE ID, never by `cwd`. dsh attaches a session to a workspace only when asked by id
    // (`session-controller/commands.ts`: `cwd` alone is a session in no workspace), and the seat
    // gateway seeds a new seat's session grants from the sessions IN its workspaces on the
    // browser's first baseline — a session made by `cwd` is not among them, the seed replaces
    // the grant the create had written, dsh no longer lists it, drops it from the address and
    // makes another. Measured 20/09 on dev in the gateway's own ledger: the ahead session had
    // no grant, the one made on arrival did; by id, the grant survives. The gateway learns the
    // id → path pair from the create answer, so the folder check passes without a baseline.
    const ws = await rpc('workspace/create', { path: `/site/${label}` })
    const workspaceId = ws?.workspace?.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') return null
    const made = await rpc('session/create', {
      workspaceId,
      agentPreset: `designer-${site.platform}`
    })
    return typeof made?.sessionId === 'string' && made.sessionId !== '' ? made.sessionId : null
  } catch {
    return null
  }
}

/**
 * The site's dsh RPC door on a seat minted for `email` as owner, the way the browser's own calls go
 * through the seat gateway; null when this deployment cannot mint one.
 * @param {{ config: any, seatDoor: { mintSeatSession?: Function }, fetchImpl?: typeof fetch,
 *   site: { host?: string | null, label: string, site_key: string }, email: string }} input
 * @returns {Promise<((endpoint: string, request: object) => Promise<any>) | null>}
 */
export async function siteSeatRpc({ config, seatDoor, fetchImpl = fetch, site, email }) {
  const seat = await siteSeatConnection({ config, seatDoor, fetchImpl, site, email })
  if (!seat) return null
  return (endpoint, request) => dshRpc({ ...seat, endpoint, request, fetchImpl })
}

async function siteSeatConnection({ config, seatDoor, fetchImpl, site, email }) {
  if (typeof seatDoor.mintSeatSession !== 'function') return null
  const h = config.hosts?.get?.(site.host ?? config.defaultHost)
  if (!h?.dshOrigin || !h?.seatSecret) return null
  const grant = siteSeatGrant({ email, role: 'owner', label: site.label, siteKey: site.site_key })
  let token = null
  try {
    token = await seatDoor.mintSeatSession({ origin: h.dshOrigin, secret: h.seatSecret, grant, fetchImpl })
  } catch {
    return null
  }
  if (typeof token !== 'string' || token === '') return null
  const mount = `/${site.site_key}`
  return { origin: h.dshOrigin, mount, token }
}

/**
 * Queue `text` as the next message of an existing chat on a site (`session/prompt`, `mode: 'queue'`):
 * how the demo QA gate hands its repair list to the agent that built the demo.
 * @param {{ config: any, seatDoor: { mintSeatSession?: Function }, fetchImpl?: typeof fetch,
 *   site: { host?: string | null, label: string, site_key: string }, email: string,
 *   sessionId: string, requestId: string, text: string }} input
 * @returns {Promise<boolean>} whether dsh accepted it
 */
export async function promptSiteSession({ sessionId, requestId, text, ...seat }) {
  const fetchImpl = seat.fetchImpl ?? fetch
  const connection = await siteSeatConnection({ ...seat, fetchImpl })
  if (!connection) return false
  // Native creation records a durable grant, but the gateway learns cwd through its filtered
  // workspace/follow baseline. Never replace that ownership check with a server-side bypass.
  if (!(await siteSessionBaseline({ ...connection, label: seat.site.label, sessionId }))) return false
  const answer = await dshRpc({
    ...connection,
    fetchImpl,
    endpoint: 'session/prompt',
    request: {
      requestId,
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }]
    }
  }).catch(() => null)
  return answer?.accepted === true
}
