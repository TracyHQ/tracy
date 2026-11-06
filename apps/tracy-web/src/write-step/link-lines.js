// A link line of the write report (TracyHQ/tracy#371): `lineOrder` says what the link stage will do with a plan link, whose door and
// address are known, and `lineResult` says what became of it once the writes are done.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { mapsAddress } from '../lib/map-links.js'
import { refusalWords } from './contract-write.js'
import { actsInsidePage, slashless } from './link-doors.js'
import { readRow } from './settings-door.js'

const ENDED = 'the run ended before this link was written'
export const failed = (reason, extra = {}) => ({ status: 'failed', reason, key: null, ...extra })

/** What becomes of a link whose door is known and whose address is `target`, before the writes. */
export function lineOrder(claim, door, target, { hiddenKeys, leaving, goneKeys = new Set() }) {
  const { slot: id, content: leadsTo } = claim
  const { link } = door
  if (door.via === 'menu' && leaving.has(link.menuItem)) return { via: 'menu', item: door.item }
  const label = claim.label ? hiddenKeys.get(contentMapKey(claim.label)) : null
  if (label && door.via !== 'menu') return { via: 'label', label, leadsTo }
  if (door.via === 'no-kit-link')
    return failed(`the kit lists no link ${id}, so nothing says where it is on the site`)
  if (door.via === 'words-only')
    return failed(`${door.key} holds words, not an address, and the kit ties no link to it`, {
      key: door.key
    })
  if (target.kind === 'map')
    return { via: 'map', slotId: link?.opens?.slotId ?? null, searches: mapsSearch(link?.target) }
  if (actsInsidePage(link) || leadsTo === 'lightbox')
    return {
      status: 'skipped',
      key: null,
      reason: `a control that acts inside the page has no address, so the plan's ${leadsTo} is not written`
    }
  if (target.kind === 'failed') return failed(target.reason)
  if (door.via === 'slot' || door.via === 'shared') {
    const keys = door.keys.filter((key) => !hiddenKeys.has(key) && !goneKeys.has(key))
    if (!keys.length) {
      const row = door.keys.find((key) => goneKeys.has(key) && !hiddenKeys.has(key))
      if (row) return { via: 'row', key: row, leadsTo }
      return { via: 'words', key: door.keys[0], leadsTo }
    }
    return { via: door.via, keys, url: target.url }
  }
  if (door.via === 'words') return { via: 'words', key: door.key, leadsTo }
  if (door.via === 'menu') return menuOrder(door, target)
  return alreadyOpens(link, target) ?? noDoor(link, leadsTo)
}

function alreadyOpens(link, target) {
  if (target.kind !== 'page' || !link?.target) return null
  if (slashless(link.target) !== slashless(target.page.path)) return null
  return alive(target)
}

const alive = (target) => ({
  status: 'written',
  key: null,
  reason: `it already opens ${target.page.id}, so there is nothing to write; read: the page is still published`,
  ordered: '1',
  readFrom: target.alive
})

/**
 * A kept link no door holds is refused, never skipped (ADR 0044, decision 21): the template prints it with the demo's address, and
 * the site check's `plan-links` blocks on it. A control the template prints with no address names the template as what must change.
 */
export const refusedLine = (reason, extra = {}) => ({ status: 'refused', reason, key: null, ...extra })

function noDoor(link, leadsTo) {
  const keeps = link?.target ? ` and it keeps opening ${link.target}` : ''
  const dead = !link?.target && link?.action === 'page-control'
  return refusedLine(
    `no door holds this link: the template prints it${keeps}${dead ? ' with no address' : ''}, so the plan's ${leadsTo} cannot reach the site${
      dead ? '; the template must print it as a link with an address the site holds' : ''
    }`,
    dead ? { deadControl: true } : {}
  )
}

function menuOrder({ item, row, link }, target) {
  if (!row) return failed(`${link.menuItem} is no menu item of this site`)
  const type = String(row.type ?? '')
  if (type === 'heading' || type === 'separator')
    return {
      status: 'skipped',
      key: null,
      reason: `${link.menuItem} is a ${type}, not a link, so it opens nothing`
    }
  if (type === 'url') return { via: 'menu', item, url: target.url }
  if (target.kind === 'page' && target.row === item) return alive(target)
  return failed(
    `${link.menuItem} is a ${type || 'component'} item, a page of its own: its target cannot move without replacing that page`
  )
}

/** @returns {object} the fields of the link's report line */
export function lineResult(order, done) {
  if (order.status) return order
  const { written, refused, settled, hides, hiddenKeys, leaving, menuDone } = done
  if (order.via === 'slot') {
    const [key] = order.keys
    if (refused.has(key))
      return failed(refusalWords(refused.get(key)), { key, refusal: refused.get(key), ordered: order.url })
    if (!written.has(key)) return { status: 'skipped', reason: ENDED, key }
    // The other keys of a shared address go in the same call: the next run needs to know they hold it too.
    const alsoKeys = (order.alsoKeys ?? []).filter((other) => written.has(other))
    return {
      status: 'written',
      reason: null,
      key,
      ordered: order.url,
      ...(alsoKeys.length ? { alsoKeys } : {})
    }
  }
  if (order.via === 'label') return labelResult(order, hides)
  if (order.via === 'control') return controlResult(order, hides)
  if (order.via === 'words') return wordsResult(order, hiddenKeys, hides)
  if (order.via === 'map') return mapResult(order, settled)
  if (order.via === 'row') return rowResult(order, done.removed ?? new Map())
  const id = `menuItem-${order.item}`
  if (leaving.has(id)) return leftMenu(id, settled)
  const words = menuDone.get(order)
  if (words === undefined) return { status: 'skipped', reason: ENDED, key: null }
  return words === 'done'
    ? {
        status: 'written',
        reason: null,
        key: null,
        ordered: order.url,
        readFrom: readRow('menuItem', order.item, 'link')
      }
    : failed(words, { key: null, ordered: order.url })
}

/** The plan sends a link somewhere and hides the words it shows: a link with no words is an empty box, so it goes with them. */
function labelResult({ label, leadsTo }, hides) {
  const hidden = hides?.get(label)
  if (!hidden) return { status: 'skipped', reason: ENDED, key: null }
  const conflict = `the plan sends this link to ${leadsTo} but hides ${label}, the words it shows`
  const { status, key, ordered, readFrom } = hidden
  if (status !== 'hidden')
    return failed(`${conflict}, and they could not be hidden, so the link stays: ${hidden.reason}`, {
      key: key ?? null,
      conflict: true
    })
  return {
    status,
    conflict: true,
    key: key ?? null,
    reason: `${conflict}: with no words it would be an empty box, so it left with them`,
    leftWith: label,
    ...(ordered === undefined ? {} : { ordered }),
    ...(readFrom ? { readFrom } : {})
  }
}

/** The template prints this control only with a stored address, which is leaving: the link goes with the control. */
function controlResult({ slot, key, noDoor }, hides) {
  const hidden = hides?.get(slot)
  if (!hidden) return { status: 'skipped', reason: ENDED, key }
  if (hidden.status !== 'hidden')
    return failed(`${noDoor}; ${key} could not leave: ${hidden.reason}`, { key })
  const { status, ordered, readFrom } = hidden
  return {
    status,
    key,
    leftWith: key,
    reason: `its control is printed only with the stored address ${key}, which left, so this link left with its control`,
    ...(ordered === undefined ? {} : { ordered }),
    ...(readFrom ? { readFrom } : {})
  }
}

/** A link printed inside a slot of words: it leaves with that slot, and nothing rewrites one address among the words. */
function wordsResult({ key, leadsTo }, hiddenKeys, hides) {
  const slot = hiddenKeys.get(key)
  if (!slot)
    return failed(
      `this link is inside the words of ${key}, and no door rewrites one address among words, so the plan's ${leadsTo} cannot reach the site`,
      { key }
    )
  const hidden = hides?.get(slot)
  if (!hidden) return { status: 'skipped', reason: ENDED, key }
  const { status, ordered, readFrom } = hidden
  const reason =
    status === 'hidden'
      ? `the plan hides ${key}, and this link leaves with it`
      : `this link stays, because ${key} that holds it could not be hidden: ${hidden.reason}`
  return {
    status,
    reason,
    key,
    ...(status === 'hidden' ? { leftWith: key } : {}),
    ...(ordered === undefined ? {} : { ordered }),
    ...(readFrom ? { readFrom } : {})
  }
}

/** The link's address is held in a row the plan gives up: it leaves with the row, which the hide stage removes whole. */
function rowResult({ key, leadsTo }, removed) {
  const done = removed.get(key)
  if (done === undefined) return { status: 'skipped', reason: ENDED, key }
  if (done !== true)
    return failed(`this link is held in a row the plan gives up, and the row could not leave: ${done}`, {
      key
    })
  return {
    status: 'hidden',
    key,
    leftWith: key,
    reason: `this link is held in a row the plan gives up, so the plan's ${leadsTo} is not written and the link left with its row`,
    ordered: 'removed',
    readFrom: { action: 'content.contract', params: { operation: 'inspect' }, path: ['removedSlots', key] }
  }
}

/** What a map no slot holds needs before it can move: named on the line, so the owner can route it. */
export const MAP_NEEDS =
  'the map it opens is drawn from settings no slot holds (the map plugin params): it needs a door for those params in the Claude Cowork plugin, or a template that prints the map from a slot or links to the address'

/** A maps link that searches an address, as the kit read the template's own link: the template prints it. */
const mapsSearch = (target) => mapsAddress(target) !== null

function mapResult({ slotId, searches }, settled) {
  // Card AP: a template that prints this button as a maps search of the address it prints draws no map from settings, so there is
  // nothing to refuse and nothing to write here: the address slot is written, and the site check's map-location reads the link.
  if (!slotId && searches)
    return {
      status: 'skipped',
      key: null,
      reason:
        "this button is the template's maps search of the address the page prints, not a map drawn from settings: the address is written with the page, and map-location reads where the link leads"
    }
  if (!slotId) return refusedLine(`this button opens a map that stays at the demo place: ${MAP_NEEDS}`)
  const done = settled.get(slotId)
  if (!done)
    return {
      status: 'skipped',
      key: null,
      reason: `this button opens the map setting${slotId ? ` ${slotId}` : ''}, which the page settings stage fills from the address`
    }
  return {
    ...done,
    key: null,
    reason: `this button opens the map setting ${slotId}: ${done.reason ?? 'written by the page settings stage'}`
  }
}

function leftMenu(item, settled) {
  const done = settled.get(item)
  if (!done) return { status: 'skipped', reason: ENDED, key: null }
  if (done.status === 'written')
    return {
      status: 'hidden',
      reason: `the plan takes ${item} off the site, and this link leaves with it`,
      key: null,
      leftWith: item,
      ordered: done.ordered,
      readFrom: done.readFrom
    }
  return failed(`this link stays with ${item}: ${done.reason}`, { key: null })
}
