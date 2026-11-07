// Which design system slot contracts a kit's template may wear, by the CMS the kit was read from (#462).
// Joomla: `joomla-<product>-modes`, then `joomla-<product>`. WordPress: the contract made for the release's theme,
// found by the same lookup the Add site door uses (`quickstartContractOf` in lib/ds-slot.js). A WordPress release with
// no slot has NO names: it is never given the Joomla slot of a product that happens to share the name.

const WORDPRESS_CONTRACT_ID = /^([a-z0-9-]+\/wp\d+)\/[^/]+$/
const WORDPRESS_RELEASE = /^quickstart\/[a-z0-9-]+\/wp\d+$/

/**
 * The release tag of a WordPress kit (`quickstart/<product>/wp<n>`), or null when the kit is not a WordPress one.
 * Read from what the kit stamp carries: `quickstart.release`, else the contract id `<product>/wp<n>/<version>`.
 */
export function wordpressTagOfKit(kit) {
  const q = kit.quickstart ?? {}
  if (typeof q.release === 'string' && WORDPRESS_RELEASE.test(q.release)) return q.release
  const id = WORDPRESS_CONTRACT_ID.exec(typeof kit.contract === 'string' ? kit.contract : '')?.[1]
  if (id) return `quickstart/${id}`
  return q.platform === 'wordpress' ? (q.release ?? `quickstart/${q.product ?? 'unknown'}`) : null
}

/**
 * @param {any} kit the template kit document
 * @param {(q: { platform: string, tag: string, version: string | null }) => { contract: string } | { reason: string }} [wordpressSlotOf]
 *   `quickstartContractOf` of lib/ds-slot.js; a WordPress kit needs it
 * @returns {{ names: string[], problem: null } | { names: [], problem: string }}
 */
export function slotNamesOfKit(kit, wordpressSlotOf) {
  const tag = wordpressTagOfKit(kit)
  if (tag === null) {
    const product = kit.quickstart?.product
    return { names: [`joomla-${product}-modes`, `joomla-${product}`], problem: null }
  }
  const found = wordpressSlotOf?.({ platform: 'wordpress', tag, version: null })
  if (found && 'contract' in found) return { names: [found.contract], problem: null }
  const reason = found && 'reason' in found ? found.reason : 'TEMPLATE_NOT_READY'
  return {
    names: [],
    problem: `the Design system has no WordPress template contract for ${tag.replace(/^quickstart\//, '')} (${reason}): no accent can be built`
  }
}
