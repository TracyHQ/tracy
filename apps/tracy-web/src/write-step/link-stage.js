// The write step's link stage (TracyHQ/tracy#371, ADR 0044, decision 3: the plan owns link targets). Before the hide stage it works
// out every plan link's address and door, and hands the slots to the one contract call; a menu item's target is written after the
// page settings stage, which knows the items that left the site. A link that cannot be resolved or that no door holds is failed
// with the reason, so the site check goes red; nothing is guessed.
import { createHash } from 'node:crypto'
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { goneRowSlots } from './hide-rows.js'
import { iconsOf } from './kit-slot-routes.js'
import { foreignItemLinks } from './item-page-links.js'
import {
  audioDecisionProblem,
  isAudioSlot
} from 'website-opportunities/domain/audio-source.mjs'
import { keptBlocks } from './owner-table.js'
import { audioBindingMatches, linkDoors } from './link-doors.js'
import { failed, lineOrder, lineResult } from './link-lines.js'
import { NO_LAST } from './no-last-report.js'
import { articleOfPage, linkTarget } from './link-targets.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const PAGE_ROWS = 25

// Contract keys survive a clone; only inspect's unique actual row mapping identifies the rendered article.
function renderedAudioEntity(reading, entity) {
  const ids = reading?.ids
  const id = ids?.[entity]
  if (
    !ids ||
    Array.isArray(ids) ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    Object.entries(ids).filter(([key, value]) => key.startsWith('article-') && String(value) === String(id))
      .length !== 1
  )
    return null
  return `article-${id}`
}

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
    .filter((p) => p && !rowsOpening(p, rows, null, kit).length && articleOfPage(p, kit) !== null)
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
      orders.get(slot)?.status === 'refused' &&
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
 * The menu items a plan link relabels whose target cannot be written (a component item is a page of its own, or the site refused
 * the target): the label would print the plan's words over the old target, the template's demo page. So each leaves the menus
 * with its label (ADR 0044, closing ladder): its line is hidden on the item's row, and the write step unpublishes the item and
 * does not write the label. Decided before any write, so nothing is half written.
 */
function strandedMenuItems({ claims, doors, orders, leaving }) {
  const out = []
  for (const claim of claims) {
    const door = doors.get(claim.slot)
    const order = orders.get(claim.slot)
    if (door?.via !== 'menu' || !door.row || !claim.label || leaving.has(door.link?.menuItem)) continue
    if (order?.status !== 'failed' && order?.status !== 'refused') continue
    const id = Number(door.item)
    const reason = `${order.reason}; so the item leaves the menus with its label instead of printing the plan's words over its old page`
    Object.assign(order, {
      status: 'hidden',
      reason,
      key: null,
      ordered: '0',
      readFrom: readRow('menuItem', id, 'published')
    })
    out.push({ item: `menuItem-${id}`, id, link: claim.slot, label: claim.label, reason })
  }
  return out
}

/** A menu target the site refused after the label was written: the item is unpublished, so the label opens no old page. */
async function unpublishAfterRefusal(call, item, refusal) {
  try {
    await call('content.update', { kind: 'menuItem', id: item, fields: { published: 0 } })
    return `${refusal}; the item was unpublished so its label does not open the old page`
  } catch (error) {
    return `${refusal}; unpublishing the item failed too: ${error.message}`
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
  const active = new Set(keptBlocks(plan).map((d) => d.block))
  const media = each(kit?.blocks)
    .filter((b) => active.has(b.id))
    .flatMap((block) =>
      each(block.links)
        .filter((l) => l.action === 'media-source')
        .map((link) => ({ link, block }))
    )
  const audioFailures = []
  const audioOrders = []
  let audioReadback = []
  const emptySlots = []
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
      emptySlots,
      audioFailures: media.map(({ link }) => ({ slot: link.id, reason })),
      readbackAudio: async () => [],
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
  // The address slots of rows the plan gives up: the hide stage removes those rows whole, so no link writes there (decision 22).
  const icons = iconsOf(kit)
  const goneKeys = new Set(
    [...goneRowSlots({ plan, kit })].map((id) => contentMapKey(icons.get(id)?.field ?? id))
  )
  const orders = new Map()
  const doors = new Map(claims.map((claim) => [claim.slot, doorOf(claim.slot)]))
  // A card sent to another card's item page leads to the page that lists them instead (item-page-links.js).
  const foreign = foreignItemLinks({ claims, kit, plan, taken })
  for (const claim of claims)
    orders.set(
      claim.slot,
      lineOrder(
        claim,
        doors.get(claim.slot),
        foreign.has(claim.slot) && !foreign.get(claim.slot).content
          ? { kind: 'failed', reason: foreign.get(claim.slot).reason }
          : doors.get(claim.slot)?.link?.action === 'media-source'
            ? (() => {
                const reason = audioDecisionProblem(
                  doors.get(claim.slot).link,
                  claim.content,
                  each(brief?.facts)
                )
                return reason ? { kind: 'failed', reason } : { kind: 'audio', url: claim.content }
              })()
            : linkTarget(foreign.get(claim.slot)?.content ?? claim.content, {
                plan,
                kit,
                facts,
                createdPages,
                ...site
              }),
        {
          hiddenKeys,
          leaving,
          goneKeys
        }
      )
    )
  for (const { link, block } of media) {
    const bound = doorOf(link.id)
    const slot = each(reading?.slots).find((s) => s.key === contentMapKey(link.sourceSlot))
    const claim = owners.get(link.id)
    let reason =
      bound.via !== 'audio'
        ? bound.reason
        : !renderedAudioEntity(reading, link.sourceBinding.entity)
          ? 'audio source has no unique trusted actual article ID'
          : null
    if (!reason && claim?.kind === 'link') {
      const order = orders.get(link.id)
      if (order?.via !== 'slot') reason = order?.reason ?? 'audio source decision was refused'
      else audioOrders.push({ link, block, key: slot.key, value: order.url })
    } else if (!reason && (!claim || claim.kind === 'hide')) {
      if (slot.canHide !== true || slot.key in taken)
        reason = 'audio absence requires proven source hide eligibility and no competing write'
      else {
        emptySlots.push(slot.key)
        audioOrders.push({ link, block, key: slot.key, value: '' })
      }
    } else if (!reason) reason = 'audio source has a competing non-media owner'
    if (reason) audioFailures.push({ slot: link.id, reason })
  }
  const readbackAudio = async () => {
    if (!audioOrders.length) return []
    let after
    try {
      after = await call('content.contract', { operation: 'inspect' })
    } catch (error) {
      audioReadback = audioOrders.map(({ key }) => ({
        key,
        stored: false,
        status: 'failed',
        reason: `audio source inspect failed: ${error.message}`
      }))
      return audioReadback
    }
    audioReadback = audioOrders.map(({ link, block, key, value }) => {
      const slots = each(after?.slots).filter((s) => s.key === key)
      const beforeOwner = each(reading?.slots).filter(
        (s) => s.entity === link.sourceBinding.entity && isAudioSlot(s)
      )
      const owner = each(after?.slots).filter((s) => s.entity === link.sourceBinding.entity && isAudioSlot(s))
      const census =
        owner.length === beforeOwner.length &&
        owner.every(
          (s) =>
            beforeOwner.filter(
              (b) =>
                b.key === s.key &&
                audioBindingMatches(
                  s,
                  {
                    ...link,
                    id: b.key,
                    sourceSlot: b.key,
                    target: b.sample,
                    sourceBinding: {
                      entity: b.entity,
                      column: b.column,
                      jsonPath: b.jsonPath,
                      group: b.group
                    }
                  },
                  block
                ) &&
                s.current === (audioOrders.find((o) => o.key === b.key)?.value ?? b.current)
            ).length === 1
        )
      const entity = renderedAudioEntity(after, link.sourceBinding.entity)
      const stored =
        !!entity &&
        entity === renderedAudioEntity(reading, link.sourceBinding.entity) &&
        census &&
        after?.contract === reading?.contract &&
        slots.length === 1 &&
        audioBindingMatches(slots[0], link, block) &&
        slots[0].current === value &&
        (value !== '' || slots[0].canHide === true)
      return {
        key,
        ordered: value,
        contractEntity: link.sourceBinding.entity,
        sourceBinding: link.sourceBinding,
        entity,
        track: String(link.sourceBinding.group.item),
        block: block.id,
        allEmpty: census && owner.every((s) => s.current === ''),
        ownerTracks: owner.map((s) => ({
          key: s.key,
          entity,
          track: String(s.group?.item),
          ordered: s.current
        })),
        stored,
        status: stored ? 'pending' : 'failed',
        reason: stored
          ? value
            ? 'stored source verified; initialized player metadata/error-free playback proof is still required'
            : 'empty source verified; whole track row and all-empty player absence proof is still required'
          : 'audio source readback did not preserve the exact contract/owner/track/value'
      }
    })
    return audioReadback
  }
  settleControls(orders, doors, owners)
  const stranded = strandedMenuItems({ claims, doors, orders, leaving })

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
  for (const order of audioOrders) {
    if (order.value && values.get(order.key) !== order.value)
      audioFailures.push({ slot: order.link.id, reason: 'audio source conflicts with another write' })
  }
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
        // Its label is written by now: an item left on its old target would print the plan's words over that page.
        menuDone.set(order, await unpublishAfterRefusal(call, item, error.message))
      }
    }
  }

  return {
    changes,
    evidence,
    stranded,
    emptySlots,
    audioFailures,
    readbackAudio,
    acceptAudioProof: (proof) => {
      audioReadback = proof
    },
    writeMenu,
    results: (done) => {
      const seen = { ...done, written: new Set(done.written), hiddenKeys, leaving, menuDone }
      return new Map(
        [...orders].map(([slot, order]) => {
          const line = lineResult(order, seen)
          const source = audioReadback.find((a) => a.key === order.keys?.[0])
          if (source)
            return [
              slot,
              {
                ...line,
                status: source.stored && source.status !== 'failed' ? 'written' : 'failed',
                reason: source.reason,
                stored: source.stored,
                mediaProof: source.status
              }
            ]
          const moved = foreign.get(slot)
          return [slot, moved && line.status === 'written' ? { ...line, reason: moved.reason } : line]
        })
      )
    }
  }
}
