// The accounting of the marker build (ticket #585): each place of the universe (`universe.mjs`) classed once, with
// the evidence the build team's own step values give. Nothing here decides what a build should write: it reads what
// the write plan writes and what it, the write order and the rules gate say they left, and calls a place unexplained
// when none of them says anything about it. Pure.
import { accountBuildPlace } from './accounting-build.mjs'
import { pageShapesOf, unbuiltOf } from './marker-composition.mjs'
import { ACCOUNT, placeKeyOf, uncoveredLocations, universeOf } from './universe.mjs'

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

/** The blocks whose fields read each fact (`{fact: name}`). */
function factBlocksOf(mapping) {
  const out = new Map()
  for (const [block, d] of Object.entries(mapping?.blocks ?? {}))
    for (const v of Object.values(d?.fields ?? {}))
      if (typeof v?.fact === 'string') out.set(v.fact, [...(out.get(v.fact) ?? []), block])
  return out
}

/** The code of a write step gap: its code and cause (`redo_failed:write_failed`). */
const gapCode = (gap) => (gap.cause && gap.cause !== gap.code ? `${gap.code}:${gap.cause}` : gap.code)

/**
 * The gaps that took a whole page out, by page type: a gap naming the page (`<type>/*`) or emptying its main block (the
 * rules gate then drops the page), so every block of that page's recipe is left unplaced by that gap.
 */
function pageGapsOf(gaps, pageRecipes) {
  const main = new Map(list(pageRecipes?.recipes).map((r) => [r.pageType, r.mainBlock]))
  const out = new Map()
  for (const g of gaps)
    for (const b of list(g.blocks)) {
      const [type, block] = b.split('/')
      if ((block === '*' || block === main.get(type)) && !out.has(type)) out.set(type, g)
    }
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

/** The blocks every page recipe that places them is of a page type the kit declares unbuilt, with that page's code. */
function unbuiltBlocksOf(pageRecipes, mapping) {
  const unbuilt = unbuiltOf(mapping)
  const built = new Set(pageShapesOf(pageRecipes, mapping).flatMap((p) => p.blocks))
  const out = new Map()
  for (const r of list(pageRecipes?.recipes))
    if (unbuilt.has(r.pageType))
      for (const b of [...list(r.blocks), ...list(r.variants).flatMap((v) => list(v.blocks))])
        if (!built.has(b)) out.set(b, { pageType: r.pageType, ...unbuilt.get(r.pageType) })
  return out
}

/**
 * Class every place of the kit's mapping. Every place carries `by` (`writer`: the build team's chain; `marker_plan`:
 * the gate's own plan; `kit`: the kit declares it) and `code` (the reason code that chain gives, the first when several).
 * @param {{mapping: object, blockStore?: object, pageRecipes?: object}} kit
 * @param {{writePlan: object, order: object, gaps?: object[]}} built the marker build (`marker-plan.mjs`)
 * @returns {{counts: Record<string, number>, places: object[]}}
 */
export function accountFor({ mapping, blockStore, pageRecipes }, { writePlan, order, gaps = [] }) {
  const universe = universeOf(mapping)
  const written = writtenPlaces(writePlan)
  const cuts = cutsOf(writePlan)
  const blocks = orderBlocksOf(order)
  const skipped = list(writePlan?.skipped)
  const conflicts = list(writePlan?.conflicts)
  const hidden = list(order?.hidden)
  const unproven = list(writePlan?.unproven)
  const factFields = factFieldsOf(mapping)
  const design = designFieldsOf(blockStore)
  const unbuilt = unbuiltOf(mapping)
  const unbuiltBlocks = unbuiltBlocksOf(pageRecipes, mapping)
  const gapBlocks = new Map()
  for (const g of gaps) for (const b of g.blocks) gapBlocks.set(b.split('/')[1], g)
  const pageGaps = pageGapsOf(gaps, pageRecipes)
  for (const shape of pageShapesOf(pageRecipes, mapping)) {
    const g = pageGaps.get(shape.pageType)
    if (g) for (const b of shape.blocks) if (!gapBlocks.has(b)) gapBlocks.set(b, g)
  }
  const factBlocks = factBlocksOf(mapping)
  const places = []
  for (const place of universe.values()) {
    const done = (account, why, by = null, code = null) =>
      places.push({
        key: place.key,
        owner: place.owner,
        block: place.block ?? null,
        field: place.field,
        // A place the gate's own plan left is a failure of the gate's coverage: unexplained, never a skip.
        account: by === 'marker_plan' ? ACCOUNT.unexplained : account,
        by: account === ACCOUNT.written ? 'writer' : by,
        code: account === ACCOUNT.written ? 'written' : code,
        why
      })
    if (place.owner === 'build') {
      const a = accountBuildPlace(place, { writePlan, order, gaps, unbuilt })
      done(a.account, a.why, a.by, a.code)
      continue
    }
    if (place.owner === 'setting') {
      done(ACCOUNT.declared, `setting set by the kit: ${place.setting.why ?? ''}`, 'kit', 'setting_set')
      continue
    }
    if (place.owner === 'emptied') {
      done(
        ACCOUNT.declared,
        `emptied and never written: ${place.emptied.why ?? ''}`,
        'kit',
        'emptied_not_written'
      )
      continue
    }
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
      done(ACCOUNT.declared, 'design line: the build never writes it', 'kit', 'design_line')
      continue
    }
    if (place.owner === 'language') {
      const o = place.language
      if (o.keep) done(ACCOUNT.declared, `language string kept: ${o.keep}`, 'kit', 'language_kept')
      else if (o.value !== undefined)
        done(ACCOUNT.declared, 'language string set by the kit', 'kit', 'language_set')
      else
        done(
          ACCOUNT.skipped,
          `language string filled by ${
            list(o.filledBy)
              .map((f) => `${f.block}.${f.field}`)
              .join(', ') || 'a block'
          }, not written`,
          'writer',
          'language_string_not_written'
        )
      continue
    }
    if (place.owner === 'seo' || place.owner === 'build_set') {
      done(ACCOUNT.unexplained, 'no operation writes it and no skip reason', null, 'not_written')
      continue
    }
    if (place.owner === 'fact' && place.loc.notWritten) {
      done(
        ACCOUNT.declared,
        `not written by ${place.loc.notWritten.by}: ${place.loc.notWritten.why}`,
        'kit',
        'not_written_by_decision'
      )
      continue
    }
    if (place.owner === 'fact') {
      const fields = factFields.get(place.field) ?? new Set()
      const reasons = new Set(
        skipped.filter((s) => s.fact === place.field || fields.has(lastOf(s.entry))).map((s) => s.reason)
      )
      // The write plan's own word that it has no door for a site setting (`identity_field_no_door`).
      for (const u of unproven)
        if (u?.column && place.loc.entity === 'settings' && u.column === place.loc.column) reasons.add(u.code)
      // A record a write step gap took out (the page that creates it): `contact-1` of `contact:page.contact`.
      const kind = /^([a-z]+)-\d+$/.exec(place.loc.entity ?? '')?.[1]
      const gap = kind && gaps.find((g) => String(g.record).startsWith(`${kind}:`))
      // Every block that reads the fact taken out by write step gaps: no entry of the fact is left to write.
      const readers = factBlocks.get(place.field) ?? []
      const taken = !reasons.size && readers.length && readers.every((b) => gapBlocks.has(b))
      const byGap = gap ?? (taken ? gapBlocks.get(readers[0]) : null)
      if (byGap) reasons.add(`write step gap: ${byGap.code} (${byGap.cause ?? byGap.record})`)
      done(
        reasons.size ? ACCOUNT.skipped : ACCOUNT.unexplained,
        reasons.size ? [...reasons].join(', ') : 'no operation and no skip reason',
        'writer',
        byGap && reasons.size === 1 ? gapCode(byGap) : [...reasons][0]
      )
      continue
    }
    const owners = [place.block, ...place.also].filter(Boolean)
    const prefixes = owners.flatMap((b) => (blocks.get(b) ?? []).map((x) => x.prefix))
    if (!prefixes.length) {
      const off = owners.map((b) => unbuiltBlocks.get(b)).find(Boolean)
      if (off && owners.every((b) => unbuiltBlocks.has(b))) {
        done(ACCOUNT.declared, `block only on page type ${off.pageType}, declared unbuilt`, 'kit', off.code)
        continue
      }
      const gap = owners.map((b) => gapBlocks.get(b)).find(Boolean)
      if (gap)
        done(
          ACCOUNT.skipped,
          `write step gap: ${gap.code} (${gap.cause ?? gap.record})`,
          'writer',
          gapCode(gap)
        )
      else done(ACCOUNT.skipped, 'block not placed by the marker plan', 'marker_plan', 'block_not_placed')
      continue
    }
    const reasons = reasonsOf(prefixes, place, skipped, hidden)
    const conflicted = conflicts.some(
      (c) => prefixes.some((p) => c.entry.startsWith(`${p}.`)) && lastOf(c.entry) === place.field
    )
    if (conflicted) reasons.push('conflict')
    done(
      reasons.length ? ACCOUNT.skipped : ACCOUNT.unexplained,
      reasons.length ? reasons.join(', ') : 'no operation and no skip reason',
      'writer',
      reasons[0]
    )
  }
  // The completeness guard: a location of the mapping the universe does not hold and no ignored key covers.
  for (const f of uncoveredLocations(mapping, universe))
    places.push({
      key: `uncovered:${f.path.join('.')}`,
      owner: 'mapping',
      block: null,
      field: f.path.join('.'),
      account: ACCOUNT.unexplained,
      by: 'marker_plan',
      code: 'location_not_in_universe',
      why: `a location at ${f.path.join('.')} is no place of the universe and no ignored mapping key covers it`
    })
  const counts = { universe: places.length }
  for (const a of Object.values(ACCOUNT)) counts[a] = places.filter((p) => p.account === a).length
  return { counts, places }
}
