/**
 * The first three Road to live steps of one release, moved here from `road-to-live.js` unchanged so the template
 * readiness verdict (`verdict.js`) and Road to live build them once:
 *
 *   release        the release on GitHub: a draft cannot be installed by anything;
 *   install-file   tracy_setting.json, judged by `cardRefusal` (the door's NOT_A_CARD), then the files it names
 *                  against the assets GitHub lists and the sha256 GitHub states for them;
 *   contract       the content contract sealing this version, asked of this release and of every other
 *                  choosable release of the template (`contractStatus`, the door's NO_CONTRACT).
 *
 * A release row whose asset list is not known (`assets` not an array: a release read from the quickstart list pin
 * rather than from GitHub, `pinned-release.js`) is not judged on missing files; every row GitHub gives has a list.
 */
import { contractStatus } from '../brief-support.js'
import { cardRefusal } from '../design-inspiration.js'
import {
  DESIGN_INSPIRATION_FILE,
  DESIGN_INSPIRATION_HIDDEN_FILE,
  shownOnInspiration
} from '../quickstart-releases.js'

/**
 * `quickstart/ja-nova/j6` → `ja-nova`, `tracy-base/wp7` → `tracy-base`: the segment before the cut,
 * the folder a content contract lives under.
 */
const slugOf = (tag) => tag.split('/').at(-2) ?? tag

/**
 * Which way the quickstart-contract skill goes for this release (`SKILL.md` §2): an installer
 * release takes the full path (a new version is cut, its install file switched on after the
 * merge); a captured package (webroot + database) is captured directly, on the same version. A
 * captured package without the agent docs also takes the full path, which the release cannot tell.
 */
const contractPathOf = (setting) =>
  setting?.install && typeof setting.install === 'object' && 'installer' in setting.install
    ? 'full'
    : 'direct'

/**
 * How `batch-contracts.mjs capture --only <slug>` can capture this release, or null when it cannot,
 * in the order `selectCards` decides: a Joomla or WordPress release that is not a draft and does not
 * carry the hidden mark, with either a card file (`card`) or, with no card file, its
 * tracy_setting.json and named with `--without-card <tag>` (`without-card`: a contract comes before
 * the card). A release with the hidden mark is excluded as `card hidden` whether or not it carries a
 * card, `--without-card` or not.
 * @returns {'card' | 'without-card' | null}
 */
function batchScopeOf(release) {
  if (release.platform !== 'joomla' && release.platform !== 'wordpress') return null
  if (release.github === 'draft') return null
  const names = new Set((release.assets ?? []).map((a) => a?.name))
  if (names.has(DESIGN_INSPIRATION_HIDDEN_FILE)) return null
  if (names.has(DESIGN_INSPIRATION_FILE)) return 'card'
  return release.setting ? 'without-card' : null
}

/**
 * The install parts whose sha256 differs from the digest GitHub states for the asset of that name (`sha256:<hex>`,
 * stated since 2025). A part or an asset without one is not judged: nothing can be compared.
 * @returns {string[]}
 */
function installDigestsDiffering(release) {
  const install = release.setting?.install
  if (release.local || !install || typeof install !== 'object') return []
  const stated = new Map(
    (release.assets ?? [])
      .filter((a) => typeof a?.digest === 'string' && a.digest.startsWith('sha256:'))
      .map((a) => [a.name, a.digest.slice('sha256:'.length).toLowerCase()])
  )
  const out = []
  for (const part of Object.values(install)) {
    const { file, sha256 } = /** @type {any} */ (part) ?? {}
    if (typeof file !== 'string' || typeof sha256 !== 'string' || !stated.has(file)) continue
    if (stated.get(file) !== sha256.toLowerCase()) out.push(file)
  }
  return out
}

/**
 * Put the release, install-file and contract steps of `release` on the road.
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, contracts: import('../contracts.js').ContractIndex, siblings?: { platform: string, tag: string, version?: string | null }[] }} input
 * @returns {{ version: string | null, own: ReturnType<typeof contractStatus> }} the version the release carries and its contract status
 */
export function releaseSteps(put, waitingOn, { release, contracts, siblings = [] }) {
  const setting = release.setting
  const version = typeof setting?.version === 'string' ? setting.version : null

  // 1. The release on GitHub: a draft cannot be installed by anything.
  if (release.github === 'draft') put('release', 'todo', 'release-draft')
  else put('release', 'done', 'release-published', { github: release.github })

  // 2. The install file, judged by `cardRefusal` (the door's NOT_A_CARD) in its own order.
  const refusal = release.github === 'draft' ? null : cardRefusal(release)
  if (refusal !== null) {
    if (!setting || release.tracy === 'no-setting') put('install-file', 'todo', 'no-install-file')
    else if (release.tracy !== 'ready')
      put('install-file', 'todo', 'install-file-invalid', { reason: release.reason ?? null })
    else if (typeof setting.template !== 'string' || setting.template === '')
      put('install-file', 'todo', 'no-template')
    else put('install-file', 'todo', 'template-not-an-id', { template: setting.template })
  } else {
    // The files a build downloads, against the assets GitHub lists (`cardWarnings` asks the same).
    const missing = []
    // A row whose asset list is not known (`assets: null`, read from the pin) is not judged on it.
    const listed = release.assets === undefined || Array.isArray(release.assets)
    if (listed && !release.local && setting?.install && typeof setting.install === 'object') {
      const names = new Set((release.assets ?? []).map((a) => a?.name))
      for (const part of Object.values(setting.install)) {
        const file = /** @type {any} */ (part)?.file
        if (typeof file === 'string' && file !== '' && !names.has(file)) missing.push(file)
      }
    }
    // The host downloads each part and refuses bytes whose sha256 is not the one the install file pins
    // (`quickstart.py`): a part GitHub states another digest for cannot be installed.
    const differing = installDigestsDiffering(release)
    if (missing.length > 0) put('install-file', 'warn', 'asset-missing', { files: missing })
    else if (differing.length > 0)
      put('install-file', shownOnInspiration(release) ? 'warn' : 'todo', 'install-file-sha-mismatch', {
        version,
        files: differing,
        reason: `GitHub states another sha256 for ${differing.join(', ')} than the install file pins`
      })
    else put('install-file', 'done', 'install-file-ready', { version })
  }

  // 3. The content contract, from the same `contractStatus` the door's NO_CONTRACT reads, asked of
  // this release and of every other choosable release of the template.
  const own = contractStatus({ platform: release.platform, tag: release.tag, version }, contracts)
  const missingSiblings = siblings.filter(
    (b) => b.tag !== release.tag && contractStatus(b, contracts).state === 'none'
  )
  const others = missingSiblings.map((b) => b.tag)
  // It waits for the install file alone (the draft release before it holds that one too).
  const contractWait = waitingOn(['release', 'install-file'])
  const path = contractPathOf(setting)
  if (own.state === 'not-applicable' && others.length === 0) put('contract', 'done', 'contract-not-needed')
  else if (own.state === 'none') {
    const batch = batchScopeOf(release)
    const params = {
      platform: release.platform,
      slug: slugOf(release.tag),
      version,
      tags: [release.tag, ...others],
      path,
      batchInScope: batch !== null,
      batchWithoutCard: batch === 'without-card'
    }
    if (contractWait) put('contract', 'blocked', 'no-contract', params, contractWait)
    else put('contract', 'todo', 'no-contract', params)
  } else if (others.length > 0)
    // `missing` carries each one's platform and version, so the guide can word the work for THAT
    // release rather than for this one.
    put('contract', 'todo', 'sibling-no-contract', {
      tags: others,
      missing: missingSiblings.map((b) => ({ tag: b.tag, platform: b.platform, version: b.version ?? null }))
    })
  else if (own.state === 'lower')
    put('contract', 'warn', 'contract-lower', { profile: own.profile, version, path })
  else if (own.state === 'exact') put('contract', 'done', 'contract-exact', { profile: own.profile })
  else put('contract', 'done', 'contract-not-needed')
  return { version, own }
}
