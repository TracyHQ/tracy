// Prints the edit matrix of the revision run (#599), for three writers: `plain` (its words depend on its own block),
// `cross` (it quotes in a long paragraph what another block of the page shows) and `cross-new` (the same, with new
// words on every call, as a real model). Per plan edit: the pages written again and kept, the model calls, the write
// operations kept, written again and added, the door writes, the site against a full build of the new revision, and
// the restore. A writer with new words on every call cannot give the full build's words, so its row says instead how
// many old values (changed or taken away, and shown nowhere in the new plan) the site still shows after the revision,
// and how many a full build shows (both 0 when no old value is left).
//
//   node apps/tracy-web/test/draft-revision-matrix-print.mjs [plain|cross|cross-new]
import { writerContextOf, writerRequestsOf } from 'website-opportunities/domain/page-writer-context.mjs'
import { withoutWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { oldValuesOf, revisionValuesOf } from 'website-opportunities/domain/revision-old-values.mjs'
import { textsNamedIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { EDITS, revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { site } from './draft-revision-fixtures.mjs'
import {
  firstBuild,
  freshBuild,
  restoreOf,
  restoredTo,
  revisionRun,
  sameSite
} from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

let calls = 0
const WRITERS = {
  plain: {},
  cross: { cross: true },
  'cross-new': { cross: true, seed: (text) => `${text}:${calls++}` }
}
const ALL = { ...EDITS, ...MORE_EDITS }
const kit = { blockStore: site.aiq.blockStore, library: site.aiq.library, mapping: site.aiq.mapping }
const requestsOf = (side) =>
  writerRequestsOf(side.plan, writerContextOf({ profile: withoutWithheld(side.profile), ...kit }))
const base = { plan: site.build.approval.plan, profile: site.build.approval.profile }

/** The old values a site must not show after the edit: changed or taken away, and shown nowhere in the new plan. */
function goneOf(revised) {
  const now = new Set(revisionValuesOf(revised, requestsOf(revised)).values())
  return oldValuesOf(base, revised, requestsOf(base), requestsOf(revised)).filter((v) => !now.has(v))
}

const cols = [
  'writer',
  'edit',
  'written',
  'kept',
  'model',
  'same',
  'rewrite',
  'added',
  'writes',
  'site',
  'restore',
  'stop'
]
console.log(cols.join(' | '))
for (const [writer, options] of Object.entries(WRITERS)) {
  if (process.argv[2] && process.argv[2] !== writer) continue
  for (const name of Object.keys(ALL)) {
    const first = await firstBuild({ writer: options })
    const revised = revisedBy(name, ALL)
    const partial = await revisionRun(first, revised, { writer: options })
    const row = { writer, edit: name, model: partial.model.calls.length, writes: partial.writes }
    if (partial.error) {
      console.log(cols.map((c) => String({ ...row, stop: partial.error.code }[c] ?? '')).join(' | '))
      continue
    }
    const fresh = await freshBuild(revised, { writer: options })
    const { impact } = partial.run.plan.revision
    const delta = partial.run.write.report.delta
    const gone = goneOf(revised)
    row.site =
      writer === 'cross-new'
        ? `old values shown ${textsNamedIn(snapshotOf(first.memory), gone).length}, full build ${textsNamedIn(snapshotOf(fresh.memory), gone).length}`
        : sameSite(first.memory, fresh.memory, delta.orphaned)
          ? 'equal'
          : 'DIFFERS'
    const build = first.builds.get(partial.run.write.build.ref)
    const restored = await restoreOf(first, build).then(
      () => restoredTo(first.memory, first.snapshot, build),
      (error) => `stop ${error.code}`
    )
    Object.assign(row, {
      written: impact.write.length,
      kept: impact.reuse.length,
      same: delta.same,
      rewrite: delta.rewrite.length,
      added: delta.added.length,
      restore: restored === true ? 'restored' : restored
    })
    console.log(cols.map((c) => String(row[c] ?? '')).join(' | '))
  }
}
