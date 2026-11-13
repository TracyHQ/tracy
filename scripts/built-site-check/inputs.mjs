// The inputs of the built site check (ticket #601) other than the pages: the AI quickstart kit (Contract A), the
// write step's result (its write plan with the write order, and its run report) and the approved plan. Read only.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BLOCK_STORE_FILE,
  MAPPING_FILE
} from '../../packages/wo/website-opportunities/domain/ai-quickstart-contract.mjs'
import { slugOf } from '../../packages/wo/website-opportunities/domain/draft-write-plan-records.mjs'
import { placesOfOrder } from '../../packages/wo/website-opportunities/domain/write-order-check.mjs'
import { pagesInOrder } from '../../packages/wo/website-opportunities/domain/write-order-pages.mjs'
import { heldTextsOf } from '../../packages/wo/website-opportunities/domain/plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
export const CONTENT_MAP_FILE = path.join('blank-site-contract', 'content-map.json')

/** The kit of a folder: its block store and mapping file, and the blank site's content map when it has one. */
export function loadKit(dir) {
  const contentMap = path.join(dir, CONTENT_MAP_FILE)
  return {
    blockStore: json(path.join(dir, BLOCK_STORE_FILE)),
    mapping: json(path.join(dir, MAPPING_FILE)),
    contentMap: existsSync(contentMap) ? json(contentMap) : null
  }
}

/** The declared field of a store block, from its own fields or its item fields. */
export function declaredFieldOf(kit, blockId, name) {
  const block = list(kit?.blockStore?.blocks).find((b) => b.id === blockId)
  return [...list(block?.fields), ...list(block?.itemFields)].find((f) => f.name === name) ?? null
}

/**
 * The write step's result: `{plan, report}` (the write plan `tracy-draft-write-plan/v1` and the run's report), or a
 * write plan alone. An operation counts as written when the report says it ran; with no report, every operation.
 */
export function writeResultOf(value) {
  const plan = Array.isArray(value?.ops) ? value : Array.isArray(value?.plan?.ops) ? value.plan : null
  if (!plan) return null
  const report = value?.report ?? null
  const ran = Array.isArray(report?.ran) ? new Set(report.ran) : null
  return { plan, report, ops: plan.ops.filter((op) => !ran || ran.has(op.key)) }
}

/** Every entry of the write order by key, with its page id and its store block id. */
export function entriesOf(order) {
  const out = new Map()
  for (const { page, block, place } of placesOfOrder(order))
    for (const e of list(place.fields))
      if (e?.key) out.set(e.key, { entry: e, page: page.id, block: block.block ?? block.id })
  return out
}

/** The approved plan: `{plan, profile}` (the approval) or a plan alone; and the held names of its profile. */
export function approvalOf(value) {
  const plan = Array.isArray(value?.pages) ? value : (value?.plan ?? null)
  return { plan, held: heldTextsOf(value?.profile?.withheld ?? plan?.withheld).filter(Boolean) }
}

/**
 * The pages a site built from the plan has: `{page, pageType, alias, path}`, home first. The aliases are the write
 * plan's menu items when the write result is given, else the ones the write would make from the page names.
 */
export function expectedPagesOf(plan, write) {
  const items = list(write?.plan?.ops).filter((op) => op.kind === 'menuItem.create')
  const used = new Set()
  return pagesInOrder(plan).map((page, i) => {
    const op = items.find((o) => o.page === page.id)
    let alias = op?.fields?.alias ?? slugOf(page.name)
    if (!op) {
      const base = alias
      for (let n = 2; used.has(alias); n++) alias = `${base}-${n}`
    }
    used.add(alias)
    const home = i === 0
    return { page: page.id ?? null, pageType: page.pageType ?? null, alias, path: home ? '/' : `/${alias}` }
  })
}

/** The menu items of other menus than the main one the write made: `{key, menutype, path}` of the page they open. */
export function otherMenuItemsOf(write, expected) {
  const main = write?.plan?.mainMenu ?? null
  return list(write?.plan?.ops)
    .filter((op) => op.kind === 'menuItem.create' && op.fields?.menutype && op.fields.menutype !== main)
    .map((op) => ({
      key: op.key,
      menutype: op.fields.menutype,
      path: expected.find((p) => p.page === op.page)?.path ?? null
    }))
    .filter((item) => item.path)
}
