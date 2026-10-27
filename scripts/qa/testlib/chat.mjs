/**
 * One chat turn with the stand's agent on a draft site (plan §4.6, seam 6). A test asserts the
 * CONSEQUENCE of the turn (an HTTP door, a page, a structured UI fact), never the model's words.
 *
 * Wire: the same dsh RPC the dsh page sends (`client-connection`: POST `<base>/api/<endpoint>` with
 * `{ type: 'client-request', rpcId, method, payload: { args } }`, answered by
 * `{ type: 'server-response', rpcId, result: { ok, value | error } }`), under the site's dsh mount
 * `/<siteKey>/`, through the QA gate. Endpoints: `session/create`, `session/prompt` (the one the gate
 * counts as a chat slot), `session/projections`, `session/cancel`
 * (`vendor/tracy/deepseek-harness/packages/api/session-controller/src/commands.ts`).
 *
 * Before the first RPC the helper goes through the same two steps the product does
 * (`apps/tracy-web/src/sites/route.js` `sessionMadeAhead`):
 *   1. the seat. tracy-web answers the FIRST request under `/<siteKey>/` that carries no seat cookie
 *      by minting the seat and a 302 back to the same address (`workspace/route.js`, `if (minted)`)
 *      — for a POST too, which is why a bare RPC came back 302. So the site door `GET /<siteKey>/` is
 *      opened first and its `tracy_tok_*` cookie lands in the client's jar.
 *   2. the dsh workspace. `workspace/create { path: '/site/<label>' }` (idempotent; the seat's only
 *      folder, `lib/seat-grant.js`) answers the dsh `workspaceId`, and the session is made BY THAT
 *      ID: the gateway learns the id -> folder pair from the create answer. The `workspaceId` in
 *      `/api/sites` is Tracy's team, not a dsh workspace — sent to dsh it is a 403.
 *
 * `chat()` sends EXACTLY ONE `session/prompt` per call and never retries it: a refused slot (429/403
 * from the gate) or a failed prompt is thrown as a ChatError with the gate's or dsh's code.
 * The turn has ended when the session's `turnOutline` holds a turn past the ones it had before and
 * that turn carries a response (filled only at `turn/end`). Past `timeoutMs` the turn is cancelled
 * (`session/cancel`) and a ChatError `CHAT_TIMEOUT` is thrown.
 *
 * Exports:
 *   ChatError (Error with .code, .status?, .detail?)
 *   chat(siteKey, text, { client?, sessionId?, workspaceId?, timeoutMs? = 240000, pollMs? = 1000 })
 *     -> Promise<{ sessionId, turn, response, ms }>   // workspaceId = a dsh workspace id, if known
 *   rpcValue(reply): unknown          // the `value` of a dsh RPC answer, or throws ChatError
 *   siteLabel(siteKey, domain): string                // the label dsh files the site under
 *   openSeat(client, siteKey): Promise<void>          // step 1 above; throws ChatError NO_SEAT
 *   siteWorkspace(client, siteKey): Promise<string>   // step 2 above: the dsh workspaceId
 */
import { createHash, randomUUID } from 'node:crypto'
import { standClient } from './stand.mjs'

export class ChatError extends Error {
  constructor(code, message, extra = {}) {
    super(`${code}: ${message}`)
    this.code = code
    Object.assign(this, extra)
  }
}

export function rpcValue(reply) {
  if (reply.status !== 200) {
    const code = reply.json?.code ?? `HTTP_${reply.status}`
    throw new ChatError(code, `dsh RPC answered ${reply.status}`, {
      status: reply.status,
      detail: reply.text
    })
  }
  const result = reply.json?.result
  if (result?.ok === true) return result.value
  const code = result?.error?.code ?? 'RPC_BAD_ANSWER'
  throw new ChatError(code, result?.error?.message ?? 'no result in the answer', { status: 200 })
}

/**
 * The label a site is filed under, as `apps/tracy-web/src/sites/label.js` `fleetLabel` computes
 * it: a site born on the stand is `<label>.<domain>`; any other name is its readable form plus
 * the first 8 hex of its SHA-256. Copied (this file imports only Node core); keep the two equal.
 */
export function siteLabel(siteKey, domain) {
  const name = String(siteKey)
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  const zone = String(domain).toLowerCase().replace(/\./g, '\\.')
  const own = name.match(new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${zone}$`))
  if (own) return own[1]
  const readable = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const digest = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return `${readable.slice(0, 63 - digest.length - 1).replace(/-+$/, '')}-${digest}`
}

export async function openSeat(client, siteKey) {
  const path = `/${siteKey}/`
  const reply = await client.get(path)
  if (reply.status === 200) return
  // The mint answers 302 to the very address asked; anywhere else (`/<label>/join`, `/login`) is
  // a refusal: no live seat, or no session.
  if (reply.status === 302 && reply.headers.location === path) return
  throw new ChatError('NO_SEAT', `the site door answered ${reply.status} ${reply.headers.location ?? ''}`, {
    status: reply.status,
    detail: reply.text
  })
}

export async function siteWorkspace(client, siteKey) {
  const path = `/site/${siteLabel(siteKey, client.config.domain)}`
  const value = rpcValue(await client.dsh(siteKey, 'workspace/create', { request: { path } }))
  const id = value?.workspace?.workspaceId
  if (typeof id !== 'string' || id === '') throw new ChatError('NO_WORKSPACE', `no workspaceId for ${path}`)
  return id
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function outline(client, siteKey, sessionId) {
  const values = rpcValue(await client.dsh(siteKey, 'session/projections', { request: { sessionId } }))
  // The answer is a projection baseline ({ values }) or the map itself, depending on the dsh build.
  const v = values?.values ?? values ?? {}
  return Array.isArray(v.turnOutline) ? v.turnOutline : []
}

export async function chat(
  siteKey,
  text,
  { client = standClient(), sessionId, workspaceId, timeoutMs = 240_000, pollMs = 1000 } = {}
) {
  if (!siteKey || typeof text !== 'string' || !text.trim()) throw new Error('chat(siteKey, text) needs both')
  const started = Date.now()
  await openSeat(client, siteKey)
  let sid = sessionId
  if (!sid) {
    const wid = workspaceId ?? (await siteWorkspace(client, siteKey))
    const created = rpcValue(await client.dsh(siteKey, 'session/create', { request: { workspaceId: wid } }))
    sid = String(created.sessionId)
  }
  const before = (await outline(client, siteKey, sid)).length
  const requestId = randomUUID()
  rpcValue(
    await client.dsh(siteKey, 'session/prompt', {
      request: { sessionId: sid, requestId, mode: 'queue', content: [{ type: 'text', text }] }
    })
  )
  for (;;) {
    const turns = await outline(client, siteKey, sid)
    const last = turns.at(-1)
    if (turns.length > before && typeof last?.response === 'string' && last.response !== '') {
      return { sessionId: sid, turn: last.turn, response: last.response, ms: Date.now() - started }
    }
    if (Date.now() - started > timeoutMs) {
      await client.dsh(siteKey, 'session/cancel', { request: { sessionId: sid } }).catch(() => {})
      throw new ChatError('CHAT_TIMEOUT', `no turn end within ${timeoutMs} ms; cancel requested`, {
        sessionId: sid
      })
    }
    await sleep(pollMs)
  }
}
