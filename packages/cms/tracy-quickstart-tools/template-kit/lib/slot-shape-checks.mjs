// Self-checks that a kit's text slots have the shape the current tool gives them, counted against the content map
// beside the contract, so a kit made by an older tool (or settled only in part) is caught rather than read green:
//   samplesCut              a text slot whose `sample` is not the whole demo text or whose `demoChars` is missing or
//                           wrong (the demo has words): the writer would aim at a cut length
//   sentenceGroupsUnsettled a block whose `sentences` differ from what the sentence-groups pass gives
//   inlineEmphasisMissing   a text slot whose demo marks words inline (inline-marks.mjs) with no matching `inline`
//   inlineMarkupLost        a content map text slot whose stored value marks words inline (a br, span, strong, em, b or
//                           i) while its sample holds none: the kit cannot list marks the map lost. Measured against the
//                           demo database by `content-coverage/resample.mjs` into content-coverage.json (`inlineMarkup`);
//                           a map with a whole-unit text slot (an element xpath) and no measurement counts 1
// Each count goes to `kit.checks`; the first failing slots or blocks of each go to `kit.coverage.failures`
// (`{part, where, reason}`), where the Road to live step and /ops name them.
import { neutralKey } from './ids.mjs'
import { settleSentenceGroups } from './sentence-groups.mjs'
import { sampleOf, textSlotsOf } from './text-format.mjs'

export const SHAPE_PARTS = [
  'samplesCut',
  'sentenceGroupsUnsettled',
  'inlineEmphasisMissing',
  'inlineMarkupLost'
]
const NAMED = 20 // failures listed per part; the count says how many there are

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const isUnitXpath = (x) => typeof x === 'string' && !x.includes('/@') && !/\/text\(\)(\[\d+\])?$/.test(x)

/**
 * `inlineMarkupLost` from the content coverage file beside the contract: its count and the slots it names. Null when
 * no coverage file was handed in (the check is not asked).
 * @param {object} map
 * @param {any} contentCoverage content-coverage.json, null when there is none, undefined when not asked
 */
function inlineMarkupLostOf(map, contentCoverage) {
  if (contentCoverage === undefined) return null
  const m = contentCoverage?.inlineMarkup
  if (m && Number.isInteger(m.lost)) {
    const named = (Array.isArray(m.lostSlots) ? m.lostSlots : []).map((key) => [key, 'its stored value'])
    return { count: m.lost, named }
  }
  const units = (map.slots ?? []).some((s) => s.type === 'text' && isUnitXpath(s.xpath))
  return units ? { count: 1, named: [['content-map', 'not measured']] } : { count: 0, named: [] }
}

/**
 * Count the checks on `kit` (changed in place: `checks` and `coverage.failures`) and return the counts.
 * @param {object} kit
 * @param {{map: object, contentCoverage?: any}} o `contentCoverage`: content-coverage.json beside the contract (null when there is
 *   none); left out, `inlineMarkupLost` is not counted
 */
export function slotShapeChecks(kit, { map, contentCoverage }) {
  const raw = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s]))
  const cut = new Map()
  const inline = new Map()
  for (const b of kit.blocks ?? [])
    for (const s of textSlotsOf(b)) {
      const m = raw.get(s.id)
      if (m?.sample == null) continue
      const want = sampleOf(m.sample, m)
      if (want.demoChars.total && (s.sample !== want.sample || !same(s.demoChars, want.demoChars)))
        cut.set(s.id, b.id)
      if (want.inline.length && !same(s.inline, want.inline)) inline.set(s.id, b.id)
    }
  // The sentence groups the pass gives now, on a copy, against the kit's own.
  const fresh = settleSentenceGroups({ blocks: structuredClone(kit.blocks ?? []) }, { map })
  const unsettled = (kit.blocks ?? [])
    .map((b, i) => ({ id: b.id, have: b.sentences, want: fresh.blocks[i].sentences }))
    .filter((x) => !same(x.have, x.want))
  const failures = []
  const name = (part, entries, whereOf, reasonOf) => {
    for (const [id, block] of entries.slice(0, NAMED))
      failures.push({ part, where: whereOf(id), reason: reasonOf(id, block) })
  }
  const slot = (id) => `slots[${id}]`
  name(
    'samplesCut',
    [...cut],
    slot,
    (id, b) =>
      `text slot ${id} of block ${b}: sample or demoChars is not the whole demo text (cli.mjs samples)`
  )
  name(
    'sentenceGroupsUnsettled',
    unsettled.map((x) => [x.id, x.id]),
    (id) => `blocks[${id}]`,
    (id) => `block ${id}: sentence groups not settled (cli.mjs slot-roles)`
  )
  name(
    'inlineEmphasisMissing',
    [...inline],
    slot,
    (id, b) =>
      `text slot ${id} of block ${b}: the demo marks words inline, the kit slot has no matching inline (cli.mjs samples)`
  )
  const lost = inlineMarkupLostOf(map, contentCoverage)
  if (lost)
    name(
      'inlineMarkupLost',
      lost.named,
      (key) => (key === 'content-map' ? key : `contentMap.slots[${key}]`),
      (key, what) =>
        what === 'not measured'
          ? 'the content map samples were not measured against the demo database (content-coverage/resample.mjs)'
          : `content map slot ${key}: ${what} marks words inline, its sample does not (content-coverage/resample.mjs --write)`
    )
  const counts = {
    samplesCut: cut.size,
    sentenceGroupsUnsettled: unsettled.length,
    inlineEmphasisMissing: inline.size,
    ...(lost ? { inlineMarkupLost: lost.count } : {})
  }
  kit.checks = { ...kit.checks, ...counts }
  const coverage = kit.coverage ?? { parts: {}, failures: [] }
  kit.coverage = {
    ...coverage,
    failures: [...(coverage.failures ?? []).filter((f) => !SHAPE_PARTS.includes(f.part)), ...failures]
  }
  return counts
}
