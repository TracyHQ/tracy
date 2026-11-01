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
 *             (`kit-stale`), without pages or blocks or a picture at either width (`kit-incomplete`), with template
 *             gaps the kit measured that carry no accepted reason (`kit-gaps`, judged like the holes of Content
 *             coverage), not approved (`kit-not-approved`), or approved on another image set (`kit-approval-stale`);
 *   warn      the same on a release already published: it is never taken off for it, as Content coverage does.
 */
import { contractFor } from '../contracts.js'
import { COVERAGE_POLICY } from '../content-coverage/judge.js'
import { shownOnInspiration } from '../quickstart-releases.js'
import { imagesDigest, KIT_FILE, KIT_WIDTHS, kitOfContract, notShownWidthsOf, widthsOf } from './reader.js'

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
  return kitOfContract(contractFor(contracts, release?.tag, version))
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
  if (gaps.length === 0) return null
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
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, contractId?: string | null, kit: import('./reader.js').Kit, policy?: any }} input
 *   `kit`: the kit beside the contract that seals this version (`kitOfRelease`)
 *   `policy`: the Content coverage policy, whose `rolesPlatforms` are the platforms with a content map
 */
export function templateKitStep(
  put,
  waitingOn,
  { release, version, contractId = null, kit, policy = COVERAGE_POLICY }
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
    approvedBy: typeof doc.approval?.by === 'string' ? doc.approval.by : null,
    approvedAt: typeof doc.approval?.at === 'string' ? doc.approval.at : null
  }
  if (doc.quickstart.version !== version)
    return put(KIT_STEP, failing, 'kit-stale', {
      ...params,
      reason: `it was captured for ${doc.quickstart.version}, not ${String(version)}`
    })
  const incomplete = incompleteOf(doc)
  if (incomplete)
    return put(KIT_STEP, failing, 'kit-incomplete', {
      ...params,
      reason: incomplete.reason,
      missingPictures: incomplete.missing
    })
  const gaps = templateGapsOf(doc, policy)
  const judged = { ...params, ...gaps }
  if (gaps.gaps > 0) return put(KIT_STEP, failing, 'kit-gaps', judged)
  const approval = doc.approval
  if (!approval || typeof approval !== 'object' || typeof approval.imagesSha256 !== 'string')
    return put(KIT_STEP, failing, 'kit-not-approved', judged)
  if (approval.imagesSha256.toLowerCase() !== imagesDigest(doc.images))
    return put(KIT_STEP, failing, 'kit-approval-stale', judged)
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
      default:
        return `The template kit of ${version} is missing. ${CAPTURE} Then approve it.`
    }
  })()
  return { error: 'TEMPLATE_KIT_NOT_READY', reason }
}
