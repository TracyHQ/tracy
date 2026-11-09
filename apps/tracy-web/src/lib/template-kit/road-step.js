/**
 * The Road to live step "Template kit": is the template kit of this release (screenshots of every page and block at
 * 1440 and 390, a per page summary of the content map, a version stamp) captured for THIS quickstart version and
 * approved by a person on the very image set it lists? The text part is committed as `template-kit.json` beside the
 * contract (`reader.js`); this step is modelled on Content coverage (`../content-coverage/road-step.js`).
 *
 *   done      the kit of this version is complete and approved on the images it lists (`kit-approved`), or the step
 *             does not apply: a platform with no content map, the same platforms Content coverage judges
 *             (`kit-not-needed`);
 *   blocked   the contract is not passed yet: the kit sits beside it (`kit-waiting`);
 *   todo      no kit (`kit-missing`), unreadable (`kit-invalid`), captured for another quickstart version
 *             (`kit-stale`), without pages or blocks or a picture at either width, or with a self-check of its own
 *             above 0, or a packed 1440 shot of a page or block without a current text look (`kit-incomplete`,
 *             `missingLooks`: written by `cli.mjs looks`), with template
 *             gaps the kit measured that carry no accepted reason (`kit-gaps`, judged like the holes of Content
 *             coverage), not approved (`kit-not-approved`), or approved on another image set (`kit-approval-stale`);
 *             A kit the flow cannot use holds Publish too, whatever its pictures: a fact a flow step reads that the kit
 *             gets wrong (`flow-reads.js`: a logo spot nothing can write, an accent read from links, a menu without a
 *             navigation group, slots the content map beside it lacks, a front page without its own group, a kit the
 *             brand step refuses, no image zip on the release, and for a template `demo-baseline-policy.json` opts in no
 *             `demo-baseline.json` of this version beside the contract). Every such gap rides along as `flowGaps` on the
 *             step's params from the version check on, so the first code never hides the others;
 *   warn      the same on a release already published: it is never taken off for it, as Content coverage does; or a
 *             gap the flow only works around (`kit-setting-slot-missing`) on a kit otherwise approved.
 */

import { COVERAGE_POLICY } from '../content-coverage/judge.js'
import { shownOnInspiration } from '../quickstart-releases.js'
import { contractOfRelease } from '../slot-roles-of-release.js'
import { BASELINE_FILE } from './demo-baseline-file.js'
import { flowGapsOf } from './flow-reads.js'
import {
  imagesDigest,
  KIT_FILE,
  KIT_WIDTHS,
  kitOfContract,
  looksMissingOf,
  notShownWidthsOf,
  widthsOf
} from './reader.js'

export { kitMapOfRelease } from './flow-reads.js'

/** Kinds the kit may record that are not template gaps: an empty logo is the owner's choice, never a defect. */
const NOT_A_GAP = new Set(['logo-empty-shows-nothing-in-header'])

/** How many template gaps, and accepted ones, the step names itself. */
const SHOWN_TEMPLATE_GAPS = 8

/**
 * The template gaps of a kit (`templateGaps`: a defect the kit measured on the template, such as a page without an
 * h1, a dead link or path, a row packed to the left), split like Content coverage holes: a gap holds until it carries
 * an accepted reason at least as long as Content coverage asks of a hole.
 * @param {any} doc
 * @param {any} policy
 */
function templateGapsOf(doc, policy) {
  const all = (Array.isArray(doc.templateGaps) ? doc.templateGaps : []).filter(
    (g) => g && typeof g === 'object' && !NOT_A_GAP.has(String(g.kind))
  )
  const minReason = Number(policy.minAcceptedReasonLength ?? 12)
  const isAccepted = (g) =>
    typeof g.accepted?.reason === 'string' && g.accepted.reason.trim().length >= minReason
  const open = all.filter((g) => !isAccepted(g))
  const accepted = all.filter(isAccepted)
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const g of open) counts.set(String(g.kind), (counts.get(String(g.kind)) ?? 0) + 1)
  return {
    gaps: open.length,
    gapsByKind: [...counts]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || (a.kind < b.kind ? -1 : 1)),
    gapsShown: open.slice(0, SHOWN_TEMPLATE_GAPS).map((g) => ({
      id: String(g.id ?? ''),
      kind: String(g.kind),
      where: g.where && typeof g.where === 'object' ? g.where : null,
      detail: typeof g.detail === 'string' ? g.detail : null
    })),
    gapsAccepted: accepted.length,
    gapsAcceptedShown: accepted.slice(0, SHOWN_TEMPLATE_GAPS).map((g) => ({
      id: String(g.id ?? ''),
      kind: String(g.kind),
      reason: g.accepted.reason,
      by: typeof g.accepted.by === 'string' ? g.accepted.by : null
    }))
  }
}

export const KIT_STEP = 'template-kit'

/** How many pages or blocks without a picture the step names itself. */
const SHOWN_GAPS = 8

/**
 * What the step reads for a release when the caller does not hand it in: the kit beside the contract that seals
 * this version.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 */
export function kitOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  return kitOfContract(contractOfRelease(release, contracts))
}

/**
 * The self-checks the copy and the site check depend on, worded for /ops (2026-11-04): a kit settled before the tool cut no
 * sample, settled its sentence groups and listed inline emphasis reads as complete to everything else, and so does a kit
 * on a content map whose samples lost the demo's inline markup (`inlineMarkupLost`, measured against the demo database), and so
 * does a kit whose demo prints a button with no address, a map no slot moves or a phone outside a link (2026-11-05).
 * Named first, so the 90 characters /ops shows of the reason name them; any other counter keeps its own name.
 */
export const KIT_CHECK_LABELS = Object.freeze({
  samplesCut: 'demo samples cut',
  sentenceGroupsUnsettled: 'sentence groups not settled',
  inlineEmphasisMissing: 'inline emphasis missing',
  inlineMarkupLost: 'inline markup lost',
  // What a visitor reaches (reach-checks.mjs, 2026-11-05): a button the template prints with no address, a map no slot moves,
  // a phone number printed outside any link.
  deadControls: 'buttons with no address',
  mapLocationUnmapped: 'map stays at the demo place',
  phoneNotCallable: 'phones not callable',
  // A list mixing a lone row with card rows where a card row pairs no text slot (row-pairs.mjs, 2026-11-05): a plan cannot
  // tell which card texts go with which picture row.
  rowPartsUnpaired: 'card rows without paired texts',
  // An explanation in reach-accepts.json that matches no failure (check-accepts.mjs): a stale reason.
  checkAcceptsUnmatched: 'explanations matching nothing'
})
const checkName = (name) => KIT_CHECK_LABELS[name] ?? name
const labelledFirst = ([a], [b]) => (a in KIT_CHECK_LABELS ? 0 : 1) - (b in KIT_CHECK_LABELS ? 0 : 1)

/**
 * How many failures of each check the kit explains (`checkAccepts.<check>`: `[{where, reason, by}]`, a person's reason for
 * a failure the template keeps, from reach-accepts.json): an entry counts when its reason is not empty, and never more
 * than the check counts.
 * @param {any} doc
 * @param {string} name
 * @param {number} count
 */
function explainedOf(doc, name, count) {
  const list = doc.checkAccepts && typeof doc.checkAccepts === 'object' ? doc.checkAccepts[name] : null
  const n = (Array.isArray(list) ? list : []).filter(
    (a) => typeof a?.reason === 'string' && a.reason.trim().length > 0
  ).length
  return Math.min(n, count)
}

/**
 * The checks whose failures the kit explains, as the kit records them: the whole count and how many carry a reason.
 * @param {any} doc
 */
function checksExplainedOf(doc) {
  const checks = doc.checks && typeof doc.checks === 'object' ? doc.checks : {}
  return Object.entries(checks)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .map(([check, count]) => ({
      check,
      label: checkName(check),
      count,
      explained: explainedOf(doc, check, count)
    }))
    .filter((c) => c.explained > 0)
}

/**
 * The kit's own self-checks (`checks`: counts that must be 0 for a planner to use the kit, such as a slot listed by
 * two blocks or a showcase page left in): a kit with any of them above what it explains is incomplete. A reach or row
 * pair failure the template keeps may carry a reason (`checkAccepts`), so the check fails only on its unexplained rest;
 * the reason shows the whole count and the explained share (`buttons with no address 70 (68 explained)`). The coverage
 * gate (`checks.slotCoverage`) lists its failures in `coverage.failures` (`{part, where, reason}`); the first ones of
 * every part are named, so the failing blocks and slots show without opening the file. Null when all are 0.
 * @param {any} doc
 */
function failingChecksOf(doc) {
  const checks = doc.checks && typeof doc.checks === 'object' ? doc.checks : {}
  const failing = Object.entries(checks)
    .filter(([name, n]) => typeof n === 'number' && n - explainedOf(doc, name, n) > 0)
    .sort(labelledFirst)
  if (failing.length === 0) return null
  const failures = Array.isArray(doc.coverage?.failures) ? doc.coverage.failures : []
  // Taken part by part in turn (the first failure of each part, then the second...), so a part with hundreds of
  // failures never hides another part; every failing part is named at least once.
  const byPart = new Map()
  for (const f of failures) {
    const part = String(f?.part)
    if (!byPart.has(part)) byPart.set(part, [])
    byPart.get(part).push(f)
  }
  const turns = []
  for (let i = 0; turns.length < failures.length; i++)
    for (const list of byPart.values()) if (list[i]) turns.push(list[i])
  const named = turns
    .slice(0, Math.max(SHOWN_GAPS, byPart.size))
    .map((f) => `${String(f?.part)} ${String(f?.where)}`)
  const counted = ([name, n]) => {
    const explained = explainedOf(doc, name, n)
    return `${checkName(name)} ${n}${explained ? ` (${explained} explained)` : ''}`
  }
  return {
    reason: `its self-checks fail: ${failing.map(counted).join(', ')}${
      named.length ? ` (${named.join(', ')}${failures.length > named.length ? ', ...' : ''})` : ''
    }`,
    missing: []
  }
}

/**
 * What a kit lacks before anyone can approve it: no pages, no blocks, or a page or block without a picture at
 * one of the two widths. A block may skip a width it is not shown at (an off canvas menu, a block the template hides
 * on small or wide screens) when it lists that width in `notShownAt` and gives a non-empty `notShownBecause`; a page
 * always needs both. Null when it is complete.
 * @param {any} doc
 */
function incompleteOf(doc) {
  const pages = Array.isArray(doc.pages) ? doc.pages : []
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : []
  if (pages.length === 0) return { reason: 'it lists no pages', missing: [] }
  if (blocks.length === 0) return { reason: 'it lists no blocks', missing: [] }
  const gaps = []
  for (const [kind, list] of /** @type {const} */ ([
    ['page', pages],
    ['block', blocks]
  ]))
    for (const item of list) {
      const have = widthsOf(item?.images)
      // A block the template does not show at a width needs no picture there, but only when it says why.
      const excused = kind === 'block' ? notShownWidthsOf(item) : new Set()
      const missing = KIT_WIDTHS.filter((w) => !have.has(w) && !excused.has(w))
      if (missing.length > 0) gaps.push({ kind, id: String(item?.id ?? '?'), missing })
    }
  if (gaps.length === 0) return failingChecksOf(doc)
  const named = gaps
    .slice(0, SHOWN_GAPS)
    .map((g) => `${g.kind} ${g.id} at ${g.missing.join(' and ')}`)
    .join(', ')
  return {
    reason: `${gaps.length} picture${gaps.length === 1 ? ' is' : 's are'} missing: ${named}${gaps.length > SHOWN_GAPS ? ', ...' : ''}`,
    missing: gaps.slice(0, SHOWN_GAPS)
  }
}

/**
 * The shots a planner would still have to open: every packed 1440 shot of a page or block needs a current look
 * (`looksMissingOf`), written by the packager's own Claude Code with `cli.mjs looks`. Null when every one has it.
 * @param {any} doc
 */
function looksIncompleteOf(doc) {
  const missing = looksMissingOf(doc)
  if (missing.length === 0) return null
  const named = missing
    .slice(0, SHOWN_GAPS)
    .map((m) => `${m.kind} ${m.id}${m.why === 'stale' ? ' (stale)' : ''}`)
    .join(', ')
  return {
    reason: `${missing.length} ${missing.length === 1 ? 'page or block has no current look of its' : 'pages and blocks have no current look of their'} 1440 shot: ${named}${missing.length > SHOWN_GAPS ? ', ...' : ''}`,
    missing: missing.slice(0, SHOWN_GAPS)
  }
}

/**
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, contractId?: string | null, kit: import('./reader.js').Kit, map?: import('./flow-reads.js').KitMap | null, baseline?: import('./demo-baseline-file.js').DemoBaseline, policy?: any }} input
 *   `kit`: the kit beside the contract that seals this version (`kitOfRelease`)
 *   `baseline`: the demo baseline beside the same contract (`baselineOfRelease`), asked of the templates the baseline
 *   policy opts in; left out, it is not asked
 *   `map`: what the flow reads of the content map beside it (`kitMapOfRelease`); null skips the checks that need it
 *   `policy`: the Content coverage policy, whose `rolesPlatforms` are the platforms with a content map
 */
export function templateKitStep(
  put,
  waitingOn,
  { release, version, contractId = null, kit, map = null, baseline = undefined, policy = COVERAGE_POLICY }
) {
  const plain = { version, platform: release.platform, contract: contractId }
  // A kit summarises the content map, so it applies where Content coverage judges a content map (ADR 0038).
  const platforms = policy.rolesPlatforms ?? policy.platforms
  if (!platforms.includes(release.platform)) return put(KIT_STEP, 'done', 'kit-not-needed', plain)
  const live = shownOnInspiration(release)
  const wait = live ? undefined : waitingOn(['release', 'install-file', 'contract'])
  if (wait) return put(KIT_STEP, 'blocked', 'kit-waiting', plain, wait)
  const failing = live ? 'warn' : 'todo'
  if (kit.state === 'none') return put(KIT_STEP, failing, 'kit-missing', { ...plain, live })
  if (kit.state === 'invalid')
    return put(KIT_STEP, failing, 'kit-invalid', { ...plain, live, reason: kit.reason })
  const doc = kit.doc
  const params = {
    ...plain,
    live,
    kitVersion: typeof doc.kitVersion === 'string' ? doc.kitVersion : null,
    kitQuickstartVersion: doc.quickstart.version,
    templateVersion: typeof doc.template?.version === 'string' ? doc.template.version : null,
    images: doc.images.length,
    pages: Array.isArray(doc.pages) ? doc.pages.length : 0,
    blocks: Array.isArray(doc.blocks) ? doc.blocks.length : 0,
    errors: Array.isArray(doc.errors) ? doc.errors.length : 0,
    // Every check with explained failures, as the kit records it: /ops shows the count and the explained share.
    checksExplained: checksExplainedOf(doc),
    approvedBy: typeof doc.approval?.by === 'string' ? doc.approval.by : null,
    approvedAt: typeof doc.approval?.at === 'string' ? doc.approval.at : null
  }
  if (doc.quickstart.version !== version)
    return put(KIT_STEP, failing, 'kit-stale', {
      ...params,
      reason: `it was captured for ${doc.quickstart.version}, not ${String(version)}`
    })
  // A kit names the contract it was built on: one built on another contract of the same version (a seed) is stale.
  if (typeof doc.contract === 'string' && contractId && doc.contract !== contractId)
    return put(KIT_STEP, failing, 'kit-stale', {
      ...params,
      reason: `it was built on the contract ${doc.contract}, not ${contractId}`
    })
  const flowGaps = flowGapsOf(doc, { map, release, baseline })
  const flow = flowGaps.length > 0 ? { flowGaps } : {}
  const incomplete = incompleteOf(doc)
  if (incomplete)
    return put(KIT_STEP, failing, 'kit-incomplete', {
      ...params,
      ...flow,
      reason: incomplete.reason,
      missingPictures: incomplete.missing
    })
  const gaps = templateGapsOf(doc, policy)
  const judged = { ...params, ...gaps, ...flow }
  if (gaps.gaps > 0) return put(KIT_STEP, failing, 'kit-gaps', judged)
  // Looks are text, outside the approval's image digest: judged here, after the pictures and gaps they describe.
  const looks = looksIncompleteOf(doc)
  if (looks)
    return put(KIT_STEP, failing, 'kit-incomplete', {
      ...judged,
      reason: looks.reason,
      missingLooks: looks.missing
    })
  // What the flow reads, before the approval: an approval covers pictures, never a kit no flow step can use.
  const blocking = flowGaps.find((g) => g.severity === 'todo')
  if (blocking) return put(KIT_STEP, failing, blocking.code, { ...judged, reason: blocking.reason })
  const approval = doc.approval
  if (!approval || typeof approval !== 'object' || typeof approval.imagesSha256 !== 'string')
    return put(KIT_STEP, failing, 'kit-not-approved', judged)
  if (approval.imagesSha256.toLowerCase() !== imagesDigest(doc.images))
    return put(KIT_STEP, failing, 'kit-approval-stale', judged)
  const warning = flowGaps[0]
  if (warning) return put(KIT_STEP, 'warn', warning.code, { ...judged, reason: warning.reason })
  return put(KIT_STEP, 'done', 'kit-approved', judged)
}

const CAPTURE = `Capture the kit with the template kit tool and commit ${KIT_FILE} beside the contract.`

/**
 * The publish door's refusal while Template kit holds Publish: what is wrong and what to do next.
 * @param {any} step the template-kit step of the road
 */
export function templateKitRefusal(step) {
  const p = step?.params ?? {}
  const version = String(p.version ?? 'this version')
  const reason = (() => {
    switch (step?.code) {
      case 'kit-invalid':
        return `The template kit of ${version} cannot be read: ${String(p.reason ?? 'no reason given')}. ${CAPTURE}`
      case 'kit-stale':
        return `The template kit is out of date: ${String(p.reason ?? 'it was captured for another version')}. Capture it again for ${version} and commit ${KIT_FILE}.`
      case 'kit-incomplete':
        if (Array.isArray(p.missingLooks) && p.missingLooks.length > 0)
          return `The template kit of ${version} is incomplete: ${String(p.reason)}. Describe each shot with \`template-kit looks\` (skill quickstart-contract, references/image-looks.md) and commit ${KIT_FILE} again.`
        return `The template kit of ${version} is incomplete: ${String(p.reason ?? 'pictures are missing')}. Capture it again so every page and block has a picture at 1440 and 390.`
      case 'kit-gaps': {
        const count = Number(p.gaps ?? 0)
        const kinds = (Array.isArray(p.gapsByKind) ? p.gapsByKind : [])
          .map((k) => `${k.count} ${k.kind}`)
          .join(', ')
        return `The template kit of ${version} found ${count} template gap${count === 1 ? '' : 's'}${kinds ? ` (${kinds})` : ''}. Fix each in the template or the quickstart and capture the kit again, or record an accepted reason on it in ${KIT_FILE}.`
      }
      case 'kit-not-approved':
        return `The template kit of ${version} is not approved yet. Look at its pictures and record the approval in ${KIT_FILE}.`
      case 'kit-approval-stale':
        return `The template kit of ${version} was approved on a different set of pictures. Look at the current pictures and approve them again.`
      case 'kit-logo-unsettable':
        return `The template kit of ${version} has a logo spot nothing can write: ${String(p.reason)}. Give each spot the template setting or the content map frame that holds its logo, and capture the kit again.`
      case 'kit-brand-colour-from-link':
        return `The template kit of ${version} reads its accent from links: ${String(p.reason)}. Read the accent from the template colour setting or its primary stylesheet token, and capture the kit again.`
      case 'kit-navigation-missing':
        return `The template kit of ${version} misses menus: ${String(p.reason)}. Capture the kit again on the content map that declares them.`
      case 'kit-map-mismatch':
        return `The template kit of ${version} was captured on another content map: ${String(p.reason)}. Capture it again on the content map of this contract.`
      case 'kit-front-page-group':
        return `The template kit of ${version} has no front page group: ${String(p.reason)}. Capture it again with the current template kit tool.`
      case 'kit-brand-unreadable':
        return `The brand step cannot read the template kit of ${version}: ${String(p.reason)}. Capture the kit again so its site part is complete.`
      case 'kit-zip-missing':
        return `The template kit of ${version} has no image zip on the release: ${String(p.reason)}. Pack the kit and attach the zip to the release.`
      case 'kit-demo-baseline-missing':
        return `The demo baseline of ${version} is not beside the contract: ${String(p.reason)}. Measure it on the untouched quickstart site with apps/tracy-web/scripts/site-check-baseline.mjs, write it with \`template-kit baseline\` and commit ${BASELINE_FILE}.`
      default:
        return `The template kit of ${version} is missing. ${CAPTURE} Then approve it.`
    }
  })()
  return { error: 'TEMPLATE_KIT_NOT_READY', reason }
}
