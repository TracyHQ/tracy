/**
 * Which steps the Publish tab walks, worked out from what the tab already knows. Pure, so a test
 * pins every combination without a page.
 *
 *   online  the site on its Tracy address (Draft / Live), then the Owner's own domain
 *   zip     Export site as ZIP (Owner only)
 *   live    Sync to live: Tracy's changes sent back to the live site an imported Joomla or WordPress
 *           site came from (Owner only, while its switch is on), in two steps: Review, then Send
 *
 * An Owner first chooses the kind; anyone else has only `online` and starts on it. An imported
 * Joomla or WordPress site that syncs from its original has a Sync step right before the last step of
 * the online and ZIP flows; the live flow has none, since its preview brings the live site's changes
 * in first. Nothing here grants a right: every step does what its door already allows the seat.
 */

export type PublishKind = 'online' | 'zip' | 'live'
export type PublishStep = 'kind' | 'address' | 'sync' | 'domain' | 'zip' | 'push' | 'send'
/** Where the "…" menu lands: the ZIP flow's start, its Sync step, or the Sync to live flow. */
export type PublishEntry = 'zip' | 'sync' | 'push'

export interface PublishFacts {
  /** The site's Owner: chooses the kind, exports, syncs and connects a domain. */
  owner: boolean
  /** Sync from live is offered: imported, Joomla or WordPress, the switch on, and the Owner. */
  syncs: boolean
  /** The own-domain step exists: the Owner, and either the switch on or a domain already there. */
  domainStep: boolean
  /** Sync to live is offered: imported, Joomla or WordPress, its switch on, and the Owner. */
  pushes?: boolean
}

/** The kinds this seat may choose from; one kind means there is nothing to choose. */
export function kindsFor(facts: PublishFacts): PublishKind[] {
  if (!facts.owner) return ['online']
  return facts.pushes ? ['online', 'zip', 'live'] : ['online', 'zip']
}

/** The steps of one kind, in order, with the kind step first when there is a choice to make. */
export function stepsFor(facts: PublishFacts, kind: PublishKind): PublishStep[] {
  const head: PublishStep[] = kindsFor(facts).length > 1 ? ['kind'] : []
  if (kind === 'live') return [...head, 'push', 'send']
  const tail: PublishStep[] =
    kind === 'zip' ? ['zip'] : facts.domainStep ? ['address', 'domain'] : ['address']
  if (facts.syncs) tail.splice(tail.length - 1, 0, 'sync')
  return [...head, ...tail]
}

/** The kind a menu entry lands in: Sync to live has its own flow, the others land in the ZIP flow. */
export function entryKind(facts: PublishFacts, entry: PublishEntry): PublishKind {
  return entry === 'push' && facts.pushes ? 'live' : 'zip'
}

/** The step a menu entry lands on: the ZIP flow's start or its Sync step, or Sync to live's Review. */
export function entryStep(facts: PublishFacts, entry: PublishEntry): PublishStep {
  if (entryKind(facts, entry) === 'live') return 'push'
  const steps = stepsFor(facts, 'zip')
  if (entry === 'sync' && steps.includes('sync')) return 'sync'
  return steps.find((step) => step !== 'kind') ?? 'zip'
}

/**
 * The platforms Sync from live can read and merge (tracy-web's `SYNC_PLATFORMS`, My Sites'
 * `SYNC_FROM_LIVE_PLATFORMS`).
 */
export const SYNC_PLATFORMS: ReadonlySet<string> = new Set(['joomla', 'wordpress'])

/** Whether a site syncs from its original, by the rule the "…" menu applies. */
export function syncsFromOriginal(site: {
  owner: boolean
  imported: boolean
  platform: string | null | undefined
  switchOn: boolean
}): boolean {
  return site.owner && site.imported && SYNC_PLATFORMS.has(site.platform ?? '') && site.switchOn
}
