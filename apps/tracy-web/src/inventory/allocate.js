/**
 * Handing a customer an instance that was installed BEFORE they asked — the claim half (§5 of
 * `tasks/todo-inventory-va-seed-theo-brief.md`), and nothing else.
 *
 * 🔒 A WARM HIT PROVISIONS NOTHING, AND THAT IS THE ONLY REASON THIS FILE EXISTS. The stock row
 * already IS a site: `site_key`, `label`, the folder on the host, the container, the CMS inside it
 * were all written when the pool was refilled (§3: the siteKey and the label are made when the
 * instance is PREPARED and are kept unchanged through the handover). So `allocateFromPool` never
 * calls `/provision`, and
 * `activateInstance` never calls it either: a fresh provision on a warm hit would install a second
 * CMS over the one the customer is about to be given, under the same label, and the only visible
 * symptom would be a site that took four minutes instead of four seconds. The tests assert the
 * absence of that call rather than the presence of a comment.
 *
 * 🔒 COLD FALLBACK IS THE ROUTE'S DECISION, NOT THIS FILE'S. When there is no stock this returns
 * `{ok: false, code: 'NO_STOCK'}` and stops. The caller then walks its existing cold path — and it
 * MUST walk it with the release it already pinned for this build (`resolveInstall` was called
 * before the claim, §5: pin the release BEFORE handing anything out), not with whatever the tag
 * resolves to a second
 * later. Re-resolving is how a customer ends up with a version nobody measured; the pin is the
 * whole point of resolving early.
 *
 * 🔒 SIDE EFFECTS LIVE OUTSIDE THE DATABASE TRANSACTION. Granting a seat, attaching a lane, pairing
 * a content door and minting a session all talk to another machine, and none of them can be rolled
 * back. So the transaction does one thing — move the instance and stamp who it is for — and every
 * later step is idempotent, re-checks the fencing token before it writes, and can be re-run by a
 * second request that resumes on the SAME instance.
 *
 * WHAT A CHECKPOINT IS HERE, said plainly because the word promises more than the schema can give.
 * `026-site-inventory.sql` has no per-step activation ledger, and this file does not invent one by
 * borrowing a column that means something else (`health_detail` is the machine check; writing
 * handover progress there would make the health reader lie). The checkpoint is therefore the
 * instance STATE: `assigning` means "a handover of THIS instance has begun", it is written under
 * the fencing token, and every step after it is idempotent, so a resumed request repeats work
 * rather than skipping it — and repeats it on the instance the first attempt took, never a second
 * one. A finer-grained ledger (which of the four steps finished) needs a column, and that is named
 * as a follow-up rather than faked.
 */

import { dshRpc } from '../lib/dsh-rpc.js'
import { siteSeatGrant } from '../lib/seat-grant.js'

/**
 * `inventory/store.js` is written in a parallel branch, so it is loaded on FIRST USE rather than at
 * module load: a static import would make this module unloadable — and every test in this file
 * unrunnable — until that branch lands. Tests pass their own `store`, which is also the seam that
 * lets the race and fencing cases be driven directly instead of through a route.
 */
async function defaultStore() {
  return import('./store.js')
}

/**
 * Same reason, same seam: `lib/inventory-pool-key.js` belongs to another branch. A caller that
 * already knows the pool key passes `poolKey` and neither loader runs.
 */
async function defaultPoolKeyLib() {
  return import('../lib/inventory-pool-key.js')
}

/** States in which an instance is spoken for and must not be handed to anybody else. */
const HELD_STATES = Object.freeze(['reserved', 'assigning', 'assigned'])

/**
 * Which pool a request is asking of. Either the caller states it, or it is composed from the
 * release identity the caller already pinned.
 * @returns {Promise<string>}
 */
async function poolKeyFor({ poolKey, poolKeyLib, environment, hostName, platform, quickstartTag, install }) {
  if (typeof poolKey === 'string' && poolKey !== '') return poolKey
  const lib = poolKeyLib ?? (await defaultPoolKeyLib())
  const generation = lib.generationOf({ install, verifierVersion: lib.VERIFIER_VERSION })
  return lib.poolKeyOf({
    environment,
    host: hostName,
    platform,
    quickstartTag,
    quickstartVersion: install?.version ?? null,
    generation
  })
}

/**
 * The build's own record, read narrowly. `site_creation` is owned by `sites/store.js`, which writes
 * it; this is a READ of two columns, the same narrowness `seats/route.js`'s `siteMetaFor` already
 * takes against `site` (see that file's module comment). It is not an import, so the module-graph
 * rule stands.
 *
 * 🔒 WHY IT IS RE-READ HERE WHEN THE ROUTE ALREADY CHECKED IT. The route's check happens before
 * anything is reserved; this one happens in the same breath as the reservation. Between the two a
 * retry of the same build with DIFFERENT answers is a conflict, and a conflict must not be answered
 * with a site — §5: a different payload under the same buildId is a conflict.
 */
async function creationRowOf(pool, accountId, buildId) {
  const { rows } = await pool.query(
    'select payload_hash, site_key, state from site_creation where account_id = $1 and build_id = $2',
    [accountId, buildId]
  )
  return rows[0] ?? null
}

/**
 * Take one ready instance out of a pool for one (account, build), or say there is none.
 *
 * @param {object} input
 * @param {import('pg').Pool} input.pool
 * @param {object} [input.config]
 * @param {object} [input.host] - accepted for signature symmetry with the rest of `inventory/`;
 *   deliberately UNUSED, because a warm hit calls no host (see the module comment).
 * @param {object} [input.seats] - likewise unused here; the seat is granted at activation.
 * @param {string} input.accountId
 * @param {string} input.buildId
 * @param {string} [input.platform]
 * @param {string} [input.quickstartTag]
 * @param {object} [input.install] - what `resolveInstall` pinned for THIS build.
 * @param {string} [input.email]
 * @param {string} [input.payloadHash] - the create door's own fingerprint of this request.
 * @param {string} [input.poolKey] - states the pool outright; skips the key library.
 * @param {object} [input.store] - test seam, see `defaultStore`.
 * @returns {Promise<{ok: true, warm: true, siteKey: string, label: string, instanceId: string,
 *   fencingToken: string} | {ok: false, code: 'NO_STOCK'|'POOL_DISABLED'|'IDEMPOTENCY_CONFLICT',
 *   detail?: any}>}
 */
export async function allocateFromPool({
  pool,
  config = {},
  host = null,
  seats = null,
  fetchImpl = fetch,
  accountId,
  buildId,
  platform,
  quickstartTag,
  install = null,
  email = null,
  payloadHash = null,
  poolKey = null,
  environment = config?.environment ?? null,
  hostName = config?.defaultHost ?? null,
  store = null,
  poolKeyLib = null
}) {
  // Named to keep the module contract's shape and deliberately unused: a warm hit must not reach
  // the host, and the seat belongs to activation. The missing use IS the assertion.
  void host
  void seats
  void fetchImpl
  void email
  const db = store ?? (await defaultStore())
  const key = await poolKeyFor({
    poolKey,
    poolKeyLib,
    environment,
    hostName,
    platform,
    quickstartTag,
    install
  })

  const poolRow = await db.readPool(pool, key)
  // No pool row at all is not a refusal to state: nobody ever opened stock for this release, which
  // is exactly the cold path's ordinary case.
  if (!poolRow) return { ok: false, code: 'NO_STOCK' }
  if (poolRow.enabled !== true) return { ok: false, code: 'POOL_DISABLED', detail: 'disabled' }
  if (poolRow.paused === true)
    return { ok: false, code: 'POOL_DISABLED', detail: poolRow.paused_reason ?? 'paused' }

  if (payloadHash !== null) {
    const creation = await creationRowOf(pool, accountId, buildId)
    if (creation && creation.payload_hash !== payloadHash) {
      return { ok: false, code: 'IDEMPOTENCY_CONFLICT', detail: { buildId, siteKey: creation.site_key } }
    }
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    const taken = await db.reserveReady(client, { poolKey: key, accountId, buildId })
    if (!taken.ok) {
      await client.query('rollback')
      // `NONE_READY` is the only refusal the store makes here, and it means one thing to the
      // caller: go cold, with the release already pinned.
      return { ok: false, code: 'NO_STOCK' }
    }
    await client.query('commit')
    return {
      ok: true,
      warm: true,
      siteKey: taken.instance.site_key,
      label: taken.instance.label,
      instanceId: taken.instance.id,
      // A string on purpose: `bigint` comes back from pg as text, and a caller that rounds it
      // through `Number` would start comparing fences that are equal only approximately.
      fencingToken: String(taken.fencingToken ?? taken.instance.fencing_token)
    }
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * One fencing-checked write. Every state move in activation goes through this, and a write that
 * matches no row is a STALE fence, not a retry: the reservation this worker is carrying was
 * released and given to somebody else while it was away.
 * @returns {Promise<object|null>} the row, or null when the fence no longer matches.
 */
async function guardedMove(pool, { instanceId, fromStates, toState, expectedFencingToken }) {
  const { rows } = await pool.query(
    `update inventory_instance
        set state = $3, updated_at = now()
      where id = $1 and fencing_token = $2 and state = any($4::text[])
      returning *`,
    [instanceId, expectedFencingToken, toState, fromStates]
  )
  return rows[0] ?? null
}

/** The instance as it stands, with no lock and no write. */
async function instanceRow(pool, instanceId) {
  const { rows } = await pool.query('select * from inventory_instance where id = $1', [instanceId])
  return rows[0] ?? null
}

/**
 * The seat that makes the site the customer's own. `grantSite` is an insert that only overwrites a
 * seat somebody had declined or revoked, so a resumed activation calling it twice is free; the
 * `acceptGrant` after it is what a pre-existing pending row needs (the same pair `sites/route.js`'s
 * `ensureSiteOwnerSeat` makes, for the same reason).
 */
async function grantOwnerSeat({ pool, seats, siteKey, accountId }) {
  if (!seats || typeof seats.grantSite !== 'function') return { ok: false, code: 'SEATS_NOT_WIRED' }
  const owners = typeof seats.ownersOf === 'function' ? await seats.ownersOf(pool, siteKey) : []
  const mine = owners.some((o) => o.account_id === accountId)
  if (!mine) {
    await seats.grantSite(pool, {
      siteKey,
      accountId,
      role: 'owner',
      grantedBy: accountId,
      activate: true,
      createdByProof: 'creator'
    })
  }
  if (typeof seats.acceptGrant === 'function')
    await seats.acceptGrant(pool, siteKey, accountId).catch(() => {})
  return { ok: true }
}

/**
 * The session the customer's browser lands in, made before they get there — the same two RPCs
 * `sites/route.js`'s `sessionMadeAhead` makes, and the same failure rule: nothing here may stop a
 * handover, so every refusal answers null and the address falls back to the site root.
 *
 * It is made BY WORKSPACE ID, never by `cwd`: a session made by path gets no seat grant and dsh
 * drops it on arrival (measured 20/09, see `sessionMadeAhead`'s own comment).
 */
async function sessionAhead({ config, seatDoor, fetchImpl, instance, platform, email }) {
  if (!seatDoor || typeof seatDoor.mintSeatSession !== 'function') return null
  const h = config?.hosts?.get?.(instance.host ?? config?.defaultHost)
  if (!h?.dshOrigin || !h?.seatSecret) return null
  const grant = siteSeatGrant({ email, role: 'owner', label: instance.label, siteKey: instance.site_key })
  let token = null
  try {
    token = await seatDoor.mintSeatSession({ origin: h.dshOrigin, secret: h.seatSecret, grant, fetchImpl })
  } catch {
    return null
  }
  if (typeof token !== 'string' || token === '') return null
  const rpc = (endpoint, request) =>
    dshRpc({ origin: h.dshOrigin, mount: `/${instance.site_key}`, token, endpoint, request, fetchImpl })
  try {
    const ws = await rpc('workspace/create', { path: `/site/${instance.label}` })
    const workspaceId = ws?.workspace?.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId === '') return null
    const made = await rpc('session/create', {
      workspaceId,
      ...(platform ? { agentPreset: `designer-${platform}` } : {})
    })
    return typeof made?.sessionId === 'string' && made.sessionId !== '' ? made.sessionId : null
  } catch {
    return null
  }
}

/**
 * Hand a reserved instance over: the owner seat, the lane, the content door, the session — and NO
 * provision (see the module comment).
 *
 * Fencing is checked before the first write and again before the last one, and every write is
 * conditional on the token. A worker that comes back after its reservation was released and re-let
 * writes nothing at all and is told `STALE_FENCE`.
 *
 * Resume: a second call with the same `instanceId` and the same token picks the handover up on THAT
 * instance whatever step the first call died on, because `assigning` is accepted as a starting
 * state and every step is idempotent.
 *
 * @param {object} input
 * @param {import('pg').Pool} input.pool
 * @param {object} input.config
 * @param {object} [input.host] - `{hostCall}`; used for `/attach` only.
 * @param {object} input.seats - `{grantSite, acceptGrant, ownersOf}` from the composition root.
 * @param {object} [input.workspaces]
 * @param {object} [input.seatDoor] - `{mintSeatSession}`.
 * @param {string} input.instanceId
 * @param {string} input.accountId
 * @param {string} input.email
 * @param {string|number} input.expectedFencingToken
 * @param {{pairComponent?: Function, setAttached?: Function}} [input.sites] - the two things the
 *   `sites` domain owns and this one may not import: `pair-component.js`'s pairing, and
 *   `store.js`'s `setAttached`. Injected by the composition root exactly as `sitesRoutes` already
 *   receives `seats`/`host`/`workspaces`/`seatDoor` — there is NO fallback import, because
 *   `test/module-graph.test.mjs` refuses one and a silent default would hide a missing wire.
 * @returns {Promise<{ok: true, siteKey: string, label: string, workspacePath: string,
 *   sessionId: string|null, attached: boolean, paired: boolean, pending: string[]} |
 *   {ok: false, code: string, detail?: any}>}
 */
export async function activateInstance({
  pool,
  config = {},
  host = null,
  seats = null,
  // Part of the module contract's shape; the workspace row is written by the route's own handoff.
  workspaces = null,
  seatDoor = null,
  fetchImpl = fetch,
  instanceId,
  accountId,
  email,
  expectedFencingToken,
  sites = null
}) {
  const pairComponent = sites?.pairComponent ?? null
  const setAttached = sites?.setAttached ?? null
  void workspaces
  const token = String(expectedFencingToken)
  const before = await instanceRow(pool, instanceId)
  if (!before) return { ok: false, code: 'NO_SUCH_INSTANCE' }
  // 🔒 FENCE FIRST, AND BEFORE ANY SIDE EFFECT. Checking after the seat was granted would be a
  // check that reports a theft it has already committed.
  if (String(before.fencing_token) !== token) {
    return { ok: false, code: 'STALE_FENCE', detail: { state: before.state } }
  }
  if (!HELD_STATES.includes(before.state)) {
    return { ok: false, code: 'NOT_RESERVED', detail: { state: before.state } }
  }
  // The customer this instance was taken for is the only one it may be handed to — a request that
  // named somebody else's instance is refused rather than served.
  if (before.reserved_account && before.reserved_account !== accountId) {
    return { ok: false, code: 'RESERVED_FOR_ANOTHER' }
  }

  // The checkpoint: `assigning` says a handover of THIS instance has begun. `assigning` and
  // `assigned` are accepted as starting states so a resumed call continues instead of refusing.
  const moving = await guardedMove(pool, {
    instanceId,
    fromStates: HELD_STATES,
    toState: before.state === 'assigned' ? 'assigned' : 'assigning',
    expectedFencingToken: token
  })
  if (!moving) return { ok: false, code: 'STALE_FENCE' }

  const pending = []

  const seat = await grantOwnerSeat({ pool, seats, siteKey: moving.site_key, accountId })
  if (!seat.ok) return { ok: false, code: seat.code }

  // ── Lane ────────────────────────────────────────────────────────────────────────────────────
  let attached = false
  if (host && typeof host.hostCall === 'function') {
    const answer = await host.hostCall(
      config,
      moving.host ?? config.defaultHost,
      '/attach',
      { label: moving.label },
      { fetchImpl }
    )
    attached = answer?.ok === true
    if (attached && typeof setAttached === 'function') await setAttached(moving.site_key, true)
    if (!attached) pending.push('attach')
  } else {
    pending.push('attach')
  }

  // ── Content door ────────────────────────────────────────────────────────────────────────────
  // `pairComponent` is injected rather than imported: it lives in `sites/`, and this domain may
  // not reach into another one. Absent, the door is REPORTED as unpaired — an agent that believes
  // it has a content door it has not got writes nothing and cannot say why.
  let paired = false
  if (typeof pairComponent === 'function') {
    const done = await pairComponent({ ...moving, siteKey: moving.site_key }, email).catch(() => null)
    paired = done?.ok === true || done === true
    if (!paired) pending.push('pair')
  } else {
    pending.push('pair')
  }

  // ── Session ─────────────────────────────────────────────────────────────────────────────────
  const sessionId = await sessionAhead({
    config,
    seatDoor,
    fetchImpl,
    instance: moving,
    platform: config?.platformOf ?? null,
    email
  })
  if (sessionId === null) pending.push('session')

  // 🔒 THE FENCE AGAIN, ON THE LAST WRITE. Everything between the two checks talked to other
  // machines and took time; `assigned` is the word that stops any sweeper from ever treating this
  // instance as free stock (§5), so it must not be written under a token that has moved.
  const done = await guardedMove(pool, {
    instanceId,
    fromStates: ['assigning', 'assigned'],
    toState: 'assigned',
    expectedFencingToken: token
  })
  if (!done) return { ok: false, code: 'STALE_FENCE' }

  return {
    ok: true,
    siteKey: done.site_key,
    label: done.label,
    // The folder inside dsh is the LABEL; the page the browser opens is the SITE KEY — the same
    // pair `claimAnswer` hands back, so warm and cold answer one shape.
    workspacePath: `/site/${done.label}`,
    sessionId,
    attached,
    paired,
    // Said out loud rather than implied by silence: what this handover could NOT finish. A caller
    // that shows "ready" over a site with no content door is the failure §3 warns about.
    pending
  }
}
