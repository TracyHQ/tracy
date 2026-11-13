/**
 * The check of a blank site contract against the released contract it is made from (ticket #584, gate
 * `ai-quickstart-contract`). Every problem, each `{file, at, message}`:
 *
 * - its id is the blank site id of the released contract, and it names the released files' sha256;
 * - its entities are the released ones less those the blank site step removes (run on the contract's own rows,
 *   `lockDump`), in released order, each the released entity but for identity fields the blank site rewrites;
 * - its slots are the released slots of those entities, byte for byte, but for each slot the blank site empties: its
 *   sample is the value the blank site leaves there and it opens empty (`blank-site-contract-samples.mjs`), so no
 *   demo text the blank site no longer has is left in it, and no other slot changed;
 * - no entity the blank site removes is named anywhere in it;
 * - every mapping location naming a slot of a record the blank site keeps has that slot in it, and no location on a
 *   record the build creates does.
 */

import { BLANK_SITE_STEPS, produceBlankSite } from './blank-site.mjs'
import { BLANK_CONTRACT_DIR, blankSiteContractId, lockDump, removedEntities } from './blank-site-contract.mjs'
import { blankSlot, emptiedSamples } from './blank-site-contract-samples.mjs'
import { mappingLocations } from './door-proof-cases.mjs'

const json = (v) => JSON.stringify(v)

/** Every string in `value` that is one of `keys` or starts with one of them and a dot, with where it sits. */
function namesOf(value, keys, at, found) {
  const hit = (s) => keys.has(s) || keys.has(s.split('.')[0])
  if (typeof value === 'string') {
    if (hit(value)) found.push({ at, name: value })
  } else if (Array.isArray(value)) value.forEach((v, i) => namesOf(v, keys, `${at}[${i}]`, found))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (hit(k)) found.push({ at: `${at}.${k}`, name: k })
      namesOf(v, keys, `${at}.${k}`, found)
    }
  return found
}

/**
 * @param {{ mapping: object, released: {manifest, contentMap, lock, sha256: Record<string,string>},
 *   blank: {manifest, contentMap, lock}, emptyHtml?: Function }} input
 */
export function checkBlankSiteContract({ mapping, released, blank, emptyHtml }) {
  const problems = []
  const add = (file, at, message) => problems.push({ file: `${BLANK_CONTRACT_DIR}/${file}`, at, message })
  const id = blankSiteContractId(released.manifest.id)
  if (blank.manifest.id !== id) add('manifest.json', 'id', `must be ${id}`)
  if (blank.manifest.blankSiteOf?.contract !== released.manifest.id)
    add('manifest.json', 'blankSiteOf.contract', `must name ${released.manifest.id}`)
  for (const [file, sha] of Object.entries(released.sha256))
    if (blank.manifest.blankSiteOf?.files?.[file] !== sha)
      add(
        'manifest.json',
        `blankSiteOf.files.${file}`,
        `the released ${file} is ${sha}: make the blank site contract again`
      )

  const own = lockDump(released)
  const removed = removedEntities({
    contentMap: released.contentMap,
    before: own,
    after: produceBlankSite(own, { steps: BLANK_SITE_STEPS }).sql
  })
  const gone = new Set(removed)
  const kept = released.contentMap.entities.filter((e) => !gone.has(e.key))
  const entities = blank.contentMap.entities ?? []
  if (json(entities.map((e) => e.key)) !== json(kept.map((e) => e.key)))
    add(
      'content-map.json',
      'entities',
      `must be the ${kept.length} released entities the blank site keeps, in order`
    )
  for (const e of entities) {
    const r = kept.find((k) => k.key === e.key)
    if (!r) continue
    const { identity: a, ...restA } = e
    const { identity: b, ...restB } = r
    if (json(restA) !== json(restB))
      add('content-map.json', `entities[${e.key}]`, 'differs from the released entity')
    const extra = Object.keys(a).filter((k) => !(k in b) && k !== 'id')
    if (Object.keys(b).some((k) => !(k in a)) || extra.length)
      add('content-map.json', `entities[${e.key}].identity`, 'must keep the released identity fields')
  }
  const keptSlots = released.contentMap.slots.filter((s) => !gone.has(s.entity))
  const emptied = emptiedSamples({ mapping, slots: keptSlots, ...(emptyHtml ? { emptyHtml } : {}) })
  const blankSlots = blank.contentMap.slots ?? []
  if (json(blankSlots.map((s) => s.key)) !== json(keptSlots.map((s) => s.key)))
    add(
      'content-map.json',
      'slots',
      `must be the ${keptSlots.length} released slots of the kept entities, in order`
    )
  else
    keptSlots.forEach((s, i) => {
      if (json(blankSlots[i]) === json(blankSlot(s, emptied))) return
      add(
        'content-map.json',
        `slots[${s.key}]`,
        emptied.has(s.key)
          ? 'the blank site empties it: its sample must be the blank value, and it must open empty when that is empty'
          : 'differs from the released slot'
      )
    })

  for (const [file, doc] of [
    ['content-map.json', blank.contentMap],
    ['presentation-lock.json', blank.lock]
  ])
    for (const { at, name } of namesOf(doc, gone, '', []).slice(0, 20))
      add(file, at.slice(1), `names ${name}, a record the blank site removes`)
  if (
    json(Object.keys(blank.lock.entities ?? {})) !==
    json(Object.keys(released.lock.entities).filter((k) => !gone.has(k)))
  )
    add('presentation-lock.json', 'entities', 'must be the released rows of the kept entities')
  else
    for (const [key, row] of Object.entries(blank.lock.entities))
      if (json(row) !== json(released.lock.entities[key]))
        add('presentation-lock.json', `entities.${key}`, 'differs from the released row')

  const named = new Set(blankSlots.map((s) => s.key))
  for (const { at, loc } of mappingLocations(mapping)) {
    if (!loc.slot) continue
    const created = Boolean(mapping.entities?.[loc.entity]?.created)
    if (!created && !named.has(loc.slot))
      add(
        'content-map.json',
        'slots',
        `mapping.json ${at.slice(1)}: slot ${loc.slot} of a kept record is missing`
      )
    if (created && named.has(loc.slot))
      add(
        'content-map.json',
        'slots',
        `mapping.json ${at.slice(1)}: slot ${loc.slot} is on a record the build creates`
      )
  }
  return problems
}
