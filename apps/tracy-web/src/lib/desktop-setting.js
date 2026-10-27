/** Account subscription policy shared by the web and desktop surfaces.
 * The historical desktop API and table names remain for compatibility.
 * Execution reads fail closed on database errors; the public config keeps its legacy defaults.
 */
/** @type {{ id: string, name: string, homepage: string }[]} */
export const DESKTOP_PROVIDERS = [
  { id: 'claude', name: 'Claude', homepage: 'https://claude.ai' },
  { id: 'codex', name: 'ChatGPT Codex', homepage: 'https://chatgpt.com/codex' },
  { id: 'copilot', name: 'GitHub Copilot', homepage: 'https://github.com/features/copilot' },
  { id: 'grok', name: 'Grok', homepage: 'https://grok.com' },
  // Off until Google lets a public client reach Antigravity: with the Gemini CLI client the sign-in
  // works, but every Code Assist stream answers 403 and onboarding says "this client is no longer
  // supported … migrate to the Antigravity suite" (measured 10/10/2026). An operator may still switch
  // it on at /ops › Desktop App; the adapter and its tests stay.
  { id: 'antigravity', name: 'Antigravity (Gemini)', homepage: 'https://antigravity.google', offered: false },
  // Connected with a pasted API key. Off until each passes a real key, chat and Disconnect
  // (tasks/todo-ai-accounts-wave2.md); an operator switches each on at /ops.
  { id: 'kimi', name: 'Kimi', homepage: 'https://www.kimi.com', offered: false },
  { id: 'glm', name: 'GLM', homepage: 'https://z.ai', offered: false },
  { id: 'qwen', name: 'Qwen', homepage: 'https://bailian.console.aliyun.com', offered: false }
]
const PROVIDER_IDS = new Set(DESKTOP_PROVIDERS.map((p) => p.id))

/** The known ids among `ids`, once each, in the order the screen lists them. */
const inListOrder = (ids) => DESKTOP_PROVIDERS.map((p) => p.id).filter((id) => ids.includes(id))

/** On, with every vendor that passed a real sign-in and chat offered, until an operator says otherwise (07/10/2026). */
const DEFAULT_LLM = Object.freeze({
  connect: true,
  providers: Object.freeze(DESKTOP_PROVIDERS.filter((p) => p.offered !== false).map((p) => p.id))
})
const LLM_KEYS = new Set(['connect', 'providers'])

/**
 * What a stored `llm` block means today: unknown keys and vendors dropped, a wrong type read as the
 * default, the list kept in the catalogue's order.
 *
 * A stored list naming vendors of which NONE is offered any more is read as the default list, not as
 * "no vendor": that is a list written against an older catalogue (the pi-ai ids `anthropic`,
 * `openai-codex`… of the first build, 07/10/2026), not an operator turning every vendor off. An
 * empty list stays empty — that one is an answer.
 */
function normalizeLlm(stored) {
  const llm = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  let providers = [...DEFAULT_LLM.providers]
  if (Array.isArray(llm.providers)) {
    const known = inListOrder(llm.providers)
    providers = known
  }
  return {
    connect: typeof llm.connect === 'boolean' ? llm.connect : DEFAULT_LLM.connect,
    providers
  }
}

/**
 * The app's settings on this deployment.
 *
 * 🔒 ABSENT IS DEFAULTS. No row, no pool, a failed query: each answers the defaults, so a deployment
 * that never opened the screen tells the app exactly what a fresh one does.
 * @returns {Promise<{ llm: { connect: boolean, providers: string[] }, updatedBy: string | null, updatedAt: string | null }>}
 */
export async function readDesktopSetting(pool, { strict = false } = {}) {
  const none = { llm: normalizeLlm(null), updatedBy: null, updatedAt: null }
  if (!pool) {
    if (strict) throw new Error('Subscription settings are unavailable')
    return none
  }
  try {
    const { rows } = await pool.query('select config, updated_by, updated_at from desktop_setting where id')
    if (!rows[0]) return none
    return {
      llm: normalizeLlm(rows[0].config?.llm),
      updatedBy: rows[0].updated_by,
      updatedAt: rows[0].updated_at?.toISOString?.() ?? null
    }
  } catch (error) {
    if (strict) throw error
    return none
  }
}

/**
 * The model the app's agent talks to while no plan is connected: the provider an operator gave the
 * `agent` door on `/ops` › Model & AI. Never its key.
 *
 * ⚠ `model` IS ALWAYS `null` TODAY, ON PURPOSE. The `agent` door is key-only (22/09,
 * `llm-catalog.js`); the model itself is `agent-default-model` inside the dsh image, which this
 * process cannot see. `null` says "not known here" — a model name typed in this file would be a
 * guess the screen then shows as fact. An unassigned door is `provider: null` for the same reason.
 * @returns {Promise<{ provider: string | null, model: string | null }>}
 */
export async function readTracyModel(pool) {
  const none = { provider: null, model: null }
  if (!pool) return none
  try {
    const { rows } = await pool.query(
      `select coalesce(p.preset_id, p.id) as provider, a.model
         from llm_assignment a join llm_provider p on p.id = a.provider_id
        where a.door = 'agent'`
    )
    return rows[0] ? { provider: rows[0].provider, model: rows[0].model ?? null } : none
  } catch {
    return none
  }
}

/**
 * Check a press before anything is written: `{ llm: { connect?: boolean, providers?: string[] } }`,
 * any subset. Nothing is written unless all of it is valid.
 * @returns {{ ok: true, llm: { connect?: boolean, providers?: string[] } } | { ok: false, error: string, key?: string, id?: string }}
 */
export function parseDesktopPress(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, error: 'BODY_NOT_OBJECT' }
  for (const key of Object.keys(body)) {
    if (key !== 'llm') return { ok: false, error: 'UNKNOWN_KEY', key }
  }
  const llm = body.llm
  if (llm === null || typeof llm !== 'object' || Array.isArray(llm)) {
    return { ok: false, error: 'NOT_OBJECT', key: 'llm' }
  }
  for (const key of Object.keys(llm)) {
    if (!LLM_KEYS.has(key)) return { ok: false, error: 'UNKNOWN_KEY', key: `llm.${key}` }
  }
  if ('connect' in llm && typeof llm.connect !== 'boolean') {
    return { ok: false, error: 'NOT_BOOLEAN', key: 'llm.connect' }
  }
  if ('providers' in llm) {
    if (!Array.isArray(llm.providers) || llm.providers.some((id) => typeof id !== 'string')) {
      return { ok: false, error: 'NOT_LIST', key: 'llm.providers' }
    }
    const unknown = llm.providers.find((id) => !PROVIDER_IDS.has(id))
    if (unknown !== undefined)
      return { ok: false, error: 'UNKNOWN_PROVIDER', key: 'llm.providers', id: unknown }
  }
  const out = {}
  if ('connect' in llm) out.connect = llm.connect
  if ('providers' in llm) out.providers = inListOrder(llm.providers)
  return { ok: true, llm: out }
}

/**
 * Apply a press in ONE statement, merged into what is stored, so two operators changing different
 * keys at once both land.
 */
export async function saveDesktopSetting(pool, llm, updatedBy) {
  await pool.query(
    `insert into desktop_setting (id, config, updated_by) values (true, jsonb_build_object('llm', $1::jsonb), $2)
     on conflict (id) do update set
       config = desktop_setting.config
         || jsonb_build_object('llm', coalesce(desktop_setting.config->'llm', '{}'::jsonb) || $1::jsonb),
       updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(llm), updatedBy]
  )
}
