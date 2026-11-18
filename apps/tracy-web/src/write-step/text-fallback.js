// What the write step does when the plugin refuses a TEXT slot (card AS, 2026-11-06): the refused slot would keep its demo words,
// which no customer wrote. So after the contract call it climbs, once per rung and never more:
//   1. plain: the customer's own words without emphasis codes or tags (visible text only), sent again, when they differ from what
//      was sent: a refusal of the markup (too long with the codes counted, markup not taken) leaves the words standing;
//   2. hidden: the slot emptied, when the kit does not keep it (`canHide: false`) and the site says it can empty it (`canHide`);
//   3. demo-remains: a failed line that says the demo text is still on the site.
// The rung each slot ended on is on its report line as `textFallback`. Pictures, links and settings are not text: untouched here.
import { visibleText } from '../lib/site-copy/emphasis-markup.js'
import { kitSlotIndex } from '../lib/template-kit/kit-slots.js'
import { refusalWords, slotCanEmpty } from './contract-write.js'

const each = (value) => (Array.isArray(value) ? value : [])
const DEMO_REMAINS = 'the demo text remains on the site'

/**
 * @param {{ refused: Map<string, object>, changes: Record<string, string>, evidence?: Record<string, string>, kit: object,
 *   contentMap?: object | null, before?: object | null, inspect: () => Promise<object>,
 *   send: (input: { reading: object, changes: Record<string, string>, evidence: Record<string, string>, emptySlots: string[] })
 *     => Promise<{ written: string[], emptied?: string[], refused: Map<string, object>, stop?: object, cancelled?: boolean }> }} input
 *   `refused`: what the contract call refused, by content map key; `changes`: what it sent; `before`: the site's inspect the
 *   contract call was sent on, whose `canHide` says what the site can empty
 * @returns {Promise<Map<string, { rung: 'plain' | 'hidden' | 'demo-remains', ordered?: string, entry: object, reason: string }>>}
 */
export async function climbTextFallback({
  refused,
  changes,
  evidence = {},
  kit,
  contentMap,
  before,
  inspect,
  send
}) {
  const map = new Map(each(contentMap?.slots).map((s) => [s?.key, s]))
  const kitSlots = kitSlotIndex(kit)
  const kitSlotOf = (key) => kitSlots.get(key.replace(/^module-/, 'block-')) ?? kitSlots.get(key)
  const isText = (key) => (map.get(key)?.type ?? kitSlotOf(key)?.type) === 'text'
  const texts = [...refused.keys()].filter((key) => typeof changes[key] === 'string' && isText(key))
  const out = new Map()
  if (!texts.length) return out
  const first = (key) => refused.get(key)
  const why = (key) => refusalWords(first(key))

  // Rung 1: the plain words, where they are not what was sent already.
  const plain = Object.fromEntries(
    texts
      .map((key) => [key, visibleText(changes[key])])
      .filter(([key, words]) => words && words !== changes[key])
  )
  let left = texts
  if (Object.keys(plain).length) {
    const took = await send({
      reading: await inspect(),
      changes: plain,
      evidence: Object.fromEntries(
        Object.keys(plain)
          .filter((k) => k in evidence)
          .map((k) => [k, evidence[k]])
      ),
      emptySlots: []
    })
    for (const key of took.stop || took.cancelled ? [] : took.written)
      out.set(key, {
        rung: 'plain',
        ordered: plain[key],
        entry: first(key),
        reason: `the plugin refused the words with their emphasis (${why(key)}), so they were written plain`
      })
    left = texts.filter((key) => !out.has(key))
  }

  // Rung 2: hide what the kit lets go and the site can empty (as the site said before the write), read afresh only to send.
  const onSite = new Map(each(before?.slots).map((s) => [s?.key, s]))
  const hideable = left.filter((key) => slotCanEmpty(onSite.get(key)) && kitSlotOf(key)?.canHide !== false)
  if (hideable.length) {
    const took = await send({ reading: await inspect(), changes: {}, evidence: {}, emptySlots: hideable })
    for (const key of took.stop || took.cancelled ? [] : (took.emptied ?? []))
      out.set(key, {
        rung: 'hidden',
        entry: first(key),
        reason: `the plugin refused the words (${why(key)}), so the slot was emptied rather than keep its demo text`
      })
  }

  // Rung 3: say it.
  for (const key of texts)
    if (!out.has(key))
      out.set(key, { rung: 'demo-remains', entry: first(key), reason: `${why(key)}; ${DEMO_REMAINS}` })
  return out
}

/** The report lines with the rung each refused text slot ended on. */
export function withTextFallback(lines, fallbacks) {
  if (!fallbacks?.size) return lines
  return lines.map((line) => {
    const done = typeof line.key === 'string' && fallbacks.get(line.key)
    if (!done || !['written', 'failed'].includes(line.status)) return line
    const base = { ...line, textFallback: done.rung, reason: done.reason, refusal: done.entry }
    if (done.rung === 'plain') return { ...base, status: 'written', ordered: done.ordered }
    if (done.rung === 'hidden') {
      const { ordered: _sent, ...rest } = base
      return { ...rest, status: 'hidden' }
    }
    return { ...base, status: 'failed' }
  })
}
