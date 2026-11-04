// Slots a page prints as one sentence: pieces of one stored field whose text sits in one element, split only by inline
// markup ("Join over <span>900</span> of our members"). The content map keeps each piece apart with the address of
// its text, so a step reading slot by slot never sees the sentence. Told from the addresses alone, so it holds for
// every template and needs no site.
import { neutralKey } from './ids.mjs'

const INLINE = /^(span|strong|em|b|i|u|mark|small|sup|sub|abbr|code|a)(\[\d+\])?$/
const TEXT_NODE = /^text\(\)(\[\d+\])?$/
const NUMBERED = /\/text\(\)\[\d+\]$/
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ')

/** The element a text address prints in, and whether the text is bare in it or inside inline markup. */
function placeOf(xpath) {
  const steps = String(xpath ?? '').split('/')
  if (!TEXT_NODE.test(steps.at(-1) ?? '')) return null
  steps.pop()
  if (!INLINE.test(steps.at(-1) ?? '')) return { element: steps.join('/'), bare: true }
  steps.pop()
  return { element: steps.join('/'), bare: false }
}

/**
 * Every group of the content map, in map order: its slot ids, the sentence the demo prints, each piece, and between each two
 * pieces the space the demo prints there ('' for a word split by a coloured letter).
 * @returns {{slots: string[], sample: string, pieces: string[], joins: string[], kept: boolean[]}[]}
 */
export function sentenceGroupsOf(map) {
  const groups = new Map()
  for (const s of map.slots ?? []) {
    if (s.type !== 'text') continue
    const place = placeOf(s.xpath)
    if (!place) continue
    const key = JSON.stringify([s.entity, s.column, s.nestedJson ?? null, s.jsonPath ?? null, place.element])
    groups.set(key, [...(groups.get(key) ?? []), { slot: s, bare: place.bare }])
  }
  const out = []
  for (const pieces of groups.values()) {
    // Only inline pieces with no bare words between them are labels side by side.
    if (pieces.length < 2 || !pieces.some((p) => p.bare) || !pieces.some((p) => !p.bare)) continue
    const samples = pieces.map((p) => clean(p.slot.sample))
    out.push({
      slots: pieces.map((p) => neutralKey(p.slot.key)),
      sample: samples.join('').trim(),
      pieces: samples.map((t) => t.trim()),
      joins: samples.slice(1).map((next, i) => (/\s$/.test(samples[i]) || /^\s/.test(next) ? ' ' : '')),
      // Where the write step puts the demo's space back by itself: at a numbered text node beside an element.
      kept: samples.slice(1).map((next, i) => {
        const before = NUMBERED.test(pieces[i].slot.xpath) && /\s$/.test(samples[i])
        return before || (NUMBERED.test(pieces[i + 1].slot.xpath) && /^\s/.test(next))
      })
    })
  }
  return out
}

/** The block that lists a slot. */
function holderOf(kit, id) {
  const lists = (b) =>
    (b.lists ?? []).flatMap((l) => [
      ...(l.rowSlots ?? []).flatMap((r) => [r, ...(Array.isArray(r.slots) ? r.slots : [])]),
      ...(l.rows ?? []).flatMap((r) => r.slots ?? [])
    ])
  return kit.blocks.find((b) => [...(b.slots ?? []), ...lists(b)].some((s) => s?.id === id && !s.ownedBy))
}

/** Set `sentences` on the block listing each group's slots; a group the kit shows no slot of is left out. */
export function settleSentenceGroups(kit, { map }) {
  for (const b of kit.blocks) delete b.sentences
  for (const group of sentenceGroupsOf(map)) {
    const block = holderOf(kit, group.slots[0])
    if (!block) continue
    block.sentences = [
      ...(block.sentences ?? []),
      { id: `${block.id}.sentence-${(block.sentences?.length ?? 0) + 1}`, ...group }
    ]
  }
  return kit
}
