/**
 * Which children of an unticked list page a page the customer KEPT still lists (TCH #1013, decided 08/10/2026): a
 * child stays reachable while a kept page lists it, and answers 404 only when none does. In this theme the page that
 * lists another page's children is Team: its notes are the blog posts of category `people`, so with Blog unticked
 * those posts keep answering 200. A service's latest-posts box is the blog's own feed and goes with it. Pure, so node
 * tests run it on the seed; `link-gate.ts` feeds it the record and the note slugs.
 */

/** The blog category whose posts the Team page lists as its notes. */
export const TEAM_NOTES_CATEGORY = 'people'

/** The child paths (`/blog/<slug>`) the kept pages list; `kept.team` is whether the Team page is published. */
export function listedChildren(kept: { team: boolean }, noteSlugs: readonly string[]): Set<string> {
  return new Set(kept.team ? noteSlugs.map((s) => `/blog/${s}`) : [])
}
