/**
 * What the brief's photographs show about the business, as facts the brief states (`observed-facts.mjs`), asked right
 * after the photographs are labelled (`brief-picture-labels.js`): the labels of the sharp, on-topic photos the business
 * published go to a text model in one call, and its grouped answer is held in code.
 *
 * 🔒 NO PHOTO LEAVES THIS STEP. The model reads the vision labels only; the brief gets facts naming photo ids, and the
 * planner reads those facts, never a photo or a per-photo description.
 * 🔒 NEVER IN THE WAY OF THE BRIEF. No observable photo, a refused budget or a failed call: no observed fact, and the note
 * says why. This step never throws.
 */
import { ceilingCents, visionCostCents } from 'website-opportunities/src/cost-prices.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import {
  heldObservedFacts,
  observablePhotos,
  photoViewOf
} from 'website-opportunities/domain/pictures/observed-facts.mjs'
import { observedFactsPrompt } from 'website-opportunities/domain/pictures/observed-facts-prompt.mjs'
import { observeWithModel } from '../lib/picture-observations.js'

/** How many photos of each drop reason, for the note. */
function countsOf(dropped) {
  const out = {}
  for (const d of dropped) out[d.reason] = (out[d.reason] ?? 0) + 1
  return out
}

/**
 * @param {{media: any[], labels: Map<string, {labels: any}>, closedList?: any, businessName?: string | null,
 *   trade?: string | null, door: {url: string, key: string, model: string}, accountId?: string | null,
 *   observe?: typeof observeWithModel, chargeable: Function}} input
 *   `labels`: the vision label of each photo by id, as the labelling step made them
 * @returns {Promise<{facts: {field: string, value: string, assetIds: string[]}[], note: Record<string, any>}>}
 */
export async function observeBriefPictures({
  media,
  labels,
  closedList = null,
  businessName = null,
  trade = null,
  door,
  accountId = null,
  observe = observeWithModel,
  chargeable
}) {
  const context = { list: closedList ?? { offerings: [], people: [] }, businessName }
  const views = (media ?? [])
    .filter((m) => m?.id)
    .map((m) => {
      const label = labels?.get(m.id)?.labels
      return photoViewOf(label ? { ...m, labels: { ...m.labels, vision: { labels: label } } } : m, context)
    })
  const { photos, dropped } = observablePhotos(views)
  const note = { photos: photos.length, dropped: countsOf(dropped) }
  if (!photos.length) return { facts: [], note: { ...note, status: 'none' } }
  try {
    const model = door.model
    const { answer } = await chargeable(
      {
        provider: 'vision',
        operation: model,
        maxCents: ceilingCents('vision', model),
        actualCents: (r) => visionCostCents(model, r.usage),
        // Part of labelling the brief's pictures, counted with it on /ops (`ops-usage-research.js`).
        purpose: 'picture-labels',
        payer: accountId ? { kind: 'account', accountId } : null,
        tokens: (r) => modelTokensOf((r.usage?.requests ?? []).map((q) => q.usage))
      },
      () => observe({ door, prompt: observedFactsPrompt(photos, { trade }) })
    )
    const facts = heldObservedFacts(answer, photos, {
      people: (closedList?.people ?? []).map((p) => p.label)
    })
    return { facts, note: { ...note, status: 'observed', facts: facts.length } }
  } catch (error) {
    return {
      facts: [],
      note: { ...note, status: 'failed', reason: String(error?.code ?? 'observation_failed').slice(0, 60) }
    }
  }
}
