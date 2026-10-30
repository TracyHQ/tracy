// Leaf module: kept free of imports so the bundle's module order does not move when a new caller imports it.

/**
 * The refusals the replace job answers from its plan and its read alone, before any record is written: the call's
 * shape, the words not found or not editable, the count rules, a value rule, the customer's question, a site
 * identity's own door, and the site lease refusing the request before it ran (`SITE_BUSY`; after records landed it
 * says `written` and `partial`). A refusal after a write (one undone, `PARTIAL`, `STORE_CHANGED` mid-call) and every
 * lost or unknown outcome are not among them.
 */
const BEFORE_WRITE = new Set([
  'BAD_PARAMS',
  'NOT_FOUND',
  'NOT_EDITABLE',
  'AMBIGUOUS',
  'COUNT_MISMATCH',
  'TOO_MANY',
  'VALUE_NOT_ALLOWED',
  'CONFIRM_FIRST',
  'SITE_IDENTITY',
  'SITE_BUSY'
])

/**
 * 🔒 A CALL IS SENT AGAIN ONLY WHEN ITS ANSWER PROVES NOTHING WAS WRITTEN (28/10/2026): a grouped call
 * whose receipt was lost was sent again pair by pair, so "Menu item" → "Menu item for customer" was applied twice
 * and the pair it had written read as NOT_FOUND. True only for a refusal of {@link BEFORE_WRITE} that carries no
 * mark of a write (`written`, `reverted`, `partial`, `undo`, an `apply_id`): an undone write (`VALUE_NOT_ALLOWED`
 * after a check, a read failure) says `written`. A thrown call, a timeout, a 5xx, `OUTCOME_UNKNOWN` and any other
 * answer are not proof, and their pairs stay as they are until the next read measures the page.
 * @param {unknown} answer
 */
export function refusedBeforeWrite(answer) {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return false
  const a = /** @type {Record<string, unknown>} */ (answer)
  return (
    a.ok === false &&
    typeof a.code === 'string' &&
    BEFORE_WRITE.has(a.code) &&
    !(Number(a.written) > 0) &&
    a.reverted === undefined &&
    a.partial === undefined &&
    a.undo === undefined &&
    a.apply_id === undefined &&
    a.applyId === undefined
  )
}
