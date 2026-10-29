/**
 * The offering lines taken off after every pin and sweep (COO rule, spec TracyHQ/tracy#189 round 9): a description or a
 * summary of a kept offering card that would only repeat the offering's name ("Padel" under "Padel") is emptied after the
 * write, never shown, whichever step wrote it (the copy writer, a copy pin, a fallback). Any CMS whose engine empties lines
 * after its write; pure: slots and words in, slots out.
 */
import { onlyNamesOffering } from 'website-opportunities/domain/offering-description.mjs'

const DESCRIBING = new Set(['offering.description', 'offering.summary'])

/**
 * @param {{slots: any[], honesty: any, written: Record<string, string>}} input - `written`: the words each slot will hold
 * @returns {any[]} the slots to empty after the write (their keys leave `written` with the caller)
 */
export function nameOnlyOfferingLines({ slots, honesty, written }) {
  const cardNames = honesty?.cardNames ?? {}
  const planned = new Set(honesty?.nameOnly ?? [])
  const hidden = new Set((honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group))
  const out = []
  for (const slot of slots ?? []) {
    if (!DESCRIBING.has(slot?.role) || slot.type !== 'text') continue
    const card = slot.group?.id
    if (!card || !cardNames[card] || hidden.has(card)) continue
    const names = [
      cardNames[card],
      ...slots
        .filter((s) => s.role === 'offering.name' && s.group?.id === card)
        .map((s) => written[s.key])
        .filter((v) => typeof v === 'string')
    ]
    const value = written[slot.key]
    // A line left unwritten (or echoing the template's words) keeps the demo: when the brief has no words for it and the
    // writer gave none either, it goes too.
    const unwritten =
      typeof value !== 'string' ||
      !value.trim() ||
      value.replace(/\s+/g, ' ').trim() ===
        String(slot.sample ?? '')
          .replace(/\s+/g, ' ')
          .trim()
    if (unwritten ? planned.has(slot.key) : onlyNamesOffering(value, names)) out.push(slot)
  }
  return out
}
