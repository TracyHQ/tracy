/**
 * The road to live: the eleven steps one release walks before customers can pick it on Design
 * inspiration, in the order they FINISH (not the order they start: several run side by side).
 *
 *   release → install-file → contract → content-coverage → template-kit → customize → design-system → demo
 *   → listing → published → polish
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
 *     docs too, which only the joomlart-products source can tell), and a demo made before it would sit on
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
 *   - Template kit waits for the contract too: the kit (screenshots of every page and block at 1440 and 390, a per
 *     page summary of the content map, a version stamp) is committed as `template-kit.json` beside it
 *     (`template-kit/road-step.js`). A kit that is missing, of another version, incomplete, or not approved on the
 *     images it lists holds Publish; a release already published only warns. A template that
 *     `template-kit/demo-baseline-policy.json` opts in (JA Boxing) also needs `demo-baseline.json` of this version beside
 *     the contract, measured at step 0 on the untouched quickstart site;
 *   - Publish needs the release, the install file, the listing, the contract, Content coverage, Template kit,
 *     Customize your site and Design system, never a demo (a warning never takes a card off, 04/10/2026); the one
 *     exception is Design system's DEMO-1 (14/10/2026: must-fix): with no demo the preview door has
 *     nothing to dress, so the Add site panel offers no Design system picker at all. It adds no new
 *     wait: Publish already waits on the listing and the listing on a live demo, so a release that can
 *     publish has a demo anyway, and DEMO-1 only names the gap on the Design system step;
 *   - polish waits for nothing and holds nothing.
 */
import { contractRefusalText } from './brief-support.js'
import { COVERAGE_STEP, contentCoverageRefusal } from './content-coverage/road-step.js'
import { cardRefusal, cardWarnings, notShownWhy } from './design-inspiration.js'
import { listingProblems } from './listing-pages.js'
import { cardOf, shownOnInspiration } from './quickstart-releases.js'
import { KIT_STEP, templateKitRefusal } from './template-kit/road-step.js'
import { startRoad, verdictSteps } from './template-readiness/verdict.js'

export const ROAD_STEPS = Object.freeze([
  'release',
  'install-file',
  'contract',
  'content-coverage',
  'template-kit',
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
  'template-kit',
  'customize',
  'design-system'
])

/** Card warnings that belong to an earlier step than polish: they are said there instead. */
const DEMO_CODES = new Set(['no-demo', 'demo-failed', 'demo-version'])
const INSTALL_CODES = new Set(['asset-missing', 'template-not-an-id'])

const passed = (s) => s.state === 'done' || s.state === 'warn'
const list = (/** @type {unknown} */ x) => (Array.isArray(x) ? x.join(', ') : '')

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
 *   fit?: import('./content-coverage/fit.js').Fit,
 *   templateKit?: import('./template-kit/reader.js').Kit,
 *   kitMap?: import('./template-kit/flow-reads.js').KitMap | null
 * }} world this server's live demo of the release, its failed demo job, the pictures it holds,
 *   the contract index, every choosable release of the same template (the door asks a contract of
 *   each of them), and the stored Customize your site and Design system checks of this release's version.
 *   `coverage`: the content coverage of the sealing contract; read from its folder when left out.
 *   `roles`: its slot roles, the third group of Content coverage; read the same way when left out.
 *   `fit`: the Slot fit of its content map, the fourth group (ADR 0039); read the same way when left out.
 *   `templateKit`: the template kit beside the sealing contract; read from its folder when left out.
 *   `kitMap`: what the flow reads of the content map beside that kit; read from the same folder when left out.
 *   `demoBaseline`: the demo baseline beside that contract (`demo-baseline.json`), which the Template kit step asks of
 *   the templates `template-kit/demo-baseline-policy.json` opts in; read from the same folder when left out.
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
    fit = undefined,
    templateKit = undefined,
    kitMap = undefined,
    demoBaseline = undefined
  }
) {
  if (!release || release.kind === 'design-pack') return null
  const at = startRoad()
  const { road, put, waitingOn } = at

  // What the card would warn about, with the world as it is: routed to the step that fixes it.
  const warnings = cardOf(release) ? cardWarnings(release, { demo, failed, has }) : []

  // 1–5. The release, its install file, the contract, Content coverage, Template kit, Customize your site and Design
  // system: the steps the template readiness verdict judges, built once there (`template-readiness/verdict.js`).
  const { version, own } = verdictSteps(
    release,
    {
      demo,
      contracts,
      siblings,
      readiness,
      dsReadiness,
      dsSeverity,
      doorHealth,
      coverage,
      roles,
      fit,
      templateKit,
      kitMap,
      demoBaseline
    },
    at
  )

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
    if (published.blockedBy === 'install-file' && by?.code === 'install-file-sha-mismatch')
      return {
        error: 'NOT_A_CARD',
        reason: `The install file pins a sha256 that GitHub does not state for ${list(by.params.files)}: a build would refuse the download. Attach the files the install file names, or write their sha256 into it again.`
      }
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
    if (published.blockedBy === KIT_STEP) return templateKitRefusal(by)
    if (published.blockedBy === 'customize') return customizeRefusal(by)
    if (published.blockedBy === 'design-system') return designSystemRefusal(by)
  }
  if (published.code === 'not-showable')
    return { error: 'NOT_SHOWABLE', reason: String(published.params.why) }
  return null
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
