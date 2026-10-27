// site-sweep-verdict.mjs — the one way a heights cell reaches its verdict, for the sweep and for `--explain`:
// the accept rows of the dossier move what they cover out of the defects, then the cells are settled (net, status).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { UsageError } from '../lib/cli-args.mjs'
import { readSmallFile, parseDecisions } from '../lib/parity-acceptance.mjs'
import { applyAccept, validateSweepAccept } from './site-sweep-accept.mjs'
import { HEIGHTS_ID } from './site-sweep-heights.mjs'
import { settleHeightCells } from './site-sweep-heights-judge.mjs'

/**
 * The accept context of a dossier: { rows, decisions, runRoot }, or null when it records no row. Every row is validated; an invalid one throws
 * a UsageError (before a browser starts). DECISIONS.md is needed when a row cites a decision.
 */
export function acceptContextOf(rows, runRoot) {
  // the shape first: a declaration that is not a list is refused, never taken for an empty one
  if (rows === undefined || rows === null) return null
  const shape = validateSweepAccept(rows, { decisions: null, runRoot })
  if (!Array.isArray(rows)) throw new UsageError(shape.join('\n'))
  if (!rows.length) return null
  let decisions = null
  if (rows.some((r) => r?.kind !== 'not-measurable')) {
    const decisionsFile = path.join(runRoot, 'DECISIONS.md')
    if (!existsSync(decisionsFile)) throw new UsageError(`sweep.accept needs the dossier's DECISIONS.md (${decisionsFile}): every row cites one decision`)
    decisions = parseDecisions(readSmallFile(decisionsFile, 'DECISIONS.md'))
  }
  const problems = validateSweepAccept(rows, { decisions, runRoot })
  if (problems.length) throw new UsageError(problems.join('\n'))
  return { rows, decisions, runRoot }
}

/**
 * Accept rows, then `settleHeightCells`. `judged` = { check: entry } is changed in place; `ctx` = { rows, decisions?, runRoot? } (as `acceptContextOf`);
 * `scope` = { routes, widths, heightsWidths?, partial? } as `applyAccept`. An invalid row throws a UsageError. → what `applyAccept` returns.
 */
export function settleVerdict(judged, ctx, scope) {
  let accept = { accepted: [], errors: [], skipped: [], closedItems: {} }
  const rows = ctx?.rows ?? []
  const problems = validateSweepAccept(rows, { decisions: ctx?.decisions ?? null, runRoot: ctx?.runRoot ?? process.cwd() })
  if (problems.length) throw new UsageError(problems.join('\n'))
  if (rows.length) accept = applyAccept(judged, rows, scope)
  if (judged[HEIGHTS_ID]) settleHeightCells(judged[HEIGHTS_ID])
  return accept
}
