// The site checks of step 9b after its turns (#448): each ended turn is handed to `judge`, and the checks run one at a
// time. A check waits `judgeGatherMs` for other turns ending at the same moment, reads only the pages those turns changed
// (every page when one changed files or a write no page places, repair-judge.js), and is joined to the site as it now is
// (lib/scoped-site-check.js). A turn with a new blocking failure on a page it changed is undone, whole, newest first;
// the pages it changed then hold the failures they had before it, and are read again before the hand-over (`recheck`).
// A turn that wrote nothing needs no check. A check that cannot end in the time left throws, as any 9b error.
import { mergeScopedCheck } from '../../lib/scoped-site-check.js'
import { EVERY_PAGE, pagesChanged, recordPagesOf, turnsToUndo, undoTurns } from './repair-judge.js'

/** One site check within the time left, of `pages` (every page when null), joined to the site as it now is. */
async function checkPages(pass, state, result, pages) {
  const from = pass.clock.now()
  const done = await pass.clock.within(() => pass.checkSite(pages), pass.clock.checkLeft())
  if (done.late) throw new Error('the site check after the repairs did not end in the time left')
  result.checks += 1
  pass.mark?.('check', from, { pages: pages ?? 'every page' })
  state.check = pages ? mergeScopedCheck(state.check, done.value, pages) : done.value
}

/** The pages `turns` changed, or null for every page. */
function scopeOf(turns, recordPages) {
  const pages = new Set()
  for (const t of turns) {
    t.changedPages = pagesChanged(t, recordPages)
    if (t.changedPages === EVERY_PAGE) return null
    for (const p of t.changedPages) pages.add(p)
  }
  return [...pages]
}

/**
 * @param {object} pass the pass's context (repair-pass.js)
 * @param {{ first: object, check: object }} state the first check, and the site check of the site as it now is
 * @param {object} result the pass's result: `checks` and `undone` grow here
 */
export function checkWorker(pass, state, result) {
  let pending = []
  let running = null
  const undoneScope = { pages: new Set(), every: false }

  async function once() {
    await pass.clock.sleep(pass.clock.limits.judgeGatherMs)
    const batch = pending
    pending = []
    try {
      const recordPages = recordPagesOf(pass.ledger)
      const wrote = batch.map((b) => b.turn).filter((t) => t.changes.length)
      for (const b of batch) b.turn.judged = true
      let bad = []
      if (wrote.length) {
        const before = state.check
        const pages = scopeOf(wrote, recordPages)
        await checkPages(pass, state, result, pages)
        bad = turnsToUndo(wrote, state.first, state.check, recordPages)
        const undone = await undoTurns(pass, bad, 'a new blocking failure on a page it changed')
        result.undone.push(...undone)
        for (const t of bad.filter((t) => pass.ledger.undone.has(t.turnId))) {
          // Undone, its pages are as they were before it.
          if (t.changedPages === EVERY_PAGE) undoneScope.every = true
          else for (const p of t.changedPages) undoneScope.pages.add(p)
          state.check =
            t.changedPages === EVERY_PAGE ? before : mergeScopedCheck(state.check, before, t.changedPages)
        }
      }
      for (const b of batch) b.resolve({ undone: pass.ledger.undone.has(b.turn.turnId) })
    } catch (error) {
      // Not judged after all: the pass judges them again before the hand-over (repair-pass.js `judgeTheRest`).
      for (const b of batch) b.turn.judged = false
      for (const b of batch) b.reject(error)
    }
  }

  const kick = () => {
    running ??= (async () => {
      while (pending.length) await once()
    })().finally(() => {
      running = null
      if (pending.length) kick()
    })
  }

  return {
    /** Judges one ended turn: `{ undone }` once a check covering it ran (none when it wrote nothing). */
    judge(turn) {
      return new Promise((resolve, reject) => {
        pending.push({ turn, resolve, reject })
        kick()
      })
    },
    /** Reads again the pages undone turns changed, so the site handed over is measured as it is. */
    async recheck() {
      if (!undoneScope.every && !undoneScope.pages.size) return
      await checkPages(pass, state, result, undoneScope.every ? null : [...undoneScope.pages])
    }
  }
}
