// The accounting of the marker build (ticket #585): each place of the universe (`universe.mjs`) classed once, with
// the evidence the build team's own step values give. Nothing here decides what a build should write: it reads what
// the write plan writes and what it, the write order and the rules gate say they left, and calls a place unexplained
// when none of them says anything about it. Pure.
import { ACCOUNT, placeKeyOf, universeOf } from './universe.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const lastOf = (entry) =>
  String(entry ?? '')
    .split('.')
    .at(-1)

/** The places a write plan writes (a value's location) or takes out (a removed element), by place key. */
export function writtenPlaces(writePlan) {
  const written = new Map()
  for (const op of list(writePlan?.ops)) {
    for (const v of list(op.values))
      written.set(placeKeyOf(v.loc), { how: 'written', op: op.key, entry: v.entry })
    for (const r of list(op.removes)) {
      const key = placeKeyOf({ ...r.loc, xpath: r.xpath ?? r.loc?.xpath })
      if (!written.has(key)) written.set(key, { how: 'removed', op: op.key })
    }
  }
  return written
}

/** The row cuts of a write plan (`hides.row`: the rows of a stored list the write takes out, all but `kept`). */
const cutsOf = (writePlan) =>
  list(writePlan?.ops).flatMap((op) => list(op.cuts).map((c) => ({ ...c, op: op.key })))

/** The cut that takes out the row a location sits in, if any. */
function cutFor(loc, cuts) {
  const path = list(loc.jsonPath)
  return cuts.find((c) => {
    const parent = list(c.row?.parent)
    if (c.row?.entity !== loc.entity || c.row?.column !== loc.column) return false
    if (parent.some((p, i) => path[i] !== p)) return false
    const array = path[parent.length]
    const index = path[parent.length + 1]
    return list(c.row.arrays).includes(array) && Number.isInteger(index) && !list(c.kept).includes(index)
  })
}

/** The order's blocks of each kit block, with the entry prefix of each (`<page>.<plan block>`). */
function orderBlocksOf(order) {
  const out = new Map()
  for (const page of list(order?.pages))
    for (const block of list(page.blocks)) {
      if (!out.has(block.block)) out.set(block.block, [])
      out.get(block.block).push({ prefix: `${page.id}.${block.id}`, state: block.state })
    }
  return out
}

/**
 * The reasons the write plan and the write order give for this place: a skipped entry of one of the blocks naming the
 * field, or a hide of the whole block, of the child list the place sits in, or of the field.
 */
function reasonsOf(prefixes, place, skipped, hidden) {
  const reasons = new Set()
  const under = (at, p) => at === p || at.startsWith(`${p}.`)
  for (const s of skipped)
    if (prefixes.some((p) => under(s.entry, p)) && lastOf(s.entry) === place.field) reasons.add(s.reason)
  for (const h of hidden) {
    const at = String(h.at ?? '')
    const p = prefixes.find((x) => under(at, x))
    if (p === undefined) continue
    const rest = at
      .slice(p.length + 1)
      .split('.')
      .filter(Boolean)
    const item = rest.length === 1 && /-marker-\d+$/.test(rest[0])
    if (!rest.length || rest.includes(place.field) || (place.list && rest[0] === place.list) || item)
      reasons.add(`hidden:${h.reason ?? 'order'}`)
  }
  return [...reasons]
}

/** The field names of each fact in the block fields that read it (`{fact: name}`), for the skip reasons of a fact. */
function factFieldsOf(mapping) {
  const out = new Map()
  for (const d of Object.values(mapping?.blocks ?? {}))
    for (const [field, v] of Object.entries(d?.fields ?? {}))
      if (typeof v?.fact === 'string') out.set(v.fact, new Set([...(out.get(v.fact) ?? []), field]))
  return out
}

/** The design typed fields of each block of the store, by block id. */
function designFieldsOf(blockStore) {
  const out = new Map()
  for (const b of blockStore?.blocks ?? [])
    out.set(
      b.id,
      new Set(
        [...(b.fields ?? []), ...(b.itemFields ?? [])].filter((f) => f?.type === 'design').map((f) => f.name)
      )
    )
  return out
}

/**
 * Class every place of the kit's mapping.
 * @param {{mapping: object}} kit
 * @param {{writePlan: object, order: object, gaps?: object[]}} built the marker build (`marker-plan.mjs`)
 * @returns {{counts: Record<string, number>, places: object[]}}
 */
export function accountFor({ mapping, blockStore }, { writePlan, order, gaps = [] }) {
  const universe = universeOf(mapping)
  const written = writtenPlaces(writePlan)
  const cuts = cutsOf(writePlan)
  const blocks = orderBlocksOf(order)
  const skipped = list(writePlan?.skipped)
  const conflicts = list(writePlan?.conflicts)
  const hidden = list(order?.hidden)
  const factFields = factFieldsOf(mapping)
  const design = designFieldsOf(blockStore)
  const gapBlocks = new Map()
  for (const g of gaps) for (const b of g.blocks) gapBlocks.set(b.split('/')[1], g)
  const places = []
  for (const place of universe.values()) {
    const done = (account, why) =>
      places.push({
        key: place.key,
        owner: place.owner,
        block: place.block ?? null,
        field: place.field,
        account,
        why
      })
    const hit = written.get(place.key)
    if (hit) {
      done(ACCOUNT.written, hit.how)
      continue
    }
    const cut = cutFor(place.loc, cuts)
    if (cut) {
      done(ACCOUNT.written, `row cut (${cut.rule})`)
      continue
    }
    if (place.owner === 'design' || design.get(place.block)?.has(place.field)) {
      done(ACCOUNT.declared, 'design line: the build never writes it')
      continue
    }
    if (place.owner === 'language') {
      const o = place.language
      if (o.keep) done(ACCOUNT.declared, `language string kept: ${o.keep}`)
      else if (o.value !== undefined) done(ACCOUNT.declared, 'language string set by the kit')
      else
        done(
          ACCOUNT.skipped,
          `language string filled by ${
            list(o.filledBy)
              .map((f) => `${f.block}.${f.field}`)
              .join(', ') || 'a block'
          }, not written`
        )
      continue
    }
    if (place.owner === 'fact') {
      const fields = factFields.get(place.field) ?? new Set()
      const reasons = new Set(
        skipped.filter((s) => s.fact === place.field || fields.has(lastOf(s.entry))).map((s) => s.reason)
      )
      done(
        reasons.size ? ACCOUNT.skipped : ACCOUNT.unexplained,
        reasons.size ? [...reasons].join(', ') : 'no operation and no skip reason'
      )
      continue
    }
    const owners = [place.block, ...place.also].filter(Boolean)
    const prefixes = owners.flatMap((b) => (blocks.get(b) ?? []).map((x) => x.prefix))
    if (!prefixes.length) {
      const gap = owners.map((b) => gapBlocks.get(b)).find(Boolean)
      done(
        ACCOUNT.skipped,
        gap ? `write step gap: ${gap.code} (${gap.cause ?? gap.record})` : 'block not placed by the chain'
      )
      continue
    }
    const reasons = reasonsOf(prefixes, place, skipped, hidden)
    const conflicted = conflicts.some(
      (c) => prefixes.some((p) => c.entry.startsWith(`${p}.`)) && lastOf(c.entry) === place.field
    )
    if (conflicted) reasons.push('conflict')
    done(
      reasons.length ? ACCOUNT.skipped : ACCOUNT.unexplained,
      reasons.length ? reasons.join(', ') : 'no operation and no skip reason'
    )
  }
  const counts = { universe: places.length }
  for (const a of Object.values(ACCOUNT)) counts[a] = places.filter((p) => p.account === a).length
  return { counts, places }
}
