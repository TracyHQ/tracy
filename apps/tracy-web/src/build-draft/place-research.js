/**
 * The build chat's research of the owner's links (#575): the STEP CHAIN's own research of the business, never a second
 * runner. The owner's business is saved and researched exactly as Build from my business does it
 * (`opportunities-build/business-research.js`: a private `ownSite` opportunity, the shared place research with every
 * stage of `place-executor.js`, resumed by itself when it pauses), and the brief is the step chain's own content brief
 * (`createRevision`, a `wo_revision`), so the build chat reads what a Website Opportunities build reads.
 *
 *   start    links judged (`gather-links.js` over `link-fields.js`), a Google link matching several places asks the
 *            owner first (`gather-place.js`), then the business is saved and its research started: the ids ride on
 *            the running step (`engine.place`)
 *   progress the place run's own source rows, read on each poll of the engine (`link-reads.js` `linkProgressOf`)
 *   finish   the content brief made, and what the build chat's later steps read kept in the draft's research
 *
 * 🔒 THE OWNER CHOOSES THEIR PLACE ONCE. The place the owner chose is the saved opportunity's place: a later research of
 * the same Google link reads it from the opportunity the draft names, so the question never comes back. Starting over
 * forgets the draft's ids (`fresh-start.js`); the place research itself is shared data and stays.
 */
import { randomUUID } from 'node:crypto'
import { parseGoogleLink } from 'website-opportunities/domain'
import { keepDescriptionOut } from './description-guard.js'
import { EngineStepError } from './engine-steps.js'
import { linksOf } from './gather-links.js'
import { placeAmbiguousError } from './gather-place.js'
import { tradeOfWords } from '../lib/wo-revision-choice.js'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The Google link among the owner's links, as its address reads, or null. */
export const googleLinkOf = (links) =>
  list(links)
    .map((link) => parseGoogleLink(link)?.url)
    .find(Boolean) ?? null

/** The research refusals that are a daily limit of the step chain (`startResearch`): the owner tries again later. */
const LIMITS = new Set(['NEW_PLACES_LIMIT', 'RESEARCH_AGAIN_LIMIT'])

/**
 * The place the owner chose for this Google link in an earlier research of the draft: the saved opportunity's own
 * Google place, as the link door reads a picked place (`link-fields.js` `pickedPlace`). Undefined when the draft's
 * research read another Google link, or none.
 */
async function keptPlaceOf(service, accountId, research, links) {
  const ids = research?.ids
  const was = research?.googleLink ? googleLinkOf([research.googleLink]) : null
  if (!ids?.opportunityId || !was || was !== googleLinkOf(links)) return undefined
  const opp = await service.opportunity(accountId, ids.opportunityId).catch(() => null)
  if (!opp || !['google-places', 'google'].includes(opp.provider)) return undefined
  return { provider: 'google-places', providerId: opp.provider_id, name: opp.name }
}

/**
 * Judge the links and start the research. Throws the place question when the Google link matches several places
 * (`place_ambiguous`), `research_empty` when no link can be read.
 * @param {{links: string[], name?: string}} inputs
 * @param {{service: object, accountId: string, draftId?: string | null, place?: object | 'none',
 *   research?: object | null, now?: () => number}} tools `place`: the owner's answer to the place question;
 *   `research`: the draft's research record so far
 * @returns {Promise<{opportunityId: string, placeId: string | null, jobId: string | null, googleLink: string | null,
 *   setAside: Array<{link: string, reason: string}>}>}
 */
export async function startPlaceResearch({ links, name }, tools) {
  const { service, accountId, draftId = null, research = null, now = Date.now } = tools
  const [domain, { keys }] = await Promise.all([service.loadDomain(), service.runtime()])
  const place = tools.place ?? (await keptPlaceOf(service, accountId, research, links))
  const judged = await linksOf({
    linkFields: service.linkFields,
    domain,
    links,
    googleKey: Boolean(keys?.google),
    place: place ?? null,
    typedName: isText(name) ? name.trim() : null
  })
  if (judged.ambiguous) throw placeAmbiguousError(judged.ambiguous)
  if (!judged.fields)
    throw new EngineStepError('research_empty', 'none of the links can be read', { noRerun: true })
  const own = {
    requestId: `build-chat-${randomUUID()}`,
    at: new Date(now()).toISOString(),
    ...(draftId ? { buildDraft: draftId } : {})
  }
  const started = await service.start({ accountId, fields: judged.fields, listings: judged.listings, own })
  if (started.refusal) {
    const code = LIMITS.has(started.refusal.code) ? 'research_limit' : 'research_unavailable'
    throw new EngineStepError(code, `the research did not start: ${started.refusal.code}`, { noRerun: true })
  }
  return {
    opportunityId: started.opportunityId,
    placeId: started.placeId,
    jobId: started.jobId,
    googleLink: judged.googleLink,
    setAside: judged.setAside
  }
}

/**
 * The step chain's content brief of the researched business, as the research step's gathered record
 * (`engine-steps.js` `researchRecordOf`): the brief with the owner's description kept out word for word (D46), its
 * asset manifest, the place profile, the ids later steps read (the brand step reads the revision), and the owner's
 * description as the owner's statement the needs profile reads for its facts.
 *
 * 🔒 THE OWNER'S WORDS STILL REACH THE BUSINESS READING (#575). The place research is shared data and never reads one
 * owner's words, so the description is read beside it as the build chat read it before the step chain's research
 * (`readDescription`: the business reading of the words alone, `gather.js`, given what the owner keeps off the site):
 * what it read is the record's `descriptionFacts`, and the trade the description names guides the brief's trade when
 * the sources name none (`gather-read.js` `tradeOf`, the description as its hint). Its sentences never reach the brief.
 * @param {{description?: string | null, name?: string | null}} inputs
 * @param {{service: object, accountId: string, place: object, readDescription?: Function | null,
 *   withheld?: object | null}} tools `place`: the running step's ids
 */
export async function finishPlaceResearch(
  { description, name = null },
  { service, accountId, place, readDescription = null, withheld = null }
) {
  const made = await service.brief({ accountId, opportunityId: place.opportunityId })
  const revision = made?.revision
  if (!revision?.brief)
    throw new EngineStepError('research_unusable', `the brief could not be made: ${made?.error ?? 'none'}`, {
      noRerun: made?.error === 'BRIEF_INVALID' || made?.error === 'NOT_FOUND'
    })
  const brief = structuredClone(revision.brief)
  // The trade the owner's words name, when the sources named none (the hint of `tradeOf`).
  if (isText(description) && (!isText(brief.trade) || brief.trade === 'other')) {
    const hinted = tradeOfWords(description)
    if (hinted !== 'other') brief.trade = hinted
  }
  const keptOut = keepDescriptionOut(brief, description)
  const read =
    isText(description) && readDescription
      ? await readDescription({
          description,
          name: isText(name) ? name : (brief.business?.name ?? null),
          trade: isText(brief.trade) && brief.trade !== 'other' ? brief.trade : null,
          withheld
        }).catch(() => null)
      : null
  return {
    ...(read?.descriptionFacts ? { descriptionFacts: read.descriptionFacts } : {}),
    ...(read?.reading ? { reading: read.reading } : {}),
    brief,
    manifest: list(revision.asset_manifest),
    placeProfile: revision.place_profile ?? null,
    ids: { opportunityId: place.opportunityId, placeId: place.placeId ?? null, revisionId: revision.id },
    ...(place.googleLink ? { googleLink: place.googleLink } : {}),
    setAside: list(place.setAside),
    ...(isText(description) ? { ownerStatement: description.trim() } : {}),
    ...(keptOut.length ? { descriptionKeptOut: keptOut } : {})
  }
}
