// The write step gaps of a marker build (ticket #585): a refusal of the build team's write step (#597) the gate
// accounts for as `skipped_by_writer` instead of working around it. The gate never changes the write step or its plan:
// it takes the data that met the refusal out of the composition and runs the whole chain again, so the rules gate leaves
// the emptied block (or page) out exactly as it would for a customer, and the gap is reported with its code, its cause
// and the blocks it took out. Pure, but for the composition it changes in place.

/** The write plan's own refusals: a record kind the write cannot create. */
const PLAN_REFUSALS = new Set(['record_kind_unsupported'])
/**
 * The write plan's guards that name the operation they refuse (`draft-write-guards.mjs`): a contact created with no name
 * (the kit's only place of the name the contact takes is a block a gap took out).
 */
const GUARD_REFUSALS = new Set(['record_name_empty'])
/** The write run's refusals after its retries: a door refusal of an operation, or a read back that did not match. */
const RUN_REFUSALS = new Set(['redo_failed', 'read_back_mismatch'])

const emptied = (block) => {
  // Emptied, not removed: the plan's block ids follow the composition's positions (`plan-gate-pages.mjs` `pagesOf`).
  block.data = []
}

/**
 * The composition page of a plan page id, as the rules gate gives ids (`plan-gate-pages.mjs` `pagesOf`): a page whose
 * main block shows nothing is dropped and takes no id; the first page of a type is named by the type, the next ones
 * `<type>-2`, `<type>-3`.
 */
function pageOf(composition, id, kit) {
  const main = new Map((kit?.pageRecipes?.recipes ?? []).map((r) => [r.pageType, r.mainBlock]))
  const taken = new Set()
  for (const page of composition.pages) {
    if (!page.blocks.some((b) => b.block === main.get(page.pageType) && b.data.length)) continue
    let pageId = page.pageType
    for (let n = 2; taken.has(pageId); n++) pageId = `${page.pageType}-${n}`
    taken.add(pageId)
    if (pageId === id) return page
  }
  return null
}

function takeOutPage(composition, pageType) {
  const at = composition.pages.findIndex((p) => p.pageType === pageType)
  if (at < 0) return false
  composition.pages.splice(at, 1)
  return true
}

/**
 * Take a data id out of every created block that shows it. A block left with fewer items than it shows at least is
 * emptied: the rules gate refuses it otherwise (`too_few_items`), as it would refuse it for a customer.
 */
function takeOutItem(composition, kit, item) {
  const created = new Map(
    kit.blockStore.blocks.filter((b) => b.placement === 'created').map((b) => [b.id, b])
  )
  const blocks = []
  for (const page of composition.pages)
    for (const block of page.blocks)
      if (created.has(block.block) && block.data.includes(item)) {
        block.data = block.data.filter((id) => id !== item)
        const min = created.get(block.block).items?.min ?? 0
        if (block.data.length && block.data.length < min) emptied(block)
        blocks.push(`${page.pageType}/${block.block}`)
      }
  return blocks
}

/**
 * The items of a block the rules gate placed itself (`<page>-extra-<n>`, data no composed block showed): left out by
 * the composition, so the gate does not place them again.
 */
function leaveOutPlaced(composition, writePlan, key, planBlock) {
  const op = (writePlan?.ops ?? []).find((o) => o.key === key)
  const items = new Set()
  for (const v of op?.values ?? []) {
    const [, block, item] = String(v.entry ?? '').split('.')
    if (block === planBlock && item && /-marker-\d+$/.test(item)) items.add(item)
  }
  const out = new Set(composition.leftOut.map((e) => e.item))
  for (const item of items)
    if (!out.has(item))
      composition.leftOut.push({
        item,
        reason: 'The write step could not write the section that would show it.'
      })
  return [...items].map((item) => `${planBlock}/${item}`)
}

/** Empty the composition block of a plan block id (`<page>-b<n>`). */
function takeOutBlock(composition, planBlock, kit) {
  const m = /^(.+)-b(\d+)$/.exec(planBlock)
  const page = m && pageOf(composition, m[1], kit)
  const block = page?.blocks[Number(m[2]) - 1]
  if (!block?.data.length) return []
  emptied(block)
  return [`${page.pageType}/${block.block}`]
}

/** The plan blocks an operation of the write plan writes, read from its values' entries (`<page>.<block>.<field>`). */
function blocksOfOp(writePlan, key) {
  const op = (writePlan?.ops ?? []).find((o) => o.key === key)
  const ids = new Set()
  for (const v of op?.values ?? []) {
    const [page, block] = String(v.entry ?? '').split('.')
    if (page && block) ids.add(`${page}.${block}`)
  }
  return [...ids]
}

/** What an operation key of the write plan names: `copy:<page>.<block>`, `article:<item>`, `<kind>:page.<type>`. */
function takeOutSubject(composition, kit, subject, key, writePlan) {
  if (subject.startsWith('page.')) {
    const pageType = subject.slice('page.'.length)
    return takeOutPage(composition, pageType) ? [`${pageType}/*`] : []
  }
  if (/^[^.]+\.[^.]+-b\d+$/.test(subject)) return takeOutBlock(composition, subject.split('.')[1], kit)
  // A block the rules gate placed itself: only the items it placed leave (a value it carries from a composed block of
  // the page, a heading, stays with that block).
  if (/^[^.]+\.[^.]+-extra-\d+$/.test(subject))
    return leaveOutPlaced(composition, writePlan, key, subject.split('.')[1])
  const items = takeOutItem(composition, kit, subject)
  if (items.length) return items
  // Another operation (an extra copy of a block the write makes): the blocks its values come from.
  return blocksOfOp(writePlan, key).flatMap((id) => takeOutBlock(composition, id.split('.')[1], kit))
}

/**
 * The gap of a refusal, with the composition changed so the next run does not meet it; null when the refusal is not a
 * write step gap the gate can account for (the build stops then).
 * @returns {{code: string, cause?: string, record: string, blocks: string[], message: string} | null}
 */
export function writerGapOf(error, composition, kit, writePlan) {
  const code = error?.code
  const record = PLAN_REFUSALS.has(code)
    ? error.details?.record
    : RUN_REFUSALS.has(code)
      ? error.details?.op
      : GUARD_REFUSALS.has(code)
        ? error.details?.problems?.find((p) => p.code === code)?.op
        : null
  if (typeof record !== 'string') return null
  const subject = record.split(':').slice(1).join(':')
  const blocks = takeOutSubject(composition, kit, subject, record, writePlan)
  if (!blocks.length) return null
  const cause = error.details?.cause ?? error.details?.recordKind
  return {
    code,
    ...(cause !== undefined ? { cause: String(cause) } : {}),
    record,
    blocks,
    message: String(error.message ?? code),
    details: error.details ?? null
  }
}
