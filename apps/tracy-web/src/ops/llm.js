/**
 * `/api/ops/llm/*` — the Model & AI screen's doors.
 *
 * 🔒 `owner`/`admin` ONLY, AND THAT INCLUDES THE READ. Everywhere else on this surface a lesser
 * role reads and cannot write (`writable: false`). Here the read itself is the sensitive thing:
 * which vendors Tracy pays, what the key looks like, which address the traffic goes to. A seat is
 * granted so somebody can work on a customer's site, not so they can inventory the company's
 * credentials — so a `developer` or `editor` gets 403, the same answer as a stranger.
 *
 * 🔒 NO KEY EVER COMES BACK OUT. Every response is built from `readProviders` (hint only), never
 * from `resolveDoor`. The one place the plaintext key exists in this file is inside `probe()`,
 * where it goes straight into an outbound Authorization header and is never put in a response.
 *
 * 🔒 `Test` IS AN INFERENCE CALL, NOT `/models`. Borrowed from `tracy-desk`, which learned the
 * difference: a key with no chat entitlement, or one whose balance has run out, still lists models
 * happily. A green tick from `/models` would promise exactly what the real doors then fail to do —
 * and "the key ran out of money" is the single most common reason somebody opens this screen, so
 * the provider's own words are passed back verbatim rather than flattened into "could not reach".
 */
import { Hono } from 'hono'
import { capabilitiesOf } from '../lib/llm-capabilities.js'
import { CAPABILITIES, catalogEntry, doorEntry, LLM_CATALOG, LLM_DOORS } from '../lib/llm-catalog.js'
import {
  assignDoor,
  auditBook,
  clearDoor,
  deleteProvider,
  normalizeModelAliases,
  normalizeProviderAlias,
  readAssignments,
  readAudit,
  readProviders,
  resolveProvider,
  saveModelAliases,
  saveModels,
  saveProvider
} from '../lib/llm-store.js'
import { foreignMakerIn } from '../lib/model-providers.js'
import { admit, denied } from './admit.js'

/** A provider id somebody typed: a catalog id, or `custom:<slug>`. Nothing else reaches the table. */
const SAFE_ID = /^(?:[a-z0-9-]{1,40}|custom:[a-z0-9-]{1,40})$/

/**
 * Whether an address may be saved for a provider. The key is sent to it, and Test and Get-models
 * read what it answers, so it must be a plain http(s) address with no credentials in it and not the
 * cloud metadata host.
 */
export function addressAllowed(value) {
  if (typeof value !== 'string') return false
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username !== '' || url.password !== '') return false
  return !/^(169\.254\.|\[?fe80:|metadata\.google\.internal$)/i.test(url.hostname)
}

/** How long a probe may take before it is somebody's problem rather than a spinner. */
const PROBE_TIMEOUT_MS = 20_000

/**
 * One real, minimal inference call.
 *
 * Returns what HAPPENED rather than throwing: a refusal by the provider, a name that does not
 * resolve and a request that timed out are all answers this screen should draw, and none of them
 * is an error in this app.
 */
async function probe({ baseUrl, apiKey, model, fetchImpl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      // The vendor's sentence, capped — it is the whole value of pressing the button.
      let detail = text.slice(0, 400)
      try {
        const parsed = JSON.parse(text)
        detail = parsed?.error?.message ?? parsed?.message ?? detail
      } catch {
        // A provider that answers an error in HTML or plain text still says something useful.
      }
      return { ok: false, status: response.status, detail, latencyMs: Date.now() - startedAt }
    }
    return { ok: true, status: response.status, detail: null, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: controller.signal.aborted
        ? `No answer within ${PROBE_TIMEOUT_MS / 1000}s.`
        : String(error?.message ?? error),
      latencyMs: Date.now() - startedAt
    }
  } finally {
    clearTimeout(timer)
  }
}

export function llmRoutes({ pool, config, fetchImpl = fetch, deps = {} }) {
  const app = new Hono()
  const secret = config.sessionSecret

  /** The door every route here keeps: staff, and senior enough to hold credentials. */
  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
    // The PUBLIC origin, not the request's: behind the tunnel this app is handed plain http.
    if (write && c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    return { who }
  }

  const body = async (c) => {
    if (!c.req.header('content-type')?.startsWith('application/json')) return { deny: c.body(null, 403) }
    const parsed = await c.req.json().catch(() => null)
    return parsed && typeof parsed === 'object'
      ? { value: parsed }
      : { deny: c.json({ error: 'INVALID_BODY' }, 400) }
  }

  app.get('/api/ops/llm', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    return c.json({
      catalog: LLM_CATALOG,
      doors: LLM_DOORS,
      capabilities: CAPABILITIES,
      providers: await readProviders(pool, secret),
      assignments: await readAssignments(pool),
      visionTest: (await deps.visionTests?.status({ actor: g.who.email })) ?? { state: 'unavailable' },
      // Reaching this door at all already means owner/admin, so this is always true — it is here
      // because every other screen on this surface reads the same field, and a screen that had to
      // special-case one door is a screen that will forget to.
      writable: true
    })
  })

  app.put('/api/ops/llm/providers/:id', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const id = c.req.param('id')
    if (!SAFE_ID.test(id)) return c.json({ error: 'INVALID_ID' }, 400)
    const b = await body(c)
    if (b.deny) return b.deny
    // A row must either configure a catalog entry or be fully custom with its own address —
    // anything else is a row nothing can build a request from.
    const preset = catalogEntry(b.value.presetId)
    if (!preset && !b.value.baseUrl) return c.json({ error: 'NEEDS_BASE_URL' }, 400)
    if (b.value.apiKey !== undefined && typeof b.value.apiKey !== 'string')
      return c.json({ error: 'INVALID_KEY' }, 400)
    if (
      b.value.baseUrl !== undefined &&
      b.value.baseUrl !== null &&
      b.value.baseUrl !== '' &&
      !addressAllowed(b.value.baseUrl)
    )
      return c.json({ error: 'INVALID_BASE_URL' }, 400)
    const saved = await saveProvider(
      pool,
      {
        id,
        presetId: b.value.presetId ?? null,
        name: b.value.name,
        baseUrl: b.value.baseUrl,
        apiKey: b.value.apiKey,
        enabled: b.value.enabled
      },
      secret,
      g.who.email
    )
    // 🔒 SAY WHICH DOORS A CHANGE REACHES. Switching a provider off, or moving its address, changes
    // what every door assigned to it spends; the screen reads `affects` to warn before it happens.
    await auditBook(pool, {
      actor: g.who.email,
      action: 'provider.save',
      subject: id,
      detail: {
        enabled: saved.enabled,
        baseUrl: saved.baseUrl,
        keyChanged: b.value.apiKey !== undefined
      }
    })
    const { rows: using } = await pool.query(
      'select door from llm_assignment where provider_id = $1 order by door',
      [id]
    )
    return c.json({ provider: saved, affects: using.map((r) => r.door) })
  })

  app.delete('/api/ops/llm/providers/:id', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const result = await deleteProvider(pool, c.req.param('id'))
    if (!result.error)
      await auditBook(pool, { actor: g.who.email, action: 'provider.delete', subject: c.req.param('id') })
    return c.json(result, result.error ? 409 : 200)
  })

  /** Prove the credential works — see this file's header on why it is not a `/models` call. */
  app.post('/api/ops/llm/providers/:id/test', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const b = await body(c)
    if (b.deny) return b.deny
    const id = c.req.param('id')
    // A probe needs the REAL key, so this is the one place the screen's door resolves one. It goes
    // into an outbound header and never into a response.
    const rows = await pool.query('select * from llm_provider where id = $1', [id])
    if (rows.rows.length === 0) return c.json({ error: 'NO_SUCH_PROVIDER' }, 404)
    const door = await providerReady(pool, id, secret, { requireEnabled: false })
    if (!door) return c.json({ ok: false, status: 0, detail: 'No key is set for this provider.' })
    const model = typeof b.value.model === 'string' && b.value.model ? b.value.model : null
    if (!model) return c.json({ error: 'NEEDS_MODEL' }, 400)
    return c.json(await probe({ ...door, model, fetchImpl }))
  })

  /**
   * `Get model list` — `GET {baseUrl}/models`, the one shape every OpenAI-compatible provider
   * answers. Cached into the row as a convenience for the picker; a model absent from it is still
   * accepted if somebody types it, because a list that gates would make a new model unusable until
   * this app learned about it.
   */
  app.put('/api/ops/llm/providers/:id/model-aliases', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const b = await body(c)
    if (b.deny) return b.deny
    const providerAlias =
      b.value.providerAlias === undefined ? undefined : normalizeProviderAlias(b.value.providerAlias)
    if (providerAlias === null) return c.json({ error: 'INVALID_PROVIDER_ALIAS' }, 400)
    const aliases = normalizeModelAliases(b.value.aliases)
    if (aliases === null) return c.json({ error: 'INVALID_MODEL_ALIASES' }, 400)
    const id = c.req.param('id')
    // 🔒 A display name is Tracy's, never another product's (#249): one that names a model maker the
    // route itself does not ("Claude Opus 5.5" on a DeepSeek route) is refused, by model, with the word.
    const provider = (await readProviders(pool, secret)).find((p) => p.id === id)
    if (provider) {
      const own = [provider.presetId, provider.id, provider.name]
      const misnamed = Object.entries(aliases).flatMap(([modelId, alias]) => {
        const model = (provider.models ?? []).find((m) => m?.id === modelId)
        const word = foreignMakerIn(alias, [...own, modelId, model?.name])
        return word === null ? [] : [{ model: modelId, alias, word }]
      })
      const providerWord = typeof providerAlias === 'string' ? foreignMakerIn(providerAlias, own) : null
      if (misnamed.length > 0 || providerWord !== null)
        return c.json(
          {
            error: 'ALIAS_NAMES_ANOTHER_MAKER',
            ...(misnamed.length > 0 ? { models: misnamed } : {}),
            ...(providerWord !== null ? { providerAlias: { alias: providerAlias, word: providerWord } } : {})
          },
          400
        )
    }
    if (!(await saveModelAliases(pool, id, aliases, g.who.email, providerAlias)))
      return c.json({ error: 'NO_SUCH_PROVIDER' }, 404)
    await auditBook(pool, {
      actor: g.who.email,
      action: 'provider.model-aliases',
      subject: id,
      detail: { aliases, providerAlias }
    })
    return c.json({ aliases, providerAlias })
  })

  app.post('/api/ops/llm/providers/:id/models', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const id = c.req.param('id')
    const door = await providerReady(pool, id, secret, { requireEnabled: false })
    if (!door) return c.json({ error: 'NO_KEY' }, 400)
    try {
      const response = await fetchImpl(`${door.baseUrl}/models`, {
        headers: { authorization: `Bearer ${door.apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
      })
      if (!response.ok) return c.json({ error: 'PROVIDER_REFUSED', status: response.status }, 200)
      const payload = await response.json()
      const list = Array.isArray(payload?.data) ? payload.data : []
      const models = list
        .filter((m) => typeof m?.id === 'string')
        .map((m) => ({
          id: m.id,
          name: typeof m.name === 'string' ? m.name : m.id,
          ...capabilitiesOf(m, door.presetId)
        }))
      await saveModels(pool, id, models)
      return c.json({ models })
    } catch (error) {
      return c.json({ error: 'UNREACHABLE', detail: String(error?.message ?? error) }, 200)
    }
  })

  app.put('/api/ops/llm/doors/:door', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const doorId = c.req.param('door')
    const meta = doorEntry(doorId)
    if (!meta) return c.json({ error: 'UNKNOWN_DOOR' }, 404)
    const b = await body(c)
    if (b.deny) return b.deny
    if (!meta.needsModel && b.value.model) return c.json({ error: 'DOOR_TAKES_NO_MODEL' }, 400)
    if (meta.needsModel && !b.value.model) return c.json({ error: 'NEEDS_MODEL' }, 400)
    // 🔒 REFUSE ONLY WHAT IS KNOWN WRONG. If the provider listed this model and said it answers
    // with text only, assigning it to the pictures job produces a site with no photographs and no
    // error anywhere — so the door says no. A model nobody has listed passes: the list is a picker,
    // never a gate, and a model released this morning must still be usable.
    if (b.value.model !== undefined && b.value.model !== null) {
      if (typeof b.value.model !== 'string' || b.value.model.length > 200 || /\s/.test(b.value.model))
        return c.json({ error: 'INVALID_MODEL' }, 400)
    }
    if (meta.requires?.length && b.value.model) {
      const { rows } = await pool.query('select models from llm_provider where id = $1', [b.value.providerId])
      const known = (rows[0]?.models ?? []).find((m) => m.id === b.value.model)
      const lacking = known ? meta.requires.filter((cap) => known[cap] === false) : []
      if (lacking.length > 0)
        return c.json(
          {
            error: doorId === 'seedImage' ? 'MODEL_CANNOT_DRAW' : 'MODEL_CAPABILITY_MISMATCH',
            model: b.value.model,
            lacking
          },
          400
        )
    }
    // 🔒 CHECKED THROUGH `resolveDoor`'s OWN RULES, not by reading the row: a provider that is
    // disabled or whose key this process cannot open would resolve to nothing at request time, so
    // accepting the assignment would produce a screen that says "configured" above a door that
    // answers 503.
    const ready = await providerReady(pool, b.value.providerId, secret)
    if (!ready) return c.json({ error: 'PROVIDER_NOT_READY' }, 400)
    const result = await assignDoor(
      pool,
      doorId,
      {
        providerId: b.value.providerId,
        model: meta.needsModel ? b.value.model : null,
        effort: b.value.effort
      },
      g.who.email
    )
    if (result.error) return c.json(result, 400)
    await auditBook(pool, {
      actor: g.who.email,
      action: 'door.assign',
      subject: doorId,
      detail: {
        providerId: b.value.providerId,
        model: meta.needsModel ? b.value.model : null,
        effort: (await readAssignments(pool))[doorId]?.effort ?? null
      }
    })
    return c.json({ assignments: await readAssignments(pool) })
  })

  app.delete('/api/ops/llm/doors/:door', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    await clearDoor(pool, c.req.param('door'))
    await auditBook(pool, { actor: g.who.email, action: 'door.clear', subject: c.req.param('door') })
    return c.json({ assignments: await readAssignments(pool) })
  })

  app.post('/api/ops/llm/doors/vision/test', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const b = await body(c)
    if (b.deny) return b.deny
    if (
      Object.keys(b.value).join(',') !== 'requestKey' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(b.value.requestKey ?? '')
    )
      return c.json({ error: 'INVALID_VISION_TEST_REQUEST' }, 400)
    if (!deps.visionTests) return c.json({ error: 'VISION_TEST_UNAVAILABLE' }, 503)
    try {
      const answer = await deps.visionTests.run({
        actor: g.who.email,
        requestKey: b.value.requestKey,
        checkAllowed: async () => {
          if ((await guard(c, { write: true })).deny) throw new Error('VISION_TEST_PERMISSION_REVOKED')
        }
      })
      await auditBook(pool, {
        actor: g.who.email,
        action: 'vision.test',
        subject: answer.id,
        detail: { state: answer.state, model: answer.model, costCents: answer.costCents }
      })
      c.header('cache-control', 'no-store')
      return c.json(answer)
    } catch (e) {
      return c.json({ error: e.code ?? e.message }, 409)
    }
  })

  /**
   * Push the keys this book holds down to the machine the agent and the seeder run on.
   *
   * Handed in rather than imported so this domain keeps its module-graph boundary; `app.js` wires
   * the real one (`host.hostCall` → `/_host/model-keys`).
   */
  /** The history of the book: who changed what, newest first. Staff only; carries no key. */
  app.get('/api/ops/llm/audit', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    return c.json({ entries: await readAudit(pool) })
  })

  app.post('/api/ops/llm/push', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!deps.pushKeys) return c.json({ error: 'PUSH_NOT_CONFIGURED' }, 503)
    const pushed = await deps.pushKeys({ pool, secret, by: g.who.email })
    await auditBook(pool, {
      actor: g.who.email,
      action: 'keys.push',
      subject: 'hosts',
      detail: { ok: pushed.ok === true, cleared: pushed.cleared === true, wrote: pushed.wrote ?? [] }
    })
    return c.json(pushed)
  })

  return app
}

/**
 * One provider by id, through `resolveProvider`'s rules — see its docstring on why every caller
 * must ask the same way.
 *
 * `requireEnabled: false` is passed by Test and by Get model list, because both exist to help
 * somebody decide whether to enable a provider at all. Everything that SPENDS a provider keeps the
 * default.
 */
async function providerReady(pool, providerId, secret, opts) {
  if (typeof providerId !== 'string' || providerId === '') return null
  const { rows } = await pool.query('select * from llm_provider where id = $1', [providerId])
  if (rows.length === 0) return null
  const ready = await resolveProvider(rows[0], secret, opts)
  return ready ? { ...ready, presetId: rows[0].preset_id } : null
}
