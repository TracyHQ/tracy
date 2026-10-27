/**
 * Whether "Apply" in the Add site popup can write a given build.
 *
 * Apply writes through a content contract (a WordPress or Joomla release that has a profile naming its text and picture
 * slots) or through the personalize tool of an EmDash template. Every other release keeps the template's own words, and
 * a popup that asks a business owner about their site for a build that will ignore the answers is a promise nobody
 * keeps: so the Design inspiration card says, per platform, whether Apply can write it (`apply`), and the wizard offers the
 * popup only for builds that can.
 *
 * Whether the SITE will take the write is a second question this cannot answer (a release whose profile the Claude
 * Cowork plugin on the site does not carry yet is refused when the writing starts, and the site keeps its words).
 */
import { contractFor } from './contracts.js'
import { emdashToolFor } from './emdash-tool.js'

/**
 * @param {{platform: string, tag: string, version?: string | null}} build - one platform entry of a template card
 * @param {import('./contracts.js').ContractIndex} contracts
 * @returns {boolean}
 */
export function briefSupported({ platform, tag, version }, contracts) {
  if (platform === 'emdash') return emdashToolFor(tag) !== null
  return contractFor(contracts, tag, version ?? undefined) !== null
}

/**
 * @typedef {{ state: 'exact' | 'lower' | 'none' | 'not-applicable', profile: string | null, version: string | null }} ContractStatus
 */

/**
 * Whether a platform entry of a template card is bound to a content contract, from the SAME `contractFor` the
 * provisioning entry uses (no second rule).
 *
 * - `exact`: a profile sealed for this very version.
 * - `lower`: no profile for this version, but the nearest lower one of the same release and major serves it
 *   (`fallbackFrom` on the contract); the component may still refuse it if the release changed structure.
 * - `none`: no profile at all, so a site built from it has no slot map.
 * - `not-applicable`: EmDash has no component to bind.
 *
 * `version` is always the release version; `profile` is the id of the profile found, null for `none` and
 * `not-applicable`.
 * @param {{platform: string, tag: string, version?: string | null}} build
 * @param {import('./contracts.js').ContractIndex} contracts
 * @returns {ContractStatus}
 */
export function contractStatus({ platform, tag, version }, contracts) {
  const asked = version ?? null
  if (platform === 'emdash') return { state: 'not-applicable', profile: null, version: asked }
  const found = contractFor(contracts, tag, asked ?? undefined)
  if (found === null) return { state: 'none', profile: null, version: asked }
  return { state: found.fallbackFrom === undefined ? 'exact' : 'lower', profile: found.id, version: asked }
}

/**
 * What stops Publish: the platforms of the card whose release has NO contract. Publishing is what Tracy
 * offers to customers, a different act from what an agent may do on a site (ADR 0022, addendum 04/10/2026),
 * so a card is not put on Design inspiration until each Joomla/WordPress release of it has a contract.
 * EmDash has nothing to bind (`not-applicable`) and a lower profile only warns (`contractWarnings`).
 * @param {{platform: string, tag: string, version?: string | null}[]} builds
 * @param {import('./contracts.js').ContractIndex} contracts
 * @returns {{ platform: string, tag: string }[]}
 */
export function contractBlockers(builds, contracts) {
  return builds
    .filter((build) => contractStatus(build, contracts).state === 'none')
    .map((build) => ({ platform: build.platform, tag: build.tag }))
}

/**
 * The next step a staff member can act on, for the NO_CONTRACT refusal Publish answers with.
 *
 * 🔒 IT NAMES THE WAY THE DOCS GIVE, NEVER `batch-contracts.mjs --only`. That tool only sees releases
 * that carry a card file without the hidden mark, so it can never capture a template that was never
 * published, and a never published template is exactly the one this refusal is said about. The
 * contract is read from the profile tree inside this server's image, so it shows only after the tch
 * PR merges to develop and CI deploys this server.
 * @param {({ tag: string } | string)[]} blockers
 */
export function contractRefusalText(blockers) {
  const tags = blockers.map((b) => (typeof b === 'string' ? b : b.tag)).join(', ')
  return (
    `Not published: ${tags} has no content contract yet. Every Joomla and WordPress release of this template needs one before its listing is offered. ` +
    'Make it in the tch repo (JA Joomla T3 or T4: the quickstart-contract skill; WordPress: packages/cms/tracy-wordpress-quickstart/contracts), ' +
    'merge it to develop, and publish again once CI has deployed this server. Road to live, step 3, lists every step.'
  )
}

/**
 * The cautions Publish answers with, one per platform of the card that is served by a lower profile. A
 * platform with no contract at all never gets here: Publish refuses it first (`contractBlockers`).
 * @param {{platform: string, tag: string, version?: string | null}[]} builds
 * @param {import('./contracts.js').ContractIndex} contracts
 * @returns {{ code: 'LOWER_CONTRACT', platform: string, tag: string, text: string }[]}
 */
export function contractWarnings(builds, contracts) {
  const warnings = []
  for (const build of builds) {
    const status = contractStatus(build, contracts)
    if (status.state === 'lower')
      warnings.push({
        code: 'LOWER_CONTRACT',
        platform: build.platform,
        tag: build.tag,
        text: `${build.tag} uses the content contract made for ${status.profile}. It is not tested on ${status.version} yet.`
      })
  }
  return warnings
}
