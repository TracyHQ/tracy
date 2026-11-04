// The write step's link stage (TracyHQ/tracy#371, ADR 0044, decision 3: the plan owns link targets). Before the hide stage it works
// out every plan link's address and door, and hands the slots to the one contract call; a menu item's target is written after the
// page settings stage, which knows the items that left the site. A link that cannot be resolved or that no door holds is failed
// with the reason, so the site check goes red; nothing is guessed.
import { createHash } from 'node:crypto'
import { contentMapKey } from '../site-writer/contract-mapping.js'
import { linkDoors } from './link-doors.js'
import { failed, lineOrder, lineResult } from './link-lines.js'
import { NO_LAST } from './no-last-report.js'
import { articleOfPage, linkTarget } from './link-targets.js'
import { menuRows, rowsOpening } from './page-meta-write.js'
import { doorCall } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const PAGE_ROWS = 25

async function articleRows(call) {
  const rows = new Map()
  for (let offset = 0; offset < 5000; offset += PAGE_ROWS) {
    const answer = await call('content.list', { kind: 'article', limit: PAGE_ROWS, offset })
    const items = each(answer?.items)
    for (const item of items) rows.set(Number(item.id), item)
    if (items.length < PAGE_ROWS) break
  }
  return rows
}

/** The menu rows and, when a kept page has no row, the articles: what it takes to name a page's address. */
async function readAddresses({ call, kit, leads }) {
  const rows = await menuRows(call)
  const pages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const rowless = leads
    .map((l) => pages.get(l.leadsTo))
    .filter((p) => p && !rowsOpening(p, rows).length && articleOfPage(p, kit) !== null)
  return { rows, articles: rowless.length ? await articleRows(call) : new Map() }
}

/** Several links on one address go when the plan sends them one way; the plan's own link slots are settled first. */
function settleShared(orders, values) {
  const rounds = new Map()
  for (const order of orders.values())
    if (order.via === 'shared') {
      const name = order.keys.join(' ')
      rounds.set(name, [...(rounds.get(name) ?? []), order])
    }
  for (const round of rounds.values()) {
    const { keys } = round[0]
    const urls = new Set([
      ...round.map((o) => o.url),
      ...keys.filter((k) => values.has(k)).map((k) => values.get(k))
    ])
    if (urls.size > 1) {
      const reason = `these links share one address on the site (${keys.join(', ')}) and the plan sends them to different places`
      for (const order of round) Object.assign(order, failed(reason), { via: null })
      continue
    }
    for (const key of keys) values.set(key, round[0].url)
    for (const order of round) Object.assign(order, { via: 'slot', keys: [keys[0]], alsoKeys: keys.slice(1) })
  }
}

/**
 * A link no door holds, measured with no address, and a stored placeholder address of its entity that leaves: the template prints
 * the control only with that address, so the link leaves with it. Only when each such link has its own address on that entity;
 * otherwise nothing says which control went, and the links stay failed.
 */
function settleControls(orders, doors, owners) {
  const leaving = new Map()
  for (const claim of owners.values())
    if (claim.kind === 'hide' && claim.storedAddress) {
      const key = contentMapKey(claim.slot)
      const entity = key.slice(0, key.lastIndexOf('.'))
      leaving.set(entity, [...(leaving.get(entity) ?? []), { slot: claim.slot, key }])
    }
  const doorless = new Map()
  for (const [slot, door] of doors) {
    const entity = door.block?.source?.entity
    if (
      door.via === 'none' &&
      !door.link?.target &&
      orders.get(slot)?.status === 'failed' &&
      leaving.has(entity)
    )
      doorless.set(entity, [...(doorless.get(entity) ?? []), slot])
  }
  for (const [entity, slots] of doorless) {
    const addresses = leaving.get(entity)
    if (addresses.length !== slots.length) continue
    slots.forEach((slot, at) => {
      const noDoor = orders.get(slot).reason
      orders.set(slot, { via: 'control', noDoor, ...addresses[at] })
    })
  }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, plan: object, brief?: object, owners: Map<string, object>,
 *   reading: object, extras: object, taken: Record<string, string>, last?: object, createdPages?: Map<string, object> }} input
 *   `taken`: what other files send to the contract call; `last`: the last report, whose menu targets are not written again;
 *   `createdPages`: what became of each page the plan creates (page-create-stage.js)
 * @returns {Promise<{ changes: Record<string, string>, evidence: Record<string, string>, writeMenu: () => Promise<void>,
 *   results: (done: object) => Map<string, object> }>} `results` gives each link line once the writes are done, by slot
 */
export async function prepareLinks({
  door,
  siteKey,
  kit,
  plan,
  brief,
  owners,
  reading,
  extras,
  taken,
  last = NO_LAST,
  contentMap,
  createdPages
}) {
  const claims = [...owners.values()].filter((c) => c.kind === 'link')
  const call = doorCall(door, siteKey)
  let site
  try {
    site = await readAddresses({ call, kit, leads: claims.map((c) => ({ leadsTo: c.content })) })
  } catch (error) {
    const reason = `the menu or the articles could not be read: ${error.message}`
    return {
      changes: {},
      evidence: {},
      writeMenu: async () => {},
      results: () => new Map(claims.map((c) => [c.slot, failed(reason)]))
    }
  }
  const facts = new Map(each(brief?.facts).map((f) => [f?.id, f]))
  const doorOf = linkDoors({ kit, reading, rows: site.rows, contentMap })
  const hiddenKeys = new Map(
    [...owners.values()].filter((c) => c.kind === 'hide').map((c) => [contentMapKey(c.slot), c.slot])
  )
  const leaving = new Set(each(extras?.mainMenu?.hide).map((h) => h.item))
  const orders = new Map()
  const doors = new Map(claims.map((claim) => [claim.slot, doorOf(claim.slot)]))
  for (const claim of claims)
    orders.set(
      claim.slot,
      lineOrder(
        claim,
        doors.get(claim.slot),
        linkTarget(claim.content, { plan, kit, facts, createdPages, ...site }),
        {
          hiddenKeys,
          leaving
        }
      )
    )
  settleControls(orders, doors, owners)

  const onSite = new Map(each(reading?.slots).map((s) => [s?.key, s]))
  const values = new Map()
  for (const order of orders.values())
    if (order.via === 'slot') {
      const [key] = order.keys
      if (key in taken && taken[key] !== order.url)
        Object.assign(order, failed(`${key} is written by another file, which keeps it`, { key }), {
          via: null
        })
      else if (values.has(key) && values.get(key) !== order.url)
        Object.assign(
          order,
          failed(`${key} is already sent to ${values.get(key)} by another link of the plan`, { key }),
          {
            via: null
          }
        )
      else values.set(key, order.url)
    }
  settleShared(orders, values)
  const changes = Object.fromEntries(values)
  const evidence = {}
  for (const claim of claims) {
    const key = orders.get(claim.slot).keys?.[0]
    if (key && onSite.get(key)?.requiresEvidence) evidence[key] = `Plan link: ${claim.content}`
  }

  const menuDone = new Map()
  const menuOrders = [...orders].filter(([, o]) => o.via === 'menu' && !leaving.has(`menuItem-${o.item}`))
  const writeMenu = async () => {
    const seen = new Map()
    for (const [slot, order] of menuOrders) {
      const { item, url } = order
      if (seen.has(item)) {
        menuDone.set(
          order,
          seen.get(item) === url ? 'done' : `this menu item is already sent to ${seen.get(item)}`
        )
        continue
      }
      seen.set(item, url)
      if (last.same(slot, url)) {
        menuDone.set(order, 'done')
        continue
      }
      const applyId = `links-${createHash('sha256').update(`${item} ${url}`).digest('hex').slice(0, 32)}`
      try {
        await call('content.update', { apply_id: applyId, kind: 'menuItem', id: item, fields: { link: url } })
        menuDone.set(order, 'done')
      } catch (error) {
        menuDone.set(order, error.message)
      }
    }
  }

  return {
    changes,
    evidence,
    writeMenu,
    results: (done) => {
      const seen = { ...done, written: new Set(done.written), hiddenKeys, leaving, menuDone }
      return new Map([...orders].map(([slot, order]) => [slot, lineResult(order, seen)]))
    }
  }
}
