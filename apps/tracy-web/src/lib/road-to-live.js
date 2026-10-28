/**
 * The road to live: the ten steps one release walks before customers can pick it on Design
 * inspiration, in the order they FINISH (not the order they start: several run side by side).
 *
 *   release → install-file → contract → content-coverage → customize → design-system → demo → listing
 *   → published → polish
 *
 * 🔒 ONE ROAD FOR THE SCREEN AND THE DOOR. Each step is decided by the very functions the publish
 * door and the listing already use (`cardRefusal`, `cardOf`/`shownOnInspiration`, `contractStatus`,
 * `cardWarnings`, `notShownWhy`), and the door's refusal is read off this road
 * (`publishRefusalOf`): the first step Publish needs that is not done. So the Templates page cannot
 * say "ready" while the door refuses, and cannot list a reason the door does not hold.
 *
 * A step is `{ step, state, code, params, blockedBy? }`:
 *   - `done`: nothing left here; `warn`: done, with something worth fixing (a lower contract, a
 *     demo on another version, pictures missing);
 *   - `todo`: the next thing to do on this step, and it can be done now;
 *   - `blocked`: not done, and waiting for an earlier step, named by `blockedBy`;
 *   - `checking`: the Customize your site or Design system check of this release is still running
 *     (those two steps only).
 * `code` + `params` say what the step is about, for a reader that words it (the page's guide table
 * keyed by `code`); no sentence is parsed anywhere.
 *
 * 🔒 THE RECOMMENDED ORDER, NOT ONLY THE DOORS' (11/10/2026: the panel gives the single best
 * advice, not options). Each step waits for what its door needs, plus what makes its work last:
 *   - the contract waits for the install file alone. It is the long pole (the quickstart-contract
 *     skill, a claude-cowork release, the Tracy pin, a PR, a CI deploy), so it starts at once;
 *   - the demo waits for this release's own contract while there is none (`no-contract`): the
 *     skill may cut a NEW version (an installer release always, a captured pack without the agent
 *     docs too, which only the ja-products source can tell), and a demo made before it would sit on
 *     the old one. A live demo is kept: if the contract brings a new version, `demo-version` says so;
 *   - the listing waits for a live demo: Create listing fills the form and takes the pictures from
 *     it. A saved listing stays done even if the demo later goes down;
 *   - Customize your site waits for the contract: the readiness check reads it (ADR 0029). Its
 *     must-fix rules hold Publish; its worth-fixing rules only warn. A release already published is
 *     never taken off by it: the step only warns there (ADR 0029 §4, 1A 08/10/2026);
 *   - Design system waits for the install file alone: its check reads the template's stylesheets and
 *     the slot contract (`packages/design/tracy-ds-slot/templates/`), never the content contract
 *     (ADR 0031). Like Customize your site, its must-fix rules hold Publish, its worth-fixing rules
 *     only warn, and a release already published only warns;
 *   - Content coverage waits for the contract: the audit measures that contract on a built site and
 *     commits `content-coverage.json` beside it (`content-coverage/road-step.js`, owner 24/10/2026).
 *     Unexplained holes, slot roles missing from the content map (ADR 0038), and on Joomla a content map
 *     without Slot fit (ADR 0039), hold Publish; a release already published only warns;
 *   - Publish needs the release, the install file, the listing, the contract, Content coverage,
 *     Customize your site and Design system, never a demo (a warning never takes a card off, 04/10/2026); the one
 *     exception is Design system's DEMO-1 (14/10/2026: must-fix): with no demo the preview door has
 *     nothing to dress, so the Add site panel offers no Design system picker at all. It adds no new
 *     wait: Publish already waits on the listing and the listing on a live demo, so a release that can
 *     publish has a demo anyway, and DEMO-1 only names the gap on the Design system step;
 *   - polish waits for nothing and holds nothing.
 */
import { contractRefusalText, contractStatus } from './brief-support.js'
import {
  COVERAGE_STEP,
  contentCoverageRefusal,
  contentCoverageStep,
  coverageOfRelease
} from './content-coverage/road-step.js'
import { fitOfRelease } from './content-coverage/fit.js'
import { rolesOfRelease } from './content-coverage/roles.js'
import { cardRefusal, cardWarnings, notShownWhy } from './design-inspiration.js'
import { listingProblems } from './listing-pages.js'
import { previewDemoGap } from './preview-demo.js'
import {
  cardOf,
  DESIGN_INSPIRATION_FILE,
  DESIGN_INSPIRATION_HIDDEN_FILE,
  shownOnInspiration
} from './quickstart-releases.js'
import { summarizeReadiness } from './template-customization-question-readiness/severity.js'
import { summarizeDsReadiness } from './template-design-system-readiness/severity.js'

export const ROAD_STEPS = Object.freeze([
  'release',
  'install-file',
  'contract',
  'content-coverage',
  'customize',
  'design-system',
  'demo',
  'listing',
  'published',
  'polish'
])

/** The steps Publish needs done (or warned), in road order; the first one not done is the refusal. */
const PUBLISH_NEEDS = Object.freeze([
  'release',
  'install-file',
  'listing',
  'contract',
  'content-coverage',
  'customize',
  'design-system'
])

/** Card warnings that belong to an earlier step than polish: they are said there instead. */
const DEMO_CODES = new Set(['no-demo', 'demo-failed', 'demo-version'])
const INSTALL_CODES = new Set(['asset-missing', 'template-not-an-id'])

const passed = (s) => s.state === 'done' || s.state === 'warn'

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
 * The road of one release, or null for a design pack (it is never offered on Design inspiration,
 * so it has no road to walk).
 * @param {any} release one row of `readReleases`
 * @param {{
 *   demo?: { url: string, version?: string | null } | null,
 *   failed?: { reason: string | null, step?: string | null, version?: string | null } | null,
 *   has?: (file: string) => boolean,
 *   contracts: import('./contracts.js').ContractIndex,
 *   siblings?: { platform: string, tag: string, version?: string | null }[],
 *   readiness?: import('./customize-readiness.js').Readiness | null,
 *   dsReadiness?: import('./customize-readiness.js').Readiness | null,
 *   doorHealth?: { checkedAt: number, assets: number, failed: { path: string, status: number }[] } | null,
 *   coverage?: import('./content-coverage/reader.js').Coverage,
 *   roles?: import('./content-coverage/roles.js').Roles,
 *   fit?: import('./content-coverage/fit.js').Fit
 * }} world this server's live demo of the release, its failed demo job, the pictures it holds,
 *   the contract index, every choosable release of the same template (the door asks a contract of
 *   each of them), and the stored Customize your site and Design system checks of this release's version.
 *   `coverage`: the content coverage of the sealing contract; read from its folder when left out.
 *   `roles`: its slot roles, the third group of Content coverage; read the same way when left out.
 *   `fit`: the Slot fit of its content map, the fourth group (ADR 0039); read the same way when left out.
 * @returns {{ step: string, state: 'done' | 'blocked' | 'todo' | 'warn' | 'checking', code: string, params: Record<string, unknown>, blockedBy?: string }[] | null}
 */
export function roadOf(
  release,
  {
    demo = null,
    failed = null,
    has = () => false,
    contracts,
    siblings = [],
    readiness = null,
    dsReadiness = null,
    dsSeverity = undefined,
    doorHealth = null,
    coverage = undefined,
    roles = undefined,
    fit = undefined
  }
) {
  if (!release || release.kind === 'design-pack') return null
  const road = []
  const put = (step, state, code, params = {}, blockedBy = undefined) => {
    const s = { step, state, code, params }
    if (blockedBy) s.blockedBy = blockedBy
    road.push(s)
    return s
  }
  /** The first of `steps` not passed yet, or undefined. */
  const waitingOn = (steps) =>
    steps.map((n) => road.find((s) => s.step === n)).find((s) => s && !passed(s))?.step

  // What the card would warn about, with the world as it is: routed to the step that fixes it.
  const warnings = cardOf(release) ? cardWarnings(release, { demo, failed, has }) : []
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
    if (!release.local && setting?.install && typeof setting.install === 'object') {
      const names = new Set((release.assets ?? []).map((a) => a?.name))
      for (const part of Object.values(setting.install)) {
        const file = /** @type {any} */ (part)?.file
        if (typeof file === 'string' && file !== '' && !names.has(file)) missing.push(file)
      }
    }
    if (missing.length > 0) put('install-file', 'warn', 'asset-missing', { files: missing })
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

  // 3b. Content coverage: the committed measurement of the contract that seals this version, and its slot roles
  // (ADR 0038: the third group of the step).
  contentCoverageStep(put, waitingOn, {
    release,
    version,
    contractId: own.profile,
    coverage: coverage ?? coverageOfRelease(release, contracts),
    roles: roles ?? rolesOfRelease(release, contracts),
    fit: fit ?? fitOfRelease(release, contracts)
  })

  // 4. Customize your site: the stored readiness check of this version (see the 🔒 above).
  customizeStep(put, waitingOn, { release, version, readiness })

  // 5. Design system: the stored Template Design System Readiness check of this version (ADR 0031).
  designSystemStep(put, waitingOn, {
    release,
    version,
    readiness: dsReadiness,
    severity: dsSeverity,
    previewGap: previewDemoGap(demo),
    doorHealth
  })

  // 6. The demo on this server. A live one counts whatever came before; otherwise installing it
  // needs a release Tracy can build from.
  if (demo) {
    if (typeof demo.version === 'string' && version !== null && demo.version !== version)
      put('demo', 'warn', 'demo-version', { url: demo.url, demoVersion: demo.version, version })
    else put('demo', 'done', 'demo-live', { url: demo.url, version: demo.version ?? null })
  } else {
    // A contract still to make may cut a new version, so the demo waits for it (see the 🔒 above).
    const wait = waitingOn(['release', 'install-file']) ?? (own.state === 'none' ? 'contract' : undefined)
    const [code, params] = failed
      ? [
          'demo-failed',
          {
            reason: failed.reason ?? null,
            step: failed.step ?? null,
            version: failed.version ?? null,
            releaseVersion: version
          }
        ]
      : ['no-demo', {}]
    if (wait) put('demo', 'blocked', code, params, wait)
    else put('demo', 'todo', code, params)
  }

  // 7. The listing: saved on the release (hidden or shown), else waiting for what the Save door
  // needs (`cardRefusal`), then for a live demo (Create listing reads it; see the 🔒 above).
  // A saved listing is done only when it covers the release's top-level pages (`listing-pages.js`,
  // the set Create listing drafts), carries no page a listing may not show (Login, a 404, `/ru`,
  // a legal page) and has a desktop picture of every page. A published one that falls short only
  // warns: the road never takes a card off, nor holds a card customers already see.
  const card = cardOf(release)
  if (card) {
    const hidden = release.inspirationHidden === true
    const layouts = Array.isArray(card.layouts) ? card.layouts : []
    const { missing, forbidden } = listingProblems(release, card)
    const noDesktop = layouts.filter(
      (l) => typeof l?.shots?.desktop !== 'string' || l.shots.desktop === ''
    ).length
    if (missing.length === 0 && forbidden.length === 0 && noDesktop === 0)
      put('listing', 'done', 'listing-saved', { hidden })
    else
      put('listing', shownOnInspiration(release) ? 'warn' : 'todo', 'listing-incomplete', {
        hidden,
        missing,
        forbidden,
        noDesktop,
        pages: layouts.length
      })
  } else {
    const wait = waitingOn(['release', 'install-file']) ?? (demo === null ? 'demo' : undefined)
    const params = { demo: demo !== null }
    if (wait) put('listing', 'blocked', 'no-listing', params, wait)
    else put('listing', 'todo', 'no-listing', params)
  }

  // 8. Published: what customers see, `shownOnInspiration`, the rule `GET /api/templates` answers.
  if (shownOnInspiration(release)) put('published', 'done', 'published')
  else {
    const wait = waitingOn(PUBLISH_NEEDS)
    // `waiting`: EVERY step Publish still needs, in road order, so a reader never says "waiting
    // for step 5" while step 3 is missing too. `blockedBy` stays the door's first refusal.
    const waiting = ROAD_STEPS.filter((n) => {
      const s = road.find((x) => x.step === n)
      return PUBLISH_NEEDS.includes(n) && s && !passed(s)
    })
    if (wait) put('published', 'blocked', 'not-published', { waiting }, wait)
    else {
      const why = notShownWhy({ ...release, inspirationHidden: false })
      if (why) put('published', 'todo', 'not-showable', { why })
      else put('published', 'todo', 'ready-to-publish')
    }
  }

  // 9. Polish: what the card lacks once it exists, plus the pages file the Pages question reads.
  // It waits for nothing and holds nothing: tracy_site_pages.json can be attached at any time.
  const items = warnings
    .filter((w) => !DEMO_CODES.has(w.code) && !INSTALL_CODES.has(w.code))
    .map(({ code, params, text }) => ({ code, params, text }))
  if (!Array.isArray(release.pages))
    items.push({
      code: 'no-pages-file',
      params: {},
      text: 'The release has no tracy_site_pages.json, so the Pages question keeps every page'
    })
  if (items.length > 0) put('polish', 'warn', 'polish', { items })
  else put('polish', 'done', 'polish-done')
  return road
}

/**
 * Why the publish door refuses this release, read off its road: the first step Publish needs that
 * is not done, in the door's own error codes. Null when Publish may go ahead.
 * @param {ReturnType<typeof roadOf>} road
 * @param {any} release the same row the road was built from
 * @returns {{ error: string, reason: string, tags?: string[] } | null}
 */
export function publishRefusalOf(road, release) {
  if (!road)
    return { error: 'NOT_A_CARD', reason: cardRefusal(release) ?? 'This release has no road to live.' }
  const published = road.find((s) => s.step === 'published')
  if (!published || published.state === 'done') return null
  if (published.state === 'blocked') {
    const by = road.find((s) => s.step === published.blockedBy)
    if (published.blockedBy === 'release' || published.blockedBy === 'install-file')
      return { error: 'NOT_A_CARD', reason: cardRefusal(release) ?? 'This release cannot be a listing.' }
    if (published.blockedBy === 'listing' && by?.code === 'listing-incomplete')
      return { error: 'LISTING_INCOMPLETE', reason: listingIncompleteText(by.params) }
    if (published.blockedBy === 'listing')
      return { error: 'NO_CARD', reason: 'Save a listing first: this release carries none.' }
    if (published.blockedBy === 'contract') {
      const tags = /** @type {string[]} */ (by?.params?.tags ?? [release.tag])
      return { error: 'NO_CONTRACT', tags, reason: contractRefusalText(tags) }
    }
    if (published.blockedBy === COVERAGE_STEP) return contentCoverageRefusal(by)
    if (published.blockedBy === 'customize') return customizeRefusal(by)
    if (published.blockedBy === 'design-system') return designSystemRefusal(by)
  }
  if (published.code === 'not-showable')
    return { error: 'NOT_SHOWABLE', reason: String(published.params.why) }
  return null
}

/**
 * The Customize your site step, from the stored check of this release's own version.
 *
 *   blocked   the contract is not passed yet (the check reads it);
 *   checking  the check is queued or running;
 *   todo      must-fix rules remain, the check could not run, nothing has checked this version, or
 *             a rule could not read the evidence it needs (`not-checked`: the Claude Cowork plugin a
 *             new site gets could not be read, or what it was read for changed since);
 *   warn      only worth-fixing rules remain, or a published release fails must-fix rules or has a
 *             rule not checked (it is never taken off for it, so the step only warns there);
 *   done      every rule the check could decide passes.
 * `params` always carries `passed`, `total`, `mustFix` and `worthFixing` (zero and empty before a
 * result exists), plus `version` and, once checked, `checkedAt`; `rechecking: true` while a release
 * that has a result is checked again (the state stays the last result's, so Publish is neither newly
 * held nor newly let through by a re-check).
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, readiness: any }} input the release, its version, its stored check
 */
function customizeStep(put, waitingOn, { release, version, readiness }) {
  const own = readiness && (readiness.version ?? null) === version ? readiness : null
  const summary = own?.state === 'done' ? summarizeReadiness(own.report) : summarizeReadiness(null)
  const params = {
    ...summary,
    version,
    ...(own?.checkedAt ? { checkedAt: own.checkedAt } : {}),
    // Judged again in the background (new rules, a new profile row…): the last result below stands,
    // for the screen and for Publish, until the new one lands.
    ...(own?.recheckingSince && own.state !== 'checking' ? { rechecking: true } : {})
  }
  const live = shownOnInspiration(release)
  const wait = live ? undefined : waitingOn(['release', 'install-file', 'contract'])
  if (wait) return put('customize', 'blocked', 'customize-waiting', params, wait)
  if (!own) return put('customize', 'todo', 'customize-not-checked', params)
  if (own.state === 'checking') return put('customize', 'checking', 'customize-checking', params)
  if (own.state !== 'done')
    return put('customize', 'todo', 'customize-error', { ...params, reason: own.reason ?? null })
  if (summary.mustFix.length > 0)
    return live
      ? put('customize', 'warn', 'customize-live-failing', params)
      : put('customize', 'todo', 'customize-must-fix', params)
  // Nobody knows these pass, so a new Publish waits for them like a must-fix (25/10/2026).
  if (summary.notChecked.length > 0)
    return live
      ? put('customize', 'warn', 'customize-live-unchecked', params)
      : put('customize', 'todo', 'customize-unchecked', params)
  if (summary.worthFixing.length > 0) return put('customize', 'warn', 'customize-worth-fixing', params)
  return put('customize', 'done', 'customize-ready', params)
}

/**
 * The door's refusal while Customize your site holds Publish, in its own code, with the must-fix
 * rules it waits for.
 * @param {any} step the customize step of the road
 */
function customizeRefusal(step) {
  const p = step?.params ?? {}
  const unchecked = step?.code === 'customize-unchecked'
  const rules = (
    Array.isArray(unchecked ? p.notChecked : p.mustFix) ? (unchecked ? p.notChecked : p.mustFix) : []
  ).map((/** @type {any} */ m) => m.rule)
  const reason = unchecked
    ? `Customize your site: ${rules.join(', ')} not checked (${String(p.notChecked?.[0]?.message ?? 'the evidence could not be read')}). Press Check again once it can be read.`
    : step?.code === 'customize-must-fix'
      ? `Customize your site: ${rules.length} must-fix rule${rules.length === 1 ? '' : 's'} left (${rules.join(', ')}). Fix them in the template, release it again, then press Check again.`
      : step?.code === 'customize-checking'
        ? 'Customize your site is still being checked. Publish once the check is done.'
        : step?.code === 'customize-error'
          ? `Customize your site could not be checked: ${String(p.reason ?? 'no reason given')}. Press Check again.`
          : 'Customize your site has not been checked for this version. Press Check again.'
  return { error: 'CUSTOMIZE_NOT_READY', reason, rules }
}

/**
 * The Design system step (ADR 0031), from the stored Template Design System Readiness check of this
 * release's own version, in the states and with the params of the Customize your site step:
 *
 *   blocked   the install file is not passed yet (the check reads the template's files);
 *   checking  the check is queued or running;
 *   todo      not measured at the current preview probe (`ds-not-at-probe`, shown alone, no grade),
 *             must-fix rules remain, the check could not run, nothing has checked this version, or
 *             (phase 2, `rule-severity.json` `unmeasured`) a built-site rule has no measurement file;
 *   warn      only worth-fixing rules remain, a built-site rule is not measured yet (phase 1), or a
 *             published release fails must-fix rules;
 *   done      every rule the check could decide passes.
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, readiness: any, severity?: import('./template-design-system-readiness/severity.js').DsSeverity, previewGap?: 'NO_DEMO' | 'NO_SLOT' | null }} input
 *   `previewGap`: why the Add site preview door would find no demo of this release, null when it has one (DEMO-1)
 */
function designSystemStep(put, waitingOn, { release, version, readiness, severity, previewGap, doorHealth }) {
  const own = readiness && (readiness.version ?? null) === version ? readiness : null
  const summary =
    own?.state === 'done'
      ? summarizeDsReadiness(own.report, severity, { previewGap, doorHealth })
      : summarizeDsReadiness(null, severity)
  const params = {
    ...summary,
    version,
    ...(own?.checkedAt ? { checkedAt: own.checkedAt } : {}),
    ...(own?.recheckingSince && own.state !== 'checking' ? { rechecking: true } : {})
  }
  const live = shownOnInspiration(release)
  const wait = live ? undefined : waitingOn(['release', 'install-file'])
  if (wait) return put('design-system', 'blocked', 'ds-waiting', params, wait)
  if (!own) return put('design-system', 'todo', 'ds-not-checked', params)
  if (own.state === 'checking') return put('design-system', 'checking', 'ds-checking', params)
  if (own.state !== 'done')
    return put('design-system', 'todo', 'ds-error', { ...params, reason: own.reason ?? null })
  // no measurement at the current preview probe: that alone, and Publish waits for it (never ds-ready)
  if (summary.notAtProbe) return put('design-system', live ? 'warn' : 'todo', 'ds-not-at-probe', params)
  if (summary.mustFix.length > 0)
    return live
      ? put('design-system', 'warn', 'ds-live-failing', params)
      : put('design-system', 'todo', 'ds-must-fix', params)
  // "Not measured yet" (spec decision 11): never a pass; it holds Publish only once the file says so
  if (summary.unmeasured.length > 0)
    return summary.unmeasuredHolds && !live
      ? put('design-system', 'todo', 'ds-not-measured', params)
      : put('design-system', 'warn', 'ds-not-measured', params)
  if (summary.worthFixing.length > 0) return put('design-system', 'warn', 'ds-worth-fixing', params)
  return put('design-system', 'done', 'ds-ready', params)
}

/**
 * The extra sentence of the refusal when must-fix rules are preview rules not measured yet
 * (`unmeasuredPreview` in `rule-severity.json`): what brings the measurement.
 * @param {Record<string, unknown>} p the design-system step's params
 */
function previewUnmeasuredText(p) {
  const held = (Array.isArray(p.mustFix) ? p.mustFix : []).filter(
    (/** @type {any} */ m) => m?.unmeasured === true
  )
  if (held.length === 0) return ''
  return ` ${held.map((/** @type {any} */ m) => m.rule).join(', ')} ${held.length === 1 ? 'is' : 'are'} not measured on the Add site preview yet: measure it with apps/tracy-web/scripts/preview-check.mjs and bring design-system-measurement.json with the release.`
}

/**
 * The door's refusal while Design system holds Publish, with the must-fix rules it waits for.
 * @param {any} step the design-system step of the road
 */
function designSystemRefusal(step) {
  const p = step?.params ?? {}
  const rules = (Array.isArray(p.mustFix) ? p.mustFix : []).map((/** @type {any} */ m) => m.rule)
  const reason =
    step?.code === 'ds-must-fix'
      ? `Design system: ${rules.length} must-fix rule${rules.length === 1 ? '' : 's'} left (${rules.join(', ')}). Fix them in the template or its slot contract, release it again, then press Check again.${previewUnmeasuredText(p)}`
      : step?.code === 'ds-not-at-probe'
        ? `Design system: ${String(p.version ?? 'this version')} is not measured with preview probe v${String(p.notAtProbe?.current ?? '')}. Measure it with the tdsr skill and commit the file it writes, then press Check again.`
        : step?.code === 'ds-not-measured'
          ? `Design system: ${(Array.isArray(p.unmeasured) ? p.unmeasured : []).length} rule${(Array.isArray(p.unmeasured) ? p.unmeasured : []).length === 1 ? '' : 's'} not measured yet on ${String(p.version ?? 'this version')}. Measure the built site with the tdsr skill and bring design-system-measurement.json with the release.`
          : step?.code === 'ds-checking'
            ? 'Design system is still being checked. Publish once the check is done.'
            : step?.code === 'ds-error'
              ? `Design system could not be checked: ${String(p.reason ?? 'no reason given')}. Press Check again.`
              : 'Design system has not been checked for this version. Press Check again.'
  return { error: 'DESIGN_SYSTEM_NOT_READY', reason, rules }
}

/**
 * Why a saved listing is not done yet, in words: the release's pages it has no tab for, then the
 * pages without a desktop picture.
 * @param {Record<string, unknown>} params the listing step's params
 */
function listingIncompleteText(params) {
  /** @param {unknown} v */
  const pagesIn = (v) => /** @type {{ label: string, path: string }[]} */ (Array.isArray(v) ? v : [])
  const words = (/** @type {{ label: string, path: string }[]} */ pages) =>
    pages.map((p) => `${p.label} (${p.path})`).join(', ')
  const missing = pagesIn(params.missing)
  const forbidden = pagesIn(params.forbidden)
  const noDesktop = Number(params.noDesktop ?? 0)
  const parts = []
  if (missing.length > 0) parts.push(`the listing has no page for ${words(missing)}, which the release lists`)
  if (forbidden.length > 0) parts.push(`remove ${words(forbidden)}, which a listing does not show`)
  if (noDesktop > 0)
    parts.push(`${String(noDesktop)} page${noDesktop === 1 ? ' has' : 's have'} no desktop picture`)
  return `Finish the listing first: ${parts.join('; ')}. Fix it in Edit listing, take the pictures, then press Update listing.`
}
