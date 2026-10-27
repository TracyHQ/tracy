/**
 * Which design a new Joomla site is actually built with.
 *
 * Every Joomla site Tracy builds starts from ONE base quickstart. A design is either the template
 * that base already carries, or a pinned package installed on top of it before the site is bound —
 * so "which design" is a question with three honest answers, and the customer has to see which one
 * they are getting BEFORE they press the button:
 *
 *   served   — the design has a package, a reviewed activation recipe and a published contract
 *              profile, so the site is built with it;
 *   fallback — the design exists in the inspiration library but nothing serves it yet, so the site
 *              is built with the default design and the form says so;
 *   unknown  — the id is not in the library at all, and the request is refused rather than quietly
 *              turned into the default. A fallback that accepts anything is an open door with a
 *              friendly notice on it.
 *
 * The decision is made HERE, from the pinned registry, and never from anything the client sends.
 * The client may say which design was picked; it may not say which template, profile or package
 * the fleet will install. `registryRevision` is what lets the two halves notice they disagree: the
 * form shows a plan, the create call carries the revision it showed, and provisioning re-resolves
 * from its own copy of the same file. A registry that moved between those moments produces a
 * conflict the customer is shown, not a site built with a design nobody displayed.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The image puts the registry here (see `apps/tracy-web/Dockerfile`), and the repo keeps a mirror
 * at the same path so a checkout and a container read the same bytes. `scripts/check-design-
 * templates.ts` is what keeps the mirror equal to the canonical copy the fleet scripts ship.
 */
const DEFAULT_REGISTRY = fileURLToPath(new URL('../design-templates.json', import.meta.url))

/**
 * @typedef {{
 *   state: string, reason?: string, name: string,
 *   base: { quickstart: string, version: string },
 *   template: { element: string, version: string, source: string },
 *   artifact?: { file: string, kind: string, bytes: number, sha256: string, url: string, githubAssetId?: number },
 *   activation?: Record<string, unknown>,
 *   contractProfile: string,
 *   contractFiles: Record<string, string>,
 *   coworkMinVersion: string
 * }} DesignEntry
 * @typedef {{
 *   schemaVersion: string, version: string, platform: string, defaultDesign: string,
 *   defaultBase?: string, bases?: Record<string, {name: string, version: string, template: {element: string, version: string, source: string}, baselineProfile: string, coworkMinVersion: string, workflow: string}>,
 *   library: { source: string, count: number, ids: string[] },
 *   designs: Record<string, DesignEntry>
 * }} DesignRegistry
 * @typedef {{
 *   requestedDesign: string, effectiveDesign: string,
 *   baseQuickstart: string, baseVersion: string,
 *   template: { element: string, version: string, source: string },
 *   effectiveDesignName: string, contractProfile: string, coworkMinVersion: string,
 *   workflow?: string, multilingual?: false, registryRevision: string, fallback: boolean, fallbackReason?: string
 * }} DesignPlan
 */

const ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const PROFILE = /^[a-z][a-z0-9-]{1,40}\/[a-z][a-z0-9]{0,9}\/[0-9]+\.[0-9]+\.[0-9]+$/

/** Refuse a registry that cannot produce a plan, rather than producing half of one.
 * @param {DesignRegistry} registry
 * @returns {DesignRegistry}
 */
export function validateDesignRegistry(registry) {
  if (registry?.schemaVersion !== 'tracy-design-templates/v1' || !registry.version || !registry.platform)
    throw new Error('Unsupported design template registry')
  const ids = registry.library?.ids
  if (!Array.isArray(ids) || !ids.length || ids.length !== registry.library.count)
    throw new Error('The design registry does not name its inspiration library')
  if (ids.some((id) => typeof id !== 'string' || !ID.test(id))) throw new Error('Invalid inspiration id')
  if (!registry.designs || typeof registry.designs !== 'object') throw new Error('Incomplete design registry')
  for (const [id, design] of Object.entries(registry.designs)) {
    if (!ids.includes(id)) throw new Error(`Design outside the inspiration library: ${id}`)
    if (!['served', 'pending'].includes(design.state) || (design.state === 'pending' && !design.reason))
      throw new Error(`Invalid design state: ${id}`)
    if (typeof design.name !== 'string' || design.name === '')
      throw new Error(`Design has no display name: ${id}`)
    if (!design.base?.quickstart || !design.base.version) throw new Error(`Design names no base: ${id}`)
    if (
      !design.template?.element ||
      !design.template.version ||
      !['bundled', 'artifact'].includes(design.template.source)
    )
      throw new Error(`Invalid design template: ${id}`)
    if (!PROFILE.test(design.contractProfile ?? '')) throw new Error(`Invalid contract profile: ${id}`)
    if (!design.coworkMinVersion)
      throw new Error(`Design names no minimum Claude Cowork plugin version: ${id}`)
    // A design that installs something has to say exactly what, down to the bytes — and it has to
    // carry the recipe that turns an installed package into an active design. Without the recipe
    // the package lands and nothing uses it, which looks like success and ships the wrong design.
    if (design.template.source === 'artifact') {
      const artifact = design.artifact
      const url = artifact ? new URL(artifact.url) : null
      if (
        !artifact ||
        !url ||
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
        throw new Error(`Invalid design artifact: ${id}`)
      const styles = design.activation?.styles
      if (!Array.isArray(styles) || !styles.length)
        throw new Error(`Design installs a package but activates nothing: ${id}`)
      // Which template the recipe rewrites FROM. Without it the activator has to decide for itself
      // whether a style it finds belongs to the base the recipe was reviewed against, and deciding
      // is how a site that is NOT that base gets rewritten anyway.
      if (design.activation.fromTemplate !== registry.designs[registry.defaultDesign]?.template.element)
        throw new Error(`Activation must rewrite the default design's own template: ${id}`)
    } else if (design.artifact) throw new Error(`A bundled design downloads nothing: ${id}`)
  }
  const fallback = registry.designs[registry.defaultDesign]
  // The default is what every unsupported design becomes, so it is the one entry that may never be
  // pending and may never need a download — a fallback that can fail is not a fallback.
  if (!fallback || fallback.state !== 'served' || fallback.template.source !== 'bundled')
    throw new Error('The default design must be served by the base archive itself')
  if (registry.bases) {
    if (!registry.defaultBase || !registry.bases[registry.defaultBase])
      throw new Error('Missing default base')
    for (const [id, base] of Object.entries(registry.bases)) {
      if (
        !/^[a-z][a-z0-9-]+\/j[0-9]+$/.test(id) ||
        !base.name ||
        !base.version ||
        base.workflow !== 'template-build' ||
        base.template?.source !== 'bundled' ||
        !base.template.element ||
        !PROFILE.test(base.baselineProfile) ||
        !base.coworkMinVersion
      )
        throw new Error('Invalid construction base')
    }
  }
  return registry
}

/** Read and pin the registry. The revision is the file's own bytes, so any edit moves it.
 * @param {string} [file]
 * @returns {{ registry: DesignRegistry, revision: string }}
 */
export function loadDesignRegistry(file = DEFAULT_REGISTRY) {
  const bytes = readFileSync(file)
  const registry = validateDesignRegistry(JSON.parse(bytes.toString('utf8')))
  return { registry, revision: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * Whether a design can never carry a second edition, and is therefore built in ONE language.
 *
 * Asked by id, not read off a plan: a design that is ALSO a template card (ja-kinetic on the local
 * stand, 23/09/2026) gets a hand-made plan from the template road, which never passes through
 * `resolveDesignPlan` — and the one-language build silently did not happen.
 * @param {DesignRegistry} registry @param {unknown} id
 */
export function oneLanguageDesign(registry, id) {
  return typeof id === 'string' && registry.designs?.[id]?.multilingual === false
}

/**
 * The plan for one requested design, or null when the id names nothing in the library.
 *
 * @param {{ registry: DesignRegistry, revision: string }} loaded
 * @param {unknown} requested
 * @returns {DesignPlan | null}
 */
export function resolveDesignPlan({ registry, revision }, requested, baseId = registry.defaultBase) {
  if (typeof requested !== 'string' || !ID.test(requested) || !registry.library.ids.includes(requested))
    return null
  const wanted = registry.designs[requested]
  const served = wanted?.state === 'served'
  if (!served && registry.bases) {
    const base = registry.bases[baseId]
    if (!base || base.workflow !== 'template-build') throw new Error('Unsupported construction base')
    return {
      requestedDesign: requested,
      effectiveDesign: requested,
      effectiveDesignName: requested,
      // The design the site wears, in the shape the site folder records (29/09/2026): on
      // this road the library id itself, dressed onto the base by the template build.
      design: { id: requested, source: 'catalog' },
      baseQuickstart: baseId,
      baseVersion: base.version,
      template: { ...base.template },
      contractProfile: base.baselineProfile,
      coworkMinVersion: base.coworkMinVersion,
      registryRevision: revision,
      fallback: true,
      fallbackReason: 'template_build_required',
      workflow: 'template-build'
    }
  }
  const id = served ? requested : registry.defaultDesign
  const design = registry.designs[id]
  return {
    requestedDesign: requested,
    effectiveDesign: id,
    // The name a person reads, so the notice can say "the Apple template" rather than "apple".
    // It comes from the registry rather than the lane's catalogue because the lane is not the
    // authority on which designs are served, and the two lists would drift.
    effectiveDesignName: design.name,
    // What the site wears is the design it is BUILT with — the fallback's, when it falls back.
    design: { id, source: 'catalog' },
    baseQuickstart: design.base.quickstart,
    baseVersion: design.base.version,
    template: { ...design.template },
    contractProfile: design.contractProfile,
    coworkMinVersion: design.coworkMinVersion,
    // A design that can never carry a second edition is built in ONE language — the one chosen —
    // and the Joomla stages read this to write it as the source and make it the site's default.
    ...(design.multilingual === false ? { multilingual: false } : {}),
    registryRevision: revision,
    fallback: !served,
    // Why the customer is not getting what they picked, in a word the UI can translate. A design
    // the registry has not heard of and one it is not finished serving are different situations
    // and the entry says which; anything else is simply not served yet.
    ...(served ? {} : { fallbackReason: wanted?.reason ?? 'template_unavailable' })
  }
}
