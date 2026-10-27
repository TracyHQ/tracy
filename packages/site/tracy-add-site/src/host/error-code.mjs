/**
 * The one reading of a thrown `fetch` failure's code, shared by every check that needs it: the
 * diagnostic's error code (`diagnostic.mjs`), the TLS check of a Joomla sign-in (`joomla.ts`), and
 * the ban check of the export and both sign-ins (`site-link.ts`).
 *
 * `fetch` wraps the socket's error as `TypeError: fetch failed` with the code on `cause`; a host
 * with several addresses (IPv4 and IPv6, say) gives an `AggregateError` cause whose members carry
 * it, one per address. Each check that walked only the `cause` chain read that second shape as an
 * unknown error — a sign-in refused at every address then said `unreachable` instead of the ban.
 */

/** How deep the cause chain and the members of an `AggregateError` are followed. */
const MAX_DEPTH = 4

/**
 * The first code on `error`, its cause chain or the members of an `AggregateError` in it that
 * `accept` takes, or `undefined`.
 * @param {unknown} error
 * @param {(code: string) => boolean} accept
 * @returns {string | undefined}
 */
export function failureCode(error, accept) {
  /** @type {Array<{ value: unknown, depth: number }>} */
  const queue = [{ value: error, depth: 0 }]
  while (queue.length > 0) {
    const next = queue.shift()
    if (!next || !next.value || typeof next.value !== 'object' || next.depth >= MAX_DEPTH) continue
    const { code, errors, cause } = /** @type {{ code?: unknown, errors?: unknown, cause?: unknown }} */ (
      next.value
    )
    if (typeof code === 'string' && accept(code)) return code
    if (Array.isArray(errors))
      for (const member of errors) queue.push({ value: member, depth: next.depth + 1 })
    queue.push({ value: cause, depth: next.depth + 1 })
  }
  return undefined
}
