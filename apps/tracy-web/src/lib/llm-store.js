/**
 * The provider book — reading and writing `llm_provider` / `llm_assignment`.
 *
 * 🔒 TWO READS, AND THEY ARE NOT THE SAME FUNCTION. `readProviders` answers a SCREEN and can never
 * return a key — only whether one is set and a hint. `resolveDoor` answers a REQUEST this process
 * is about to make and returns the real credential. Keeping them apart means a screen cannot
 * accidentally acquire a key by adding a field, and a reviewer can see which one a caller used
 * from its name alone.
 *
 * 🔒 AN ABSENT `apiKey` MEANS "UNCHANGED", AN EMPTY ONE MEANS "REMOVE". The screen never receives
 * a key, so it cannot send one back when somebody edits a base URL — if absent meant "clear", every
 * unrelated save would quietly disarm the provider. The deliberate removal has to be a value
 * somebody typed (an empty field), never the shape of a partial form.
 *
 * ⚠ A KEY THIS PROCESS CANNOT OPEN IS ITS OWN STATE, not "unconfigured". It happens for exactly
 * one reason — `SESSION_SECRET` was rotated (see `secret-box.js`) — and the fix is to type the keys
 * again. Drawing it as a provider nobody set up would send somebody looking for a different
 * problem, so `keyUnreadable` rides on the row.
 */

import { baseUrlFor, catalogEntry, LLM_DOORS } from './llm-catalog.js'
import { effortOptions } from './llm-effort.js'
import { hintFor, openSecret, sealSecret } from './secret-box.js'

const DOOR_IDS = LLM_DOORS.map((d) => d.id)

function rowToScreen(row, secret, key) {
  const preset = catalogEntry(row.preset_id)
  return {
    id: row.id,
    presetId: row.preset_id,
    name: row.name,
    // What a request would ACTUALLY use, resolved here rather than in the screen: the row's
    // override or the catalog's default, so the page cannot show one address and the door call
    // another.
    baseUrl: baseUrlFor({ baseUrl: row.base_url, presetId: row.preset_id }),
    baseUrlOverridden: Boolean(row.base_url),
    apiKeyUrl: preset?.apiKeyUrl ?? null,
    keyOptional: preset?.keyOptional === true,
    note: preset?.note ?? null,
    configured: key !== null,
    keyHint: hintFor(key),
    keyUnreadable: Boolean(row.api_key_cipher) && key === null,
    enabled: row.enabled,
    models: row.models ?? [],
    effortOptions: Object.fromEntries(
      (row.models ?? []).map((metadata) => [
        metadata.id,
        effortOptions({
          presetId: row.preset_id,
          baseUrl: baseUrlFor({ baseUrl: row.base_url, presetId: row.preset_id }),
          metadata
        })
      ])
    ),
    modelAliases: row.model_aliases ?? {},
    providerAlias: row.provider_alias ?? '',
    modelsReadAt: row.models_read_at ? row.models_read_at.toISOString() : null,
    revision: row.revision,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString()
  }
}

/** Every configured provider, in a shape safe to hand a browser. */
export async function readProviders(pool, secret) {
  const { rows } = await pool.query('select * from llm_provider order by name')
  return Promise.all(
    rows.map(async (row) => rowToScreen(row, secret, await openSecret(row.api_key_cipher, secret)))
  )
}

/**
 * Insert or update one provider.
 * @param {object} input - `{ id, presetId, name?, baseUrl?, apiKey?, enabled? }`. See this file's
 *   header on what an absent vs empty `apiKey` means.
 */
export async function saveProvider(pool, input, secret, by) {
  // A pasted key often carries a newline; `Bearer sk-..\n` makes `fetch` throw on every call.
  if (typeof input.apiKey === 'string') input = { ...input, apiKey: input.apiKey.trim() }
  const preset = catalogEntry(input.presetId)
  const name = input.name ?? preset?.name ?? input.id
  const sealed =
    input.apiKey === undefined
      ? undefined
      : input.apiKey === ''
        ? null
        : await sealSecret(input.apiKey, secret)

  const { rows } = await pool.query(
    `insert into llm_provider (id, preset_id, name, base_url, api_key_cipher, enabled, updated_by)
     values ($1, $2, $3, $4, $5, coalesce($6, false), $7)
     on conflict (id) do update set
       preset_id = excluded.preset_id,
       -- $9 / $10: an absent name or address is "leave it alone", like an absent key. Resetting them
       -- let a bare enabled-only save wipe a gateway address and send the key to the vendor's own.
       name = case when $9 then excluded.name else llm_provider.name end,
       base_url = case when $10 then excluded.base_url else llm_provider.base_url end,
       -- $8 says whether a key was part of this save at all. Without it, coalesce could not
       -- tell "leave it alone" (undefined) from "remove it" (null) -- they are the same SQL value.
       api_key_cipher = case when $8 then $5 else llm_provider.api_key_cipher end,
       enabled = coalesce($6, llm_provider.enabled),
       revision = llm_provider.revision + 1,
       updated_by = excluded.updated_by,
       updated_at = now()
     returning *`,
    [
      input.id,
      input.presetId ?? null,
      name,
      input.baseUrl ? input.baseUrl.trim() : null,
      sealed ?? null,
      input.enabled ?? null,
      by,
      sealed !== undefined,
      input.name !== undefined,
      input.baseUrl !== undefined
    ]
  )
  return rowToScreen(rows[0], secret, await openSecret(rows[0].api_key_cipher, secret))
}

/** What `Get model list` last read. A cache for a picker, never a gate. */
export async function saveModels(pool, id, models) {
  await pool.query('update llm_provider set models = $2, models_read_at = now() where id = $1', [
    id,
    JSON.stringify(models)
  ])
}

/**
 * Remove a provider — refused while it is still doing a job.
 *
 * The database would refuse too (`on delete restrict`), but it would refuse with a constraint
 * name. Naming the DOORS lets the screen say "Text for a built site still uses this", which is the
 * sentence somebody needs in order to decide what to do next.
 */
export async function deleteProvider(pool, id) {
  const { rows } = await pool.query('select door from llm_assignment where provider_id = $1 order by door', [
    id
  ])
  if (rows.length > 0) return { error: 'PROVIDER_IN_USE', doors: rows.map((r) => r.door) }
  try {
    await pool.query('delete from llm_provider where id = $1', [id])
  } catch (error) {
    // A door was assigned between the check and the delete: the foreign key is the real guard.
    if (error?.code !== '23503') throw error
    const { rows: now } = await pool.query(
      'select door from llm_assignment where provider_id = $1 order by door',
      [id]
    )
    return { error: 'PROVIDER_IN_USE', doors: now.map((r) => r.door) }
  }
  return { error: null, doors: [] }
}

/** Point one door at a provider. `model` is null for `agent` (key only — see `llm-catalog.js`). */
export async function assignDoor(pool, door, { providerId, model = null, effort }, by) {
  if (!DOOR_IDS.includes(door)) return { error: 'UNKNOWN_DOOR' }
  let chosenEffort = null
  if (door === 'woEditorial') {
    const provider = (await pool.query('select * from llm_provider where id=$1', [providerId])).rows[0]
    const options = effortOptions({
      presetId: provider?.preset_id,
      baseUrl: baseUrlFor({ baseUrl: provider?.base_url, presetId: provider?.preset_id }),
      metadata: provider?.models?.find((m) => m.id === model)
    })
    chosenEffort = effort === undefined && options.choices.includes('high') ? 'high' : (effort ?? null)
    if (chosenEffort !== null && !options.choices.includes(chosenEffort))
      return { error: 'MODEL_EFFORT_UNSUPPORTED', supported: options.choices, mode: options.mode }
  } else if (door === 'vision') {
    // Only "off" (menu photo reading without reasoning); null = the step's default, `low`.
    if (effort !== undefined && effort !== null && effort !== 'off')
      return { error: 'MODEL_EFFORT_UNSUPPORTED', supported: ['off'], mode: 'selectable' }
    chosenEffort = effort ?? null
  } else if (effort !== undefined && effort !== null) return { error: 'DOOR_EFFORT_UNSUPPORTED' }
  await pool.query(
    `insert into llm_assignment (door, provider_id, model, updated_by, reasoning_effort)
     values ($1, $2, $3, $4, $5)
     on conflict (door) do update set
       provider_id = excluded.provider_id,
       model = excluded.model,
       reasoning_effort = excluded.reasoning_effort,
       revision = llm_assignment.revision + 1,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [door, providerId, model, by, chosenEffort]
  )
  return { error: null }
}

export async function clearDoor(pool, door) {
  await pool.query('delete from llm_assignment where door = $1', [door])
}

/**
 * Every door, named, with what it is pointed at — `null` for the ones nobody assigned.
 *
 * ⚠ IT ANSWERS ALL FOUR, ALWAYS. A map with only the assigned doors in it would let a screen draw
 * three rows and leave the reader wondering whether the fourth exists; "not assigned" is a state
 * worth showing, because it is the state that falls back to the environment.
 */
export async function readAssignments(pool) {
  const { rows } = await pool.query('select * from llm_assignment')
  const out = Object.fromEntries(DOOR_IDS.map((id) => [id, null]))
  for (const row of rows) {
    // A row for a door this build does not have is not answered. Migration 097 removed the one
    // such row that existed (`questions`) and the constraint no longer admits another.
    if (!DOOR_IDS.includes(row.door)) continue
    out[row.door] = {
      providerId: row.provider_id,
      model: row.model,
      effort: row.reasoning_effort ?? null,
      revision: row.revision,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at.toISOString()
    }
  }
  return out
}

/**
 * Where a door stands in the book, in one of four words — the thing `modelForDoor` needs in order
 * to tell "nobody filled this door in" from "somebody did and it cannot answer".
 *
 * - `unassigned`: no `llm_assignment` row. The deployment never chose; the environment may answer.
 * - `ok`: assigned, and the provider would answer. `credential` is what to spend.
 * - `disabled`: assigned, and the provider is switched off.
 * - `unreadable`: assigned and enabled, but the key will not open (a rotated `SESSION_SECRET`) or
 *   is empty.
 *
 * 🔒 WHY NOT JUST `null`. Three different situations used to collapse into one `null`, and every
 * caller answered it the same way: spend the environment's key on the environment's model. For
 * "unassigned" that is the point of the fallback. For the other two an operator HAD chosen a
 * provider and a model, and the call quietly went to a different vendor with a different model and
 * no sign anywhere — a switch taken out of service that kept spending.
 */
export async function lookupDoor(pool, door, secret) {
  const { rows } = await pool.query(
    `select p.*, a.model as door_model, a.revision as assignment_revision,
            a.updated_at as assignment_updated_at, a.reasoning_effort
       from llm_assignment a join llm_provider p on p.id = a.provider_id
      where a.door = $1`,
    [door]
  )
  if (rows.length === 0) return { state: 'unassigned' }
  if (!rows[0].enabled) return { state: 'disabled' }
  const resolved = await resolveProvider(rows[0], secret)
  if (!resolved) return { state: 'unreadable' }
  const row = rows[0]
  return {
    state: 'ok',
    credential: { ...resolved, model: row.door_model },
    snapshot: {
      providerId: row.id,
      providerRevision: row.revision,
      assignmentRevision: row.assignment_revision,
      assignmentUpdatedAt: row.assignment_updated_at.toISOString(),
      effort: row.reasoning_effort ?? null,
      presetId: row.preset_id,
      metadata: (row.models ?? []).find((m) => m.id === row.door_model) ?? null
    }
  }
}

/**
 * The credential a door should actually use, or `null`.
 *
 * `null` means "this door cannot be answered from the book" — whether nobody assigned it or the
 * assignment is broken. Callers that must tell those apart (`modelForDoor`) use `lookupDoor`.
 *
 * 🔒 A DISABLED PROVIDER RESOLVES TO NOTHING. `enabled` is the switch somebody flips to take a
 * provider out of service (a key that ran out, a vendor having an incident); a door that kept
 * using it would make that switch decoration.
 */
export async function resolveDoor(pool, door, secret) {
  const found = await lookupDoor(pool, door, secret)
  return found.state === 'ok' ? found.credential : null
}

/**
 * "Would this provider actually answer?" — one implementation, asked by THREE callers: a door
 * about to spend it, the Test button, and the check before a door may be assigned to it.
 *
 * 🔒 ONE PLACE, BECAUSE THREE WOULD DISAGREE. If the assignment check read the row directly while
 * the request path used these rules, a screen could accept an assignment to a provider that then
 * resolves to nothing — and say "configured" above a door answering 503.
 *
 * 🔒 A DISABLED PROVIDER RESOLVES TO NOTHING. `enabled` is the switch somebody flips to take a
 * provider out of service (a key that ran out, a vendor having an incident); a door that kept
 * using it would make that switch decoration.
 *
 * @param {object} row - a raw `llm_provider` row.
 * @returns {Promise<{providerId: string, baseUrl: string, apiKey: string} | null>}
 */
export async function resolveProvider(row, secret, { requireEnabled = true } = {}) {
  if (!row) return null
  // ⚠ `requireEnabled: false` IS FOR THE TEST BUTTON ONLY, and the exception is the point: somebody
  // presses Test in order to decide whether to turn a provider ON. Demanding it be enabled first
  // inverts that — they would have to put an unverified credential into service to find out
  // whether it works. Every path that SPENDS the provider keeps the check.
  if (requireEnabled && !row.enabled) return null
  const apiKey = await openSecret(row.api_key_cipher, secret)
  const preset = catalogEntry(row.preset_id)
  // A local runtime needs no credential; everything else does, and a provider with an unreadable
  // or absent key must report "not configured" rather than sending an empty bearer token.
  if (!apiKey && preset?.keyOptional !== true && !onLocalNetwork(row.base_url)) return null
  return {
    providerId: row.id,
    baseUrl: baseUrlFor({ baseUrl: row.base_url, presetId: row.preset_id }),
    apiKey: apiKey ?? ''
  }
}

/**
 * Whether a custom address is this machine or its own private network (vLLM, LiteLLM, Ollama on a LAN).
 * Such a runtime needs no credential; a public address without one is a mistake, and stays "not configured".
 */
export function onLocalNetwork(address) {
  try {
    const host = new URL(address).hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host === '[::1]'
    )
  } catch {
    return false
  }
}

/** Every provider that would answer, keyed by id — what a push to another machine sends. */
export async function resolveAll(pool, secret) {
  const { rows } = await pool.query('select * from llm_provider where enabled = true')
  const out = []
  for (const row of rows) {
    const resolved = await resolveProvider(row, secret)
    if (resolved) out.push(resolved)
  }
  return out
}

/**
 * Write one line of the book's history. Never throws into the caller: a history that cannot be
 * written must not stop the change it describes, but it is said on the log.
 * @param {import('pg').Pool} pool
 * @param {{ actor: string, action: string, subject: string, detail?: Record<string, unknown> }} entry
 */
export async function auditBook(pool, { actor, action, subject, detail = {} }) {
  try {
    await pool.query(
      'insert into llm_audit (actor, action, subject, detail) values ($1, $2, $3, $4::jsonb)',
      [actor, action, subject, JSON.stringify(detail)]
    )
  } catch (error) {
    console.warn(`[llm] audit not written: ${String(error?.message ?? error)}`)
  }
}

/** The latest changes to the book, newest first. */
export async function readAudit(pool, limit = 100) {
  const { rows } = await pool.query(
    'select id, at, actor, action, subject, detail from llm_audit order by at desc, id desc limit $1',
    [Math.min(Math.max(1, limit), 500)]
  )
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }))
}

/** Save display names without changing credentials, model IDs, or the vendor catalog. */
export async function saveModelAliases(pool, id, aliases, by, providerAlias) {
  const { rows } = await pool.query(
    `update llm_provider set model_aliases = $2::jsonb,
       provider_alias = case when $4::text is null then provider_alias else $4 end, revision = revision + 1,
       updated_by = $3, updated_at = now() where id = $1 returning id`,
    [id, JSON.stringify(aliases), by, providerAlias ?? null]
  )
  return rows.length > 0
}

/** Reject malformed alias maps; blank aliases deliberately restore the vendor name. */
export function normalizeModelAliases(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length > 10000) return null
  const aliases = []
  for (const [id, alias] of entries) {
    if (
      !id ||
      id.length > 300 ||
      typeof alias !== 'string' ||
      alias.length > 120 ||
      /[\r\n\x00-\x1f]/.test(alias)
    )
      return null
    if (alias.trim()) aliases.push([id, alias.trim()])
  }
  return Object.fromEntries(aliases)
}

/** Blank display names restore the original provider name. */
export function normalizeProviderAlias(value) {
  if (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) return null
  return value.trim()
}
