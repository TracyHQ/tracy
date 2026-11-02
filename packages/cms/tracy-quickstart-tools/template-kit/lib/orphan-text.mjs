// Orphan text: words a block shows that come from a content map slot the kit declares nowhere (no list row, block
// slot, frame, link or demo fact of any block). A planner cannot replace or hide them, so the demo's words would
// stay on the customer's site. Words no slot holds are fixed text and are never orphans.
import { normText } from '../../content-coverage/lib/normalize.mjs'

/** Every slot id the kit declares, in any block. */
function declaredIds(blocks) {
  const ids = new Set()
  for (const b of blocks) {
    for (const s of b.slots ?? []) ids.add(s.id)
    for (const f of b.frames ?? []) ids.add(f.id)
    for (const l of b.links ?? []) for (const x of [l.id, l.labelId]) if (x) ids.add(x)
    for (const d of b.demoOwned ?? []) ids.add(d.id)
    for (const l of b.lists ?? []) {
      for (const s of l.rowSlots ?? []) {
        ids.add(s.id)
        for (const x of s.slots ?? []) if (x?.id) ids.add(x.id)
      }
      for (const r of l.rows ?? []) for (const s of r.slots ?? []) ids.add(s.id)
    }
  }
  return ids
}

/**
 * Another entity's words a block shows (`textsShown[].foreign`: a content item's, menu item's or category's slot, or
 * a piece of a longer sample) that no block declares: a link label of the block names its link (`labelId`); a
 * content item's words or a piece of a longer sample are a coincidence (the same word in that item, "Next" in a
 * typography article), so the template's words (fixed text); anything else (a menu item title in a breadcrumb) is
 * declared as the block's slot. Words another block declares (an article intro on its card) stay that block's.
 */
export function settleForeignTexts(blocks) {
  const declared = declaredIds(blocks)
  for (const b of blocks)
    for (const t of b.textsShown ?? []) {
      if (!t.foreign || declared.has(t.slot)) continue
      const link = (b.links ?? []).find((l) => norm(l.label) === norm(t.text))
      if (link) link.labelId ??= t.slot
      else if (String(t.source?.key ?? '').startsWith('article-') || t.how === 'piece') {
        t.slot = null
        b.fixedText.push({ text: t.text, source: null })
        continue
      } else b.slots.push(t.foreign)
      declared.add(t.slot)
    }
  for (const b of blocks) for (const t of b.textsShown ?? []) delete t.foreign
}

const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * Self-check over `blocks[].textsShown` (`{text, slot}`: each shown text and the slot it comes from, null for
 * template words). Returns how many shown texts come from an undeclared slot.
 */
export function orphanTextChecks({ blocks, errors }) {
  const declared = declaredIds(blocks)
  let orphans = 0
  for (const b of blocks)
    for (const t of b.textsShown ?? []) {
      if (!t.slot || declared.has(t.slot)) continue
      orphans++
      errors.push({
        kind: 'orphan-text',
        field: `blocks[${b.id}]`,
        slot: t.slot,
        reason: `"${String(t.text).slice(0, 60)}" is shown and comes from slot ${t.slot}, which no block of the kit declares`
      })
    }
  return orphans
}

/**
 * Self-check over `blocks[].paragraphsShown` (`{slot, paragraph, read}`: each paragraph the page shows, the slot it
 * comes from and whether the kit read it): a slot shown in two paragraphs or more must have every one of them read,
 * or the orphan check cannot see the rest. Returns how many such slots have fewer paragraphs read than shown.
 */
export function paragraphChecks({ blocks, errors }) {
  let short = 0
  for (const b of blocks) {
    const bySlot = new Map()
    for (const p of b.paragraphsShown ?? []) {
      if (!p.slot) continue
      const c = bySlot.get(p.slot) ?? { shown: 0, read: 0 }
      c.shown++
      if (p.read) c.read++
      bySlot.set(p.slot, c)
    }
    for (const [slot, c] of bySlot) {
      if (c.shown < 2 || c.read === c.shown) continue
      short++
      errors.push({
        kind: 'paragraphs-missing',
        field: `blocks[${b.id}]`,
        slot,
        reason: `slot ${slot} shows ${c.shown} paragraphs on the page and the kit read ${c.read}`
      })
    }
  }
  return short
}

const letters = (t) => (t.match(/[\p{L}\p{N}]/gu) ?? []).length
/** How many paragraphs a slot sample holds (`((p))` of JA fields or `<p>` of HTML). */
const paragraphsIn = (sample) => (String(sample ?? '').match(/\(\(p\)\)|<p[\s>]/gi) ?? []).length

/**
 * Each paragraph a block shows (`paragraphs`: the read pass's shown `<p>`, whole), the slot it comes from, and
 * whether the shown texts read it (`read`: its words are in `texts`, a paragraph split by inline markup read in
 * pieces). A paragraph counts for every slot of the block whose sample holds two paragraphs or more and contains it,
 * even when another slot holds that paragraph alone; any other paragraph counts for the slot it matches.
 * @param {{paragraphs: string[], texts: string[], slots: object[], matchOf: (n: string) => any, keyOf: (k: string) => string}} o
 */
export function shownParagraphs({ paragraphs, texts, slots, matchOf, keyOf }) {
  // Longest first: a short word taken out first would split a longer text that holds it.
  const read = [...new Set(texts)]
    .map(normText)
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
  const multi = slots
    .filter((s) => s.type === 'text' && paragraphsIn(s.sample) >= 2)
    .map((s) => ({ s, n: normText(s.sample) }))
  const out = []
  for (const paragraph of paragraphs) {
    const n = normText(paragraph)
    if (!n) continue
    let rest = n
    for (const t of read) if (rest.includes(t)) rest = rest.split(t).join(' ')
    const isRead = letters(n) > 0 && letters(rest) / letters(n) < 0.1
    const holders = multi.filter((x) => x.n.includes(n))
    if (holders.length) for (const x of holders) out.push({ slot: keyOf(x.s.key), paragraph, read: isRead })
    else {
      const m = matchOf(n)
      out.push({ slot: m ? keyOf(m.slot.key) : null, paragraph, read: isRead })
    }
  }
  return out
}
