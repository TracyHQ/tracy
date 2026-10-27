/**
 * The client half of the channel to `tracy-host` — the per-host service that runs the agent's
 * shell commands (ADR 0014's "one dsh per host"). Plan 3 writes the verifier on the other side;
 * this file exists so both halves are checked against the exact same canonical string, not two
 * independent readings of a shared paragraph of prose.
 *
 * THE SIGNING STRING IS THE SEAT DOOR'S, BYTE FOR BYTE:
 *
 *     <timestamp>\n<nonce>\nPOST\n<path>\n<sha256hex(body)>
 *
 * `signHostCall` is not a new algorithm — it is `signSeatCall` (workspace/seat-door.js) with the
 * header names swapped from `x-seat-*` to `x-host-*`, so that this file and the seat door can be
 * fed identical inputs and produce identical signatures. That is what
 * test/host-client.test.mjs proves, instead of asserting a hand-written expected string that
 * could drift from the seat door's without either side noticing.
 *
 * The method is fixed to `POST` in the canonical for every call this file makes, `hostJob`'s real
 * GET request included — the same choice the seat door made for `whoami`, its one read-only
 * route, and for the same reason: one fewer axis for the two sides to disagree on.
 *
 * NEVER SKIP SIGNING. A host name `tracy-host` doesn't recognize, or a config entry missing its
 * secret, is refused locally (`{ ok: false, status: 0 }`) before any request is built — there is
 * no code path here that reaches the network unsigned.
 */
import { hmacHex, sha256Hex } from '../lib/hmac.js'

/**
 * Sign one `tracy-host` call. Same canonical as the seat door's `signSeatCall`, different header
 * names — see the module comment for why the two must never drift apart.
 *
 * @param {object} input - secret, path, and the already-serialized body.
 * @returns {Promise<Record<string, string>>} headers to attach to the request.
 */
export async function signHostCall({ secret, path, body, now = Date.now(), nonce }) {
  const timestamp = String(now)
  // One-use nonce, from the platform CSPRNG (crypto.randomUUID, same source as the seat door) —
  // never Math.random, and never reused across calls so a captured request can't be replayed.
  const stamp = nonce ?? crypto.randomUUID().replaceAll('-', '')
  const signature = await hmacHex(secret, `${timestamp}\n${stamp}\nPOST\n${path}\n${await sha256Hex(body)}`)
  return {
    'x-host-timestamp': timestamp,
    'x-host-nonce': stamp,
    'x-host-signature': signature
  }
}

/**
 * Look up a host's channel to `tracy-host`, refusing (not throwing) when it can't be signed for.
 *
 * @returns {{origin: string, hostSecret: string}|null}
 */
function hostChannel(config, hostName) {
  const host = config.hosts.get(hostName)
  // `dshOrigin` and `seatSecret` are the seat door's — a call signed with either would be signed
  // for the wrong lock. Only `origin` and `hostSecret` belong to this channel.
  if (!host?.origin || !host?.hostSecret) return null
  return { origin: host.origin, hostSecret: host.hostSecret }
}

/**
 * Every host this process can sign a call to — the names `hostChannel` does not refuse. A row
 * naming any other host (one taken out of `HOSTS`, or left without its secret) cannot be asked.
 * @returns {string[]}
 */
export function signedHosts(config) {
  return [...config.hosts.keys()].filter((name) => hostChannel(config, name) !== null)
}

/**
 * One signed round trip to `tracy-host`, shared by `hostCall` and `hostJob`. Never throws: a
 * network failure and a response a route can't parse both come back as `{ ok: false, ... }`, so
 * every caller gets the same shape to check instead of a mix of rejections and returns.
 *
 * `timeoutMs` (opt-in, per call): give up after that long — on the request AND on reading its
 * body — and answer `{ok: false, status: 0, timedOut: true}`. Without it there is no limit of our
 * own, as before: a long job's calls must not be cut by a default nobody asked for. A caller with a
 * deadline of its own (the Site changes tab's Git read) passes what is left of it, so a host that
 * stops answering mid-job cannot hold the request for the socket's own minutes-long timeout.
 *
 * @returns {Promise<{ok: boolean, status: number, body: any, timedOut?: boolean}>}
 */
async function callHost({ origin, hostSecret, method, path, body, fetchImpl, timeoutMs }) {
  const signed = await signHostCall({ secret: hostSecret, path, body })
  const headers = method === 'GET' ? signed : { 'content-type': 'application/json', ...signed }
  const signal =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? AbortSignal.timeout(Math.ceil(timeoutMs)) : undefined
  let response
  try {
    response = await fetchImpl(`${origin}${path}`, {
      method,
      headers,
      ...(body !== '' ? { body } : {}),
      ...(signal ? { signal } : {})
    })
  } catch {
    // DNS failure, connection refused, timeout — tracy-host was never reached. status 0 marks
    // "no HTTP response came back", so a caller can't mistake this for a real status the host sent.
    return { ok: false, status: 0, body: null, ...(signal?.aborted ? { timedOut: true } : {}) }
  }
  // An empty body and a body that isn't JSON both land here as null: `tracy-host`'s job routes
  // return JSON on every documented path, so anything else is treated as "no body to read",
  // not as a reason to throw out of a route handler.
  let parsed = null
  try {
    parsed = await response.json()
  } catch {
    // A body cut off by our own timeout is no answer at all, not an empty one.
    if (signal?.aborted) return { ok: false, status: 0, body: null, timedOut: true }
    parsed = null
  }
  return { ok: response.ok, status: response.status, body: parsed }
}

/**
 * POST one call to `tracy-host`: `${origin}/_host${path}`, signed with that host's `hostSecret`.
 *
 * @param {object} config - `config.hosts` (config.js).
 * @param {string} hostName - a key of `config.hosts`.
 * @param {string} path - appended after `/_host`, e.g. `/jobs`.
 * @param {object} [payload] - JSON-serialized as the request body.
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [opts] - `timeoutMs`: see `callHost`.
 * @returns {Promise<{ok: boolean, status: number, body: any, timedOut?: boolean}>}
 */
export async function hostCall(config, hostName, path, payload = {}, { fetchImpl = fetch, timeoutMs } = {}) {
  const channel = hostChannel(config, hostName)
  if (!channel) return { ok: false, status: 0, body: { error: 'unknown_host', host: hostName } }
  return callHost({
    ...channel,
    method: 'POST',
    path: `/_host${path}`,
    body: JSON.stringify(
      ['/provision', '/go-live', '/frame-policy'].includes(path) && config.origin
        ? { ...payload, publicOrigin: config.origin }
        : payload
    ),
    fetchImpl,
    timeoutMs
  })
}

/** Read a signed NDJSON capture with backpressure; never retain a whole page's image payloads. */
export async function hostStreamCall(
  config,
  hostName,
  path,
  payload,
  { onFrame, fetchImpl = fetch, timeoutMs = 240_000, signal: parentSignal } = {}
) {
  const channel = hostChannel(config, hostName)
  if (!channel) return { ok: false, status: 0, body: { error: 'unknown_host', host: hostName } }
  if (typeof onFrame !== 'function')
    return { ok: false, status: 0, body: { code: 'STREAM_CONSUMER_REQUIRED' } }
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(Math.min(300_000, Math.max(1, timeoutMs)))
  const signal = AbortSignal.any([controller.signal, timeout, ...(parentSignal ? [parentSignal] : [])])
  const body = JSON.stringify(payload)
  const target = `/_host${path}`
  let reader
  let status = 0
  let terminal = false
  try {
    const signed = await signHostCall({ secret: channel.hostSecret, path: target, body })
    const response = await fetchImpl(`${channel.origin}${target}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...signed },
      body,
      signal
    })
    status = response.status
    reader = response.body?.getReader()
    if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson') || !reader)
      return { ok: false, status, body: { code: 'VISION_STREAM_UNAVAILABLE' } }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let pending = ''
    let total = 0
    const invalid = (code) => Object.assign(new Error(code), { code })
    // These transport budgets match tracy-host's vision-stream.js; neither image imports the other app.
    const maxLine = 1024 * 1024
    const maxStream = 32 * 1024 * 1024
    for (;;) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxStream) throw invalid('VISION_STREAM_TOO_LARGE')
      // A network chunk is not a frame. Decode in bounded pieces, including when a test/server sends many lines at once.
      for (let offset = 0; offset < next.value.byteLength; offset += 64 * 1024) {
        pending += decoder.decode(next.value.subarray(offset, offset + 64 * 1024), { stream: true })
        let newline
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline)
          pending = pending.slice(newline + 1)
          if (!line.trim()) continue
          if (terminal || Buffer.byteLength(line) > maxLine) throw invalid('VISION_STREAM_INVALID')
          let frame
          try {
            frame = JSON.parse(line)
          } catch {
            throw invalid('VISION_STREAM_INVALID')
          }
          if (!frame || typeof frame.type !== 'string') throw invalid('VISION_STREAM_INVALID')
          signal.throwIfAborted()
          await onFrame(frame, signal)
          signal.throwIfAborted()
          terminal = frame.type === 'end'
        }
        if (Buffer.byteLength(pending) > maxLine) throw invalid('VISION_FRAME_TOO_LARGE')
      }
    }
    pending += decoder.decode()
    if (pending.trim() || !terminal) throw invalid('VISION_STREAM_INCOMPLETE')
    return { ok: true, status, body: { streamed: true } }
  } catch (error) {
    return {
      ok: false,
      status,
      body: { code: typeof error?.code === 'string' ? error.code : 'VISION_STREAM_FAILED' },
      ...(timeout.aborted ? { timedOut: true } : {})
    }
  } finally {
    controller.abort()
    await reader?.cancel().catch(() => {})
  }
}

/**
 * GET one job's status from `tracy-host`: `${origin}/_host/jobs/${jobId}`. Signed the same way as
 * `hostCall`, with an empty string standing in for the (absent) request body.
 *
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [opts] - `timeoutMs`: see `callHost`.
 * @returns {Promise<{ok: boolean, status: number, body: any, timedOut?: boolean}>}
 */
export async function hostJob(config, hostName, jobId, { fetchImpl = fetch, timeoutMs } = {}) {
  const channel = hostChannel(config, hostName)
  if (!channel) return { ok: false, status: 0, body: { error: 'unknown_host', host: hostName } }
  return callHost({
    ...channel,
    method: 'GET',
    path: `/_host/jobs/${jobId}`,
    body: '',
    fetchImpl,
    timeoutMs
  })
}
