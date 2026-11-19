// The removals of a copy held before any door (#575, part of `guardPlan`): the write takes elements out of a stored
// HTML value only after the pictures, menu items and records before it are written, so a removal that names an
// element already gone stopped the run half way (`HTML_SLOT_MISSING`, then `redo_failed`). Every removal of an op is
// run, in the op's order, over the smallest HTML holding every piece the op names in that value (`frameOf`), with the
// same piece functions the memory site and the door client use; one that names no element there is refused here,
// with nothing written (`removal_element_gone`). Pure.
import { addressOf } from './draft-write-codec.mjs'
import { frameOf } from './draft-write-frame.mjs'
import { memoryHtml } from './write-order-memory-html.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const whole = ({ xpath: _xpath, ...loc }) => loc

/** Report each removal of `op` that names an element an earlier removal of the same value already took out. */
export function removalProblems(op, report) {
  const removes = list(op.removes)
  if (!removes.length) return
  const xpaths = new Map()
  const add = (loc, xpath) => {
    const key = addressOf(whole(loc))
    xpaths.set(key, [...(xpaths.get(key) ?? []), xpath])
  }
  for (const v of list(op.values)) if (v.loc?.xpath) add(v.loc, v.loc.xpath)
  for (const r of removes) add(r.loc, r.xpath)
  const html = new Map([...xpaths].map(([key, paths]) => [key, frameOf(paths)]))
  for (const r of removes) {
    const key = addressOf(whole(r.loc))
    try {
      html.set(key, memoryHtml.remove(html.get(key), r.xpath))
    } catch {
      report(
        'removal_element_gone',
        {
          op: op.key,
          entity: r.loc?.entity ?? null,
          xpath: r.xpath,
          rule: r.rule
        },
        r
      )
    }
  }
}
