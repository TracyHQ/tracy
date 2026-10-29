// Declared button decisions share the ordinary translation door; their URLs are language-independent.
import { translateKit } from './joomla-kit.js'
import { boxLimitOf } from './slot-box-limits.js'

/** Enforce every declared action after writer copy, translating words while retaining the paired real destinations. */
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
    for (const word of words) {
      if (typeof out[word.key] === 'string' && [...out[word.key]].length > word.maxCharacters)
        throw Object.assign(
          new Error(`The declared button action does not fit its measured text slot: ${word.key}`),
          { code: 'BUTTON_ACTION_DOES_NOT_FIT' }
        )
    }
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
  if (words.some((s) => !(s.key in translated)))
    throw Object.assign(new Error('Declared button actions could not be translated into the site language'), {
      code: 'BUTTON_ACTION_TRANSLATION_REQUIRED'
    })
  return checked({ ...values, ...translated })
}

/** The tighter of a slot's contract limit and its measured box: the plugin refuses words over either. */
function limitOf(slot) {
  const own = Number.isInteger(slot?.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : 120
  const box = boxLimitOf(slot)
  return box === null ? own : Math.min(own, box)
}
