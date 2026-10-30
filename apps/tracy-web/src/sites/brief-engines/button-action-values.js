// Declared button decisions share the ordinary translation door; their URLs are language-independent.
import { translateKit } from './joomla-kit.js'
import { boxLimitOf } from './slot-box-limits.js'
import { settleText, textFallbackNotes } from './text-fallback.js'

/**
 * Enforce every declared action after writer copy, translating words while retaining the paired real destinations. Words
 * that do not fit their box or could not be translated are a recorded blocker (`text-fallback.js`): that one label is
 * left to the copy writer's words in the site language and the build goes on; its destination is still enforced.
 */
export async function buttonActionValues({
  sitePlan,
  locale = 'en',
  slots = [],
  model = null,
  signal,
  note = () => {}
}) {
  const decisions = (sitePlan?.slots ?? []).filter(
    (s) => s.reason === 'button-action' && s.decision === 'value'
  )
  const values = Object.fromEntries(decisions.map((s) => [s.key, s.value]))
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const words = decisions
    .filter((s) => (s.valueType ?? byKey.get(s.key)?.type) !== 'url')
    .map((s) => ({
      key: s.key,
      type: 'text',
      sample: s.value,
      maxCharacters: limitOf(byKey.get(s.key))
    }))
  const checked = (out) => {
    const findings = []
    for (const word of words) {
      const settled = settleText({
        site: 'button action',
        key: word.key,
        value: out[word.key],
        invalid: (t) => (!t ? 'not-translated' : [...t].length > word.maxCharacters ? 'does-not-fit' : null)
      })
      if (settled.finding) {
        findings.push(settled.finding)
        delete out[word.key]
      }
    }
    for (const line of textFallbackNotes({ findings })) note(line)
    return out
  }
  if (/^en(?:-|$)/i.test(locale) || decisions.length === 0) return checked(values)
  const translated = await translateKit({
    slots: words,
    locale,
    source: 'en',
    model,
    shipped: new Map(),
    signal,
    note,
    what: 'the declared button actions'
  })
  // Untranslated words never stand in the site language: they are left out of the values and recorded.
  const own = Object.fromEntries(Object.entries(values).filter(([key]) => !words.some((w) => w.key === key)))
  return checked({ ...own, ...translated })
}

/** The tighter of a slot's contract limit and its measured box: the plugin refuses words over either. */
function limitOf(slot) {
  const own = Number.isInteger(slot?.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : 120
  const box = boxLimitOf(slot)
  return box === null ? own : Math.min(own, box)
}
