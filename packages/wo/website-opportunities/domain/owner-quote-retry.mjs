// The owner quote retry's answer laid on a reading (decision D46, #609; the call is `src/business-reading.js`, the
// request `owner-quote-prompt.mjs`). The answer is checked as every reading answer is (`checkBusinessReading`), with
// the owner's passage as its ONLY text: an item stands only on a quote found in the statement, never in web text, and
// its label is held to the owner rules and the echo guard there. Pure.
import { READING_GROUPS, checkBusinessReading, comparable } from './business-reading.mjs'
import { ownerPassageIn } from './owner-quote-drops.mjs'

const list = (v) => (Array.isArray(v) ? v : [])

/**
 * A reading with the retry's answer applied: each item that now stands is added to its group (one the reading already
 * holds under the same label is not added twice), with the owner facts and echo records its check made. Every earlier
 * owner drop is marked `retry: 'kept'` when the retry kept an item, else `'rejected'`; what the retry itself dropped is
 * recorded after them as `why: 'retry_rejected'` with its own reason as `detail`. `ownerQuoteRetry: 'done'`; an answer
 * that is not the contract's JSON keeps the reading, `ownerQuoteRetry: 'unreadable'`, every drop `'rejected'`.
 */
export function withOwnerQuoteRetry(read, answer, sources, { trade = null } = {}) {
  const passage = ownerPassageIn(sources)
  const before = list(read?.ownerItemsDropped)
  const mark = (retry) => before.map((d) => ({ ...d, retry }))
  const checked = passage ? checkBusinessReading(answer, [passage], { trade }) : null
  if (!checked) return { ...read, ownerItemsDropped: mark('rejected'), ownerQuoteRetry: 'unreadable' }
  const out = { ...read }
  let kept = 0
  for (const group of READING_GROUPS) {
    const have = new Set(list(read[group]).map((i) => comparable(i.label)))
    const added = list(checked[group]).filter((i) => !have.has(comparable(i.label)))
    if (!added.length) continue
    out[group] = [...list(read[group]), ...added]
    kept += added.length
  }
  for (const key of ['ownerFacts', 'ownerEchoDropped'])
    if (list(checked[key]).length) out[key] = [...list(read[key]), ...checked[key]]
  out.ownerItemsDropped = [
    ...mark(kept ? 'kept' : 'rejected'),
    ...list(checked.ownerItemsDropped).map((d) => ({
      group: d.group,
      label: d.label,
      why: 'retry_rejected',
      detail: d.why
    }))
  ]
  out.ownerQuoteRetry = 'done'
  return out
}
