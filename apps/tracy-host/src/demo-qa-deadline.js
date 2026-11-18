/**
 * How long one QA run may take, all told: its pages' time (`budgetMs`), its routes' own time on top (`routeBudgetMs`,
 * read after the pages, `runDemoQa`) and a margin. 🔒 WHY (02/11/2026): the deadline held the pages' time alone, while
 * tracy-web gives the routes theirs and waits for both (`app.js` woDemoQa, 260 s / 85 s + the routes), so a check with
 * routes (45 s + 150 s) was cut at 60 s and a baseline (180 s + 90 s) at 195 s, DEMO_QA_DEADLINE with every page read
 * thrown away. Now 210 s and 285 s, each still inside what the web waits (235 s and 350 s).
 * @param {{budgetMs?: number, routeBudgetMs?: number}} asked
 */
export function qaDeadlineMs(asked) {
  const budget = Number.isFinite(asked?.budgetMs) && asked.budgetMs > 0 ? asked.budgetMs : 240_000
  const routes = Number.isFinite(asked?.routeBudgetMs) && asked.routeBudgetMs > 0 ? asked.routeBudgetMs : 0
  return Math.min(budget, 300_000) + Math.min(routes, 300_000) + 15_000
}

/** A QA deadline covers address probing, queue time and browser work; a partial run is never a verdict. */
export function qaDeadline(asked, parentSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(qaDeadlineError()), qaDeadlineMs(asked))
  return {
    signal: parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal,
    dispose: () => clearTimeout(timer)
  }
}

export function qaDeadlineError() {
  return Object.assign(
    new Error('QA did not finish within its deadline; no verdict or baseline was produced.'),
    {
      code: 'DEMO_QA_DEADLINE'
    }
  )
}
