// The marker build (ticket #585, ADR 0045 decision 3): the build team's own chain run on a marker needs profile, with
// scripted models in place of the planner, the writer, the picture looker and the icon ranker, down to the write
// order and the write plan the write step runs. Nothing is bypassed: the rules gate, the page writer's copy check, the
// picture policy, the write order check and the write plan's guards all hold the markers to the same rules as a
// customer's build, so a place the chain leaves empty or to the template is one the gate accounts for, never one it
// fills itself. Every model reply is a marker, so whatever a page shows can be traced to the step that wrote it.
import { TRACY_LIBRARY } from '../../../packages/wo/website-opportunities/domain/library.mjs'
import { writePages } from '../../../packages/wo/website-opportunities/domain/page-writer.mjs'
import { picturesStep } from '../../../packages/wo/website-opportunities/domain/picture-step.mjs'
import { composePlan } from '../../../packages/wo/website-opportunities/domain/plan-composer.mjs'
import { buildWriteOrder } from '../../../packages/wo/website-opportunities/domain/write-order.mjs'
import { checkWriteOrder } from '../../../packages/wo/website-opportunities/domain/write-order-check.mjs'
import { writePlanOf } from '../../../packages/wo/website-opportunities/domain/draft-write-plan.mjs'
import { codeOf, textMarker } from './marker-codec.mjs'
import { markerComposition } from './marker-composition.mjs'
import { writerGapOf } from './marker-gaps.mjs'
import { markerProfile, markerRegistry } from './marker-profile.mjs'
import { markerLookOf } from './marker-look.mjs'
import { pictureShapesOf } from './marker-pictures.mjs'

/** The filler word marker texts are padded with; an icon tagged with it is a candidate for every marker heading. */
export const FILLER_TAG = 'qqqqq'
/** How long a writer's marker text is: long enough to show where a field is cut, short enough for most limits. */
const WRITER_LENGTH = 17

/** The marker writer's default text of one field: the code, padded and cut to its length. */
export const markerText = ({ code, length }) => textMarker(code, { length })

/**
 * The text the marker writer writes into one field: a new code each time, cut to the field's limit. `textOf` (write
 * safety, #586) may give another text for a field: `{code, page, key, kind, limit, length, rewrite, problems}` in (`problems`:
 * why the copy check sent the field back), a string out.
 */
function markerWriter(registry, page, textOf = markerText) {
  return async (request) => {
    const user = JSON.parse(request.user)
    const fields = {}
    for (const block of user.blocks ?? [])
      for (const slot of block.fields ?? []) {
        const code = registry.take({
          what: 'writer',
          page,
          key: slot.key,
          kind: slot.kind,
          rewrite: Boolean(user.rewrite)
        })
        const limit = slot.limit ?? WRITER_LENGTH
        const length = Math.min(limit, WRITER_LENGTH)
        fields[slot.key] = textOf({
          code,
          page,
          key: slot.key,
          kind: slot.kind,
          limit: slot.limit ?? null,
          length,
          rewrite: Boolean(user.rewrite),
          problems: (user.rewrite ?? []).find((r) => r.key === slot.key)?.problems ?? []
        })
      }
    return JSON.stringify({ fields })
  }
}

/** The picture looker: every picture is a landscape photo of a place, with no people and no words on it. */
const markerVision = async (request) => ({
  pictures: JSON.parse(request.user).pictures.map((p) => ({
    id: p.id,
    label: `Marker picture ${p.id}`,
    content: 'venue-exterior',
    people: false,
    burnedInText: false,
    orientation: 'landscape'
  }))
})

/** The icon ranker: the first candidate of every item; a keywords call gets the filler word. */
const markerRanker = async (request) => {
  const user = JSON.parse(request.user)
  const items = user.items ?? []
  if (items.some((i) => Array.isArray(i.candidates)))
    return { icons: Object.fromEntries(items.map((i) => [i.id, (i.candidates ?? []).slice(0, 1)])) }
  return { keywords: Object.fromEntries(items.map((i) => [i.id, [FILLER_TAG]])) }
}

/** An icon library whose icons all carry the filler tag, so a marker heading finds a candidate. */
export const markerIconLibrary = (library) => ({
  ...library,
  icons: library.icons.map((icon) => ({ ...icon, tags: [...(icon.tags ?? []), FILLER_TAG] }))
})

/**
 * Run the build chain on the marker profile of a kit, down to the write order and its write plan.
 * @param {{ref: string, blockStore: object, pageRecipes: object, mapping: object, blankContract: object,
 *   template: {slug: string, name?: string, version: string}}} kit
 * @param {{iconLibrary: {set: string, icons: object[]}, stored?: (order: object) => object,
 *   tryWrite?: (built: object) => Promise<object>, textOf?: Function, factOf?: Function, shape?: 'max' | 'min',
 *   pages?: (shape: {pageType: string}) => boolean}} options `stored`: the stored entry of every picture frame and icon
 *   of the order (the gate stores a marker picture for each); `tryWrite`: runs the write plan (on a memory site), its
 *   result is kept as `written`, and a write step refusal it throws is a gap like the plan's own. Write safety and the
 *   structure measurements (#586) pass `textOf` (the writer's text of a field, `markerWriter`), `factOf` (a profile
 *   value, `markerProfile`), `shape` and `pages` (`markerComposition`); left out, the marker test is unchanged
 * @returns the step values, the write plan, `gaps` (`marker-gaps.mjs`) and the final composition
 */
export async function markerBuild(
  kit,
  { iconLibrary, stored = defaultStored, tryWrite, textOf, factOf, shape, pages } = {}
) {
  const registry = markerRegistry(codeOf)
  const research = markerProfile(kit, registry, { factOf })
  const composition = markerComposition(kit, research, registry, { shape, pages })
  const label = textMarker(registry.take({ what: 'answer', question: 'main-button' }))
  const icons = markerIconLibrary(iconLibrary)
  const gaps = []
  for (let attempt = 0; attempt < MAX_GAP_RETRIES; attempt++) {
    const taken = registry.entries.length
    let built = null
    try {
      built = await chainOf(kit, { registry, research, composition, label, icons, stored, textOf })
      const written = built.writePlan && tryWrite ? await tryWrite({ ...built, registry }) : null
      return { registry, research, composition, gaps, written, ...built }
    } catch (error) {
      const gap = writerGapOf(error, composition, kit, built?.writePlan)
      if (!gap) throw Object.assign(error, { gaps })
      registry.rewind(taken)
      gaps.push(gap)
    }
  }
  throw Object.assign(new Error(`the marker build met more than ${MAX_GAP_RETRIES} write step gaps`), {
    gaps
  })
}

/** At most this many write step gaps are taken out of the composition before the marker build gives up. */
const MAX_GAP_RETRIES = 100

async function chainOf(kit, { registry, research, composition, label, icons, stored, textOf }) {
  const reply = JSON.stringify(composition)
  // The marker label is offered and chosen: a typed main button answer is an owner statement the writer rewords, never
  // the label (`plan-free-answers.mjs`), so only a chosen label reaches the button word for word.
  const profile0 = structuredClone(research)
  profile0.questions
    ?.find((q) => q.topic === 'main-button')
    ?.choices.push({ id: 'marker', label, code: 'main_button_marker', params: {} })
  const { plan, profile, accounting } = await composePlan({
    profile: profile0,
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'marker' }],
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: TRACY_LIBRARY,
    template: { ...kit.template, name: kit.template.name ?? kit.template.slug, accent: '#000000' },
    brand: { website: { colors: [{ hex: '#1F6F5C', role: 'primary' }] } },
    allowTemplateLook: true,
    planId: 'plan-marker',
    model: async () => reply
  })
  const writers = []
  for (const page of plan.pages) {
    const out = await writePages({
      plan: { ...plan, pages: [page] },
      profile,
      blockStore: kit.blockStore,
      library: TRACY_LIBRARY,
      model: markerWriter(registry, page.id, textOf)
    })
    writers.push({ page: out.pages[0], prompt: out.prompt })
  }
  const pictures = await picturesStep({
    plan,
    profile,
    blockStore: kit.blockStore,
    library: TRACY_LIBRARY,
    vision: markerVision,
    copy: { pages: writers.map((w) => w.page) },
    iconLibrary: icons,
    model: markerRanker
  })
  const aiq = {
    ref: kit.ref,
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: TRACY_LIBRARY,
    template: kit.template,
    mapping: kit.mapping
  }
  const order = buildWriteOrder({
    run: { id: 'run-marker', kind: 'build' },
    aiq,
    approval: { plan, profile },
    // An own logo: a text logo makes the write step skip every logo place, so none would be measured (G11).
    // Both sides when the kit writes a dark side value: the marker colour made readable on each (`marker-look.mjs`).
    look: {
      ...markerLookOf(kit.mapping?.look, kit.templateKit ?? null, plan.look.accent),
      accentFrom: 'brand',
      logo: { kind: 'own', source: 'marker' }
    },
    writers,
    pictures,
    icons: pictures
  })
  const orderProblems = checkWriteOrder(order)
  const storedEntries = stored(order)
  // A kit without its mapping and blank site contract (an invented kit of the tests) stops at the write order.
  const writePlan =
    orderProblems.length || !kit.mapping || !kit.blankContract
      ? null
      : writePlanOf(
          order,
          { ...aiq, blankContract: kit.blankContract },
          { stored: storedEntries, iconKeys: icons.icons.map((i) => i.name) }
        )
  // The shape of each marker picture a slot of the blank site contract declares one for.
  const shapes = pictureShapesOf(writePlan, kit.blankContract)
  return {
    plan,
    profile,
    accounting,
    writers,
    pictures,
    order,
    orderProblems,
    stored: storedEntries,
    writePlan,
    pictureShapes: shapes.shapes,
    pictureShapeConflicts: shapes.conflicts
  }
}

/** A stored entry for every picture frame and icon of an order, named by its frame. */
export function defaultStored(order) {
  const ids = [...order.pictures.map((p) => p.frame), ...order.icons.map((i) => i.id)]
  return Object.fromEntries(ids.map((id) => [id, { id: `stored-${id}` }]))
}
