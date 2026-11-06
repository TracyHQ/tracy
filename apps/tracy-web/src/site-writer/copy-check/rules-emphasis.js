// W16 (ADR 0042 section 11, 2026-11-04): a slot whose demo draws some words in the accent colour (a `span` in the kit's
// `inline`) names its own words to draw, `emphasis`: exact words of one item of its text, about as long as the demo's (at most
// twice, at least 12 characters of room), under half of the text. No other slot carries an emphasis.
import { EMPHASIS_MAX_SHARE, emphasisRoomOf, spanMarkOf } from '../../lib/site-copy/inline-emphasis.js'

export function checkW16({ R, view, idx }) {
  const returned = new Set(view.returns.map((r) => r.slot).filter(Boolean))
  const seen = new Set()
  for (const s of view.slots) {
    if (returned.has(s.slot) || seen.has(s.slot) || idx.hidden.has(s.slot)) continue
    seen.add(s.slot)
    const mark = spanMarkOf(idx.kitSlots.get(s.slot))
    const emphasis = s.emphasis
    if (!mark && emphasis === undefined) continue
    const fail = (detail, cause) => R.w16.fail(s.slot, `${s.slot}: ${detail}`, cause)
    if (!mark) {
      fail('has an emphasis, but its demo draws no words in the accent colour', 'no-span')
      continue
    }
    if (emphasis === undefined) {
      fail(
        `has no emphasis: the demo draws "${mark.text}" in the accent colour (${mark.at}); name the words of your text to draw`,
        'missing'
      )
      continue
    }
    const text = s.items.join(' ')
    const room = emphasisRoomOf(mark)
    if (!s.items.some((t) => t.includes(emphasis)))
      fail(`emphasis "${emphasis}" is not words of the text, exactly as written`, 'not-in-text')
    else if (emphasis.length > room)
      fail(
        `emphasis is ${emphasis.length} characters, at most ${room} (the demo's is "${mark.text}")`,
        'long'
      )
    else if (emphasis.length >= text.length * EMPHASIS_MAX_SHARE)
      fail(
        `emphasis is ${emphasis.length} of the text's ${text.length} characters: draw a few words, never the whole text`,
        'whole'
      )
    else R.w16.ok()
  }
}
