/**
 * Which children of an unticked page a page the customer KEPT still lists (TCH #1013): none in this theme.
 *
 * 🔒 AN UNTICKED PAGE LEAVES NO REACHABLE CHILD. The pages that list another page's children are the front page (the
 * latest articles, the gallery strip) and Featured Articles; they only link them, and `link-gate.ts` draws no link to a
 * child whose page is off, so an article goes with Blog and an album with Gallery whichever page would have listed it.
 * Pure, so node tests run it on the seed.
 */

/** The child paths a kept page keeps open once their list page is unticked: always none (see above). */
export function listedChildren(): Set<string> {
  return new Set()
}
