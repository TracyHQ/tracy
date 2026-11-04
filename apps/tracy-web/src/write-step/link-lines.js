// A link line of the write report (TracyHQ/tracy#371): `lineOrder` says what the link stage will do with a plan link, whose door and
// address are known, and `lineResult` says what became of it once the writes are done.
import { contentMapKey } from '../site-writer/contract-mapping.js'
import { refusalWords } from './contract-write.js'
import { actsInsidePage, slashless } from './link-doors.js'
import { readRow } from './settings-door.js'

const ENDED = 'the run ended before this link was written'
export const failed = (reason, extra = {}) => ({ status: 'failed', reason, key: null, ...extra })

/** What becomes of a link whose door is known and whose address is `target`, before the writes. */
export function lineOrder(claim, door, target, { hiddenKeys, leaving }) {
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
  if (target.kind === 'map') return { via: 'map', slotId: link?.opens?.slotId ?? null }
  if (actsInsidePage(link) || leadsTo === 'lightbox')
    return {
      status: 'skipped',
      key: null,
      reason: `a control that acts inside the page has no address, so the plan's ${leadsTo} is not written`
    }
  if (target.kind === 'failed') return failed(target.reason)
  if (door.via === 'slot' || door.via === 'shared') {
    const keys = door.keys.filter((key) => !hiddenKeys.has(key))
    if (!keys.length) return { via: 'words', key: door.keys[0], leadsTo }
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

function noDoor(link, leadsTo) {
  const keeps = link?.target ? ` and it keeps opening ${link.target}` : ''
  return failed(
    `no door holds this link: the template prints it${keeps}, so the plan's ${leadsTo} cannot reach the site`
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
    return written.has(key)
      ? { status: 'written', reason: null, key, ordered: order.url }
      : { status: 'skipped', reason: ENDED, key }
  }
  if (order.via === 'label') return labelResult(order, hides)
  if (order.via === 'words') return wordsResult(order, hiddenKeys, hides)
  if (order.via === 'map') return mapResult(order, settled)
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
    ...(ordered === undefined ? {} : { ordered }),
    ...(readFrom ? { readFrom } : {})
  }
}

function mapResult({ slotId }, settled) {
  const done = slotId ? settled.get(slotId) : null
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
      ordered: done.ordered,
      readFrom: done.readFrom
    }
  return failed(`this link stays with ${item}: ${done.reason}`, { key: null })
}
