// The rules that follow a customer's plan edit (ticket #615, called by `plan-edit-gate.mjs`): the data a block cannot
// hold leaves it (`plan-data-limits.mjs`), the child list rows are planned again in the CUSTOMER's item order (each
// item's rows cut at the place it lands in, `planRows` with `keepOrder`), and the left out entries these rules wrote
// before are written again from the new plan. A value the customer typed that its field cannot hold is a problem, never
// dropped silently. Every row and every fact a list dropped is shown, left out, or goes with its item. Pure.
import { dataAccountingOf } from './plan-accounting.mjs'
import {
  answerOverLimitProblems,
  clearOverLimitValues,
  DATA_OVER_LIMIT_REASON,
  dropOverLimitData,
  overLimitLeftOut
} from './plan-data-limits.mjs'
import { ROW_REASONS } from './plan-rows-fit.mjs'
import { planRows } from './plan-rows.mjs'
import { listsBelowMinLeftOut, rowListProblems, rowsLeftOut } from './plan-rows-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const withoutId = ({ id: _id, ...entry }) => entry
/** A left out entry these rules wrote: a row, a dropped fact, a list below its minimum, data over its limit. */
const isRuleEntry = (e) => ROW_REASONS.has(e?.reason) || e?.reason === DATA_OVER_LIMIT_REASON

/**
 * Plan the rows of an edited plan again, in place on `next`, pushing customer problems into `problems`.
 * @param {object} next the edited plan
 * @param {Map<string, object>} blocks block id -> description
 * @param {object} data the plan data the plan was composed from
 * @param {object} edited the plan data with the customer's changed values
 * @param {Set<string>} changed the ids of the facts whose value the edit changed
 */
export function replanRows(next, blocks, data, edited, changed, problems) {
  const limited = dropOverLimitData(next.pages, blocks, edited)
  problems.push(...answerOverLimitProblems(limited.dropped.filter((x) => !changed.has(x.id))))
  for (const d of limited.dropped.filter((x) => changed.has(x.id)))
    problems.push({
      code: 'value_over_limit',
      at: `facts[${d.id}].value`,
      message: `This value has ${d.length} characters; the section shows at most ${d.limit}.`
    })
  clearOverLimitValues(limited.dropped, edited)
  const rows = planRows(limited.pages, blocks, data, { keepOrder: true })
  next.pages = rows.pages
  const label = (at) => next.pages.flatMap((p) => p.blocks).find((b) => at.includes(`blocks[${b.id}]`))?.label
  rowListProblems(next.pages, blocks, data, (code, at) =>
    problems.push({ code, at, message: `The ${label(at) ?? 'changed'} section cannot show these rows.` })
  )
  const shown = new Set(next.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const out = [
    ...overLimitLeftOut(limited.dropped, next.pages, data),
    ...rowsLeftOut(data, rows.planned, rows.dropped, new Set(), shown)
  ]
  next.leftOut = [
    ...list(next.leftOut).filter((e) => !isRuleEntry(e)),
    ...out.map(withoutId),
    ...listsBelowMinLeftOut(rows.dropped, next.pages)
  ]
  if (list(data.rows).length) next.rows = data.rows
  else delete next.rows
  const leftOutIds = new Set(out.map((e) => e.id))
  const accounting = dataAccountingOf({ data, pages: next.pages, placed: [], leftOutIds })
  const ruled = new Set([...rows.dropped, ...limited.dropped].map((d) => d.row ?? d.id))
  for (const id of accounting.unexplained.filter((x) => data.rowsById.has(x) || ruled.has(x)))
    problems.push({
      code: 'data_unaccounted',
      at: `data[${id}]`,
      message: 'A detail of your business is shown nowhere.'
    })
}
