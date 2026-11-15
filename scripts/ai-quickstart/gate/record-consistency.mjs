// The parts of a check record the release guard works out again from the record's own lists and the kit folder
// (ticket #586, review round 2), so a hand-edited count, an accident or a record of another kit is refused: the kit
// reference against the folder, the site write's status against its own counts, the universe's counts against its list
// of places, and each written value not seen against the reason the kit and the write give for it. This catches an
// inconsistent record; it does not stop a record invented field by field (`release-binding.mjs` says what does). Pure
// but for reading the kit's mapping.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { declareNotSeen } from './not-seen.mjs'

const list = (v) => (Array.isArray(v) ? v : [])

/** The kit reference a kit folder `<slug>/<cms>/<version>` names. */
export function kitRefOfFolder(folder) {
  const [slug, cms, version] = path.resolve(folder).split(path.sep).slice(-3)
  return slug + '/' + cms + '@' + version
}

/** The universe counts a record's own list of places gives. */
export function universeCountsOf(places) {
  const out = { universe: 0, written: 0, declared_not_written: 0, skipped_by_writer: 0, unexplained: 0 }
  for (const p of list(places)) {
    out.universe += 1
    const account = Object.hasOwn(out, p.account) && p.account !== 'universe' ? p.account : 'unexplained'
    out[account] += 1
  }
  return out
}

/** What a site write that says `done` must hold: no stop code, and the counts of the plan the memory write ran. */
function writeProblems(write) {
  const site = write?.site
  if (site?.status !== 'done') return []
  const mem = write?.memory?.counts
  if (site.code != null) return ['the site write says done but names the stop code ' + site.code]
  if (!site.counts || !mem) return ['the site write says done but keeps no counts of what it wrote']
  if (site.counts.ops !== mem.ops || site.counts.written !== mem.written)
    return ['the site write says done but its counts are not those of the plan it was given']
  return []
}

/** The mapping of a kit folder, or null when it has none readable. */
function mappingOf(folder) {
  const file = path.join(folder, 'mapping.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Each written value not seen whose declared reason the kit and the write do not give. */
function notSeenProblems(record, mapping) {
  const notSeen = list(record?.markerTest?.notSeen)
  if (!notSeen.length) return []
  const again = declareNotSeen(
    notSeen.map(({ declared: _declared, ...n }) => n),
    {
      conflicts: list(record?.write?.site?.counts?.conflicts),
      unproven: list(record?.write?.unproven),
      mapping,
      pages: list(record?.render?.pages)
    }
  )
  const wrong = notSeen.filter((n, i) => (n.declared ?? null) !== (again[i].declared ?? null))
  return wrong.length
    ? [
        wrong.length +
          ' written value(s) not seen carry a declared reason the kit and the write do not give (first: ' +
          (wrong[0].entry ?? wrong[0].code) +
          ')'
      ]
    : []
}

/**
 * Why a record is not consistent with itself or with the folder it ships in, as `[{code, message}]`.
 * @param {object} record
 * @param {string} folder the AI quickstart kit folder
 */
export function consistencyProblems(record, folder) {
  const out = []
  const ref = kitRefOfFolder(folder)
  if (record?.binding?.kitRef !== ref || record?.kit !== ref)
    out.push({
      code: 'kit_ref_mismatch',
      message: 'the record is of ' + (record?.binding?.kitRef ?? 'no kit') + ', the folder is ' + ref
    })
  const say = (message) => out.push({ code: 'record_inconsistent', message })
  for (const m of writeProblems(record?.write)) say(m)
  const counts = universeCountsOf(record?.places)
  const kept = record?.universe ?? {}
  const off = Object.keys(counts).filter((k) => kept[k] !== counts[k])
  if (off.length) say('the universe counts (' + off.join(', ') + ') are not those of its own list of places')
  for (const m of notSeenProblems(record, mappingOf(folder))) say(m)
  return out
}
