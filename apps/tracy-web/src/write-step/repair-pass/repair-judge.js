// How step 9b judges its turns (#448): which pages a turn changed, read from what it wrote, and which turns to undo after
// a site check. A write names its record (`{ kind, id }`, the site write log's target) or, from a fake or a host that
// says so, its page; a record is placed on a page by the content.locate answers of the pass's own comment items, which
// name the records each page's elements print. A write the pass cannot place (no target, a record no item located) is
// counted as changing every page (`*`), and so is a change of files (a turn's Git moments, such as a site-wide CSS look
// change, which writes no record): a turn is never kept because its writes could not be read. Undo is of the whole
// turn, newest first, and every undo that fails, is refused or finds no time left is kept with its reason.
import { newBlocking, pageOf } from './repair-faults.js'

export const EVERY_PAGE = '*'

const recordKey = (target) =>
  target && typeof target === 'object' && target.kind && target.id !== undefined && target.id !== null
    ? `${target.kind}:${target.id}`
    : null

/** The pages each record is printed on, from the locate levels of the pass's comment items. */
export function recordPagesOf(ledger) {
  const out = new Map()
  for (const record of new Set(ledger.records.values()))
    for (const item of record.items ?? [])
      for (const level of item.locate?.levels ?? []) {
        const key = recordKey(level)
        if (!key) continue
        if (!out.has(key)) out.set(key, new Set())
        out.get(key).add(item.page)
      }
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
  const broken = newBlocking(first, later).map((f) => pageOf(f.page))
  const brokenSet = new Set(broken.filter(Boolean))
  const out = []
  for (const turn of turns) {
    if (!turn.turnId || !turn.changes.length) continue
    turn.changedPages = pagesChanged(turn, recordPages)
    const hit =
      turn.changedPages === EVERY_PAGE ? broken.length > 0 : turn.changedPages.some((p) => brokenSet.has(p))
    if (hit) out.push(turn)
  }
  return out.reverse()
}

/** Undoes `turns` in the order given (newest first), each whole; each that fails is kept as `undo-failed` with why. */
export async function undoTurns(pass, turns, why) {
  const undone = []
  for (const turn of turns) {
    const entry = { turnId: turn.turnId, page: turn.page, why }
    if (pass.clock.returnLeft() <= 0) {
      undone.push({
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
    undone.push({ ...entry, status: ok ? 'undone' : 'undo-failed', ok, code: answer?.code ?? null, reason })
    if (ok) pass.ledger.undone.add(turn.turnId)
    else pass.log(`step 9b: undo of ${turn.turnId} on ${turn.page} failed: ${reason}`)
  }
  return undone
}
