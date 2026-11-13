// A revision run of a draft (#599): the customer changed the approved plan after a build, and the build chat starts a
// run of the new plan revision from the build the site holds (`ctx.brief.rebuildFrom`: that build's ref). The steps
// are the draft run's; what a revision changes:
//   plan      checks the ref is the build the site holds NOW (`deps.builds.current(ctx)`: any other ref is
//             `previous_build_not_current`), reads that build (`deps.builds.read(ref, ctx)`), checks it can be revised
//             (`revisionBaseProblem`: missing, unreadable, unfinished, another plan or kit: a typed stop, noRerun,
//             nothing written: the site then needs a full build on a new blank site), and works out which pages the
//             writer writes again (`revisionImpactOf`). A previous build with no kept copy writes every page again,
//             said in the record. A revision that takes a page, a block, a block's whole data list or an item off the
//             site stops here (`revision_needs_removal`), before any model call: no measured door removes a record.
//   copy      writes those pages only; every other page keeps its words with no model call; every page is checked
//             together (the copy check and the whole site check)
//   pictures, icons   ask the model only for a request the previous build did not ask (`keptModel`); a kept reply
//             that names an old value or a held text is asked again
//   order     the whole write order again (no model), checked whole
//   write     only the operations the revision changed (`runRevisionWrite`), on a record of its own
import { createHash } from 'node:crypto'
import { revisionBaseProblem } from 'website-opportunities/domain/build-result.mjs'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { hasRemovals, keptWordsOf, revisionImpactOf } from 'website-opportunities/domain/revision-impact.mjs'
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
  previous_build_doors_missing:
    'this server keeps no builds to revise, or cannot say which build a site holds',
  previous_build_not_current: 'the site holds another build than this ref'
}
const failOf = (code, ref, extra = {}) =>
  draftError(
    code,
    `${MESSAGES[code]} (${ref}): a revision writes on the site that build left; build the site in full on a new blank site instead`,
    { from: ref, ...extra }
  )

/** The stored build of a ref; a store that throws reads as an unreadable build. */
async function storedBuild(deps, ref, ctx) {
  try {
    return await deps.builds.read(ref, ctx)
  } catch {
    throw failOf('previous_build_unreadable', ref)
  }
}

/**
 * The previous build and the impact of the revision on the writer, for the plan step of a revision run; null for any
 * other run. A build that cannot be revised is a typed stop before any model work.
 */
export async function revisionOf(deps, ctx, { kit, plan, profile }) {
  if (!isRevisionRun(ctx)) return null
  const ref = ctx.brief.rebuildFrom
  if (typeof deps.builds?.read !== 'function' || typeof deps.builds?.current !== 'function')
    throw failOf('previous_build_doors_missing', ref)
  const current = await Promise.resolve()
    .then(() => deps.builds.current(ctx))
    .catch(() => null)
  if (current !== ref) throw failOf('previous_build_not_current', ref, { current: current ?? null })
  const build = await storedBuild(deps, ref, ctx)
  const code = revisionBaseProblem(build, { plan, kit: kit.ref })
  if (code) throw failOf(code, ref)
  const impact = revisionImpactOf({
    previous: {
      plan: build.plan,
      profile: build.profile,
      copy: build.copy,
      replies: build.replies,
      ops: build.write.ops
    },
    next: { plan, profile },
    blockStore: kit.aiq.blockStore,
    library: list(kit.aiq.library),
    mapping: kit.aiq.mapping ?? undefined,
    promptSha256: PROMPT_SHA256
  })
  // Taking a page, a block or an item off the site takes records off it: no measured door does that, so no model work
  // is spent (`docs/references/draft-revision-run.md`, the door Part 1 has not measured).
  if (hasRemovals(impact.removals))
    throw draftError(
      'revision_needs_removal',
      'the revision takes pages, blocks or items off the site; no measured door removes a record',
      {
        pages: impact.removals.pages,
        blocks: impact.removals.blocks.map((b) => `${b.page}/${b.block}:${b.why}`),
        items: impact.removals.items.length,
        unproven: 'record_removal_no_door'
      }
    )
  const stale = new Set(impact.staleReplies)
  const replies = list(build.replies).filter((r) => !stale.has(r.key))
  return { previous: build, impact, replies }
}

/** What the record keeps of a revision: the pages written again with why, the pages kept, never any words. */
export const revisionRecordOf = (revision) =>
  revision && {
    from: revision.previous.ref,
    full: revision.impact.full,
    write: revision.impact.write,
    reuse: revision.impact.reuse,
    blocks: revision.impact.blocks.length,
    unaffected: revision.impact.unaffected.length,
    staleReplies: revision.impact.staleReplies.length
  }

/**
 * The words a revision keeps, by page id: a page the impact did not send to the writer keeps all of them (no call).
 * A page sent for any reason, a changed block included, is written whole: the writer request of a call that asks only
 * some blocks leaves the other blocks out (`pageWriterUser`), so the writer would see another page than in a full
 * build, and a writer that quotes one block in another would write other words (the edit matrix's cross writer).
 */
export function reuseOf(plan) {
  if (!plan?.revision) return undefined
  const { impact } = plan.revision
  const kept = new Map(list(plan.previous.copy?.pages).map((p) => [p.id, p]))
  const out = new Map()
  for (const id of impact.reuse) if (kept.has(id)) out.set(id, keptWordsOf(kept.get(id)))
  return out
}

/** The model of the pictures and icons steps: the previous build's replies answer an unchanged request. */
export const keptModelOf = (model, plan) =>
  keptModel(model, plan?.revision?.replies ?? plan?.previous?.replies)
