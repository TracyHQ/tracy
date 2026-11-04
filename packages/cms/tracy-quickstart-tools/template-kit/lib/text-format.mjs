// Formatted text slots: how many paragraphs and bullets a text slot shows, and its whole demo text as a sample. A slot
// of several paragraphs or a bullet list gives one part per line, a bullet marked `- `, so a planner sees how the
// content is laid out and how long each part is; `demoChars` counts the plain text of each part. Counted on the page
// (the read pass's shown paragraphs and bullets) when the page shows the slot, else from the content map's markup.
import { normText } from '../../content-coverage/lib/normalize.mjs'

// A sample longer than this (a long article body) is cut, with an ellipsis; `demoChars` still counts the whole text.
export const SAMPLE_CAP = 1500

const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The paragraphs and bullets of a slot sample, in order. JA fields spell markup `((p))…((/p))`; HTML is read the
 * same way. Words outside any paragraph or bullet (a heading split by `((br/))`) are one paragraph.
 * @returns {{kind: 'p'|'li', text: string}[]}
 */
export function partsOf(sample) {
  const html = String(sample ?? '').replace(/\(\((\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?)\)\)/gi, '<$1>')
  const parts = []
  let rest = html
  for (const m of html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = clean(m[2])
    if (text) parts.push({ kind: m[1].toLowerCase() === 'li' ? 'li' : 'p', text })
    rest = rest.replace(m[0], ' ')
  }
  const loose = clean(rest)
  if (loose) parts.unshift({ kind: 'p', text: loose })
  return parts
}

/** The sample a planner reads: every part whole, a bullet marked `- `, one part per line; cut at SAMPLE_CAP. */
export function sampleOfParts(parts) {
  const text = parts.map((p) => (p.kind === 'li' ? `- ${p.text}` : p.text)).join('\n')
  return text.length > SAMPLE_CAP ? `${text.slice(0, SAMPLE_CAP).trimEnd()}…` : text
}

/**
 * The lengths of the demo text, on plain text with markup removed (as the writer's limit counts): `total` of every
 * part joined by one space, `lead` of the paragraphs before the bullet list (null without a list or without words
 * before it), `bullets` of each bullet.
 * @param {{kind: 'p'|'li', text: string}[]} parts
 */
export function demoCharsOf(parts) {
  const first = parts.findIndex((p) => p.kind === 'li')
  const before = first > 0 ? parts.slice(0, first).map((p) => p.text) : []
  return {
    total: parts.map((p) => p.text).join(' ').length,
    lead: before.length ? before.join(' ').length : null,
    bullets: parts.filter((p) => p.kind === 'li').map((p) => p.text.length)
  }
}

/** A kit sample read back into parts: one per line, a line starting `- ` a bullet (what `sampleOfParts` writes). */
export function partsOfSample(sample) {
  return String(sample ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('- ') ? { kind: 'li', text: l.slice(2) } : { kind: 'p', text: l }))
}

/**
 * `{paragraphs, bullets, formatFrom, sample, demoChars}` of a text slot. `page`: the block's shown paragraphs and bullets
 * (whole) and shown texts from the read pass. A shown paragraph or bullet belongs to the slot when its words are in
 * the slot's sample; a slot shown as a single text (a heading) is one paragraph.
 * @param {string} sample
 * @param {{paragraphs?: string[], bullets?: string[], texts?: string[]}} page
 */
export function formatOf(sample, page = {}) {
  const parts = partsOf(sample)
  const n = normText(sample)
  const holds = (t) => {
    const x = normText(t)
    return x.length >= 2 && n.includes(x)
  }
  const shownP = (page.paragraphs ?? []).filter(holds).length
  // A shown bullet is the slot's when its words are one whole part of the slot (a tab title that is a word of a
  // paragraph is not), counted once; a slot that is one list item's whole words (a menu label) is a text.
  const partWords = new Set(parts.map((p) => normText(p.text)))
  const shownLi = new Set(
    (page.bullets ?? []).map((t) => normText(t)).filter((x) => partWords.has(x) && x !== n)
  ).size
  const shownText = (page.texts ?? []).some((t) => {
    const x = normText(t)
    return x === n || (x.length >= 12 && n.includes(x))
  })
  const base = { sample: sampleOfParts(parts), demoChars: demoCharsOf(parts) }
  const li = parts.filter((p) => p.kind === 'li').length
  if (n && (shownP || shownLi || shownText)) {
    // A reading that did not list bullets says nothing about them: the content map's count stands.
    const bullets = Array.isArray(page.bullets) ? shownLi : li
    return { paragraphs: shownP || (bullets ? 0 : 1), bullets, formatFrom: 'page', ...base }
  }
  return { paragraphs: parts.length - li, bullets: li, formatFrom: 'content map', ...base }
}

/**
 * Every declared text slot of a block that a planner writes: its own, its list rows' and row template's (a list
 * with no sample row still has one), its card fields' items, its demo facts'.
 */
export function textSlotsOf(b) {
  return [
    ...(b.slots ?? []),
    ...(b.lists ?? []).flatMap((l) => [
      ...(l.rows ?? []).flatMap((r) => r.slots ?? []),
      ...(l.rowSlots ?? []).flatMap((s) => (Array.isArray(s.slots) ? s.slots : [s]))
    ]),
    ...(b.demoOwned ?? [])
  ].filter((s) => s.type === 'text')
}

/** The sample of a text slot from a raw content map sample: every part whole, and its lengths. */
export const sampleOf = (raw) => {
  const parts = partsOf(raw)
  return { sample: sampleOfParts(parts), demoChars: demoCharsOf(parts) }
}

/** Self-check: a declared text slot without its paragraph and bullet counts. Returns how many. */
export function textFormatChecks({ blocks, errors }) {
  let missing = 0
  for (const b of blocks)
    for (const s of textSlotsOf(b)) {
      if (Number.isInteger(s.paragraphs) && Number.isInteger(s.bullets)) continue
      missing++
      errors.push({
        kind: 'text-format-missing',
        field: `blocks[${b.id}]`,
        slot: s.id,
        reason: `text slot ${s.id} does not say how many paragraphs and bullets it shows`
      })
    }
  return missing
}

/**
 * Give every declared text slot of the kit its paragraph and bullet counts and its sample (`formatOf`).
 * `slotOf(id)`: the content map slot (raw sample, type); `detailsOf(blockId)`: the block's page reading.
 */
export function formatTextSlots({ blocks, slotOf, detailsOf }) {
  for (const b of blocks) {
    for (const d of b.demoOwned ?? []) if (slotOf(d.id)?.type === 'text') d.type = 'text'
    for (const l of b.lists ?? [])
      for (const f of l.rowSlots ?? [])
        if (f.type === 'text') for (const x of f.slots ?? []) if (x?.id) x.type = 'text'
    const page = detailsOf(b.id) ?? {}
    for (const s of textSlotsOf(b)) {
      const raw = slotOf(s.id)?.sample
      if (raw != null) Object.assign(s, formatOf(raw, page))
    }
  }
}
