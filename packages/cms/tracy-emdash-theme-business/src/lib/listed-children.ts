/**
 * Which children of an unticked list page a page the customer KEPT still keeps open (TCH #1013): none in this theme.
 *
 * 🔒 AN UNTICKED PAGE LEAVES NO REACHABLE CHILD (Akemi, 11/10/2026; replaces the Investors exception decided 08/10). The
 * Investors page lists the newest news posts of category `disclosures`, and with News unticked those four posts kept
 * answering 200, linked from /investors, /sitemap, /search and from each other (measured on dev, g58-biz-emd-full,
 * Tracy Business 1.7.5). Now a post goes with the News page exactly as a project goes with the Projects page, and the
 * Investors page draws its disclosures only while News is published (`src/views/Investors.astro`). Pure, so node tests
 * run it on the seed.
 */

/** The news category the Investors page lists, and how many of its newest posts. */
export const DISCLOSURES = 'disclosures'
const DISCLOSURES_SHOWN = 4

/** The posts the Investors page lists: the newest of category `disclosures` (posts arrive newest first). */
export function investorDisclosures<T extends { category?: { slug: string } }>(posts: readonly T[]): T[] {
  return posts.filter((p) => p.category?.slug === DISCLOSURES).slice(0, DISCLOSURES_SHOWN)
}

/** The child paths a kept page keeps open once their list page is unticked: always none (see above). */
export function listedChildren(
  _kept: { investors: boolean },
  _posts: readonly { slug: string; category?: { slug: string } }[]
): Set<string> {
  return new Set()
}
