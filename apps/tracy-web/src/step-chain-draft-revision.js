// A revision run of a draft (#599): the customer changed the approved plan after a build, and the build chat starts a
// run of the new plan revision from the build the site holds (`ctx.brief.rebuildFrom`: that build's ref). The steps
// are the draft run's; what a revision changes:
//   plan      reads the previous build (`deps.builds.read(ref, ctx)`), checks it can be revised (`revisionBaseProblem`:
//             missing, unreadable, unfinished, another plan or kit: a typed stop, noRerun, nothing written: the site
//             then needs a full build on a new blank site), and works out which pages the writer writes again
//             (`revisionImpactOf`). A previous build with no kept copy writes every page again, said in the record.
//             A revision that takes a page off stops here (`revision_needs_removal`), before any model call.
//   copy      writes those pages only; every other page keeps its words with no model call; every page is checked
//             together (the copy check and the whole site check)
//   pictures, icons   ask the model only for a request the previous build did not ask (`keptModel`)
//   order     the whole write order again (no model), checked whole
//   write     only the operations the revision changed (`runRevisionWrite`), on a record of its own
import { createHash } from 'node:crypto'
import { revisionBaseProblem } from 'website-opportunities/domain/build-result.mjs'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { keptWordsOf, revisionImpactOf } from 'website-opportunities/domain/revision-impact.mjs'
import { keptModel } from 'website-opportunities/domain/revision-model-replay.mjs'
import { draftError } from './step-chain-draft-source.js'

const PROMPT_SHA256 = createHash('sha256').update(PAGE_WRITER_PROMPT).digest('hex')
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a run is a revision of a stored build. */
export const isRevisionRun = (ctx) => isText(ctx?.brief?.rebuildFrom)

const MESSAGES = {
  previous_build_missing: 'no stored build answers this ref',
  previous_build_unreadable: 'the stored build is not a build result this server reads',
  previous_build_unfinished: 'the stored build did not finish its write',
  previous_build_other_plan: 'the stored build is of another plan',
  previous_build_other_kit: 'the stored build was written from another kit',
  previous_build_doors_missing: 'this server keeps no builds to revise'
}

/**
 * The previous build and the impact of the revision on the writer, for the plan step of a revision run; null for any
 * other run. A build that cannot be revised is a typed stop before any model work.
 */
export async function revisionOf(deps, ctx, { kit, plan, profile }) {
  if (!isRevisionRun(ctx)) return null
  const ref = ctx.brief.rebuildFrom
  const build = typeof deps.builds?.read === 'function' ? await deps.builds.read(ref, ctx) : undefined
  const code =
    build === undefined ? 'previous_build_doors_missing' : revisionBaseProblem(build, { plan, kit: kit.ref })
  if (code)
    throw draftError(
      code,
      `${MESSAGES[code]} (${ref}): a revision writes on the site that build left; build the site in full on a new blank site instead`,
      { from: ref }
    )
  const impact = revisionImpactOf({
    previous: { plan: build.plan, profile: build.profile, copy: build.copy },
    next: { plan, profile },
    blockStore: kit.aiq.blockStore,
    library: list(kit.aiq.library),
    mapping: kit.aiq.mapping ?? undefined,
    promptSha256: PROMPT_SHA256
  })
  // A page taken off the plan takes its records off the site: no measured door does that, so no model work is spent.
  if (impact.removed.length)
    throw draftError(
      'revision_needs_removal',
      `the revision takes ${impact.removed.length} page(s) off the site; no measured door removes a page`,
      { pages: impact.removed, unproven: 'record_removal_no_door' }
    )
  return { previous: build, impact }
}

/** What the record keeps of a revision: the pages written again with why, the pages kept, never any words. */
export const revisionRecordOf = (revision) =>
  revision && {
    from: revision.previous.ref,
    full: revision.impact.full,
    write: revision.impact.write,
    reuse: revision.impact.reuse,
    blocks: revision.impact.blocks.length,
    unaffected: revision.impact.unaffected.length
  }

/**
 * The words a revision keeps, by page id: a page the impact did not send to the writer keeps all of them (no call); a
 * page sent only for some of its blocks keeps the others' words and asks those blocks' fields (`ask`). A page sent for a
 * reason of the whole page (the site name, the language, its own name, a held text in its words, no kept words) is not
 * in the map: it is written whole.
 */
export function reuseOf(plan) {
  if (!plan?.revision) return undefined
  const { impact } = plan.revision
  const kept = new Map(list(plan.previous.copy?.pages).map((p) => [p.id, p]))
  const out = new Map()
  for (const id of impact.reuse) if (kept.has(id)) out.set(id, keptWordsOf(kept.get(id)))
  for (const { page, reasons } of impact.write) {
    if (!kept.has(page) || reasons.some((r) => r !== 'blocks')) continue
    const ask = impact.blocks.filter((b) => b.page === page && !b.reasons.includes('block:removed'))
    out.set(page, { ...keptWordsOf(kept.get(page)), ask: new Set(ask.map((b) => b.block)) })
  }
  return out
}

/** The model of the pictures and icons steps: the previous build's replies answer an unchanged request. */
export const keptModelOf = (model, plan) => keptModel(model, plan?.previous?.replies)
