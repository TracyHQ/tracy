/**
 * The page words a Website Opportunities build has a source for (the name, the profile's own description, the booking or
 * phone button, the story, the dishes), pinned into a Joomla or WordPress contract write BEFORE `content.contract apply`
 * (tasks/plan-wo-contract-writer.md, council 19/10/2026): the planner is not asked for those slots, one write carries them.
 *
 * 🔒 A SLOT A PERSON CHANGED IS NEVER OVERWRITTEN. Live value = the pin: done. Live value = neither the template's nor the
 * pin: `conflict`, and nothing is written there. The receipt (`slot:<key>`) says which, and the hand-off reads it.
 * 🔒 NEVER IN THE WAY OF A SITE'S OWN BUILD: no reader, no map, a failure — null, and the planner writes as before.
 */
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { planFillOf, readSlotRoles } from '../../lib/contract-slot-roles.js'

/**
 * @param {{copyFor?: Function} | null} woContent
 * @param {{siteKey: string, email: string, contract?: {id: string, dir?: string} | null, note: (n: string) => void}} ctx
 * @param {{cms: 'joomla' | 'wordpress', contentMap: {slots: any[]}, lang: string, pictures?: any[]}} input - `pictures`: this
 *   build's (`realPictures.forSite`): a dish photo its vision accepts fills its dish's picture slot
 * @returns {Promise<null | {buildId: string, pins: Record<string, string>, sources: Record<string, string>,
 *   roles: Record<string, string>, skipped: Array<{role: string, reason: string}>, placeholders: string[],
 *   dishes: Array<{name: string, description: string, price: string, pictureId?: string}>, facts: any[],
 *   neutralItem: string, pictures?: Record<string, string | {space: true} | null>, slotFill?: {version: string,
 *   locale: string, provisional: boolean, manifest: object[]}}>}
 *   `placeholders`: the slots pinned empty or neutral because nothing true goes there (a dish item with no dish of the
 *   restaurant, a price nobody collected, the template's testimonials) — nothing is hidden; `dishes`: the restaurant's
 *   dishes as written, for the template's dish items no slot covers (`wp-wo-fill.js`)
 */
export async function copyPinsOf(woContent, ctx, { cms, contentMap, lang, pictures = [] }) {
  if (typeof woContent?.copyFor !== 'function' || !ctx.contract?.id) return null
  try {
    const domain = await websiteOpportunitiesDomain()
    const { contractCopyPins } = domain
    // One read of the contract's slot roles (ADR 0038): the hand-written map, and a `ready` group plan from the
    // content map or the sidecar when there is one.
    const slotRoles = readSlotRoles(ctx.contract.dir, {
      cms,
      template: String(ctx.contract.id).split('/')[0]
    })
    const map = slotRoles.handMap
    const sidecar = readyPlanOf(domain, slotRoles)
    if (!map && !sidecar) return null
    const site = String(lang ?? 'en')
      .slice(0, 2)
      .toLowerCase()
    const read = await woContent.copyFor({
      siteKey: ctx.siteKey,
      email: ctx.email,
      lang: site,
      ...(pictures?.length ? { pictures } : {}),
      cards: map?.roles.cards?.length ?? 0,
      // A map with no dishes role asks for as many as a release without a map: the sweep fills the dish items with them.
      dishes:
        Math.max(
          0,
          ...Object.entries(map?.roles ?? {})
            .filter(([role]) => role === 'dishes' || role.startsWith('dishes:'))
            .map(([, groups]) => groups.length)
        ) || SWEEP_DISHES
    })
    if (!read) return null
    const kind = read.itemKind ?? 'dish'
    const { pins, sources, skipped, placeholders, dishes, facts } = contractCopyPins({
      map,
      contentMap,
      pinned: read.pinned,
      locale: site,
      kind
    })
    /** @type {Record<string, string>} */
    const roles = {}
    for (const [role, groups] of Object.entries(map?.roles ?? {}))
      groups.forEach((group, n) => {
        for (const [field, key] of Object.entries(group))
          if (!field.startsWith('$'))
            roles[key] ??= role === 'cards' || role.startsWith('dishes') ? `${role}[${n}]` : role
      })
    const out = {
      buildId: read.buildId,
      pins,
      sources,
      roles,
      skipped,
      placeholders: placeholders ?? [],
      dishes: dishes ?? [],
      facts: facts ?? [],
      // The name of a template's item no slot covers and nothing true is known for (`wp-wo-fill.js`).
      neutralItem: domain.neutralItemName({ kind, locale: site }),
      // The place profile and its assessment: the accepted facts and people the fill plan's text substitutes read.
      placeProfile: read.placeProfile ?? null
    }
    let filled = out
    if (sidecar && read.placeProfile)
      try {
        filled = withSlotFill(domain, out, sidecar, read.placeProfile, contentMap, site, pictures)
      } catch (error) {
        // The plan never costs the map's pins: they are written as before.
        ctx.note(`the slot plan could not be made: ${error instanceof Error ? error.message : error}`)
      }
    if (filled.skipped.length > 0)
      ctx.note(
        `${filled.skipped.length} sourced line(s) did not fit this release and were left to the planner`
      )
    return filled
  } catch (error) {
    ctx.note(`the sourced page words could not be read: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

/**
 * The release's group plan (content map or `slot-roles.json`) when it is `ready` and this domain can fill from it, else
 * null: a missing, stale or invalid one keeps the hand-made map (`slot-roles/<cms>.json`), or no pin at all.
 * @param {any} domain
 * @param {ReturnType<typeof readSlotRoles>} read
 */
function readyPlanOf(domain, read) {
  if (typeof domain.planSlotFill !== 'function' || typeof domain.neutralFor !== 'function') return null
  return read.state === 'ready' ? read.doc : null
}

/**
 * The pins of a release with a `ready` sidecar: each card locked to one entity of the place profile, a card with no entity
 * neutral or empty (`planSlotFill`). Over the hand-made map's sourced pins, never its placeholders: a slot the sidecar
 * leaves to the model (`composed`) keeps the map's sourced words.
 */
function withSlotFill(domain, out, slotRoles, placeProfile, contentMap, locale, pictures) {
  const plan = planFillOf(domain, slotRoles, { placeProfile, locale })
  const fill = domain.slotFillPins({ plan, contentMap, profile: placeProfile.profile, pictures })
  const kept = Object.keys(out.pins).filter((key) => out.sources[key] !== 'placeholder')
  return {
    ...out,
    pins: { ...Object.fromEntries(kept.map((key) => [key, out.pins[key]])), ...fill.pins },
    sources: { ...Object.fromEntries(kept.map((key) => [key, out.sources[key]])), ...fill.sources },
    roles: { ...out.roles, ...fill.roles },
    skipped: [...out.skipped, ...fill.skipped],
    placeholders: fill.placeholders,
    dishes: fill.dishes.length ? fill.dishes : out.dishes,
    // Each card's picture slot bound to its own entity's picture (`slotFillPins`): what the pictures' planner honours.
    pictures: fill.pictures ?? {},
    slotFill: {
      version: plan.version,
      locale,
      provisional: placeProfile.provisional === true,
      ...(placeProfile.note ? { profileNote: placeProfile.note } : {}),
      manifest: fill.manifest
    }
  }
}

/** How many of the restaurant's dishes the sweep is given for the template's dish items no slot covers. */
const SWEEP_DISHES = 24

/**
 * The restaurant's dishes as written, for an opportunity's build of a release with no slot-role map (JA Diner): no pin is
 * made, but the sweep still fills the template's dish items with them (`wp-wo-fill.js`) rather than neutral names.
 * @param {{copyFor?: Function} | null} woContent
 * @param {{siteKey: string, email: string, note: (n: string) => void}} ctx
 * @param {{lang: string}} input
 * @returns {Promise<Array<{name: string, description: string, price: string}>>} none when nothing can be read
 */
export async function sweepDishesOf(woContent, ctx, { lang }) {
  if (typeof woContent?.copyFor !== 'function') return []
  try {
    const { contractCopyPins } = await websiteOpportunitiesDomain()
    const read = await woContent.copyFor({
      siteKey: ctx.siteKey,
      email: ctx.email,
      lang: String(lang ?? 'en')
        .slice(0, 2)
        .toLowerCase(),
      cards: 0,
      dishes: SWEEP_DISHES
    })
    if (!read) return []
    return contractCopyPins({ map: null, contentMap: null, pinned: read.pinned }).dishes ?? []
  } catch (error) {
    ctx.note(`the restaurant's dishes could not be read: ${error instanceof Error ? error.message : error}`)
    return []
  }
}

/**
 * The contract pages of an opportunity's build that the template ships to show its features — colour variants, sign-in,
 * profile, error and password pages (`pageRole` `sample`): nobody visits them on a demo, so no model writes their words.
 * @param {Array<{slug: string, entity: string}>} pages - the contract's pages
 * @returns {Promise<string[]>} their entity keys; none when the domain cannot be read
 */
export async function samplePagesOf(pages) {
  try {
    const { pageRole } = await websiteOpportunitiesDomain()
    return pages.filter((page) => pageRole({ id: page.slug }) === 'sample').map((page) => page.entity)
  } catch {
    return []
  }
}

/**
 * Whether a page of an opportunity's build is one the template ships to show its features, judged by its whole path
 * (`explore/j-pages/category-blog` is a sample, though `category-blog` alone reads as a blog): the domain's `pageRole`, read
 * once so the sweep can ask it page by page.
 * @returns {Promise<(at: string) => boolean>} never true when the domain cannot be read
 */
export async function sampleAt() {
  try {
    const { pageRole } = await websiteOpportunitiesDomain()
    return (at) => at !== '' && pageRole({ id: at }) === 'sample'
  } catch {
    return () => false
  }
}

/**
 * What each pin is on the site as it stands: `written` (it holds the pin, or will once written), `conflict` (a person changed
 * it), `skipped` (the site lacks the slot, or the write did not carry it).
 * @param {Record<string, string>} pins
 * @param {Map<string, {current?: string, sample?: string}>} live - the site's slots before the write
 * @param {Set<string>} [wrote] - the keys the write carried and the site took; none given: before the write
 * @returns {Record<string, 'written' | 'conflict' | 'skipped'>}
 */
export function pinStates(pins, live, wrote) {
  /** @type {Record<string, 'written' | 'conflict' | 'skipped'>} */
  const out = {}
  for (const [key, value] of Object.entries(pins)) {
    const slot = live.get(key)
    if (!slot) out[key] = 'skipped'
    else if (slot.current === value) out[key] = 'written'
    else if (slot.current !== undefined && slot.current !== slot.sample) out[key] = 'conflict'
    else out[key] = !wrote || wrote.has(key) ? 'written' : 'skipped'
  }
  return out
}

/**
 * One receipt per pinned slot beside the build's other writes (`slot:<key>`): the same key on a retry, so it is replaced.
 * @param {{recordWrite: Function}} woContent
 * @param {NonNullable<Awaited<ReturnType<typeof copyPinsOf>>>} read
 * @param {Record<string, string>} states - `pinStates`
 * @param {(n: string) => void} note
 */
export async function recordPins(woContent, read, states, note) {
  try {
    for (const [key, state] of Object.entries(states))
      await woContent.recordWrite(read.buildId, `slot:${key}`, {
        state,
        role: read.roles[key] ?? null,
        source: read.sources[key] ?? null
      })
    // What each slot of a sidecar's plan holds (sourced, composed, neutral, empty): what QA counts.
    if (read.slotFill) await woContent.recordWrite(read.buildId, 'slot-fill', read.slotFill)
  } catch (error) {
    note(
      `what the sourced page words became could not be recorded: ${error instanceof Error ? error.message : error}`
    )
  }
}
