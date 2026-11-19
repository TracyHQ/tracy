// The site planner's round 0 in writing turns of one conversation (ADR 0045 stage 1, 2026-11-19). Off by default: a
// run asks for it with harness.planTurns (frozen with the run); without it round 0 is planned exactly as before, as
// one answer that holds the whole plan. Pure: inputs in, new values out.
//
// Why: the progressive plan of ADR 0045 hands copy and pictures on one settled page group at a time, so the plan is
// first written one page group at a time. Parts planned at the same time (plan-parts.js, #645) gave no gain on dev:
// each part read the whole kit again. Turns of one conversation keep what the earlier turns read of the kit, and the
// provider's prefix cache.
//
// - The turns (turnGroups): turn 1 plans everything of the whole site (site, with its voice, forms, legal pages,
//   not-found page and footer menu; mainMenu; sharedBlocks), then one turn per page group of the kit, in kit order.
// - Turn 1's message is the run's own first message (the same bytes as a run without turns), then what the turn
//   decides (firstTurnInstruction). Every later turn's message is the next user message of the same conversation and
//   says which page group it plans (groupTurnMessage). The wording follows the plan parts' messages. The planner
//   prompt itself is locked and unchanged.
// - The answers are merged as parts are (plan-parts.js mergePlanParts): the whole-site fields of turn 1, each group's
//   pageGroups and pages entries from its own turn, every turn's owner tasks and kit gaps once, and the main menu
//   without the pages no turn kept. The merged plan is then read and checked once, like any round 0, and the fix
//   rounds continue the same conversation.
// - After each group's turn, the plan check runs on the whole-site part with that group alone (groupTurnCheck): the
//   full check on that partial plan, keeping only the failures of the page-local rules (PAGE_LOCAL_RULES) that are
//   located in the group. The round records them (reading.turnChecks); they change nothing the round sends.
import { indexKit } from './plan-check/kit-index.js'
import { asDecision } from './plan-check/plan-index.js'
import { mergePlanParts, SITE_FIELDS } from './plan-parts.js'

const arr = (x) => (Array.isArray(x) ? x : [])

/** Whether a run plans its round 0 in turns. */
export const plansInTurns = (harness) => harness?.planTurns === true

/**
 * The plan check's rules that read one page group on its own: what they judge sits on the group's pages (a block,
 * its slots, frames, lists and links, a page's title). The other rules read the site across pages (the menu, the
 * footer, closure, forms, shared labels, links to other pages, articles, the image review) and run on the whole plan
 * only.
 */
export const PAGE_LOCAL_RULES = Object.freeze([
  'R03',
  'R05',
  'R06',
  'R07',
  'R08',
  'R12',
  'R14',
  'R15',
  'R16',
  'R17',
  'R18',
  'R19',
  'R20',
  'R21',
  'R22',
  'R23',
  'R26'
])

/** The kit's page groups, in kit order: one turn each after the whole-site turn. */
export const turnGroups = (kit) =>
  arr(kit?.pageGroups)
    .map((g) => g?.id)
    .filter((id) => typeof id === 'string')

/** The kit pages of one group, in kit order. */
const pagesOf = (kit, group) =>
  arr(kit?.pages)
    .filter((p) => p?.group === group && typeof p.id === 'string')
    .map((p) => p.id)

/** What turn 1 is told after the run's own first message. */
export function firstTurnInstruction(kit) {
  const groups = turnGroups(kit)
  const total = groups.length + 1
  return [
    `# Planning in turns: turn 1 of ${total}, the whole site`,
    '',
    `The site is planned in ${total} turns of this one conversation: this turn plans the whole site, then each later turn plans one page group of the kit, in kit order. Code puts the turns' plans together into one plan, and the plan check reads it as one site once the last turn is answered.`,
    '',
    `This turn: everything of the whole site, and nothing else: ${SITE_FIELDS.join(', ')} (in site: the voice, the forms, the legal pages, the not-found page and the footer menu). Plan the main menu as if every page group of the kit that holds content for this business is kept; code takes out an entry for a page a later turn drops. Read with the tools what the whole site needs: what you read stays in this conversation for the later turns.`,
    '',
    'The later turns plan these page groups and their pages, one group each, so write nothing for them in pageGroups or pages now:',
    ...groups.map((group, i) => `- turn ${i + 2}: ${group}`),
    '',
    "Owner tasks and kit gaps that come from the whole site are this turn's to write; code keeps every turn's.",
    '',
    "Answer with one JSON object in the shape of the whole site plan, holding only this turn's part, nothing before or after it."
  ].join('\n')
}

/** Turn 1's user message: the run's own first message, then the turn's instruction. */
export function firstTurnMessage(firstUser, kit) {
  const extra = firstTurnInstruction(kit)
  if (typeof firstUser === 'string') return `${firstUser}\n\n${extra}`
  if (Array.isArray(firstUser)) return [...firstUser, { type: 'text', text: extra }]
  return extra
}

/**
 * The user message of turn `turn + 1` (turn 1 is the whole site, so `turn` is the number of answers already given),
 * which plans the page group turnGroups(kit)[turn - 1]; null once every group has had its turn.
 */
export function groupTurnMessage(turn, kit) {
  const groups = turnGroups(kit)
  const group = groups[turn - 1]
  if (!(turn >= 1) || group === undefined) return null
  const total = groups.length + 1
  const pages = pagesOf(kit, group)
  return [
    `# Planning in turns: turn ${turn + 1} of ${total}, the page group ${group}`,
    '',
    `This turn plans the page group ${group} and its pages (${pages.join(', ') || 'none in the kit'}). Decide this group (keep or drop, with why), and plan every page of it you keep, block by block, exactly as the whole plan asks. What this conversation has read of the kit is still here: read with the tools only what this group needs and the conversation does not hold yet.`,
    '',
    `The earlier turns' answers stand: write nothing for the whole site (${SITE_FIELDS.join(', ')}) or for another page group; code reads only this group's pageGroups and pages entries from this answer. A block that every page shows (the header, the footer) is turn 1's.`,
    "Owner tasks and kit gaps that come from this group's pages are this turn's to write; code keeps every turn's.",
    ...(turn === groups.length
      ? [
          '',
          "This is the last turn. Once the turns are put together, the plan check's failures for the whole site come back to you in this conversation: then correct every entry the list names, whichever turn planned it."
        ]
      : []),
    '',
    'Answer with one JSON object in the shape of the whole site plan, holding only this page group, nothing before or after it.'
  ].join('\n')
}

/** The split mergePlanParts reads: turn 1 owns no page group, each later turn owns its own. */
const turnParts = (kit) => [[], ...turnGroups(kit).map((group) => [group])]

/** The turns' plans as one plan, in the shape of a whole-plan answer. `kit`: the run's kit (groups, pages, order). */
export function mergePlanTurns(answers, kit) {
  return mergePlanParts(answers, turnParts(kit).slice(0, answers.length), kit)
}

/**
 * The plan check of the last group turn of `answers`, or null after turn 1: the whole-site part of turn 1 with that
 * group alone (`read` puts it together as any answer is, `check` runs the full plan check on it), keeping only the
 * failures of the page-local rules located in that group. Returns `{ group, failures, rules }`: the number of those
 * failures and the ids of the rules that have one, in the check's rule order.
 * @param {{ answers: any[], kit: any, read?: (plan: any) => any, check: (plan: any) => any }} input
 */
export function groupTurnCheck({ answers, kit, read = (plan) => plan, check }) {
  const turn = answers.length - 1
  const group = turnGroups(kit)[turn - 1]
  if (!(turn >= 1) || group === undefined) return null
  const plan = read(mergePlanParts([answers[0], answers[turn]], [[], [group]], kit))
  const inGroup = locatedIn(plan, kit, group)
  const rules = []
  let failures = 0
  for (const rule of arr(check(plan)?.rules)) {
    if (!PAGE_LOCAL_RULES.includes(rule?.id)) continue
    const found = arr(rule.failures).filter((f) => inGroup(f?.where)).length
    if (!found) continue
    failures += found
    rules.push(rule.id)
  }
  return { group, failures, rules }
}

/**
 * Whether a failure's `where` (the check's own words, plan-check/*.js) is in `group` of `plan`: a page of the group
 * ("page <id> / block ...", "pages <id> ...", a bare page id), the group itself ("pageGroups <id>"), a path into the
 * plan's pages or pageGroups ("$.pages[2]..."), or a slot or frame whose block a page of the group decides (a social
 * icon field, "item <id> / frame <id>"). The whole site ("site...", "sharedBlocks[...]", a shared block's slot) is
 * not.
 */
function locatedIn(plan, kit, group) {
  const pageIds = new Set(pagesOf(kit, group))
  const pages = arr(plan?.pages)
  const blocks = new Set(
    pages
      .filter((p) => pageIds.has(p?.id))
      .flatMap((p) => arr(p.blocks).map((d) => asDecision(d).block))
      .filter((block) => typeof block === 'string')
  )
  const { slotOwner } = indexKit(kit && typeof kit === 'object' ? kit : {})
  return (where) => {
    const text = typeof where === 'string' ? where : ''
    const path = /^\$\.(pages|pageGroups)\[(\d+)\]/.exec(text)
    if (path) {
      const entry = arr(plan?.[path[1]])[Number(path[2])]
      return path[1] === 'pages' ? pageIds.has(entry?.id) : entry?.id === group
    }
    const named = /^(page|pages|pageGroups) (\S+)/.exec(text)
    if (named) return named[1] === 'pageGroups' ? named[2] === group : pageIds.has(named[2])
    if (pageIds.has(text)) return true
    const frames = /^item \S+ \/ frames? (.+)$/.exec(text)
    const ids = frames ? frames[1].split(', ') : [text]
    return ids.some((id) => blocks.has(slotOwner.get(id)))
  }
}
