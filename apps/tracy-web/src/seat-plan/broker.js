/** One account owns its encrypted connections and routing; site grants are checked separately. */
import { createHash, randomUUID } from 'node:crypto'
import { withModelContext } from './model-context.js'
import { createVault } from './vault.js'
import { createPkce } from './wire/pkce.js'
import { parseCallbackInput } from './wire/oauth.js'
import {
  providers as realProviders,
  models,
  names,
  identityOf,
  exhausted,
  inputModalities
} from './providers.js'

/**
 * A vendor's error text with anything that may be request content taken out before it is logged:
 * a data URI, and any long base64 run (a picture a vendor echoed back).
 * @param {string} text
 */
const scrubbed = (text) =>
  text
    .replace(/data:[^\s;,]+;base64,[A-Za-z0-9+/=]*/g, '[data]')
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[base64]')

export class PlanFailure extends Error {
  constructor(code, status = 409, params = {}) {
    super(code)
    this.code = code
    this.status = status
    this.params = params
  }
}
/** How a vendor signs in: `key` (a pasted API key), `device` (a code the person types, GitHub's device flow), else `browser`. */
const signInOf = (vendor) =>
  vendor.signIn === 'key' || vendor.signIn === 'device' ? vendor.signIn : 'browser'
/**
 * How a vendor signs in from one surface. On the web nothing listens on a vendor's registered
 * `localhost` callback, so a vendor that also offers a device code (`webSignIn: 'device'`, Codex)
 * signs in by that code there; the desktop app catches the callback itself and keeps the browser
 * sign-in. Any surface other than `desktop` is the web.
 * @param {any} vendor
 * @param {string} [surface]
 */
const signInFor = (vendor, surface) => {
  const kind = signInOf(vendor)
  if (kind !== 'browser' || surface === 'desktop') return kind
  return vendor.webSignIn === 'device' &&
    typeof vendor.deviceStart === 'function' &&
    typeof vendor.devicePoll === 'function'
    ? 'device'
    : kind
}
/**
 * The sign-in an attempt was started with, as sealed in it: `complete()` finishes it that way, never
 * the way the vendor would start one now. An attempt sealed before the kind was sealed (it lives ten
 * minutes) is a device one exactly when it holds a device code.
 */
const sealedSignIn = (sealed) => sealed.signIn ?? (sealed.deviceAuthId ? 'device' : 'browser')
const fail = (code, status, params) => {
  throw new PlanFailure(code, status, params)
}
const hash = (value) => createHash('sha256').update(value).digest('hex')
const who = (row) => ({ account: row.account_id, id: row.id, provider: row.provider })
/** A pasted API key: printable ASCII without spaces, at most 512 characters. */
const KEY_SHAPE = /^[\x21-\x7e]{1,512}$/
/** A vendor's refusal of a pasted key, as the person can act on it. */
const KEY_REFUSALS = { key: 401, plan: 403, vendor: 502 }
const goodId = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
/**
 * Tracy AI's entry in an account's order (migration 095). The order lists connection ids and this
 * literal exactly once; the first entry is the Default, the rest are fallbacks in turn, and Tracy AI
 * ends the walk: an entry after it is never tried in that turn.
 */
const TRACY = 'tracy'
/** @param {string} value - the pin or order entry's provider */
const isTracy = (value) => value === TRACY

export function createSeatPlanBroker({
  pool,
  kek,
  policy,
  providers = realProviders,
  identify = identityOf,
  fetchImpl = fetch,
  now = Date.now
}) {
  const vault = () => {
    try {
      return createVault(kek)
    } catch {
      return fail('disabled', 503)
    }
  }
  const q = (sql, args = []) => pool.query(sql, args)
  /** A connected row whose cool-down, if any, has passed. */
  const serving = (row) => row.secret !== null && (!row.cooldown_until || +row.cooldown_until <= now())
  async function settings(provider) {
    const { llm } = await policy()
    if (!llm.connect || (provider && !llm.providers.includes(provider))) fail('disabled', 403)
    return llm
  }
  async function tx(fn) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const value = await fn(client)
      await client.query('commit')
      return value
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
  async function account(email) {
    // A valid session can arrive before the account row exists (identity's `touchAccount` runs on
    // the code path, not on every door; a brand-new account's first-run screen read this door and
    // got 401, measured 11/10/2026): create the row on first read, as `seats/store.js`
    // `ensureAccount` does. The viewer cookie already proved the email.
    const { rows } = await q(
      `insert into account (email) values ($1)
       on conflict (email) do update set email = excluded.email
       returning id, email, language`,
      [email]
    )
    if (!rows[0]) fail('notSignedIn', 401)
    return rows[0]
  }
  async function grant(accountId, site) {
    const { rows } = await q(
      `select s.site_key from seat s join site t on t.site_key=s.site_key
      where s.account_id=$1 and (t.site_key=$2 or t.label=$2)
      and s.revoked_at is null and s.declined_at is null and s.accepted_at is not null`,
      [accountId, site]
    )
    if (!rows[0]) fail('noAccess', 403)
    return rows[0].site_key
  }
  async function routing(accountId) {
    const { rows } = await q('select * from seat_plan_routing where account_id=$1', [accountId])
    return rows[0] ?? { enabled: true, connection_order: [TRACY], version: 0 }
  }
  async function connections(accountId) {
    const { rows } = await q(
      'select * from seat_plan_connection where account_id=$1 order by created_at, id',
      [accountId]
    )
    return rows
  }
  /**
   * The configured order, the one thing every reader walks (status, a pin, a failover and the way
   * back from one): the saved order with ids that have no row dropped and `tracy` kept once, `tracy`
   * appended when missing, then each connection the saved order never named (a new one, in the
   * order it was made) inserted before `tracy` while `tracy` is last — the first private
   * subscription becomes the Default, later ones stand before Tracy AI — else appended: once the
   * person put Tracy AI ahead of their subscriptions, a new one joins the end.
   * @param {{id: string}[]} rows - the account's connections, oldest first
   * @param {string[]} saved - `connection_order` as saved
   */
  function orderOf(rows, saved) {
    const ids = new Set(rows.map((r) => r.id))
    const order = []
    for (const id of saved) if ((id === TRACY || ids.has(id)) && !order.includes(id)) order.push(id)
    if (!order.includes(TRACY)) order.push(TRACY)
    for (const { id } of rows) {
      if (order.includes(id)) continue
      if (order.at(-1) === TRACY) order.splice(order.length - 1, 0, id)
      else order.push(id)
    }
    return order
  }
  /** The configured order as entries: a connection row, or `{id: 'tracy', provider: 'tracy'}`. */
  function entries(rows, saved) {
    const byId = new Map(rows.map((r) => [r.id, r]))
    return orderOf(rows, saved).map((id) => (id === TRACY ? { id: TRACY, provider: TRACY } : byId.get(id)))
  }
  /**
   * What a turn runs on, walking the configured order: `entry` is the first connection that can
   * serve (connected, its provider offered, not cooling down, not in `tried`); undefined when Tracy
   * AI came first — Tracy AI ends the walk, entries after it are not tried this turn. `cooling` is
   * the first connection walked past only for its cool-down, so a pin that lands on Tracy AI can
   * say which subscription it waits for and come back to it.
   * @param {any[]} list - from `entries()`
   * @param {{providers: string[]}} llm
   * @param {Set<string>} [tried]
   */
  function choose(list, llm, tried = new Set()) {
    let cooling
    for (const e of list) {
      if (isTracy(e.provider)) break
      if (tried.has(e.id) || !e.secret || !llm.providers.includes(e.provider)) continue
      if (!serving(e)) {
        cooling ??= e
        continue
      }
      return { entry: e, cooling }
    }
    return { entry: undefined, cooling }
  }
  /**
   * The account's order and connections read once, and the walk over them: what `choose()` says,
   * plus the routing row and the connections it was said about.
   * @param {string} accountId
   * @param {{providers: string[]}} llm
   * @param {Set<string>} [tried]
   */
  async function pick(accountId, llm, tried) {
    const [r, rows] = await Promise.all([routing(accountId), connections(accountId)])
    return { r, rows, ...choose(entries(rows, r.connection_order), llm, tried) }
  }
  async function status(accountId) {
    const [llm, rows, r] = await Promise.all([policy(), connections(accountId), routing(accountId)])
    const list = entries(rows, r.connection_order)
    const choice = llm.llm.connect && kek ? choose(list, llm.llm).entry : undefined
    return {
      // The effective route of a new chat; null = Tracy AI (first in the order, or every
      // subscription before it cooling down). The configured order is `routing.connectionOrder`.
      // `inputModalities`: whether that route's model reads pictures (`['text', 'image']`) or text only.
      next: choice
        ? {
            connectionId: choice.id,
            name: names[choice.provider],
            inputModalities: inputModalities(choice.provider, models[choice.provider])
          }
        : null,
      enabled: llm.llm.connect && !!kek,
      providers: llm.llm.providers
        .filter((p) => providers[p])
        .map((id) => ({
          id,
          name: names[id],
          signIn: signInOf(providers[id]),
          webSignIn: signInFor(providers[id], 'web')
        })),
      connections: list
        .filter((row) => !isTracy(row.provider))
        .map((row) => ({
          connectionId: row.id,
          provider: row.provider,
          name: names[row.provider],
          account: row.subject_label,
          connected: row.secret !== null,
          available: serving(row),
          retryAt: row.cooldown_until,
          connectedAt: row.created_at
        })),
      routing: {
        enabled: r.enabled,
        connectionOrder: list.map((e) => e.id),
        version: r.version
      }
    }
  }
  /**
   * Saves the order. `connectionOrder` must name every connection that has a row for this account
   * (a disconnected one keeps its row and its place) and `tracy` exactly once, nothing else. A
   * `tracyFallback` field is ignored, not refused: the bundle that sent it predates 095 and keeps
   * working through a deploy.
   */
  async function saveRouting(accountId, input) {
    await settings()
    if (
      !input ||
      typeof input.enabled !== 'boolean' ||
      !Number.isInteger(input.expectedVersion) ||
      !Array.isArray(input.connectionOrder) ||
      input.connectionOrder.some((id) => id !== TRACY && !goodId(id)) ||
      new Set(input.connectionOrder).size !== input.connectionOrder.length ||
      !input.connectionOrder.includes(TRACY)
    )
      fail('invalid', 400)
    await tx(async (c) => {
      await c.query('select pg_advisory_xact_lock(hashtext($1))', [`subscription-account:${accountId}`])
      const rows = (await c.query('select id from seat_plan_connection where account_id=$1', [accountId]))
        .rows
      if (
        input.connectionOrder.length !== rows.length + 1 ||
        rows.some((r) => !input.connectionOrder.includes(r.id))
      )
        fail('invalid', 400)
      const saved = (await c.query('select version from seat_plan_routing where account_id=$1', [accountId]))
        .rows[0]
      if ((saved?.version ?? 0) !== input.expectedVersion) fail('conflict')
      await c.query(
        `insert into seat_plan_routing(account_id, enabled, connection_order) values($1,$2,$3)
        on conflict(account_id) do update set enabled=$2, connection_order=$3, version=seat_plan_routing.version+1`,
        [accountId, input.enabled, JSON.stringify(input.connectionOrder)]
      )
    })
    return status(accountId)
  }
  /**
   * Starts a sign-in. `surface` is where the person signs in from (`desktop` for the desktop app,
   * anything else is the web); it decides the sign-in for a vendor that signs in differently on each.
   */
  async function start(accountId, binding, provider, surface = 'web') {
    // A key vendor has no sign-in round: its key goes to `connectKey` directly.
    if (!providers[provider] || signInOf(providers[provider]) === 'key') fail('invalid', 400)
    await settings(provider)
    await q(
      "update seat_plan_attempt set secret='{}',status='failed' where account_id=$1 and expires_at<$2 and status in ('open','claimed')",
      [accountId, new Date(now())]
    )
    const vendor = providers[provider]
    const signIn = signInFor(vendor, surface)
    const pkce = await createPkce()
    // A device sign-in keeps the vendor's device code sealed with the attempt; only the code the
    // person types and the page to type it on go back to the browser.
    const device = signIn === 'device' ? await vendor.deviceStart(vendor.defaults(), fetchImpl) : null
    const id = randomUUID()
    const secret = vault().seal(
      { account: accountId, id, provider },
      device
        ? {
            signIn,
            state: pkce.state,
            deviceAuthId: device.deviceAuthId,
            userCode: device.userCode,
            intervalMs: device.intervalMs
          }
        : { ...pkce, signIn }
    )
    await q(
      `insert into seat_plan_attempt(id,account_id,provider,state_hash,browser_binding,secret,expires_at)
      values($1,$2,$3,$4,$5,$6,$7)`,
      [id, accountId, provider, hash(pkce.state), hash(binding), secret, new Date(now() + 600000)]
    )
    if (device)
      return {
        attemptId: id,
        signIn,
        authorizeUrl: device.authUrl,
        userCode: device.userCode,
        intervalMs: device.intervalMs,
        state: pkce.state
      }
    return {
      attemptId: id,
      signIn,
      authorizeUrl: vendor.authorizeUrl(vendor.defaults(), pkce),
      state: pkce.state
    }
  }
  /**
   * Finishes a sign-in the way the attempt was started (sealed in it). A browser sign-in sends the
   * pasted callback `url` once; a device sign-in polls with `{attemptId, state}` at the attempt's
   * `intervalMs` until the vendor (GitHub, OpenAI) confirms, and each poll that is not yet confirmed
   * answers `{pending: true}`.
   */
  async function complete(accountId, binding, { attemptId, url, state } = {}) {
    if (!goodId(attemptId)) fail('invalid', 400)
    const polling = url === undefined
    if (
      polling
        ? typeof state !== 'string' || !state || state.length > 512
        : typeof url !== 'string' || url.length > 8192
    )
      fail('invalid', 400)
    const input = polling ? { state } : parseCallbackInput(url)
    if (!polling && (!input.code || !input.state)) fail('code', 400)
    const row = (
      await q(
        `update seat_plan_attempt set status='claimed'
      where id=$1 and account_id=$2 and browser_binding=$3 and state_hash=$4 and status='open' and expires_at>$5 returning *`,
        [attemptId, accountId, hash(binding), hash(input.state), new Date(now())]
      )
    ).rows[0]
    if (!row) {
      // A poll that overlaps another poll of the same attempt is still waiting, not expired.
      if (polling) {
        const busy = (
          await q(
            `select 1 from seat_plan_attempt where id=$1 and account_id=$2 and browser_binding=$3 and state_hash=$4
            and status='claimed' and expires_at>$5`,
            [attemptId, accountId, hash(binding), hash(input.state), new Date(now())]
          )
        ).rows[0]
        if (busy) return { pending: true }
      }
      fail('expired')
    }
    const vendor = providers[row.provider]
    /** A complete that does not match the attempt leaves it open for the one that does. */
    const mismatch = async () => {
      await q("update seat_plan_attempt set status='open' where id=$1 and status='claimed'", [row.id])
      fail('invalid', 400)
    }
    if (!vendor || signInOf(vendor) === 'key') await mismatch()
    let sealed
    try {
      await settings(row.provider)
      sealed = vault().open(who(row), row.secret)
    } catch (error) {
      await q("update seat_plan_attempt set status='failed',secret='{}' where id=$1", [row.id])
      if (error instanceof PlanFailure) throw error
      fail('code', 400)
    }
    if ((sealedSignIn(sealed) === 'device') !== polling) await mismatch()
    try {
      let blob
      if (polling) {
        const polled = await vendor.devicePoll(vendor.defaults(), sealed, fetchImpl)
        if (polled.status !== 'authorized') {
          await q("update seat_plan_attempt set status='open' where id=$1 and status='claimed'", [row.id])
          return { pending: true, intervalMs: sealed.intervalMs }
        }
        blob = polled.blob
      } else blob = await vendor.exchangeCode(vendor.defaults(), sealed, input.code, fetchImpl)
      const identity = await identify(row.provider, blob, fetchImpl)
      await tx(async (c) => {
        await c.query('select pg_advisory_xact_lock(hashtext($1))', [`subscription-account:${accountId}`])
        const attempt = (
          await c.query('select status from seat_plan_attempt where id=$1 and expires_at>$2 for update', [
            row.id,
            new Date(now())
          ])
        ).rows[0]
        if (attempt?.status !== 'claimed') fail('expired')
        await settings(row.provider)
        const old = (
          await c.query(
            'select * from seat_plan_connection where account_id=$1 and provider=$2 and provider_subject=$3',
            [accountId, row.provider, identity.subject]
          )
        ).rows[0]
        const id = old?.id ?? randomUUID()
        const secret = vault().seal({ account: accountId, id, provider: row.provider }, blob)
        await c.query(
          `insert into seat_plan_connection(id,account_id,provider,provider_subject,subject_label,secret)
          values($1,$2,$3,$4,$5,$6) on conflict(account_id,provider,provider_subject) do update
          set secret=excluded.secret,subject_label=excluded.subject_label,version=seat_plan_connection.version+1,cooldown_until=null,refreshed_at=now()`,
          [id, accountId, row.provider, identity.subject, identity.label, secret]
        )
        await c.query("update seat_plan_attempt set status='done',secret='{}' where id=$1", [row.id])
      })
    } catch (error) {
      await q("update seat_plan_attempt set status='failed',secret='{}' where id=$1", [row.id])
      if (error instanceof PlanFailure) throw error
      fail('code', 400)
    }
    return status(accountId)
  }
  /**
   * Connects a vendor that signs in by a pasted API key (Kimi, GLM, Qwen). The vendor proves the key
   * before anything is kept; the same key pasted again replaces the kept one. The key is never
   * logged and never returned. A Disconnect that lands while the vendor is being asked wins: the
   * connection's version is read before the probe and must be unchanged when it is written.
   */
  async function connectKey(accountId, provider, key) {
    const vendor = providers[provider]
    if (!vendor || signInOf(vendor) !== 'key' || typeof key !== 'string') fail('invalid', 400)
    const apiKey = key.trim()
    if (!KEY_SHAPE.test(apiKey)) fail('invalid', 400)
    await settings(provider)
    // A key's subject is the full SHA-256 of the key (`wire/api-key.js`), known before the vendor answers.
    const seen =
      (
        await q(
          'select version from seat_plan_connection where account_id=$1 and provider=$2 and provider_subject=$3',
          [accountId, provider, hash(apiKey)]
        )
      ).rows[0]?.version ?? 0
    let proven
    try {
      proven = await vendor.fromKey(apiKey, vendor.defaults(), fetchImpl)
    } catch (error) {
      // Anything but a refused key or a missing plan is the vendor's failure, never the person's.
      const code = error?.code === 'key' || error?.code === 'plan' ? error.code : 'vendor'
      fail(code, KEY_REFUSALS[code])
    }
    const { blob, identity } = proven
    if (identity?.subject !== hash(apiKey)) fail('vendor', 502)
    await tx(async (c) => {
      await c.query('select pg_advisory_xact_lock(hashtext($1))', [`subscription-account:${accountId}`])
      await settings(provider)
      const old = (
        await c.query(
          'select id, version from seat_plan_connection where account_id=$1 and provider=$2 and provider_subject=$3 for update',
          [accountId, provider, identity.subject]
        )
      ).rows[0]
      if ((old?.version ?? 0) !== seen) fail('conflict')
      const id = old?.id ?? randomUUID()
      const secret = vault().seal({ account: accountId, id, provider }, blob)
      await c.query(
        `insert into seat_plan_connection(id,account_id,provider,provider_subject,subject_label,secret)
        values($1,$2,$3,$4,$5,$6) on conflict(account_id,provider,provider_subject) do update
        set secret=excluded.secret,subject_label=excluded.subject_label,version=seat_plan_connection.version+1,cooldown_until=null,refreshed_at=now()`,
        [id, accountId, provider, identity.subject, identity.label, secret]
      )
    })
    return status(accountId)
  }
  async function disconnect(accountId, id) {
    if (!goodId(id)) fail('invalid', 400)
    await tx(async (c) => {
      await c.query('select pg_advisory_xact_lock(hashtext($1))', [`subscription-account:${accountId}`])
      const row = (
        await c.query(
          `update seat_plan_connection set secret=null,version=version+1,cooldown_until=null
        where id=$1 and account_id=$2 returning provider`,
          [id, accountId]
        )
      ).rows[0]
      if (!row) fail('noAccess', 403)
      // An exchange already in flight cannot reconnect behind the person's Disconnect.
      await c.query(
        "update seat_plan_attempt set status='failed',secret='{}' where account_id=$1 and provider=$2 and status in ('open','claimed')",
        [accountId, row.provider]
      )
    })
    return status(accountId)
  }
  async function fresh(row, signal) {
    // Session-level advisory lock serializes refreshes without blocking Disconnect's row update.
    const c = await pool.connect()
    const lock = `subscription-refresh:${row.id}`
    try {
      await c.query('select pg_advisory_lock(hashtext($1))', [lock])
      row = (
        await c.query('select * from seat_plan_connection where id=$1 and account_id=$2', [
          row.id,
          row.account_id
        ])
      ).rows[0]
      if (!row?.secret) fail('disconnected')
      let blob = vault().open(who(row), row.secret)
      if (blob.expiresAt && blob.expiresAt < now() + 60000) {
        const vendor = providers[row.provider]
        const next = await vendor.refresh(vendor.defaults(), blob, (url, init = {}) =>
          fetchImpl(url, {
            ...init,
            signal: AbortSignal.any([AbortSignal.timeout(15000), signal, init.signal].filter(Boolean))
          })
        )
        blob = { ...blob, ...next, refreshToken: next.refreshToken || blob.refreshToken }
        const secret = vault().seal(who(row), blob)
        const updated = await c.query(
          'update seat_plan_connection set secret=$1,version=version+1,refreshed_at=now() where id=$2 and version=$3 and secret is not null returning id,version',
          [secret, row.id, row.version]
        )
        if (!updated.rowCount) fail('disconnected')
        row.version = updated.rows[0].version
      }
      return { blob, version: row.version }
    } finally {
      await c.query('select pg_advisory_unlock(hashtext($1))', [lock])
      c.release()
    }
  }
  const modelCache = new Map()
  /** Models belong to the admitted account, never to the host-wide provider registry. */
  async function catalog(accountId, site, sessionId) {
    const siteKey = await grant(accountId, site)
    if (sessionId !== undefined) {
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 200) fail('invalid', 400)
      const existing = (await q('select * from seat_plan_pin where session_id=$1', [sessionId])).rows[0]
      if (existing && (existing.owner_account_id !== accountId || existing.site_key !== siteKey))
        fail('notOwner', 403)
    }
    const llm = (await policy()).llm
    if (!llm.connect || !kek) return { groups: [], failures: [] }
    const rows = await connections(accountId)
    const groups = [],
      failures = []
    for (const row of rows) {
      if (!serving(row) || !llm.providers.includes(row.provider)) continue
      const vendor = providers[row.provider]
      if (!vendor?.listModels) continue
      try {
        const key = `${row.id}:${row.version}`
        let cached = modelCache.get(key)
        if (!cached || cached.until <= now()) {
          const { blob } = await fresh(row)
          const listed = await vendor.listModels(blob, vendor.defaults(), fetchImpl)
          cached = { until: now() + 30000, models: listed }
          if (modelCache.size > 256) modelCache.clear()
          modelCache.set(key, cached)
        }
        const id = `seat-plan-${row.provider}--${row.id}`
        if (cached.models.length) {
          groups.push({
            id,
            name: `${names[row.provider]} · ${row.subject_label || names[row.provider]}`,
            connectionId: row.id,
            models: cached.models.map((model) => ({
              ...model,
              provider: id,
              inputModalities: inputModalities(row.provider, model.id)
            }))
          })
        }
      } catch {
        failures.push({
          id: `seat-plan-${row.provider}`,
          name: names[row.provider],
          message: 'The connected account model list is unavailable.'
        })
      }
    }
    return { groups, failures }
  }
  /** Save an explicit, account-owned model choice for this conversation. */
  async function selectModel(accountId, site, request) {
    const available = await catalog(accountId, site)
    const group = available.groups.find((g) => g.id === request.provider)
    if (!group?.models.some((m) => m.id === request.model)) fail('unavailable', 409)
    await pin(accountId, site, request.sessionId)
    const siteKey = await grant(accountId, site)
    const changed = await q(
      `update seat_plan_pin set connection_id=$1,provider=$2,model=$3,
       version=version+1,switched_from=null where session_id=$4 and owner_account_id=$5
       and site_key=$6 returning *`,
      [
        group.connectionId,
        request.provider.slice('seat-plan-'.length).split('--')[0],
        request.model,
        request.sessionId,
        accountId,
        siteKey
      ]
    )
    if (!changed.rows[0]) fail('notOwner', 403)
    return publicPin(changed.rows[0])
  }
  /** Return this conversation to a directly selected Tracy API route. */
  async function selectDefault(accountId, site, sessionId) {
    await pin(accountId, site, sessionId)
    const siteKey = await grant(accountId, site)
    const result = await q(
      `update seat_plan_pin set connection_id=null,provider=null,model=null,
      version=version+1,switched_from=null where session_id=$1 and owner_account_id=$2
      and site_key=$3 returning session_id`,
      [sessionId, accountId, siteKey]
    )
    if (!result.rows[0]) fail('notOwner', 403)
    return null
  }
  const publicPin = (pin) =>
    isTracy(pin?.provider)
      ? {
          provider: 'seat-plan-tracy',
          model: 'default',
          connectionId: null,
          version: pin.version,
          switchedFrom: pin.switched_from
        }
      : pin?.connection_id
        ? {
            provider: `seat-plan-${pin.provider}`,
            model: pin.model,
            // What the host tells dsh the model reads: a picture is sent only to one that reads it.
            inputModalities: inputModalities(pin.provider, pin.model),
            connectionId: pin.connection_id,
            version: pin.version,
            switchedFrom: pin.switched_from
          }
        : null
  async function pin(accountId, site, sessionId) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 200) fail('invalid', 400)
    const siteKey = await grant(accountId, site)
    let row = (await q('select * from seat_plan_pin where session_id=$1', [sessionId])).rows[0]
    if (!row) {
      const p = (await policy()).llm
      const { rows, entry, cooling } = p.connect
        ? await pick(accountId, p)
        : { rows: [], entry: undefined, cooling: undefined }
      // The walk ends on Tracy AI: a pin on Tracy AI, read against the configured order on every
      // turn (`backFromFallback`), so the conversation follows a subscription the person later puts
      // first. It says which subscription it walked past for its cool-down, if any, and nothing
      // when Tracy AI is the configured choice. An account with no connection at all gets a plain
      // pin instead — the deployment default, served by the host without this broker and never
      // moved — so the common case costs no turn here and survives a restart of this server.
      const onTracy = !entry && rows.length > 0
      await q(
        `insert into seat_plan_pin(session_id,site_key,owner_account_id,connection_id,provider,model,switched_from)
        values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [
          sessionId,
          siteKey,
          accountId,
          entry?.id ?? null,
          entry?.provider ?? (onTracy ? TRACY : null),
          entry ? models[entry.provider] : null,
          cooling ? JSON.stringify({ vendor: names[cooling.provider], reason: 'limit' }) : null
        ]
      )
      row = (await q('select * from seat_plan_pin where session_id=$1', [sessionId])).rows[0]
    }
    if (row.owner_account_id !== accountId || row.site_key !== siteKey) fail('notOwner', 403)
    // A conversation on Tracy AI — moved there by a limit, a reconnect or an outage, or pinned there
    // because Tracy AI stood first — goes to the account's subscription as soon as one stands before
    // Tracy AI and can serve: before, it stayed on Tracy AI for good, and with the fallback off it
    // refused every turn with advice that could not help it (survey 09/10/2026). Only that pin
    // moves; a pin made with no connection stays as it was made.
    if (isTracy(row.provider)) row = (await backFromFallback(accountId, row)) ?? row
    if (row.connection_id) await settings(row.provider)
    return publicPin(row)
  }
  /**
   * The subscription a pin on Tracy AI goes to: the first connection that can serve BEFORE Tracy
   * AI in the configured order, written on the pin; undefined to leave the pin where it is —
   * nothing before Tracy AI can serve yet, or Tracy AI stands first, in which case Tracy AI is the
   * choice, not a fallback.
   * @param {string} accountId
   * @param {any} row - the pin, provider `tracy`.
   */
  async function backFromFallback(accountId, row) {
    const p = await policy()
    if (!p.llm.connect) return undefined
    const { r, entry } = await pick(accountId, p.llm)
    if (!r.enabled || !entry) return undefined
    return (
      await q(
        `update seat_plan_pin set connection_id=$1,provider=$2,model=$3,version=version+1,switched_from=null
        where session_id=$4 and owner_account_id=$5 and version=$6 and provider=$7 returning *`,
        [entry.id, entry.provider, models[entry.provider], row.session_id, accountId, row.version, TRACY]
      )
    ).rows[0]
  }
  async function* run(accountId, site, sessionId, request, signal) {
    {
      let route = await pin(accountId, site, sessionId)
      if (!route) fail('disconnected')
      if (route.provider === 'seat-plan-tracy') {
        yield { fallback: true, route }
        return
      }
      const retries = new Set()
      const tried = new Set()
      while (true) {
        signal?.throwIfAborted()
        await grant(accountId, site)
        const provider = route.provider.slice('seat-plan-'.length)
        const allowed = await settings(provider)
        const row = (
          await q('select * from seat_plan_connection where id=$1 and account_id=$2', [
            route.connectionId,
            accountId
          ])
        ).rows[0]
        tried.add(route.connectionId)
        let emitted = false
        let reset = row?.cooldown_until
        let blob
        let credentialVersion = row?.version
        const firstOutput = new AbortController()
        const timeout = setTimeout(
          () => firstOutput.abort(new DOMException('Model response timed out', 'TimeoutError')),
          60000
        )
        try {
          if (!row?.secret) fail('disconnected', 409, { vendor: names[provider] })
          if (reset && +reset > now()) throw Object.assign(new Error('usage limit'), { status: 429 })
          ;({ blob, version: credentialVersion } = await fresh(row, signal))
          const vendor = providers[provider]
          for await (const chunk of vendor.streamOnce({
            blob,
            config: vendor.defaults(),
            options: {
              ...withModelContext(request, provider, route.model),
              provider,
              model: route.model,
              sessionId,
              // Decided here, from the route this attempt runs on, never from the caller: after a
              // failover to a text-only model the same request goes on with its pictures as text.
              supportsImages: inputModalities(provider, route.model).includes('image')
            },
            signal: AbortSignal.any([firstOutput.signal, signal].filter(Boolean)),
            fetchImpl
          })) {
            if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
              throw Object.assign(new Error(chunk.reason.failure?.message), {
                status: chunk.reason.failure?.code === 'rate_limit_error' ? 429 : 502
              })
            }
            if (!emitted) {
              clearTimeout(timeout)
              yield { route }
              emitted = true
            }
            yield { chunk }
          }
          return
        } catch (error) {
          clearTimeout(timeout)
          if (signal?.aborted) throw error
          if (error instanceof PlanFailure && error.code !== 'disconnected') throw error
          // Never replay a request once any output (including a tool call) escaped.
          if (emitted) fail('providerError', 502, { vendor: names[provider] })
          // A pasted key is wrong only on a 401. A 403 is an access or policy refusal of a key the
          // vendor knows (a plan, a tool it does not accept): the key is kept and the connection rests
          // like a plan refusal, since the person cannot fix it by pasting the key again.
          const keyRefused = blob?.kind === 'key' && error.status === 403
          const authentication =
            ([401, 403].includes(error.status) && !keyRefused) || error.code === 'disconnected'
          if (authentication && row?.secret) {
            await q(
              'update seat_plan_connection set secret=null,version=version+1 where id=$1 and version=$2',
              [row.id, credentialVersion]
            )
          }
          const transient =
            error.status >= 500 ||
            error.status === 429 ||
            error.name === 'TimeoutError' ||
            error.name === 'TypeError'
          if (transient && !exhausted(error) && !retries.has(route.connectionId)) {
            retries.add(route.connectionId)
            continue
          }
          let usage = null
          if (blob && [402, 429].includes(error.status) && providers[provider].usage) {
            const boundedFetch = (url, init = {}) =>
              fetchImpl(url, {
                ...init,
                signal: AbortSignal.any([AbortSignal.timeout(4000), signal, init.signal].filter(Boolean))
              })
            usage = await providers[provider]
              .usage(blob, providers[provider].defaults(), boundedFetch)
              .catch(() => null)
          }
          // Only account-wide windows prove this model is exhausted. A transient 429 alone never does.
          const full = (usage?.windows || []).filter(
            (w) =>
              [
                'five_hour',
                'seven_day',
                'seven_day_oauth_apps',
                'primary_window',
                'secondary_window',
                'primary',
                'secondary'
              ].includes(w.id) && w.usedPercent >= 100
          )
          const limited = exhausted(error) || full.length > 0 || keyRefused
          // The only trace of why a turn left this vendor; the page just sees `switchedFrom`. A vendor
          // body that echoes a pasted key never carries it into the log.
          const said = String(error.message)
          console.warn(
            `[seat-plan] ${names[provider]} turn failed (${error.status ?? error.name}): ${scrubbed(blob?.apiKey ? said.replaceAll(blob.apiKey, '[key]') : said).slice(0, 200)}`
          )
          const resetAt = Math.max(0, ...full.map((w) => Number(w.resetAt) || 0))
          reset = reset && +reset > now() ? reset : new Date(resetAt > now() ? resetAt : now() + 60000)
          if (limited)
            await q('update seat_plan_connection set cooldown_until=$1 where id=$2 and secret is not null', [
              reset,
              row.id
            ])
          // The next entry of the configured order that can serve, or Tracy AI: the order always
          // holds Tracy AI, so a turn that leaves its subscription always has somewhere to go.
          // Automatic switching off: no other subscription, straight to Tracy AI.
          const picked = await pick(accountId, allowed, tried)
          const next = picked.r.enabled ? picked.entry : undefined
          const changed = (
            await q(
              `update seat_plan_pin set connection_id=$1,provider=$2,model=$3,version=version+1,switched_from=$4
            where session_id=$5 and owner_account_id=$6 and version=$7 returning *`,
              [
                next?.id ?? null,
                next?.provider ?? TRACY,
                next ? models[next.provider] : null,
                JSON.stringify({
                  vendor: names[provider],
                  reason: limited ? 'limit' : authentication ? 'reconnect' : 'unavailable'
                }),
                sessionId,
                accountId,
                route.version
              ]
            )
          ).rows[0]
          const winner =
            changed ??
            (
              await q('select * from seat_plan_pin where session_id=$1 and owner_account_id=$2', [
                sessionId,
                accountId
              ])
            ).rows[0]
          route = publicPin(winner)
          if (!route || tried.has(route.connectionId)) fail('limit')
          if (route.provider === 'seat-plan-tracy') {
            await grant(accountId, site)
            yield { fallback: true, route }
            return
          }
        } finally {
          clearTimeout(timeout)
        }
      }
    }
  }
  async function inspect(accountId, site, sessionId) {
    const row = (
      await q('select * from seat_plan_pin where session_id=$1 and owner_account_id=$2', [
        sessionId,
        accountId
      ])
    ).rows[0]
    if (row) {
      const siteKey = await grant(accountId, site || row.site_key)
      if (siteKey !== row.site_key) fail('noAccess', 403)
    }
    return { route: publicPin(row) }
  }
  return {
    account,
    status,
    saveRouting,
    start,
    complete,
    connectKey,
    disconnect,
    pin,
    run,
    inspect,
    catalog,
    selectModel,
    selectDefault
  }
}
