/**
 * Which places of an AI quickstart mapping file a door proof writes on a blank site (ticket #584, gate #585).
 *
 * One case per kind of address the build writes: a plain column, a JSON path, a nested JSON value, an element piece,
 * an attribute piece, a child list row, a fact place, and every text node place (a slot whose xpath names a
 * `text()` node: the blank site keeps its white space so the address stays). Only places on a record the bound
 * contract names count: the inspect of the site lists them (`slots`, by key). Pure.
 */

/** Every location of the blocks and facts of a mapping file, with where it sits (`at`). `keyAt` is not a place. */
export function mappingLocations(mapping) {
  const out = []
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`))
    else if (v && typeof v === 'object') {
      if (typeof v.entity === 'string' && typeof v.column === 'string') out.push({ at, loc: v })
      for (const [k, x] of Object.entries(v)) if (k !== 'keyAt') walk(x, `${at}.${k}`)
    }
  }
  walk({ blocks: mapping.blocks, facts: mapping.facts }, '')
  return out
}

const isAttr = (l) => /\/@[a-z-]+$/.test(l.xpath ?? '')

/** The kinds of case, each a test on a location and where it sits. Order is the order of the proof. */
export const CASE_KINDS = [
  ['plain column', (l) => !l.jsonPath && !l.xpath && !l.piece],
  ['json path', (l) => l.jsonPath && !l.nestedJson && !l.xpath && !l.piece],
  ['nested json', (l) => l.nestedJson && !l.xpath && !l.piece],
  ['element piece', (l) => l.piece && !isAttr(l) && !/text\(\)/.test(l.xpath)],
  ['attribute piece', (l) => l.piece && isAttr(l)],
  ['child list row', (l, at) => /\.(lists|itemLists)\./.test(at) && !l.piece],
  ['fact place', (l, at) => at.startsWith('.facts.') && !l.piece]
]

/**
 * @param {{ mapping: object, slots: Map<string, {key: string, xpath?: string}> }} input
 * @returns {{ cases: {name: string, at: string, loc: object}[], missing: string[] }} `missing` names a kind with no
 *   place on a record the contract names
 */
export function doorProofCases({ mapping, slots }) {
  const all = mappingLocations(mapping).filter(({ loc }) => loc.slot && slots.has(loc.slot))
  const cases = []
  const missing = []
  const used = new Set()
  for (const [name, test] of CASE_KINDS) {
    // One place per slot: two pieces of one stored value would be two writes of the same value.
    const found = all.find(({ at, loc }) => test(loc, at) && !used.has(loc.slot))
    if (!found) missing.push(name)
    else {
      used.add(found.loc.slot)
      cases.push({ name, ...found })
    }
  }
  const textNodes = new Set()
  for (const { at, loc } of all) {
    if (loc.piece || !/text\(\)/.test(slots.get(loc.slot).xpath ?? '') || textNodes.has(loc.slot)) continue
    textNodes.add(loc.slot)
    if (!used.has(loc.slot)) cases.push({ name: `text node ${loc.slot}`, at, loc })
  }
  if (!textNodes.size) missing.push('text node')
  return { cases, missing }
}

/** An invented value a case writes: a link for a link place, short words otherwise (`i` keeps them apart). */
export function proofValue(loc, slot, i) {
  if (slot?.type === 'url' || (loc.xpath ?? '').endsWith('/@href'))
    return `https://invented-gym.example/p/${i}`
  return `Word ${i}`
}
