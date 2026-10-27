/**
 * Sources: providers that answer a capability group (`domain/capabilities.mjs`). A discovery source finds businesses
 * in an area (group `map-discovery`); an evidence source collects what is public about one business (any other group:
 * a website, a social page, reviews). A source is one module whose default export is a plain object:
 *
 *   id          kebab-case; the provider id the operator orders in the capability catalogue
 *   label       what the settings page shows
 *   credential  the key it needs (`PROVIDER_CREDENTIALS`), or null
 *   groups      the capability groups it answers
 *   discover(area, deps)  → Candidate[]   for `map-discovery`; area = { lat, lon, radiusM, limit? }
 *   collect(place, deps)  → evidence      for every other group; the group's own shape
 *
 * `deps` carries `fetch` (and `resolve`, `timeoutMs`) and `key`, the source's credential when it has one. A source
 * throws on a provider failure; `code`/`status` on the error say which (TIMEOUT, QUOTA or 429, 401/403, 5xx).
 */
import { CAPABILITY_GROUP_IDS, providerAnswer, runInOrder } from '../../domain/capabilities.mjs'
import { loadPluginFiles } from './load.js'
import osm from './sources/osm.js'

const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const DISCOVERY = 'map-discovery'

/** A checked, frozen source; a TypeError names what is wrong. */
export function defineSource(source) {
  if (!source || typeof source !== 'object') throw new TypeError('a source is an object')
  const { id, label, credential = null, groups } = source
  if (typeof id !== 'string' || !ID.test(id))
    throw new TypeError(`source id must be kebab-case: ${String(id)}`)
  if (typeof label !== 'string' || !label.trim()) throw new TypeError(`source ${id}: label is missing`)
  if (credential !== null && (typeof credential !== 'string' || !credential))
    throw new TypeError(`source ${id}: credential is a name or null`)
  if (!Array.isArray(groups) || groups.length === 0)
    throw new TypeError(`source ${id}: groups is a non-empty list`)
  for (const g of groups)
    if (!CAPABILITY_GROUP_IDS.includes(g)) throw new TypeError(`source ${id}: ${g} is not a capability group`)
  if (groups.includes(DISCOVERY) && typeof source.discover !== 'function')
    throw new TypeError(`source ${id}: ${DISCOVERY} needs discover(area, deps)`)
  if (groups.some((g) => g !== DISCOVERY) && typeof source.collect !== 'function')
    throw new TypeError(`source ${id}: an evidence group needs collect(place, deps)`)
  return Object.freeze({
    id,
    label,
    credential,
    groups: Object.freeze([...groups]),
    ...(source.discover ? { discover: source.discover } : {}),
    ...(source.collect ? { collect: source.collect } : {})
  })
}

export const BUILT_IN_SOURCES = Object.freeze([osm])

/** The sources in use, by id; an id at most once. */
export function sourceRegistry(sources = BUILT_IN_SOURCES) {
  const byId = new Map()
  for (const s of sources) {
    const source = defineSource(s)
    if (byId.has(source.id)) throw new TypeError(`source ${source.id} is listed twice`)
    byId.set(source.id, source)
  }
  return Object.freeze({
    get: (id) => byId.get(id) ?? null,
    list: () => [...byId.values()],
    /** The sources that answer `groupId`, in the order they were registered. */
    forGroup: (groupId) => [...byId.values()].filter((s) => s.groups.includes(groupId))
  })
}

/** The built-in sources followed by each source file of `dir`. */
export async function loadSources(dir) {
  return sourceRegistry([...BUILT_IN_SOURCES, ...(await loadPluginFiles(dir)).map(({ plugin }) => plugin)])
}

/** Why a provider gave nothing, as `FALLBACK_REASONS` names it. */
export function fallbackReasonOf(error) {
  const code = error?.code
  const status = error?.status
  if (code === 'TIMEOUT') return 'timeout'
  if (code === 'CREDENTIAL_MISSING') return 'credential_missing'
  if (code === 'QUOTA' || status === 402 || status === 429) return 'quota'
  if (status === 401 || status === 403) return 'credential_invalid'
  return 'provider_error'
}

/**
 * Discovery over `order` (provider ids, e.g. from `resolveOrder(providerOrder, 'map-discovery')`): the first source
 * with candidates answers; one with none ends the search as `not_found`; a failure or a missing key falls to the
 * next. `keys` maps credential names to keys. Returns `runInOrder`'s result; `answer.data` is the candidates.
 */
export async function discoverInOrder(registry, order, area, { keys = {}, ...deps } = {}) {
  return runInOrder(order, async (id) => {
    const source = registry.get(id)
    if (!source?.discover) return providerAnswer(id, 'skipped', { reason: 'provider_error' })
    const key = source.credential ? keys[source.credential] : undefined
    if (source.credential && !key) return providerAnswer(id, 'skipped', { reason: 'credential_missing' })
    try {
      const candidates = await source.discover(area, key ? { ...deps, key } : deps)
      return candidates.length
        ? providerAnswer(id, 'complete', { data: candidates })
        : providerAnswer(id, 'not_found', { data: [] })
    } catch (error) {
      return providerAnswer(id, 'skipped', { reason: fallbackReasonOf(error) })
    }
  })
}
