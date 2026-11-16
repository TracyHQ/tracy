// The site planner's round 0 in parts planned at the same time (2026-11-16). Off by default: a run asks for it with
// harness.parallelPages (the number of parts, frozen with the run); without it, or at 1, round 0 is planned exactly as
// before. Pure: inputs in, new values out.
//
// Why: round 0 was one conversation that read the kit with tools and then wrote the whole plan in one answer. On dev
// (16/11/2026) it took 357 to 753 s: 77 to 500 s of reading turns, then one writing turn of 158 to 495 s, and the plan
// step was the longest of a chain build (7 to 16 minutes with its fix rounds).
//
// - The split (planningParts): the kit's page groups in kit order cut into that many runs of consecutive groups of
//   about the same size, by the blocks of each group's root page. A part plans its groups and their pages and nothing
//   else; the first part also plans everything of the whole site (site, mainMenu, sharedBlocks), so one part decides
//   each thing and two parts never decide the same one.
// - Each part's first message is the run's own first message (the same bytes, so the provider's prefix cache can
//   reuse it, and the same kit tools), then the part: its groups, the other parts' groups, and what is the first
//   part's alone (partInstruction). The planner prompt itself is locked and unchanged.
// - The answers are merged (mergePlanParts): the whole-site fields of the first part, each part's own page groups and
//   pages in kit order, every part's owner tasks and kit gaps once. A main menu entry for a page no part kept is taken
//   out (a part may drop a page the first part put in the menu). The merged plan is then read and checked once, like
//   any round 0, and the fix rounds continue the last part's conversation.

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The most parts a run may plan at the same time. */
export const MAX_PARALLEL_PAGES = 8

/** Why a parallel pages setting cannot run, or null. 1 is one part: the run plans as if it were not set. */
export const parallelPagesProblem = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_PARALLEL_PAGES
    ? null
    : `parallel pages must be a whole number from 1 to ${MAX_PARALLEL_PAGES}`

/** Whether a run plans its round 0 in parts. */
export const plansInParts = (harness) => Number.isInteger(harness?.parallelPages) && harness.parallelPages > 1

/** The fields of a plan the first part alone decides. */
export const SITE_FIELDS = Object.freeze(['site', 'mainMenu', 'sharedBlocks'])

// The blocks a page shows at its widest measured width.
function blocksOf(page) {
  const byWidth = isObject(page?.blocks) ? page.blocks : {}
  const widths = Object.keys(byWidth)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
  return widths.length ? arr(byWidth[String(widths[0])]) : arr(page?.blocks)
}

/**
 * The size of each page group, in kit order: the blocks of its root page that are not on every page of the site (the
 * header, the footer), at least 1.
 * @param {any} kit
 */
export function groupWeights(kit) {
  const pages = new Map(arr(kit?.pages).map((p) => [p?.id, p]))
  const every = arr(kit?.pages).map((p) => new Set(blocksOf(p)))
  const shared = (block) => every.length > 1 && every.every((set) => set.has(block))
  const weights = new Map()
  for (const group of arr(kit?.pageGroups)) {
    if (typeof group?.id !== 'string') continue
    const root = pages.get(group.root ?? group.representative)
    weights.set(group.id, Math.max(1, blocksOf(root).filter((b) => !shared(b)).length))
  }
  return weights
}

/**
 * The kit's page groups cut into `parallelPages` runs of consecutive groups whose heaviest is as light as it can be
 * (fewer when the kit has fewer groups). Every group is in exactly one part; joined in order, the parts are the kit's
 * order. The same kit always gives the same parts.
 */
export function planningParts(kit, parallelPages) {
  const weights = groupWeights(kit)
  const groups = [...weights.keys()]
  const k = Math.max(1, Math.min(parallelPages, groups.length))
  if (k === 1) return [groups]
  const n = groups.length
  const before = [0]
  for (const g of groups) before.push(before.at(-1) + weights.get(g))
  const best = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity))
  const start = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0))
  best[0][0] = 0
  for (let j = 1; j <= k; j++)
    for (let i = j; i <= n; i++)
      for (let m = j - 1; m < i; m++) {
        const heaviest = Math.max(best[j - 1][m], before[i] - before[m])
        if (heaviest < best[j][i]) {
          best[j][i] = heaviest
          start[j][i] = m
        }
      }
  const parts = []
  for (let j = k, i = n; j > 0; j--) {
    const m = start[j][i]
    parts.unshift(groups.slice(m, i))
    i = m
  }
  return parts
}

/** The kit pages of each group. */
const pagesByGroup = (kit) => {
  const out = new Map()
  for (const p of arr(kit?.pages)) {
    if (typeof p?.group !== 'string') continue
    out.set(p.group, [...(out.get(p.group) ?? []), p.id])
  }
  return out
}

/**
 * What one part is told after the run's own first message.
 * @param {{ parts: string[][], part: number, kit: any }} t
 */
export function partInstruction({ parts, part, kit }) {
  const total = parts.length
  const pages = pagesByGroup(kit)
  const own = parts[part]
  const ownPages = own.flatMap((g) => pages.get(g) ?? [])
  const first = part === 0
  return [
    `# Planning part ${part + 1} of ${total}, planned at the same time as the others`,
    '',
    `The site is planned in ${total} parts at the same time, each in a conversation of its own that starts from this same message. Code puts the parts' plans together into one plan, and the plan check reads it as one site.`,
    '',
    `Your part: the page groups ${own.join(', ')}, and their pages (${ownPages.join(', ')}). Decide these groups (keep or drop, with why), and plan every page of them you keep, block by block, exactly as the whole plan asks. Read with the tools only what your part needs.`,
    '',
    'The other parts plan these page groups and their pages, so write nothing for them in pageGroups or pages:',
    ...parts.flatMap((list, p) => (p === part ? [] : [`- part ${p + 1}: ${list.join(', ')}`])),
    '',
    first
      ? `You also plan everything of the whole site: ${SITE_FIELDS.join(', ')}. Plan the main menu as if every page group of the kit that holds content for this business is kept; code takes out an entry for a page another part drops.`
      : `Part 1 plans everything of the whole site (${SITE_FIELDS.join(', ')}): leave them out of your answer, or write them empty; they are not read from your part. A block that every page shows (the header, the footer) is part 1's.`,
    'Owner tasks and kit gaps that come from your pages are yours to write; code keeps every part’s.',
    ...(part === total - 1
      ? [
          '',
          "Once the parts are put together, the plan check's failures for the whole site come back to you in this conversation: then correct every entry the list names, whichever part planned it."
        ]
      : []),
    '',
    'Answer with one JSON object in the shape of the whole site plan, holding only your part, nothing before or after it.'
  ].join('\n')
}

/** Each part's first user message: the run's own first message, then the part's instruction. */
export function partFirstMessages(firstUser, parts, kit) {
  return parts.map((_, part) => {
    const extra = partInstruction({ parts, part, kit })
    if (typeof firstUser === 'string') return `${firstUser}\n\n${extra}`
    if (Array.isArray(firstUser)) return [...firstUser, { type: 'text', text: extra }]
    return extra
  })
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

/** The main menu with each entry, and each child, whose page the plan does not keep taken out. */
export function withMenuOnKeptPages(plan) {
  if (!isObject(plan) || !Array.isArray(plan.mainMenu)) return plan
  const kept = new Set(
    arr(plan.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const keep = (entry) => typeof entry?.page !== 'string' || kept.has(entry.page)
  let changed = false
  const mainMenu = []
  for (const entry of plan.mainMenu) {
    if (!keep(entry)) {
      changed = true
      continue
    }
    const children = arr(entry?.children).filter(keep)
    if (Array.isArray(entry?.children) && children.length !== entry.children.length) {
      changed = true
      mainMenu.push({ ...entry, children })
    } else mainMenu.push(entry)
  }
  return changed ? { ...plan, mainMenu } : plan
}

/**
 * The parts' plans as one plan. `parts` is planningParts' split, `kit` the run's kit (for the order of groups and
 * pages). One part's answer is returned as it is.
 */
export function mergePlanParts(answers, parts, kit) {
  if (answers.length === 1) return answers[0]
  const groupOf = new Map(arr(kit?.pages).map((p) => [p?.id, p?.group]))
  const groupOrder = new Map(arr(kit?.pageGroups).map((g, i) => [g?.id, i]))
  const pageOrder = new Map(arr(kit?.pages).map((p, i) => [p?.id, i]))
  const firstPart = isObject(answers[0]) ? answers[0] : {}
  const merged = { ...firstPart }
  const pageGroups = []
  const pages = []
  answers.forEach((answer, p) => {
    const own = new Set(parts[p] ?? [])
    for (const g of arr(answer?.pageGroups)) if (own.has(g?.id)) pageGroups.push(g)
    // A page in no group of the kit is the whole site's, so the first part's.
    for (const page of arr(answer?.pages))
      if (own.has(groupOf.get(page?.id)) || (p === 0 && !groupOf.has(page?.id))) pages.push(page)
  })
  pageGroups.sort((a, b) => (groupOrder.get(a.id) ?? 1e9) - (groupOrder.get(b.id) ?? 1e9))
  pages.sort((a, b) => (pageOrder.get(a.id) ?? 1e9) - (pageOrder.get(b.id) ?? 1e9))
  merged.pageGroups = pageGroups
  merged.pages = pages
  merged.ownerTasks = once(answers.flatMap((a) => arr(a?.ownerTasks)))
  merged.kitGaps = once(answers.flatMap((a) => arr(a?.kitGaps)))
  return withMenuOnKeptPages(merged)
}
