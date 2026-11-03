// Looks: a short plain text of what each packed 1440 page and block shot shows, so the site planner reads text
// instead of opening every shot. Written once per kit version by the packager's own Claude Code (skill
// quickstart-contract, references/image-looks.md): `cli.mjs looks --list` names the shots that need one, subagents
// look at the files and write the texts, `cli.mjs looks --apply` checks and merges them. No browser, no network,
// no model call here. A look is `{ image, sha256, text }` on the page or block: `sha256` is the shot's sha256 in
// `images`, so a recaptured shot leaves its look stale (`looksMissingOf`, the same rule /ops judges by).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  imageAt,
  LOOK_WIDTH,
  looksMissingOf
} from '../../../../../apps/tracy-web/src/lib/template-kit/reader.js'
import { packPlan, placeLook } from './pack.mjs'

export const LOOK_TEXT_MIN = 40
export const LOOK_TEXT_MAX = 400

/** Image records by id and by path. */
function recordsOf(kit) {
  const by = new Map()
  for (const r of kit.images ?? []) {
    if (r.id) by.set(r.id, r)
    if (r.path) by.set(r.path, r)
  }
  return by
}

/**
 * The page or block objects that carry a look of their own: every page, and every block that is not drawn by
 * another block's shot (`shotOf`, whose look the pack copies from that block).
 */
const carriersOf = (kit) => [
  ...(kit.pages ?? []).map((item) => ({ kind: 'page', item })),
  ...(kit.blocks ?? []).filter((b) => !b.shotOf).map((item) => ({ kind: 'block', item }))
]

/**
 * The shots that need a look: each packed 1440 shot of a page or block (`packPlan`) whose carrier has no current
 * look. One entry per shot, with the absolute path of its file under `imagesDir` (the folder the image paths are
 * relative to). A file that is missing or differs from its sha256 is a problem: describing it would describe
 * another picture.
 * @returns {{ width: number, need: object[], current: number, problems: string[] }}
 */
export function lookWorklist(kit, imagesDir) {
  const records = recordsOf(kit)
  const packed = packPlan(kit).imageIds
  const isPacked = (ref) => {
    const r = records.get(ref)
    return Boolean(r) && (packed.has(r.id) || packed.has(r.path) || packed.has(ref))
  }
  const missing = new Map(
    looksMissingOf({ ...kit, blocks: (kit.blocks ?? []).filter((b) => !b.shotOf) }).map((m) => [
      `${m.kind}:${m.id}`,
      m
    ])
  )
  const byShot = new Map()
  let current = 0
  for (const { kind, item } of carriersOf(kit)) {
    const ref = imageAt(item.images, LOOK_WIDTH)
    if (!ref || !isPacked(ref)) continue
    const record = records.get(ref)
    const gap = missing.get(`${kind}:${item.id}`)
    const key = record.path
    if (!gap) {
      current++
      continue
    }
    const entry = byShot.get(key) ?? {
      image: ref,
      sha256: record.sha256,
      file: resolve(imagesDir, record.path),
      why: gap.why,
      shows: [],
      ...(gap.why === 'stale' && typeof item.look?.text === 'string' ? { was: item.look.text } : {})
    }
    entry.shows.push(`${kind} ${item.id}`)
    byShot.set(key, entry)
  }
  const need = [...byShot.values()].sort((a, b) => (a.image < b.image ? -1 : a.image > b.image ? 1 : 0))
  const problems = []
  for (const n of need) {
    if (!existsSync(n.file)) problems.push(`${n.image}: no file at ${n.file}`)
    else if (
      createHash('sha256').update(readFileSync(n.file)).digest('hex') !== String(n.sha256).toLowerCase()
    )
      problems.push(`${n.image}: the file differs from its sha256 in images[]`)
  }
  return { width: LOOK_WIDTH, need, current, problems }
}

/** One look's text as stored: whitespace folded to single spaces. */
const folded = (text) => text.replace(/\s+/g, ' ').trim()

/**
 * Check every entry, then merge them all or none. An entry is `{ image, sha256, text }`: `image` a 1440 shot of a
 * page or block (by id or path), `sha256` that image's sha256 in `images`, `text` plain ASCII English of
 * LOOK_TEXT_MIN to LOOK_TEXT_MAX characters. Each page and block whose 1440 shot is that image gets the look (a
 * block drawn by another block's shot included). Applying the same entries again changes nothing.
 * @returns {{ errors: string[], set: number, unchanged: number }}
 */
export function applyLooks(kit, entries) {
  const list = Array.isArray(entries) ? entries : entries?.looks
  if (!Array.isArray(list))
    return { errors: ['looks must be a list of { image, sha256, text }'], set: 0, unchanged: 0 }
  const records = recordsOf(kit)
  const items = [...(kit.pages ?? []), ...(kit.blocks ?? [])]
  const shotsOf = new Map()
  for (const item of items) {
    const ref = imageAt(item.images, LOOK_WIDTH)
    const record = ref ? records.get(ref) : undefined
    if (!record) continue
    if (!shotsOf.has(record)) shotsOf.set(record, [])
    shotsOf.get(record).push(item)
  }
  const errors = []
  const seen = new Set()
  const ok = []
  for (const [i, e] of list.entries()) {
    const at = `entry ${i + 1}${typeof e?.image === 'string' ? ` (${e.image})` : ''}`
    if (!e || typeof e !== 'object' || typeof e.image !== 'string' || !e.image) {
      errors.push(`${at}: no image`)
      continue
    }
    const record = records.get(e.image)
    if (!record) {
      errors.push(`${at}: no such image in images[]`)
      continue
    }
    if (!shotsOf.has(record)) {
      errors.push(`${at}: not the ${LOOK_WIDTH} shot of any page or block`)
      continue
    }
    if (seen.has(record)) {
      errors.push(`${at}: the same image is described twice`)
      continue
    }
    seen.add(record)
    if (String(e.sha256 ?? '').toLowerCase() !== String(record.sha256).toLowerCase())
      errors.push(`${at}: sha256 does not match the current image (list again and describe the new shot)`)
    const text = typeof e.text === 'string' ? folded(e.text) : ''
    if (!text) errors.push(`${at}: no text`)
    else if (text.length < LOOK_TEXT_MIN || text.length > LOOK_TEXT_MAX)
      errors.push(`${at}: text is ${text.length} characters, not ${LOOK_TEXT_MIN} to ${LOOK_TEXT_MAX}`)
    else if (/[^\x20-\x7e]/.test(text)) errors.push(`${at}: text must be plain ASCII English`)
    ok.push({ record, look: { image: e.image, sha256: String(record.sha256).toLowerCase(), text } })
  }
  if (errors.length) return { errors, set: 0, unchanged: 0 }
  let set = 0
  let unchanged = 0
  for (const { record, look } of ok)
    for (const item of shotsOf.get(record)) {
      const mine = { ...look, image: imageAt(item.images, LOOK_WIDTH) }
      if (JSON.stringify(item.look) === JSON.stringify(mine)) {
        unchanged++
        continue
      }
      placeLook(item, mine)
      set++
    }
  return { errors, set, unchanged }
}

/**
 * After a rebuild, keep each look whose shot did not change: the previous kit's look of a page or block carries over
 * when the new kit names a 1440 shot with the same sha256. Returns how many were kept.
 */
export function keepLooks(kit, previous) {
  if (!previous) return 0
  const old = new Map()
  for (const item of [...(previous.pages ?? []), ...(previous.blocks ?? [])])
    if (item?.look?.sha256 && typeof item.look.text === 'string')
      old.set(String(item.look.sha256).toLowerCase(), item.look.text)
  const entries = []
  const records = recordsOf(kit)
  const done = new Set()
  for (const item of [...(kit.pages ?? []), ...(kit.blocks ?? [])]) {
    const ref = imageAt(item.images, LOOK_WIDTH)
    const record = ref ? records.get(ref) : undefined
    const text = record && old.get(String(record.sha256).toLowerCase())
    if (!text || done.has(record)) continue
    done.add(record)
    entries.push({ image: ref, sha256: record.sha256, text })
  }
  const r = applyLooks(kit, entries)
  return r.errors.length ? 0 : r.set
}

/** The indent a JSON file was written with (the full kit uses 1 space, the pack 2), so a rewrite keeps it. */
export function indentOf(source) {
  const m = /^\{\r?\n( +)"/.exec(source)
  return m ? m[1].length : 2
}
