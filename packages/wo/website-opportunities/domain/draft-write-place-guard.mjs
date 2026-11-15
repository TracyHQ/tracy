// The guards of a value's place (ticket #597), part of `guardPlan`: the template escapes almost nothing (door
// measurements of plugin 0.24.85), so every value the write sends must already be safe as raw HTML where it prints
// (`draft-write-escape.mjs`), and a contact the site would take with an empty name is refused here. Pure.
import { doubleParenthesisProblem, safetyAt, unsafeAt } from './draft-write-escape.mjs'
import { runsCodeIn } from './draft-write-markup.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * A value not safe as raw HTML where it prints (`draft-write-escape.mjs`): a `((` or `))` the template's converter
 * would turn into a bracket, outside the declared markers of a codes field (`markup_forbidden`), words not safe at
 * their kind of place as the kit declares it (`value_not_escaped`), or a value at a place the kit says the build never
 * writes (`place_not_written`).
 */
export function placeProblems(op, at, text, { markers, loc, slot = null, mapping = null }, report) {
  const parens = doubleParenthesisProblem(text, markers, runsCodeIn)
  if (parens) report('markup_forbidden', { ...at, via: parens })
  const { kind, marks } = safetyAt(op, loc, { slot, mapping })
  const unsafe = unsafeAt(text, { kind, marks, markers })
  if (unsafe === 'place_not_written') report('place_not_written', { ...at, kind })
  else if (unsafe) report('value_not_escaped', { ...at, via: unsafe, kind })
}

/** A contact created with an empty name: the site writes it (measured), so the build refuses it itself. */
export function nameProblems(op, report) {
  if (op.kind !== 'contact.create') return
  const named = list(op.values).find((v) => v.loc.column === 'name' && !v.loc.jsonPath && !v.loc.xpath)
  if (String(named?.value ?? op.fields?.title ?? '').trim() === '')
    report('record_name_empty', { op: op.key, column: 'name' })
}
