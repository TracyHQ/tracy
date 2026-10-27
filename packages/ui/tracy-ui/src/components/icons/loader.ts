import type * as modelCatalogNs from './models/catalog'
import type { ModelIconKey } from './models/meta-catalog'
import type * as platformCatalogNs from './platforms/catalog'
import type { PlatformIconKey } from './platforms/meta-catalog'
import type * as providerCatalogNs from './providers/catalog'
import type { ProviderIconKey } from './providers/meta-catalog'
import type { IconRef } from './registry'
import type { CompoundIcon } from './types'

/**
 * Async access to the generated component catalogs.
 *
 * The catalogs statically import every icon component (~4 MB of SVG paths),
 * so they must only ever be reached through the dynamic imports below — each
 * becomes its own async chunk, off every window's first paint. Loads are
 * cached and deduplicated by keeping the import promise; resolved modules are
 * additionally exposed synchronously so callers can skip a placeholder frame
 * once a catalog is in.
 */

type ProviderCatalogModule = typeof providerCatalogNs
type ModelCatalogModule = typeof modelCatalogNs
type PlatformCatalogModule = typeof platformCatalogNs

let providerCatalogModule: ProviderCatalogModule | undefined
let modelCatalogModule: ModelCatalogModule | undefined
let platformCatalogModule: PlatformCatalogModule | undefined
let providerCatalogPromise: Promise<ProviderCatalogModule> | undefined
let modelCatalogPromise: Promise<ModelCatalogModule> | undefined
let platformCatalogPromise: Promise<PlatformCatalogModule> | undefined

function loadProviderCatalogModule(): Promise<ProviderCatalogModule> {
  providerCatalogPromise ??= import('./providers/catalog').then((module) => {
    providerCatalogModule = module
    return module
  })
  return providerCatalogPromise
}

function loadModelCatalogModule(): Promise<ModelCatalogModule> {
  modelCatalogPromise ??= import('./models/catalog').then((module) => {
    modelCatalogModule = module
    return module
  })
  return modelCatalogPromise
}

function loadPlatformCatalogModule(): Promise<PlatformCatalogModule> {
  platformCatalogPromise ??= import('./platforms/catalog').then((module) => {
    platformCatalogModule = module
    return module
  })
  return platformCatalogPromise
}

export async function loadProviderIconCatalog(): Promise<Record<ProviderIconKey, CompoundIcon>> {
  return (await loadProviderCatalogModule()).PROVIDER_ICON_CATALOG
}

export async function loadProviderIcon(key: ProviderIconKey): Promise<CompoundIcon> {
  return (await loadProviderCatalogModule()).PROVIDER_ICON_CATALOG[key]
}

export async function loadModelIcon(key: ModelIconKey): Promise<CompoundIcon> {
  return (await loadModelCatalogModule()).MODEL_ICON_CATALOG[key]
}

export async function loadPlatformIconCatalog(): Promise<Record<PlatformIconKey, CompoundIcon>> {
  return (await loadPlatformCatalogModule()).PLATFORM_ICON_CATALOG
}

export async function loadPlatformIcon(key: PlatformIconKey): Promise<CompoundIcon> {
  return (await loadPlatformCatalogModule()).PLATFORM_ICON_CATALOG[key]
}

export function loadIcon(ref: IconRef): Promise<CompoundIcon> {
  if (ref.kind === 'provider') return loadProviderIcon(ref.key)
  if (ref.kind === 'model') return loadModelIcon(ref.key)
  return loadPlatformIcon(ref.key)
}

/** Synchronous lookup that only hits once the matching catalog has loaded. */
export function getLoadedIcon(ref: IconRef): CompoundIcon | undefined {
  if (ref.kind === 'provider') return providerCatalogModule?.PROVIDER_ICON_CATALOG[ref.key]
  if (ref.kind === 'model') return modelCatalogModule?.MODEL_ICON_CATALOG[ref.key]
  return platformCatalogModule?.PLATFORM_ICON_CATALOG[ref.key]
}
