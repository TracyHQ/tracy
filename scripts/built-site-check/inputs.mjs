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

/**
 * The released content map of the template a kit was drafted from: `ai-quickstarts/<slug>/<j>/<version>` sits beside
 * `contracts/<slug>/<j>/<version>/content-map.json`. Null when there is none.
 */
export function releasedMapOf(dir) {
  const parts = path.resolve(dir).split(path.sep)
  const at = parts.lastIndexOf('ai-quickstarts')
  if (at < 0) return null
  const file = path.join(
    parts.slice(0, at).join(path.sep) || path.sep,
    'contracts',
    ...parts.slice(at + 1),
    'content-map.json'
  )
  return existsSync(file) ? file : null
}

/** The page routes the template's demo content declares (`about-us/contact`), from a released content map. */
export const demoRoutesOf = (contentMap) =>
  list(contentMap?.pages)
    .map((p) => p?.route)
    .filter((r) => typeof r === 'string' && r)

/**
 * The kit of a folder: its block store and mapping file, the blank site's content map when it has one, and the routes
 * of the template's demo content (from `demoContent`, a released content map, or the one beside the kit).
 */
export function loadKit(dir, { demoContent = null } = {}) {
  const contentMap = path.join(dir, CONTENT_MAP_FILE)
  const released = demoContent ?? releasedMapOf(dir)
  return {
    blockStore: json(path.join(dir, BLOCK_STORE_FILE)),
    mapping: json(path.join(dir, MAPPING_FILE)),
    contentMap: existsSync(contentMap) ? json(contentMap) : null,
    demoRoutes: released ? demoRoutesOf(json(released)) : []
  }
}

/** The declared field of a store block, from its own fields or its item fields. */
export function declaredFieldOf(kit, blockId, name) {
  const block = list(kit?.blockStore?.blocks).find((b) => b.id === blockId)
  return [...list(block?.fields), ...list(block?.itemFields)].find((f) => f.name === name) ?? null
}

/** A write order with its pages (`tracy-write-order/v1`), or null: the write plan keeps only `{run, plan, template}`. */
const fullOrder = (value) => (Array.isArray(value?.pages) ? value : null)

/**
 * The write step's result: `{order, plan, report}` (the write order, the write plan `tracy-draft-write-plan/v1` and
 * the run's report), `{plan, report}`, or a write plan alone; `order` given apart (`--write-order`) wins. An operation
 * counts as written when the report says it ran; with no report, every operation. `orderMismatch`: the order given is
 * not the one the write plan was made from (another run).
 */
export function writeResultOf(value, { order: given = null } = {}) {
  const plan = Array.isArray(value?.ops) ? value : Array.isArray(value?.plan?.ops) ? value.plan : null
  if (!plan) return null
  const report = value?.report ?? null
  const ran = Array.isArray(report?.ran) ? new Set(report.ran) : null
  const order = fullOrder(given) ?? fullOrder(value?.order) ?? fullOrder(plan.order)
  const want = plan.order?.run?.id
  const orderMismatch = Boolean(order && want && order.run?.id && order.run.id !== want)
  return { plan, report, order, orderMismatch, ops: plan.ops.filter((op) => !ran || ran.has(op.key)) }
}

/**
 * Every entry of the write order by its place, the form a write value names it by (`entry`): the fields of every block,
 * item and row (`home.home-b2.button-label`), the SEO title and description of every page (`seo:home.title`, typed text
 * with the order's SEO limits), the share images (`seo:home.shareImage`), pictures (`frame`) and icons (`id`). Each is
 * `{entry, page, block}`, `block` the store block id (null for SEO, pictures and icons).
 */
export function entriesOf(order) {
  const out = new Map()
  const add = (key, entry, page, block = null) => key && !out.has(key) && out.set(key, { entry, page, block })
  for (const { page, block, place } of placesOfOrder(order))
    for (const e of list(place.fields)) add(e?.place, e, page.id, block.block ?? block.id)
  const seo = order?.seo ?? {}
  for (const page of list(order?.pages)) {
    for (const field of ['title', 'description'])
      if (Number.isInteger(seo[field])) {
        const key = `seo:${page.id}.${field}`
        add(key, { place: key, field, type: 'text', limit: seo[field], seo: field }, page.id)
      }
    const share = `seo:${page.id}.shareImage`
    add(share, { place: share, field: 'shareImage', type: 'picture' }, page.id)
  }
  for (const p of list(order?.pictures)) add(p?.frame, { place: p.frame, type: 'picture' }, p.page ?? null)
  for (const i of list(order?.icons)) add(i?.id, { place: i.id, type: 'icon' }, i.page ?? null)
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
