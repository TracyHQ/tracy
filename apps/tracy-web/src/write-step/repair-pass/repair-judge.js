// How step 9b judges its turns (#448): which pages a turn changed, read from what it wrote, and which turns to undo after
// a site check. A write names its record (`{ kind, id }`, the site write log's target) or, from a fake or a host that
// says so, its page; a record is placed on a page by the content.locate answers of the pass's own comment items, which
// name the records each page's elements print, and by the slots of the pass's faults (`article-16.6` is printed by
// article 16, `block-166.8` by module 166) on the page each fault names. A write the pass cannot place (no target, a record no item located) is
// counted as changing every page (`*`), and so is a change of files (a turn's Git moments, such as a site-wide CSS look
// change, which writes no record): a turn is never kept because its writes could not be read. Undo is of the whole
// turn, newest first, and every undo that fails, is refused or finds no time left is kept with its reason.
import { changedFindings, pageOf } from './repair-faults.js'

export const EVERY_PAGE = '*'

const recordKey = (target) =>
  target && typeof target === 'object' && target.kind && target.id !== undefined && target.id !== null
    ? `${target.kind}:${target.id}`
    : null

/** The record a slot belongs to (`article-16.6` is article 16, `block-166.8` module 166), or null. */
const slotRecord = (slot) => {
  const m = /^(article|block|module)-(\d+)\./.exec(String(slot ?? ''))
  return m ? `${m[1] === 'article' ? 'article' : 'module'}:${m[2]}` : null
}

/** The pages each record is printed on, from the locate levels of the pass's comment items and its faults' slots. */
export function recordPagesOf(ledger) {
  const out = new Map()
  const add = (key, page) => {
    if (!key || !page) return
    if (!out.has(key)) out.set(key, new Set())
    out.get(key).add(page)
  }
  for (const record of new Set(ledger.records.values())) {
    for (const item of record.items ?? [])
      for (const level of item.locate?.levels ?? []) add(recordKey(level.native ?? level), item.page)
    for (const fault of record.faults ?? []) add(slotRecord(fault.slot), pageOf(fault.page))
  }
  for (const fault of ledger.faults ?? []) add(slotRecord(fault.slot), pageOf(fault.page))
  return out
}

/** The pages a turn changed, by what it wrote: a list, or EVERY_PAGE when a write cannot be placed. */
export function pagesChanged(turn, recordPages) {
  const pages = new Set()
  for (const change of turn.changes) {
    if (typeof change?.page === 'string') {
      const page = pageOf(change.page)
      if (page) pages.add(page)
      continue
    }
    // Files the turn committed (a look change in the template's CSS) can show on any page.
    if (change?.via === 'files') return EVERY_PAGE
    if (change?.target?.front === true) {
      pages.add('/')
      continue
    }
    const on = recordPages.get(recordKey(change?.target))
    if (!on) return EVERY_PAGE
    for (const page of on) pages.add(page)
  }
  return [...pages]
}

/** The turns to undo after `later`: those that changed a page with a new blocking failure, newest first. */
export function turnsToUndo(turns, first, later, recordPages) {
  const { regressions, newlyObserved } = changedFindings(first, later)
  const out = []
  for (const turn of turns) {
    if (!turn.turnId || !turn.changes.length) continue
    turn.changedPages = pagesChanged(turn, recordPages)
    const affects = (f) =>
      f.kind === 'verification-lost' ||
      turn.changedPages === EVERY_PAGE ||
      turn.changedPages.includes(pageOf(f.page))
    turn.regressions = regressions.filter(affects)
    turn.newlyObserved = newlyObserved.filter(affects)
    if (turn.regressions.length) out.push(turn)
  }
  return out.reverse()
}

/** Undoes `turns` in the order given (newest first), each whole; each that fails is kept as `undo-failed` with why. */
export async function undoTurns(pass, turns, why) {
  const undone = []
  const record = (entry) => {
    undone.push(entry)
    // A failed required rollback leaves the base unverified even while other rollback calls are pending.
    if (!entry.ok) pass.undoUnverified = true
  }
  for (const turn of turns) {
    const entry = { turnId: turn.turnId, page: turn.page, why }
    // File moments belong to the whole site. Never roll back while a writer can still commit.
    if (pass.ledger.turns.some((t) => t.state === 'open')) {
      record({
        ...entry,
        status: 'undo-failed',
        ok: false,
        code: 'TURN_STILL_OPEN',
        reason: 'a repair turn is still open; wait for its writes to settle before undoing'
      })
      continue
    }
    if (pass.clock.returnLeft() <= 0) {
      record({
        ...entry,
        status: 'undo-failed',
        ok: false,
        code: null,
        reason: 'no time left before the return'
      })
      pass.log(`step 9b: no time left to undo ${turn.turnId} on ${turn.page}`)
      continue
    }
    const answer = await pass.clock
      .bounded('the turn undo door', () =>
        pass.agent.undo({ sessionId: turn.sessionId, turnId: turn.turnId })
      )
      .catch((error) => ({ ok: false, code: null, reason: String(error?.message ?? error) }))
    const ok = answer?.ok === true
    const reason = ok ? null : (answer?.reason ?? answer?.code ?? 'the undo door gave no answer')
    record({
      ...entry,
      status: ok ? 'undone' : 'undo-failed',
      ok,
      code: answer?.code ?? null,
      reason,
      ...(!ok && Array.isArray(answer?.reasons) ? { reasons: answer.reasons } : {})
    })
    if (ok) pass.ledger.undone.add(turn.turnId)
    else pass.log(`step 9b: undo of ${turn.turnId} on ${turn.page} failed: ${reason}`)
  }
  return undone
}
