// Self-checks that what a visitor reaches through the demo can be pointed at the customer: a button that leads somewhere, a map
// that can move, a phone number that can be tapped. Each counts from the kit alone, so `build` and every settle command count
// them the same way, and each must be 0 for a planner to use the kit:
//   deadControls        a link that shows words, acts inside the page (`action: page-control`) and has no door: nothing it opens
//                       (`opens`), no address (`target`), no menu item. The template prints it with a dead address (`href="#"`),
//                       so a plan that keeps it and sends it to a page cannot reach the site; the template must print a real link
//   mapLocationUnmapped a map the demo prints that no slot can move: a button that opens a map (`opens.shows: "map"`) with no
//                       `slotId`, or a block whose read found an embedded map (`embeddedMaps`, a maps address or coordinates)
//                       with no map-location setting slot on its entity. The map then stays at the demo's place
//   phoneNotCallable    a phone number the page prints outside any link: a `contact.phone` slot (or a contact block's printed
//                       mobile field) that no link of its block shows as its words, so no address can make it `tel:`
// Each count goes to `kit.checks`; the first failing links, blocks and slots of each go to `kit.coverage.failures`
// (`{part, where, reason}`), where the Road to live step and /ops name them. A failure a person explained in
// `reach-accepts.json` (check-accepts.mjs) is still counted, and listed in `kit.checkAccepts.<part>` instead.
// A phone the demo leaves empty (a contact field with `filled: false`, a phone slot whose sample has no words) prints
// nothing, so it is not counted.
import { settleCheckParts } from './check-accepts.mjs'

export const REACH_PARTS = ['deadControls', 'mapLocationUnmapped', 'phoneNotCallable']
const NAMED = 20 // failures listed per part; the count says how many there are

const each = (value) => (Array.isArray(value) ? value : [])
const hasWords = (text) => /[\p{L}\p{N}]/u.test(String(text ?? ''))
const PHONE_ROLE = /(?:^|\.)phone$/

/** Every slot a block declares: its own, its demo facts and its list rows. */
function slotsOf(block) {
  return [
    ...each(block?.slots),
    ...each(block?.demoOwned),
    ...each(block?.lists).flatMap((l) => [
      ...each(l?.rowSlots),
      ...each(l?.rows).flatMap((r) => each(r?.slots))
    ])
  ]
}

/** A link with words and no door: the template prints it, and nothing can send it anywhere. */
export const isDeadControl = (link) =>
  link?.action === 'page-control' &&
  hasWords(link.label) &&
  !link.opens &&
  !link.target &&
  !link.menu &&
  !link.menuItem &&
  link.icon?.mechanism !== 'image-file'

function deadControlsOf(kit) {
  const out = []
  for (const b of each(kit?.blocks))
    for (const l of each(b?.links))
      if (isDeadControl(l))
        out.push({
          where: `links[${l.id}]`,
          reason: `link ${l.id} of block ${b.id} ("${String(l.label).slice(0, 40)}") acts inside the page and opens nothing: the template prints it with no address, so no plan can send it to a page`
        })
  return out
}

function unmappedMapsOf(kit) {
  const out = []
  const mapSlots = each(kit?.site?.settingSlots).filter((s) => s?.kind === 'map-location')
  const mappedEntities = new Set(mapSlots.map((s) => s?.writeTo?.entity).filter(Boolean))
  for (const b of each(kit?.blocks)) {
    for (const l of each(b?.links))
      if (l?.opens?.shows === 'map' && !l.opens.slotId)
        out.push({
          where: `links[${l.id}]`,
          reason: `link ${l.id} of block ${b.id} opens a map no slot holds (${l.opens.writableReason ?? 'no map setting slot'}): it stays at the demo's place`
        })
    const maps = each(b?.embeddedMaps)
    const entity = b?.source?.entity
    if (maps.length && !(entity && mappedEntities.has(entity)))
      out.push({
        where: `blocks[${b.id}]`,
        reason: `block ${b.id} prints a map (${String(maps[0]?.what ?? 'embedded map').slice(0, 60)}) and no map-location slot holds its place: it stays at the demo's place`
      })
  }
  return out
}

function uncallablePhonesOf(kit) {
  const out = []
  const seen = new Set()
  const add = (b, id, what) => {
    if (seen.has(id)) return
    seen.add(id)
    out.push({
      where: `slots[${id}]`,
      reason: `${what} ${id} of block ${b.id} prints outside any link, so no address makes it callable: the template must print it inside a tel: link`
    })
  }
  const labels = (b) =>
    new Set(
      each(b?.links)
        .map((l) => l?.labelId)
        .filter(Boolean)
    )
  const byBlock = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  for (const b of each(kit?.blocks)) {
    const named = labels(b)
    for (const s of slotsOf(b))
      if (
        PHONE_ROLE.test(String(s?.role ?? '')) &&
        s?.id &&
        !named.has(s.id) &&
        !(typeof s.sample === 'string' && !hasWords(s.sample))
      )
        add(b, s.id, 'phone slot')
  }
  for (const c of each(kit?.site?.contactBlocks)) {
    const b = byBlock.get(c?.block)
    if (!b) continue
    const named = labels(b)
    for (const f of each(c?.accepts?.fields))
      if (
        (f?.kind === 'phone' || f?.kind === 'mobile') &&
        f.printed &&
        f.filled !== false &&
        f.writable &&
        f.id &&
        !named.has(f.id)
      )
        add(b, f.id, `${f.kind} field`)
  }
  return out
}

/**
 * Count the checks on `kit` (changed in place: `checks`, `checkAccepts` and `coverage.failures`) and return the counts.
 * @param {object} kit
 * @param {{accepts?: object[]}} [o] the entries of reach-accepts.json (readCheckAccepts)
 */
export function reachChecks(kit, { accepts = [] } = {}) {
  const found = {
    deadControls: deadControlsOf(kit),
    mapLocationUnmapped: unmappedMapsOf(kit),
    phoneNotCallable: uncallablePhonesOf(kit)
  }
  return settleCheckParts(kit, found, { accepts, named: NAMED })
}

/** The maps a block's read found on the demo (read-details.js `maps`), kept on the block for `mapLocationUnmapped`. */
export function keepEmbeddedMaps(kit, readings) {
  for (const b of each(kit?.blocks)) {
    const maps = each(readings?.get?.(b.id)?.maps)
    if (maps.length) b.embeddedMaps = maps.slice(0, 5)
    else delete b.embeddedMaps
  }
}
