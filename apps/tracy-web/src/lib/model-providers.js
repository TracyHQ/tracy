/** Map the operator provider book to deployed dsh API adapters. */
export const ROUTE_OF = { deepseek: 'deepseek-official', openrouter: 'openrouter' }

/** Only adapters backed by an enabled, usable operator account may be advertised. */
export function allowedModelProviders(providers) {
  return new Set(
    providers
      .filter((p) => p.enabled && !p.keyUnreadable && (p.configured || p.keyOptional))
      .flatMap((p) => {
        // The deployed adapters use these canonical accounts, not arbitrary custom endpoints.
        const route = ROUTE_OF[p.id]
        return route && p.presetId === p.id ? [route] : []
      })
  )
}

/**
 * The words that name a model maker or one of its model families. 🔒 AN ALIAS IS A TRACY NAME, NEVER
 * ANOTHER PRODUCT'S (#249, survey 30/10/2026): dev's `deepseek-flash` route was aliased "Claude Opus 5.5"
 * in /ops, and the model picker told every customer a Claude model answered. An alias may name a maker
 * only when the route itself does — its preset, its name, the model's id or the model's own name.
 */
const MODEL_MAKERS = Object.freeze({
  anthropic: ['anthropic', 'claude', 'opus', 'sonnet', 'haiku', 'fable'],
  openai: ['openai', 'chatgpt', 'gpt'],
  google: ['google', 'gemini', 'gemma', 'bard'],
  meta: ['llama'],
  xai: ['xai', 'grok'],
  mistral: ['mistral', 'mixtral', 'codestral', 'magistral'],
  deepseek: ['deepseek'],
  alibaba: ['qwen'],
  moonshot: ['moonshot', 'kimi'],
  zhipu: ['zhipu', 'glm'],
  cohere: ['cohere']
})

/** @param {string} text @returns {Map<string, string>} maker → the first of its words the text holds */
function makersIn(text) {
  const lower = String(text ?? '').toLowerCase()
  /** @type {Map<string, string>} */
  const found = new Map()
  for (const [maker, words] of Object.entries(MODEL_MAKERS))
    for (const word of words)
      if (new RegExp(`(?:^|[^a-z])${word}(?![a-z])`).test(lower)) {
        found.set(maker, word)
        break
      }
  return found
}

/**
 * The maker word an alias names that the route it labels does not, or null when it names none.
 * @param {unknown} alias
 * @param {unknown[]} own - the route's own names: preset id, provider name, model id, model name.
 * @returns {string | null}
 */
export function foreignMakerIn(alias, own) {
  if (typeof alias !== 'string' || alias.trim() === '') return null
  const ours = makersIn(own.filter((v) => typeof v === 'string').join(' '))
  for (const [maker, word] of makersIn(alias)) if (!ours.has(maker)) return word
  return null
}

/** The names a provider row calls itself by. @param {any} provider */
const providerNames = (provider) => [provider?.presetId, provider?.id, provider?.name]

/**
 * The model name an alias may show, or null: blank, or naming another maker than the model's (#249).
 * @param {any} provider @param {string} modelId
 */
export function shownModelAlias(provider, modelId) {
  const alias = provider?.modelAliases?.[modelId]
  if (typeof alias !== 'string' || alias.trim() === '') return null
  const model = (provider.models ?? []).find((/** @type {any} */ m) => m?.id === modelId)
  return foreignMakerIn(alias, [...providerNames(provider), modelId, model?.name]) === null
    ? alias.trim()
    : null
}

/** The provider name an alias may show, or null: blank, or naming another maker than the route's (#249). @param {any} provider */
export function shownProviderAlias(provider) {
  const alias = provider?.providerAlias
  if (typeof alias !== 'string' || alias.trim() === '') return null
  return foreignMakerIn(alias, providerNames(provider)) === null ? alias.trim() : null
}

/** Apply aliases only to deployment API routes, never to connected personal accounts. */
export function aliasModelCatalog(catalog, providers) {
  const aliases = new Map(
    providers.filter((p) => p.id === p.presetId && ROUTE_OF[p.id]).map((p) => [ROUTE_OF[p.id], p])
  )
  return {
    ...catalog,
    groups: catalog.groups.map((group) => ({
      ...group,
      name: shownProviderAlias(aliases.get(group.id)) || group.name,
      models: group.models.map((model) => {
        const name = shownModelAlias(aliases.get(group.id), model.id)
        return name ? { ...model, name } : model
      })
    })),
    failures: catalog.failures?.map((failure) => ({
      ...failure,
      name: shownProviderAlias(aliases.get(failure.id)) || failure.name
    }))
  }
}

/** Expose only operator-approved (aliased) models on deployment routes; leave personal accounts whole. */
export function restrictToAliasedModels(catalog, providers) {
  const byRoute = new Map(
    providers.filter((p) => p.id === p.presetId && ROUTE_OF[p.id]).map((p) => [ROUTE_OF[p.id], p])
  )
  const approved = (provider, modelId) => {
    const alias = provider.modelAliases?.[modelId]
    return typeof alias === 'string' && !!alias.trim()
  }
  const groups = catalog.groups
    .map((group) => {
      const provider = byRoute.get(group.id)
      // Groups that are not a deployment API route (e.g. a connected personal account) pass untouched.
      return provider
        ? { ...group, models: group.models.filter((model) => approved(provider, model.id)) }
        : group
    })
    .filter((group) => !byRoute.has(group.id) || group.models.length > 0)
  const kept = new Set(groups.map((group) => group.id))
  return {
    ...catalog,
    groups,
    routableProviders: (catalog.routableProviders || []).filter((id) => kept.has(id))
  }
}

/** True when a canonical catalog group id is a Tracy deployment API route, not a personal account. */
export function isDeploymentRoute(id) {
  for (const route of Object.values(ROUTE_OF)) if (route === id) return true
  return false
}

/** Whether a model under a deployment route carries an operator alias (is approved for the picker). */
export function isApprovedDeploymentModel(providers, route, modelId) {
  const provider = providers.find((p) => p.id === p.presetId && ROUTE_OF[p.id] === route)
  const alias = provider?.modelAliases?.[modelId]
  return typeof alias === 'string' && !!alias.trim()
}

/** Display facts for one deployed model; aliases never alter its routing identifier. */
export function tracyModelIdentity(providers, selection) {
  const provider = providers.find((p) => p.id === p.presetId && ROUTE_OF[p.id] === selection?.provider)
  if (!provider || typeof selection?.model !== 'string') return null
  const model = provider.models.find((model) => model.id === selection.model)
  return {
    providerName: shownProviderAlias(provider) || provider.name,
    modelName: shownModelAlias(provider, selection.model) || model?.name || selection.model
  }
}
