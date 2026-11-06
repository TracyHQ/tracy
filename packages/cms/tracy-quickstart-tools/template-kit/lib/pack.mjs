// The kit pack: only the images a site build reads. The planner opens a page group's full-page shot to keep or drop
// the group, then the block shots of the pages it kept; writers and checkers look at 390 too. So the pack holds the
// full-page shots (every width) of one representative page per group and one shot per block per width (a block
// shared by many pages is one shot; the body blocks of pages sharing a layout use one shot, `shotOf`). The emptied
// frame shots and fixed-text before/after shots stay in the full set for review; the pack carries the canHide
// flags only. Everything else (every page, minimum evidence, crops, contact sheets) is made again by command.
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { imagesDigest } from '../../../../../apps/tracy-web/src/lib/template-kit/reader.js'
import { firstPageOf } from './kit-paths.mjs'
import { zipStore } from './zip-store.mjs'

const blocksOf = (page) => [
  ...new Set(Array.isArray(page?.blocks) ? page.blocks : Object.values(page?.blocks ?? {}).flat())
]

/**
 * The page that stands for its group: its root, the listing page whose items the others are (page-groups.mjs). With
 * no root among the pages, the one whose blocks cover the most of the group's blocks; a tie goes to a main menu page,
 * then the shortest path, then the id.
 * @returns {{page: string, why: string}|null}
 */
export function representativeOf(group, pageById) {
  const members = [group.root, ...(group.children ?? [])].filter((id) => pageById.has(id))
  if (!members.length) return null
  if (pageById.has(group.root) && !firstPageOf(pageById.get(group.root).path ?? ''))
    return {
      page: group.root,
      why: (group.children ?? []).length
        ? `the group's listing page, with its ${group.children.length} item page${group.children.length === 1 ? '' : 's'}`
        : 'the only page of the group'
    }
  // A further result page (`?start=6`) never stands for its group: page 1 does.
  const firsts = members.filter((id) => !firstPageOf(pageById.get(id).path ?? ''))
  const ids = firsts.length ? firsts : members
  const all = new Set(ids.flatMap((id) => blocksOf(pageById.get(id))))
  const score = (id) => {
    const p = pageById.get(id)
    return { id, covers: blocksOf(p).length, menu: p.inMainMenu ? 1 : 0, path: String(p.path ?? '') }
  }
  const [best, next] = ids
    .map(score)
    .sort(
      (a, b) =>
        b.covers - a.covers ||
        b.menu - a.menu ||
        a.path.length - b.path.length ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
  const tie = next && next.covers === best.covers
  const by = !tie
    ? 'most blocks'
    : next.menu !== best.menu
      ? 'most blocks, then a main menu page'
      : next.path.length !== best.path.length
        ? 'most blocks, then the shortest path'
        : 'most blocks, then the id'
  return {
    page: best.id,
    why: `covers ${best.covers} of the group's ${all.size} blocks (${ids.length} page${ids.length === 1 ? '' : 's'}; chosen by ${by})`
  }
}

/**
 * Self-check: a group with item pages is represented by its root, the listing page (`representative` when the pack
 * set it, else the one `representativeOf` picks). Returns how many groups are not.
 */
export function representativeChecks({ pages, pageGroups, errors }) {
  const pageById = new Map(pages.map((p) => [p.id, p]))
  let wrong = 0
  for (const g of pageGroups) {
    if (!(g.children ?? []).length || !pageById.has(g.root)) continue
    const rep = g.representative ?? representativeOf(g, pageById)?.page
    if (rep === g.root) continue
    wrong++
    errors.push({
      kind: 'representative-not-listing',
      field: `pageGroups[${g.id}].representative`,
      reason: `the group is represented by ${rep}, not by its listing page ${g.root}`
    })
  }
  return wrong
}

/**
 * What goes in the pack, and the self-check: every block a page lists has its shot at every width, unless the block
 * says it is not shown there (`notShownAt` with a reason).
 * @returns {{representatives: object, imageIds: Set<string>, missing: object[], excused: object[]}}
 */
export function packPlan(kit) {
  const widths = (kit.widths ?? [1440, 390]).map(String)
  const pageById = new Map((kit.pages ?? []).map((p) => [p.id, p]))
  const blockById = new Map((kit.blocks ?? []).map((b) => [b.id, b]))
  const imageIds = new Set()
  const add = (ref) => ref && imageIds.add(ref)
  const representatives = {}
  for (const g of kit.pageGroups ?? []) {
    const r = representativeOf(g, pageById)
    if (!r) continue
    representatives[g.id] = r
    for (const w of widths) add(pageById.get(r.page)?.images?.[w])
  }
  // One shot per block per width; a body block of a page sharing its layout uses its exemplar's shot (`shotOf`).
  // Emptied and before/after shots stay in the full set: the pack carries only the canHide flags.
  for (const b of kit.blocks ?? []) if (!b.shotOf) for (const w of widths) add(b.images?.[w])
  const missing = []
  const excused = []
  for (const id of new Set([...pageById.values()].flatMap(blocksOf))) {
    const own = blockById.get(id)
    const b = own?.shotOf ? (blockById.get(own.shotOf) ?? own) : own
    for (const w of widths) {
      if (b?.images?.[w]) continue
      const notShown = (b?.notShownAt ?? []).map(String).includes(w) && b?.notShownBecause
      ;(notShown ? excused : missing).push({
        block: id,
        width: Number(w),
        ...(notShown ? { because: b.notShownBecause } : {})
      })
    }
  }
  return { representatives, imageIds, missing, excused }
}

/**
 * Put `look` on `item` right after its `images` (the end when it has none), keeping every other key in place; an
 * undefined look removes it. Mutates and returns `item`.
 */
export function placeLook(item, look) {
  const entries = Object.entries(item).filter(([k]) => k !== 'look')
  const at = entries.findIndex(([k]) => k === 'images')
  if (look !== undefined) entries.splice(at === -1 ? entries.length : at + 1, 0, ['look', look])
  for (const k of Object.keys(item)) delete item[k]
  Object.assign(item, Object.fromEntries(entries))
  return item
}

/** An image id, or a path such as `images/x.jpg`, to its record in `kit.images`. */
function recordsOf(kit, refs) {
  const byId = new Map((kit.images ?? []).map((i) => [i.id, i]))
  const byPath = new Map((kit.images ?? []).map((i) => [i.path, i]))
  const out = new Map()
  const unknown = []
  for (const ref of refs) {
    const rec = byId.get(ref) ?? byPath.get(ref)
    if (rec) out.set(rec.path, rec)
    else unknown.push(ref)
  }
  return { records: [...out.values()].sort((a, b) => (a.path < b.path ? -1 : 1)), unknown }
}

/**
 * Write `<out>/pack/` (template-kit.json naming only the packed images, and those images) and `<out>/<name>.zip`.
 * A page that does not stand for its group points at its representative's full-page shots (`fullShotOf`), so every
 * image id the pack names is in it. An approval of the previous pack is kept when it saw this very image set.
 * Returns the facts recorded as `pack` in the full template-kit.json.
 */
export function writePack({ kit, out }) {
  const plan = packPlan(kit)
  const { records, unknown } = recordsOf(kit, plan.imageIds)
  const pageGroups = (kit.pageGroups ?? []).map((g) => ({
    ...g,
    representative: plan.representatives[g.id]?.page ?? null,
    representativeWhy: plan.representatives[g.id]?.why ?? null
  }))
  const repOf = new Map()
  for (const g of pageGroups)
    for (const id of [g.root, ...(g.children ?? [])]) if (g.representative) repOf.set(id, g.representative)
  const pageById = new Map(kit.pages.map((p) => [p.id, p]))
  const imagesSha256 = imagesDigest(records)
  const dir = join(out, 'pack')
  const old = readIfJson(join(dir, 'template-kit.json'))
  const packKit = {
    ...kit,
    pageGroups,
    pages: kit.pages.map((p) => {
      // A further result page with page 1's layout shows page 1's full-page shots (`paginationOf`, layouts.mjs).
      // A page or block drawn by another one's shot carries that one's look too (looks.mjs), like its images.
      const rep = repOf.get(p.paginationOf ?? p.id) ?? repOf.get(p.id) ?? p.id
      return rep === p.id
        ? { ...p, fullShotOf: p.id }
        : placeLook(
            { ...p, images: pageById.get(rep)?.images ?? {}, fullShotOf: rep },
            pageById.get(rep)?.look
          )
    }),
    blocks: kit.blocks.map((b) => {
      if (!b.shotOf) return b
      const source = kit.blocks.find((x) => x.id === b.shotOf)
      return placeLook({ ...b, images: source?.images ?? {} }, source?.look)
    }),
    images: records,
    imagesSha256,
    approval: old?.approval?.imagesSha256 === imagesSha256 ? old.approval : null,
    pack: undefined,
    packOf: { images: (kit.images ?? []).length, note: 'the full set is made again by `cli.mjs build`' }
  }
  onlyPacked(packKit, kit)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'images'), { recursive: true })
  for (const r of records) copyFileSync(join(out, r.path), join(dir, r.path))
  writeFileSync(join(dir, 'template-kit.json'), `${JSON.stringify(packKit, null, 2)}\n`)
  const name = `template-kit-${slug(kit.template?.name ?? kit.quickstart?.slug ?? 'template')}-${slug(kit.quickstart?.version ?? 'x')}.zip`
  return {
    pageGroups,
    pack: {
      ...zipPack(out, name),
      images: records.length,
      imagesSha256,
      approved: Boolean(packKit.approval),
      blocksWithoutImage: plan.missing,
      notShownExcused: plan.excused.length,
      unknownImages: unknown
    }
  }
}

/**
 * Every image the pack json names is in the pack: a page's or block's own shot left out points where its stand-in
 * points (an evidence list of a template gap included); any other reference to the full set (emptied shots, minimum
 * evidence, before/after shots) is dropped from the pack json and stays in the full one.
 */
function onlyPacked(packKit, kit) {
  const packed = new Set(packKit.images.flatMap((i) => [i.id, i.path]))
  const known = new Set((kit.images ?? []).flatMap((i) => [i.id, i.path]))
  const moved = new Map()
  for (const [mine, theirs] of [
    [kit.pages, packKit.pages],
    [kit.blocks, packKit.blocks]
  ])
    for (const [i, x] of mine.entries())
      for (const [w, id] of Object.entries(x.images ?? {}))
        if (theirs[i].images?.[w]) moved.set(id, theirs[i].images[w])
  const clean = (v) => {
    if (typeof v === 'string') {
      const to = packed.has(v) ? v : moved.get(v)
      return to ?? (known.has(v) ? undefined : v)
    }
    if (Array.isArray(v)) return v.map(clean).filter((x) => x !== undefined)
    if (v && typeof v === 'object') {
      const o = {}
      for (const [k, x] of Object.entries(v)) {
        const c = clean(x)
        if (c !== undefined) o[k] = c
      }
      return o
    }
    return v
  }
  for (const key of Object.keys(packKit)) if (key !== 'images') packKit[key] = clean(packKit[key])
}

/** Zip `<out>/pack/` (its template-kit.json first, then its images by path) into `<out>/<name>`. */
export function zipPack(out, name) {
  const dir = join(out, 'pack')
  const packKit = JSON.parse(readFileSync(join(dir, 'template-kit.json'), 'utf8'))
  const entries = [
    { name: 'template-kit.json', data: readFileSync(join(dir, 'template-kit.json')) },
    ...packKit.images.map((r) => ({ name: r.path, data: readFileSync(join(dir, r.path)) }))
  ]
  const zip = zipStore(entries)
  writeFileSync(join(out, name), zip)
  return { file: basename(name), sha256: createHash('sha256').update(zip).digest('hex'), bytes: zip.length }
}

/**
 * Approve the pack: its images on disk must be the ones it lists, then the approval names their digest, the zip is
 * made again and the full template-kit.json records the new zip.
 * @returns {{approval: object, pack: object}}
 */
export function approvePack(out, by, at = new Date().toISOString()) {
  const dir = join(out, 'pack')
  const file = join(dir, 'template-kit.json')
  const packKit = readIfJson(file)
  if (!packKit) throw new Error('no pack to approve: run `cli.mjs pack` first')
  const changed = packKit.images.filter(
    (i) =>
      createHash('sha256')
        .update(readFileSync(join(dir, i.path)))
        .digest('hex') !== i.sha256
  )
  if (changed.length)
    throw new Error(
      `pack images differ from the list, pack again first: ${changed
        .slice(0, 5)
        .map((i) => i.path)
        .join(', ')}`
    )
  packKit.approval = { by, at, imagesSha256: imagesDigest(packKit.images) }
  writeFileSync(file, `${JSON.stringify(packKit, null, 2)}\n`)
  const fullFile = join(out, 'template-kit.json')
  const full = JSON.parse(readFileSync(fullFile, 'utf8'))
  full.pack = { ...full.pack, ...zipPack(out, full.pack?.file ?? 'template-kit-pack.zip'), approved: true }
  writeFileSync(fullFile, `${JSON.stringify(full, null, 2)}\n`)
  return { approval: packKit.approval, pack: full.pack }
}

function readIfJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Pack the kit in `out` and record `pack` and each group's representative in its template-kit.json.
 * @returns {object} the `pack` facts; a block without its shot (`blocksWithoutImage`) fails the pack
 */
export function packKitFolder(out) {
  const file = join(out, 'template-kit.json')
  const kit = JSON.parse(readFileSync(file, 'utf8'))
  const { pageGroups, pack } = writePack({ kit, out })
  kit.pageGroups = pageGroups
  kit.pack = pack
  writeFileSync(file, `${JSON.stringify(kit, null, 2)}\n`)
  return pack
}
