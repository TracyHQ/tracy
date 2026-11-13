// The last two steps of a draft run (#597, #599), split from `step-chain-draft-steps.js`:
//   order  the alt text hand-off (`step-chain-draft-alt.js`), `buildWriteOrder`, `checkWriteOrder`
//   write  `draftWriteStep`: the write plan (every guard before any door) run on the site through the doors
//          `deps.draftWrite` injects; with none, `write_not_ready_for_draft` at once (noRerun), nothing written
//
// The write step's wiring, for every draft run (a first build too), so a later revision can compare:
//   - the doors keep the sha256 of every value written per place (`wroteDoors`): the build result's `state.wrote`;
//   - every stored picture's entry carries the sha256 of its bytes (`stored(order)` answers `{id}`; the bytes are
//     opened once more through `openStored` when it does not say `sha256`): new bytes under the same stored id change
//     the picture operation's effect, so a revision uploads it again;
//   - a revision run is told what it holds (`previous.write.hold`: the held texts and the ids of the held items);
//   - a flag of the write report (`held_file_left_on_site`) is kept in the step's value and record, for the caller.
import { createHash } from 'node:crypto'
import { withoutWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { heldFormsOf } from 'website-opportunities/domain/revision-text-forms.mjs'
import { buildWriteOrder } from 'website-opportunities/domain/write-order.mjs'
import { checkWriteOrder } from 'website-opportunities/domain/write-order-check.mjs'
import { altCountsOf, altProblemsOf, withAltTexts } from './step-chain-draft-alt.js'
import { wroteDoors } from './step-chain-draft-journal.js'
import { draftError } from './step-chain-draft-source.js'
import { draftWriteStep } from './step-chain-draft-write-step.js'

/** At most this many problems of a failing write order are kept in the stop report. */
const ORDER_PROBLEMS_KEPT = 20
const list = (value) => (Array.isArray(value) ? value : [])

/** The order step: the write order of the run, checked whole. */
export async function orderStep(ctx, { kit, plan, copy, pictures, icons }) {
  const withheld = plan.profile?.withheld
  const frames = withAltTexts(pictures.frames, {
    profile: pictures.profile,
    language: plan.plan.language,
    withheld,
    template: kit.aiq.template
  })
  const order = buildWriteOrder({
    run: { id: ctx.runId ?? null, kind: 'build' },
    aiq: { ...kit.aiq, ref: kit.ref },
    approval: { plan: plan.plan, profile: pictures.profile },
    writers: [{ pages: copy.pages, prompt: copy.prompt }],
    pictures: { ...pictures, frames },
    icons
  })
  const problems = checkWriteOrder(order)
  if (problems.length)
    throw draftError(
      'write_order_check_failed',
      `${problems.length} problem(s) in the write order: ${[...new Set(problems.map((p) => p.code))].join(', ')}`,
      { problems: problems.slice(0, ORDER_PROBLEMS_KEPT), problemsCount: problems.length }
    )
  const alt = altProblemsOf(order, withheld)
  if (alt.length)
    throw draftError('alt_text_unusable', `${alt.length} placed picture(s) have no usable alt text`, {
      problems: alt.slice(0, ORDER_PROBLEMS_KEPT),
      problemsCount: alt.length
    })
  const recorded = {
    pages: order.pages.length,
    pictures: order.pictures.length,
    icons: order.icons.length,
    alts: altCountsOf(frames)
  }
  return { value: { order, recorded }, usd: 0 }
}

/** What a revision holds: the held texts (people with their short forms), and the ids of the items it keeps off the site. */
export function holdOf(profile) {
  const ids = (p) => Object.values(p?.items ?? {}).flatMap((items) => list(items).map((i) => i?.id))
  const shown = new Set(ids(withoutWithheld(profile ?? {})))
  return {
    texts: heldFormsOf(profile?.withheld),
    ids: ids(profile).filter((id) => typeof id === 'string' && !shown.has(id))
  }
}

/** Every stored entry with the sha256 of its bytes. */
async function withBytesHash(stored, open) {
  const out = {}
  for (const [id, entry] of Object.entries(stored ?? {})) {
    if (!entry?.id || typeof entry.sha256 === 'string') {
      out[id] = entry
      continue
    }
    const { bytes } = await open(entry.id)
    out[id] = { ...entry, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  return out
}

/** The write step, with its wiring (above). */
export async function writeStep(deps, ctx, inputs) {
  const wiring = deps.draftWrite
  const chain = { iconLibrary: deps.iconLibrary, builds: deps.builds }
  if (typeof wiring?.doors !== 'function') return draftWriteStep(wiring, ctx, inputs, chain)
  const record = (await wiring.record?.(ctx)) ?? {}
  const wired = {
    ...wiring,
    record: async () => record,
    doors: async (c) => wroteDoors(await wiring.doors(c), record),
    stored: async (order, c) =>
      withBytesHash(await wiring.stored?.(order, c), (id) => wiring.openStored(id, c))
  }
  const previous = inputs.plan?.previous
  const plan = previous
    ? {
        ...inputs.plan,
        previous: { ...previous, write: { ...previous.write, hold: holdOf(inputs.plan.profile) } }
      }
    : inputs.plan
  const answer = await draftWriteStep(wired, ctx, { ...inputs, plan }, chain)
  const flags = list(answer?.value?.report?.flags)
  if (flags.length) {
    answer.value.flags = flags
    answer.value.recorded.flags = flags
  }
  return answer
}
