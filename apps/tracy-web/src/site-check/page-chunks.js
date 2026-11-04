// How a site's pages go to the host: in calls of the size the host takes. Its `demo-qa` reads at most DEMO_QA_MAX_PAGES (7)
// pages asked for and DEMO_QA_MAX_PLAN (8) planned ones in one call, each page at 1440 and then 390, one page at a time at
// about 2.6 to 6 s a page, and stops starting pages after `budgetMs` (default 240 s, cap 300 s). A site of 50 pages therefore
// goes in several calls, each with a budget of its own, so no page is left unread for want of room.
export const ASKED_PER_CALL = 7
export const PLANNED_PER_CALL = 8
export const PAGES_PER_CALL = ASKED_PER_CALL + PLANNED_PER_CALL
/** What one call may take: 15 pages at 6 s is 90 s, so 180 s leaves room for a slow site. tracy-web waits longer than it. */
export const CALL_BUDGET_MS = 180_000
export const CALL_TIMEOUT_MS = 260_000

export const chunksOf = (paths, size = PAGES_PER_CALL) =>
  Array.from({ length: Math.ceil(paths.length / size) }, (_, i) => paths.slice(i * size, (i + 1) * size))

/** A call's pages as the host takes them: the first ASKED_PER_CALL asked for, the rest planned. */
export const callPages = (chunk) => ({
  pages: chunk.slice(0, ASKED_PER_CALL),
  plan: chunk.slice(ASKED_PER_CALL)
})
