// The order a created record takes in its list (#597, gate run 7; `listOrder` on its create op,
// `draft-write-item-order.mjs`): its rank as the record's `ordering`, so a list ordered by the records' own order
// shows the plan's order. Its dates are not set here: `step-chain-draft-write-dates.js` dates every created article
// apart from the plan's rank (`op.dated`, `draft-write-record-columns.mjs`, the same plan list order), newest first,
// from one time kept in the run record.

/**
 * The column that puts a created record at its rank in its list, or none.
 * @param {{listOrder?: {rank: number}}} op
 */
export function listOrderFields(op) {
  const rank = op.listOrder?.rank
  return Number.isInteger(rank) && rank >= 1 ? { ordering: rank } : {}
}
