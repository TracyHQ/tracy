/** Capability planning is data; execution stays in registered, versioned recipes. */

/**
 * @typedef {{ kind: string, version: string, release: string, url: string, sha256: string, bytes: number, githubAssetId?: number }} Artifact
 * @typedef {{ type: string, element: string, folder?: string }} Extension
 * @typedef {{ version: string, platformMajors: number[], requires: string[], extensions: Extension[], artifact?: string, recipe: string, verification: string, state: string, reason?: string }} Provider
 * @typedef {{ schemaVersion: string, version: string, platform: string, artifacts: Record<string, Artifact>, providers: Record<string, Provider>, capabilities: Record<string, { provider: string }> }} Catalog
 * @typedef {{ platform: string, platformVersion: string, extensions: (Extension & { enabled?: unknown })[], verified?: string[] }} Inventory
 */

/** Reject an incomplete or cyclic catalog before it can produce an install plan.
 * @param {Catalog} catalog
 */
export function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 'tracy-capabilities/v1' || !catalog.version || !catalog.platform)
    throw new Error('Unsupported capability catalog')
  if (!catalog.artifacts || !catalog.providers || !catalog.capabilities)
    throw new Error('Incomplete capability catalog')
  for (const [id, artifact] of Object.entries(catalog.artifacts)) {
    const url = new URL(artifact.url)
    if (
      !artifact.version ||
      !artifact.release ||
      !['akeeba-quickstart', 'tracy-runtime-quickstart', 'joomla-extension'].includes(artifact.kind) ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes <= 0 ||
      (artifact.githubAssetId !== undefined &&
        (!Number.isSafeInteger(artifact.githubAssetId) || artifact.githubAssetId <= 0))
    )
      throw new Error(`Invalid artifact: ${id}`)
  }
  const visited = new Set()
  const visiting = new Set()
  /** @param {string} id */
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Cyclic provider dependency: ${id}`)
    if (visited.has(id)) return
    const provider = catalog.providers[id]
    if (
      !provider ||
      !provider.version ||
      !provider.recipe ||
      !provider.verification ||
      !Array.isArray(provider.platformMajors) ||
      !provider.platformMajors.length ||
      provider.platformMajors.some((major) => !Number.isSafeInteger(major) || major < 1) ||
      !Array.isArray(provider.requires) ||
      !Array.isArray(provider.extensions) ||
      !['pending', 'ready'].includes(provider.state) ||
      (provider.state === 'pending' && !provider.reason)
    )
      throw new Error(`Invalid provider: ${id}`)
    if (provider.artifact && !catalog.artifacts[provider.artifact]) throw new Error(`Missing artifact: ${id}`)
    if (
      provider.artifact &&
      ['akeeba-quickstart', 'tracy-runtime-quickstart'].includes(catalog.artifacts[provider.artifact].kind) &&
      provider.recipe !== 'quickstart.restore'
    )
      throw new Error(`A quickstart cannot be installed as an extension: ${id}`)
    visiting.add(id)
    for (const dependency of provider.requires) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of Object.keys(catalog.providers)) visit(id)
  for (const [id, capability] of Object.entries(catalog.capabilities)) {
    if (!catalog.providers[capability.provider]) throw new Error(`Unknown provider for capability: ${id}`)
  }
  return catalog
}

/** The inventory is read through the seat door. An installed extension alone proves no capability.
 * @param {Catalog} catalog
 * @param {string[]} requested
 * @param {Inventory} inventory
 * @param {string[]} [executors] - Recipe ids actually registered on this host, never catalog claims.
 */
export function resolveCapabilities(catalog, requested, inventory, executors = []) {
  validateCatalog(catalog)
  if (inventory.platform !== catalog.platform)
    throw new Error(`Expected ${catalog.platform}, received ${inventory.platform}`)
  const major = Number(/^(\d+)\./.exec(inventory.platformVersion)?.[1])
  if (!major) throw new Error('The site did not report its CMS version')
  const added = new Set()
  /** @type {{ provider: string, version: string, recipe: string, status: string, reason?: string, artifact?: Artifact, missingExtensions: Extension[] }[]} */
  const steps = []
  /** @param {string} id */
  function add(id) {
    if (added.has(id)) return
    const provider = catalog.providers[id]
    for (const dependency of provider.requires) add(dependency)
    added.add(id)
    const compatible = provider.platformMajors.includes(major)
    const missingExtensions = provider.extensions.filter(
      (need) =>
        !inventory.extensions.some(
          (have) =>
            have.type === need.type &&
            have.element === need.element &&
            (have.folder ?? '') === (need.folder ?? '') &&
            [true, 1, '1'].includes(/** @type {any} */ (have.enabled))
        )
    )
    const verified =
      compatible && missingExtensions.length === 0 && inventory.verified?.includes(provider.verification)
    const blockedDependency = steps.some(
      (step) => provider.requires.includes(step.provider) && step.status === 'blocked'
    )
    const reason = !compatible
      ? `Joomla ${major} is not supported by ${id}`
      : blockedDependency
        ? 'A required capability is blocked'
        : provider.state !== 'ready'
          ? provider.reason
          : !executors.includes(provider.recipe)
            ? `No executor registered for ${provider.recipe}`
            : undefined
    steps.push({
      provider: id,
      version: provider.version,
      recipe: provider.recipe,
      status: verified ? 'satisfied' : reason ? 'blocked' : 'action-required',
      ...(!verified && reason ? { reason } : {}),
      ...(provider.artifact ? { artifact: catalog.artifacts[provider.artifact] } : {}),
      missingExtensions
    })
  }
  for (const id of requested) {
    const capability = catalog.capabilities[id]
    if (!capability) throw new Error(`Unknown capability: ${id}`)
    add(capability.provider)
  }
  return {
    catalogVersion: catalog.version,
    platform: inventory.platform,
    requested,
    executable: steps.every((step) => step.status !== 'blocked'),
    steps
  }
}
