/**
 * The step chain's picture work in the build chat's research (#575: the build chat inherits the step chain's data
 * processing). Nothing here decides anything of its own: each piece calls the step chain's function on the draft's
 * stored pictures, through the doors the wiring injects (`build-draft-gather-wiring.js`).
 *
 * - The photographs are labelled before the brief is made by the step chain's labelling
 *   (`opportunities-build/brief-picture-labels.js` `createBriefPictureLabels`: the vision call, the ownership rank of a
 *   Google author named as the business, the observed facts), asked with the step chain's own input
 *   (`revisions.js` `pictureLabelInputOf`) and laid on the read as the step chain lays them (`withPictureLabels`).
 *   A draft picture keeps its labels on its own `build_draft_picture` row, so a later build never pays for it again.
 * - The logo is chosen by the step chain's logo research (`place-logo.js` `researchLogo`: the stored candidates, each
 *   looked at by the vision model the place executor's logo research uses, then `chooseLogo`), on the draft's stored
 *   pictures in the shape of the place's media rows it reads.
 *
 * Spend: every paid call here is held by the research step's one ledger reservation (`engine-spend.js`), as the social
 * calls are, and counted in memory against the operator's cap for one research job (`/ops/wo` `researchJobCapCents`),
 * the cap the step chain's ledger holds each research job to (`cost-ledger.js` `jobCapCents`), what the business
 * reading already spent counted first. A call past that cap is refused before it is sent (`BudgetExceededError`): the
 * labelling then says it labelled nothing, the logo research lets the page's own word decide; neither stops the
 * research.
 */

/**
 * A charge door (`createChargeable`'s shape) held against one research job's cap: each call is reserved at its ceiling
 * (`spec.maxCents`) before it is sent, then counted at what it cost (`spec.actualCents`, else its ceiling).
 * @param {{capCents: number, spentCents?: number, BudgetExceededError: new (detail: object) => Error}} input
 * @returns {((spec: {maxCents: number, actualCents?: Function}, call: Function) => Promise<any>) &
 *   {spentCents: () => number}}
 */
export function jobCharge({ capCents, spentCents = 0, BudgetExceededError }) {
  let spent = Number.isFinite(spentCents) ? spentCents : 0
  const charge = async (spec, call) => {
    const maxCents = Number(spec?.maxCents) || 0
    if (spent + maxCents > capCents)
      throw new BudgetExceededError({ scope: 'job', capCents, committedCents: spent, maxCents })
    const answer = await call({ notSent: () => {} })
    let cost = maxCents
    try {
      const actual = spec.actualCents ? spec.actualCents(answer) : null
      if (Number.isFinite(actual) && actual >= 0) cost = actual
    } catch {}
    spent += cost
    return answer
  }
  charge.spentCents = () => spent
  return charge
}

/**
 * The step chain's labelling of the photographs `read` holds (`briefReadOf`), or null when no labelling door is wired
 * or the research has no account (its pictures are not stored). Never throws: a labelling that does is the step chain's
 * failed labelling (`failedPictureLabelling('vision_failed')`), as `revisions.js` `withPictureLabelling` makes it.
 * @param {{labelsWith?: ((charge: Function) => (input: object) => Promise<object>) | null, charge: Function,
 *   read: object, accountId?: string | null, parts: object, log?: Console}} input
 */
export async function pictureLabellingOf({ labelsWith, charge, read, accountId, parts, log = console }) {
  if (!labelsWith || !accountId || !parts.pictureLabelInputOf) return null
  try {
    const input = await parts.pictureLabelInputOf(null, {
      accountId,
      opportunityId: null,
      frozenResearchRead: read
    })
    return await labelsWith(charge)(input)
  } catch (error) {
    log.warn?.('build draft picture labelling failed', { error: error?.message })
    return parts.failedPictureLabelling('vision_failed')
  }
}

/** The vision door the logo research looks with, as `researchLogo` takes it: a door that cannot be looked up is none. */
async function logoDoorOf(logoDoor) {
  if (!logoDoor) return { state: 'not_configured' }
  try {
    return (await logoDoor()) ?? { state: 'not_configured' }
  } catch {
    return { state: 'unavailable', reason: 'door_lookup_failed' }
  }
}

/**
 * The business's logo as a file the brand step reads (`brand-before-site.js` `logoFile`), the step chain's logo
 * research the brief names it by, and the logo's own colours, or null. The research (`researchLogo`) reads the draft's
 * stored pictures as the place's media rows (`object_key`), the sources' logo hints, and looks at each candidate with
 * `deps.logoDoor`'s vision model (none: the page's own word decides, as in the step chain); its paid calls go through
 * `charge` (`jobCharge`). The file is written from the chosen stored copy (`writeLogo`); a logo not found or not
 * stored is no file and no logo in the brief, and the brand step then follows its own rule for a business without
 * one. The colours are measured from the same stored bytes (`media-info.js` `logoPaletteOf`, as the executor's brand
 * stage does), null when they cannot be read.
 * @returns {Promise<{file: string, research: object, palette: object[] | null} | null>}
 */
export async function logoOf({ deps, parts, rows, stored, name, accountId, charge, now = Date.now }) {
  if (!deps.writeLogo || !deps.pictures?.open) return null
  let research = null
  try {
    research = await parts.researchLogo({
      media: stored.map((m) => ({ ...m, object_key: m.objectKey })),
      sources: rows,
      door: await logoDoorOf(deps.logoDoor),
      name,
      image: async (c) => (deps.logoImage ? deps.logoImage(c) : null),
      charge,
      fetchImpl: deps.readingFetch ?? globalThis.fetch,
      now
    })
  } catch (error) {
    deps.log?.warn?.('build draft logo research failed', { error: error?.message })
    return null
  }
  const chosen = research?.status === 'found' ? research.chosen : null
  if (!chosen?.mediaId) return null
  const picture = await deps.pictures.open(chosen.mediaId, { accountId }).catch(() => null)
  const file = (await deps.writeLogo(picture).catch(() => null)) ?? null
  if (!file) return null
  const palette = parts.logoPaletteOf
    ? ((await parts.logoPaletteOf(picture.bytes).catch(() => null)) ?? null)
    : null
  return { file, research, palette }
}
