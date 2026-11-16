// Columns of the records the draft write creates beyond their words (ticket #597, real run of plugin 0.24.85). Pure;
// part of `writePlanOf`, after the categories (a created record's page type is known then).
//
//   facts   `pages.<type>.record.facts: {<column>: {fact}}` (#587): a column of every record a page of that type
//           creates holds a business fact, the first entry of that fact the plan writes (JA Boxing: the business name
//           in an article's `created_by_alias`, the page's meta author, where the site printed the administrator
//           account's name). A column outside `RECORD_FACT_COLUMNS` for the record's kind stops the plan
//           (`record_fact_column_unknown`); a plan with no entry of the fact leaves the column to the site
//           (`record_fact_missing`). A column the record door does not write (`draft-write-door-columns.mjs`: an
//           article's `created_by_alias` on plugin 0.24.85) is not sent: the door would drop it and the read back stop
//           the write. It is flagged (`record_fact_no_door`) and the site keeps its own value (the author account).
//   dates   every created article is dated apart, in the order the plan lists it: the write makes them within
//           seconds, so a list ordered by date would have no rule between two of them. A block of the store that
//           lists records by date (`itemsOrder: {by: "published", direction}`) gives the order: `desc` (newest first,
//           Joomla's own default) dates its first item newest, `asc` its first item oldest. The articles no such block
//           lists come after, in plan order. The plan holds only each article's rank (`dated: {rank}`, 0 newest);
//           the write turns ranks into `publish_up` dates from one time kept in its run record, so a resume and a
//           read back agree
//           (`step-chain-draft-write-dates.js`). A second list that orders the same articles otherwise is reported
//           (`items_order_dates_disagree`).
import { RECORD_FACT_COLUMNS } from './ai-quickstart-kit-declarations.mjs'
import { doorWrites } from './draft-write-door-columns.mjs'
import { DraftWriteError } from './draft-write-error.mjs'
import { put, unproven } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const createdOf = (state, kind) =>
  [...state.sink.records.values()].filter((r) => r.kind === 'created' && r.recordKind === kind)

/** The first block level entry of a fact that holds words: the one the plan writes at the fact's places. */
const factEntryOf = (state, name) =>
  state.facts.find((f) => f.name === name && f.scope?.level === 'block' && typeof f.entry?.value === 'string')
    ?.entry ?? null

function planRecordFacts(state) {
  const pages = state.kit.mapping.pages ?? {}
  for (const record of [...state.sink.records.values()].filter((r) => r.kind === 'created')) {
    const decl = pages[record.pageType]?.record
    if (!decl?.facts || decl.kind !== record.recordKind) continue
    for (const [column, { fact } = {}] of Object.entries(decl.facts)) {
      if (!list(RECORD_FACT_COLUMNS[record.recordKind]).includes(column))
        throw new DraftWriteError(
          'record_fact_column_unknown',
          `${record.key} declares a fact in ${column}`,
          {
            record: record.key,
            column
          }
        )
      if (!doorWrites(record.recordKind, column)) {
        unproven(state.sink, 'record_fact_no_door', { record: record.key, column, fact })
        continue
      }
      const entry = factEntryOf(state, fact)
      if (!entry) {
        unproven(state.sink, 'record_fact_missing', { record: record.key, column, fact })
        continue
      }
      put(state.sink, record.key, { column }, entry.value, {
        entry: entry.place,
        rule: `record.fact:${fact}`
      })
    }
  }
}

/** The subjects each date ordered list of the order shows, in the order it shows them (newest first). */
function datedListsOf(state) {
  const lists = []
  for (const page of state.order.pages)
    for (const block of page.blocks) {
      const order = state.kit.store.get(block.block)?.itemsOrder
      if (order?.by !== 'published' || block.state === 'hidden') continue
      const subjects = list(block.items).map((i) => i.data ?? i.id)
      lists.push({ block: block.id, subjects: order.direction === 'asc' ? subjects.reverse() : subjects })
    }
  return lists
}

function planDates(state) {
  const articles = createdOf(state, 'article')
  const bySubject = new Map(articles.map((r) => [r.subject, r]))
  let next = 0
  for (const { block, subjects } of datedListsOf(state)) {
    let last = -1
    for (const subject of subjects) {
      const record = bySubject.get(subject)
      if (!record) continue
      record.dated ??= { rank: next++ }
      if (record.dated.rank < last) unproven(state.sink, 'items_order_dates_disagree', { block })
      last = record.dated.rank
    }
  }
  for (const record of articles) record.dated ??= { rank: next++ }
}

/**
 * The fact columns and the dates of the created records.
 * @param {object} state the planner's state, after `planCategories`
 */
export function planRecordColumns(state) {
  planRecordFacts(state)
  planDates(state)
}
