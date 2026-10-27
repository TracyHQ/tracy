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

/** Apply aliases only to deployment API routes, never to connected personal accounts. */
export function aliasModelCatalog(catalog, providers) {
  const aliases = new Map(
    providers.filter((p) => p.id === p.presetId && ROUTE_OF[p.id]).map((p) => [ROUTE_OF[p.id], p])
  )
  return {
    ...catalog,
    groups: catalog.groups.map((group) => ({
      ...group,
      name: aliases.get(group.id)?.providerAlias?.trim() || group.name,
      models: group.models.map((model) => {
        const name = aliases.get(group.id)?.modelAliases?.[model.id]
        return typeof name === 'string' && name.trim() ? { ...model, name: name.trim() } : model
      })
    })),
    failures: catalog.failures?.map((failure) => ({
      ...failure,
      name: aliases.get(failure.id)?.providerAlias?.trim() || failure.name
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
    providerName: provider.providerAlias?.trim() || provider.name,
    modelName: provider.modelAliases?.[selection.model]?.trim() || model?.name || selection.model
  }
}
