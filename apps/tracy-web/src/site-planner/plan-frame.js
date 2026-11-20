// The site planner's round 0 as a frame, then its pages in parts at the same time (2026-11-20). Off by default: a run
// asks for it with harness.framedParts (the number of page parts, frozen with the run). Pure: inputs in, new values out.
//
// Why: planned in parts that each decided their own share of the site (plan-parts.js, #708 and #710), round 0 was no
// faster and the plan was worse. Each part reasoned about the whole site at max (30k to 75k tokens, about what one
// conversation reasons for everything), and the parts disagreed: a page path one part renamed was still linked by
// another's button (a 404), more pages were kept, and the menu and legal pages went missing (dev, lat19 and lat20,
// 19–20/11/2026). In one conversation (lat21, 20/11/2026) round 0 took 463 s at Arabian Tea House and 568 s at BXR
// London, one writing turn of 430 s among them.
//
// - The frame first, alone (the leading part, lib/bench-run-parts.js): everything two pages could disagree on, decided
//   once: the site, the main menu, the shared blocks, keep or drop with a slug for every page group, and for every page
//   only its id, decision, why and slug. Small to write.
// - Then the pages in `framedParts` parts at the same time, each from the frame as a fixed contract: a part writes the
//   page fields (PART_PAGE_FIELDS) of the kept pages of its groups and nothing else. The kept groups are cut into the
//   parts after the frame (framedAssignment), weighed as plan-parts.js groupWeights weighs them, so no part plans a
//   page the frame drops and the same frame always gives the same parts.
// - Put together by code (mergeFramedPlan): the frame as it is, each kept page given the fields its part wrote; the
//   frame's own page fields always win, a page a part wrote outside its share is left out, every part's owner tasks
//   and kit gaps once. The merged plan is checked once, and the fix rounds continue the frame's conversation, which
//   has the whole site in view (the frame is the last part by turn numbers, though it is asked first).
import { groupRuns, groupWeights, withMenuOnKeptPages } from './plan-parts.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The fields of a page the frame decides; a part never changes them. */
export const FRAME_PAGE_FIELDS = Object.freeze(['id', 'decision', 'why', 'slug'])
/** The fields of a kept page its part writes. */
export const PART_PAGE_FIELDS = Object.freeze([
  'visitorQuestion',
  'keyMessage',
  'story',
  'endAction',
  'seo',
  'blocks'
])
/** The most page parts a framed run plans at the same time. */
export const MAX_FRAMED_PARTS = 7

/** Why a framed parts setting cannot run, or null. */
export const framedPartsProblem = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_FRAMED_PARTS
    ? null
    : `framed parts must be a whole number from 1 to ${MAX_FRAMED_PARTS}`

/** Whether a run plans round 0 as a frame, then its pages in parts. */
export const framesPlan = (harness) => framedPartsProblem(harness?.framedParts) === null

/** What the frame's conversation is told after the run's own first message. */
export function frameInstruction(parts) {
  return [
    '# Planning the frame first, then the pages in parts',
    '',
    `The site is planned in two stages. This conversation writes the frame: everything the whole site shares, and a decision for every page. Then the kept pages are planned in ${parts} part${parts === 1 ? '' : 's'} at the same time, each from this frame, and code puts the frame and the parts together into one plan, which the plan check reads as one site. A part cannot change the frame: decide here everything two pages could disagree on.`,
    '',
    'Write in this answer, exactly as the whole plan asks:',
    '- site (every field), mainMenu and sharedBlocks;',
    '- pageGroups: every page group of the kit, keep or drop, with its slug and why;',
    `- pages: every page of the kit, and every page you create, with only ${FRAME_PAGE_FIELDS.join(', ')}. Leave out ${PART_PAGE_FIELDS.join(', ')}: the parts write them.`,
    '- ownerTasks and kitGaps that concern the whole site.',
    '',
    'Read with the tools only what the frame needs: the blocks every page shows, and the pages and their images as far as deciding them needs.',
    '',
    'Answer with one JSON object in the shape of the whole site plan, holding only the frame, nothing before or after it.'
  ].join('\n')
}

const pagesOf = (kit) => {
  const out = new Map()
  for (const p of arr(kit?.pages))
    if (typeof p?.group === 'string') out.set(p.group, [...(out.get(p.group) ?? []), p.id])
  return out
}

/** The page ids the frame keeps. */
function keptPages(frame) {
  return new Set(
    arr(frame?.pages)
      .filter((p) => isObject(p) && p.decision === 'keep' && typeof p.id === 'string')
      .map((p) => p.id)
  )
}

/**
 * The page groups each of the `parts` parts plans: the groups the frame keeps that have a page it keeps, in kit order,
 * cut into runs of about the same weight (plan-parts.js groupWeights); a part left without one gets none.
 * @returns {string[][]}
 */
export function framedAssignment(frame, kit, parts) {
  const kept = keptPages(frame)
  const byGroup = pagesOf(kit)
  const keptGroups = new Set(
    arr(frame?.pageGroups)
      .filter((g) => isObject(g) && g.decision === 'keep')
      .map((g) => g.id)
  )
  const weights = groupWeights(kit)
  const groups = [...weights.keys()].filter(
    (g) => keptGroups.has(g) && (byGroup.get(g) ?? []).some((id) => kept.has(id))
  )
  const runs = groups.length ? groupRuns(groups, weights, Math.min(parts, groups.length)) : []
  return Array.from({ length: parts }, (_, i) => runs[i] ?? [])
}

/**
 * One page part's first user message: the run's own first message, the part's instruction and the frame; null when the
 * part has no kept page to plan (no call is made for it).
 */
export function framedPartMessage(firstUser, frame, kit, part, parts) {
  const groups = framedAssignment(frame, kit, parts)[part]
  const kept = keptPages(frame)
  const byGroup = pagesOf(kit)
  const pages = groups.flatMap((g) => (byGroup.get(g) ?? []).filter((id) => kept.has(id)))
  if (!pages.length) return null
  const extra = [
    `# Planning part ${part + 1} of ${parts}, from the frame`,
    '',
    'The frame of the site plan is fixed; it is below. Keep every decision in it: which page groups and pages are kept, their slugs, the main menu, the site and the shared blocks. Link to a page only as the frame names it.',
    '',
    `Your part: the kept pages ${pages.join(', ')} (page groups ${groups.join(', ')}). For each of them write ${PART_PAGE_FIELDS.join(', ')}, block by block, exactly as the whole plan asks. Read with the tools only what your pages need.`,
    '',
    'Write nothing for any other page, and nothing of site, mainMenu, sharedBlocks or pageGroups: code takes them from the frame.',
    '',
    'Answer with one JSON object, nothing before or after it: { "pages": [ { "id": "<page id>", ...the fields above } ], "ownerTasks": [ ... ], "kitGaps": [ ... ] }.',
    '',
    'The frame:',
    '',
    JSON.stringify(frame)
  ].join('\n')
  if (typeof firstUser === 'string') return `${firstUser}\n\n${extra}`
  if (Array.isArray(firstUser)) return [...firstUser, { type: 'text', text: extra }]
  return extra
}

const once = (list) => {
  const seen = new Set()
  return list.filter((entry) => {
    const key = JSON.stringify(entry)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * The frame and its page parts as one plan. `values` are the parts' answers in part order, the frame's last (it is
 * the last part by turn numbers). A part's page outside its share, and any frame field it wrote, are left out.
 * @returns {{ plan: object, outside: number }}
 */
export function mergeFramedPlan(values, kit, parts) {
  const frame = isObject(values[parts]) ? values[parts] : {}
  const assignment = framedAssignment(frame, kit, parts)
  const groupOf = new Map(arr(kit?.pages).map((p) => [p?.id, p?.group]))
  const partOf = new Map(assignment.flatMap((groups, i) => groups.map((g) => [g, i])))
  const written = new Map()
  let outside = 0
  for (let i = 0; i < parts; i++)
    for (const page of arr(values[i]?.pages)) {
      if (!isObject(page) || typeof page.id !== 'string') continue
      if (partOf.get(groupOf.get(page.id)) !== i || written.has(page.id)) {
        outside++
        continue
      }
      written.set(page.id, page)
    }
  const pages = arr(frame.pages).map((fp) => {
    if (!isObject(fp) || fp.decision !== 'keep' || !written.has(fp.id)) return fp
    const page = written.get(fp.id)
    const own = Object.fromEntries(FRAME_PAGE_FIELDS.filter((k) => k in fp).map((k) => [k, fp[k]]))
    return {
      ...own,
      ...Object.fromEntries(PART_PAGE_FIELDS.filter((k) => k in page).map((k) => [k, page[k]]))
    }
  })
  const kept = keptPages(frame)
  outside += [...written.keys()].filter((id) => !kept.has(id)).length
  const plan = {
    ...frame,
    pages,
    ownerTasks: once([
      ...arr(frame.ownerTasks),
      ...values.slice(0, parts).flatMap((v) => arr(v?.ownerTasks))
    ]),
    kitGaps: once([...arr(frame.kitGaps), ...values.slice(0, parts).flatMap((v) => arr(v?.kitGaps))])
  }
  return { plan: withMenuOnKeptPages(plan), outside }
}
