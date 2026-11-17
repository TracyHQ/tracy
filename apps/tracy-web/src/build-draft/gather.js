/**
 * The research gatherer of the build chat before a site exists (#609): the owner's links become the research brief
 * and asset manifest a website opportunity's revision stores (`wo_revision.brief`, `wo_revision.asset_manifest`), the
 * input of `researchOf` (`engine-steps.js`), WITHOUT a website opportunity: nothing here writes a `wo_*` row. Every
 * door it reads through is injected (`build-draft-gather-wiring.js` `preSiteGatherer`), so tests run it on fakes.
 *
 *   links -> judged (`gather-links.js`) -> Google place facts, listing pages, website and social pages read
 *   (`gather-sources.js`) -> the business reading (`gather-reading.js`) -> brief and manifest (`gather-read.js`)
 *
 * The pictures the sources collected, and the Google place's photos, are stored as draft pictures (`pictures.js`),
 * within the same deadline: the manifest names only stored copies, and a picture not stored is set aside with its reason (`picturesSetAside`).
 *
 * A Google link that matches more than one place stops the step before anything is read, with the question that asks
 * the owner which place is theirs (`place_ambiguous`, `gather-place.js`); the owner's answer comes back as `place`.
 * A link that cannot be read is set aside with a plain reason (`setAside`); research with nothing read stops with
 * `research_empty` (`noRerun`: the same links read again give the same nothing). With no link at all, the owner's
 * description is the one source (the business reading reads it as the owner's answer) and nothing is fetched; with
 * neither, the step stops with `research_empty` and reason `no_links`. One deadline (`budgetMs`) bounds the
 * whole step; what was read by then is kept.
 */
import { randomUUID } from 'node:crypto'
import { EngineStepError } from './engine-steps.js'
import { linksOf, reasonOf } from './gather-links.js'
import { placeAmbiguousError } from './gather-place.js'
import { boundedFetch, isCollected, readSources, websiteReader, withinTime } from './gather-sources.js'
import { briefOf, briefReadOf, profileOfRead } from './gather-read.js'
import { jobCharge, pictureLabellingOf } from './gather-vision.js'
import { readingOf } from './gather-reading.js'
import { NOT_STORED, picturesToStore, placePhotoItems } from './pictures.js'

const NO_STORE = NOT_STORED.store_unavailable

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The links judged when there is none: a business known by the name the owner typed (`name`, the research door's own
 * field, never taken from the description) and by no place, with nothing set aside.
 */
const wordsOnlyOf = (name) => ({
  fields: {
    name: isText(name) ? name.trim() : null,
    branch: null,
    provider: null,
    providerId: null,
    candidate: {}
  },
  setAside: [],
  listings: []
})

/**
 * Three minutes: a plain crawl of the executor's 40 website pages (15 s a page at worst, most answer in under one)
 * and one paid social run fit, and the owner waiting in the chat hears back within one short wait. The business
 * reading has its own two minutes after it (`READING_BUDGET_MS`), so the whole step ends within five.
 */
export const GATHER_BUDGET_MS = 180_000

/** Google's place facts of the matched place (`executor.js` `placeFacts`), or why there are none. */
async function placeFactsOf({ domain, fields, keys, deps, now, remaining }) {
  if (fields.provider !== 'google-places' || !fields.providerId) return { facts: null }
  if (!keys?.google) return { facts: null, reason: 'no_google_key' }
  const answer = await withinTime(async () => {
    try {
      const raw = await domain.fetchPlaceDetails(fields.providerId, { ...deps, googleKey: keys.google })
      return { facts: domain.placeFactsFromDetails(raw, { now: () => new Date(now()) }) }
    } catch {
      return { facts: null, reason: 'google_unanswered' }
    }
  }, remaining())
  return answer.timedOut ? { facts: null, reason: 'timeout' } : answer
}

/**
 * The charge door of a paid social provider (`collectSocialProfile` `deps.charge`): the call runs as it is. The build
 * chat reserves the whole research step at its ceiling in the research cost ledger before it starts
 * (`engine-spend.js`, `STEP_CEILING_CENTS.research`), so each provider call is held by that one reservation; the paid
 * run per account per day is still counted before a paid page is read (`paidRunAllowed`).
 */
const withinResearchReservation = (_spec, call) => call()

/** The owner's links whose rows read nothing, each with its plain reason (a page found on the website is not one). */
const unreadOf = (rows, pasted) =>
  rows
    .filter((r) => !isCollected(r) && pasted.has(r.source))
    .map((r) => ({ link: pasted.get(r.source), reason: reasonOf(r.reason) }))

/**
 * @param {{loadDomain: () => Promise<object>, runtime: () => Promise<{keys: object, settings: object}>,
 *   linkFields: Function, listingRowOf: (listings: object[]) => Promise<object | null>,
 *   paidRunAllowed: (accountId: string | null) => Promise<boolean>, parts: object, fetch: typeof fetch,
 *   pictures?: {store: Function, open: Function} | null, writeLogo?: Function, resolve?: Function,
 *   readingDoor?: () => Promise<object>, readingFetch?: typeof fetch, readingBudgetMs?: number,
 *   pictureLabelsWith?: ((charge: Function) => (input: object) => Promise<object>) | null,
 *   now?: () => number, budgetMs?: number, log?: Console}} deps `readingDoor`: the business reading's model door
 *   (`woEditorial`); `readingFetch`: the fetch its model call goes out through; `pictureLabelsWith`: the step
 *   chain's picture labelling, made with the research's own charge door (`gather-vision.js`)
 * @returns {(input: {links: string[], description: string | null, name?: string | null, withheld?: object | null,
 *   place?: object | 'none' | null}, context?: {accountId?: string}) =>
 *   Promise<{brief: object, manifest: object[], setAside: Array<{link: string, reason: string}>,
 *   picturesSetAside: Array<{url: string, reason: string}>, pictureRun?: string, logoFile?: string,
 *   reading: object}>} `reading`: how the business was read (`gather-reading.js` record)
 */
export function createPreSiteGatherer(deps) {
  const { parts, now = Date.now, budgetMs = GATHER_BUDGET_MS } = deps
  return async function gather(
    { links, description, name = null, withheld = null, place = null },
    context = {}
  ) {
    const started = now()
    const remaining = () => budgetMs - (now() - started)
    const deadline = AbortSignal.timeout(budgetMs)
    // Neither a link nor the owner's words: nothing to read (`stoppedOf`, reason `no_links`).
    const wordsOnly = !links?.length
    if (wordsOnly && !isText(description))
      throw Object.assign(new EngineStepError('research_empty', 'nothing was given', { noRerun: true }), {
        reason: 'no_links'
      })
    // No link names the business, so the owner does: a brief needs its name (`stoppedOf`, reason `no_name`).
    if (wordsOnly && !isText(name))
      throw Object.assign(new EngineStepError('research_empty', 'no name was given', { noRerun: true }), {
        reason: 'no_name'
      })
    const [domain, { keys, settings }] = await Promise.all([deps.loadDomain(), deps.runtime()])
    const domainDeps = {
      fetch: boundedFetch(deps.fetch, deadline),
      ...(deps.resolve ? { resolve: deps.resolve } : {}),
      now
    }
    // No link at all (the owner has no website, listing or social page): the owner's words are the only source, read
    // by the business reading as the owner's answer (D46); nothing is fetched.
    const judged = wordsOnly
      ? wordsOnlyOf(name)
      : await linksOf({
          linkFields: deps.linkFields,
          domain,
          links,
          googleKey: Boolean(keys?.google),
          place
        })
    // The Google link matches more than one place: the owner says which one first (`gather-place.js`).
    if (judged.ambiguous) throw placeAmbiguousError(judged.ambiguous)
    const setAside = [...judged.setAside]
    if (!judged.fields)
      throw new EngineStepError('research_empty', 'none of the links can be read', { noRerun: true })
    const { fields } = judged
    // An opportunity in memory only: its id names no `wo_opportunity` row.
    const opp = {
      id: randomUUID(),
      name: fields.name,
      branch: fields.branch ?? null,
      provider: fields.provider,
      provider_id: fields.providerId,
      candidate: fields.candidate
    }
    const placeRead = await placeFactsOf({ domain, fields, keys, deps: domainDeps, now, remaining })
    if (placeRead.reason && judged.googleLink)
      setAside.push({ link: judged.googleLink, reason: reasonOf(placeRead.reason) })
    const paidRunAllowed = () => deps.paidRunAllowed(context.accountId ?? null)
    const sourceDeps = { ...domainDeps, charge: withinResearchReservation }
    // The step chain's website reading (`website-reading.js`): the crawl is the plain one, the browser its own paid run.
    const websiteOrder = parts.resolveProviderOrder(settings, 'website-content').order
    const connectors = parts.orderedConnectorsFor(domain, keys, settings)
    const rows = wordsOnly
      ? []
      : await readSources({
          refs: parts.refsOfCandidate(fields.candidate),
          // The place executor's own chain: every social key and the operator's provider order (/ops/wo).
          connectors: { ...connectors, website: domain.connectorsFor({}).website },
          websiteOrder,
          website: websiteReader({
            readWebsite: parts.readWebsite,
            domain,
            keys,
            order: websiteOrder,
            settings,
            paidRunAllowed,
            deps: sourceDeps
          }),
          settings,
          keys,
          sources: parts.sources,
          socialSources: parts.socialSources,
          refsOfUrls: parts.refsOfUrls,
          mergeCollected: parts.mergeCollected,
          paidRunAllowed,
          deps: sourceDeps,
          remaining
        })
    const pasted = new Map(
      (fields.candidate?.pastedLinks ?? []).map((p) => [p.source, links.find((l) => l === p.url) ?? p.url])
    )
    setAside.push(...unreadOf(rows, pasted))
    const listingRow = judged.listings.some((l) => l.ok) ? await deps.listingRowOf(judged.listings) : null
    const read = [...rows, ...(listingRow ? [listingRow] : [])]
    if (!wordsOnly && !placeRead.facts && !read.some(isCollected))
      throw new EngineStepError('research_empty', 'nothing could be read from the links', { noRerun: true })
    const pictures = await storedPicturesOf({
      deps,
      parts,
      rows: read,
      placeFacts: settings?.googlePlacesPhotos === false ? null : placeRead.facts,
      googleKey: keys?.google ?? null,
      accountId: context.accountId,
      domain,
      domainDeps,
      remaining
    })
    // The logo is chosen and written before the brief is made, so the brief names it (`brand.logo`, as a website
    // opportunity's brief does from its place's `logoResearch`): the brand step refuses a logo file the brief does not
    // name (`BRAND_LOGO_NO_ID`).
    const logo = await logoOf({ deps, parts, rows: read, stored: pictures.rows, name: opp.name, context })
    const madeAt = new Date(now()).toISOString()
    const subject = profileOfRead({
      opp,
      rows: read,
      googlePlace: placeRead.facts,
      description,
      domain,
      parts
    })
    const capCents = settings?.researchJobCapCents ?? parts.defaultJobCapCents
    const reading = await readingOf({
      parts,
      readingDoor: deps.readingDoor,
      fetch: deps.readingFetch,
      rows: read,
      profile: subject.merged,
      google: placeRead.facts,
      trade: subject.trade === 'other' ? null : subject.trade,
      description,
      withheld,
      capCents,
      now,
      ...(deps.readingBudgetMs ? { budgetMs: deps.readingBudgetMs } : {}),
      ...(deps.log ? { log: deps.log } : {})
    })
    // The step chain's paid picture calls share the research job's cap with the reading (`gather-vision.js`).
    const charge = jobCharge({
      capCents,
      spentCents: reading.record?.costCents ?? 0,
      BudgetExceededError: parts.BudgetExceededError
    })
    const briefInput = {
      opp,
      rows: read,
      media: pictures.rows,
      googlePlace: placeRead.facts,
      description,
      madeAt,
      domain,
      parts,
      reading: reading.reading,
      ...(logo ? { logoResearch: logo.research, logoPalette: logo.palette } : {})
    }
    const prepared = briefReadOf(briefInput)
    // The photographs are labelled by the step chain before the brief is made, as a place's brief is (F08).
    const pictureLabelling = await pictureLabellingOf({
      labelsWith: deps.pictureLabelsWith,
      charge,
      read: prepared.read,
      accountId: context.accountId ?? null,
      parts,
      ...(deps.log ? { log: deps.log } : {})
    })
    const made = briefOf({ ...briefInput, prepared, pictureLabelling })
    if (made.invalid)
      throw new EngineStepError(
        'research_unusable',
        `the brief is not valid: ${JSON.stringify(made.invalid).slice(0, 300)}`,
        {
          noRerun: true
        }
      )
    const logoFile = logo?.file ?? null
    return {
      brief: made.brief,
      manifest: made.manifest,
      setAside,
      picturesSetAside: pictures.setAside,
      reading: reading.record,
      // What became of the owner's description (D46): how the reading read it as a source, and its sentences kept out
      // of the brief. No description, no record.
      ...(reading.ownerStatement ? { descriptionFacts: reading.ownerStatement } : {}),
      ...(made.keptOut?.length ? { descriptionKeptOut: made.keptOut } : {}),
      ...(pictures.run ? { pictureRun: pictures.run } : {}),
      ...(logoFile ? { logoFile } : {})
    }
  }
}

/**
 * Store the pictures the sources collected (`pictures.js`), in what is left of the deadline, under one new research
 * run: the sources' pictures (the listing page's included), their logo hints, and the Google place's photos when the
 * /ops/wo switch `googlePlacesPhotos` is on (at most `placePhotosMax`, the executor's cap; each Place Photos call is
 * held by the research step's one reservation, as the social calls are). A server without a picture store, or a
 * research of no account, keeps none: every picture is set aside.
 */
async function storedPicturesOf({
  deps,
  parts,
  rows,
  placeFacts,
  googleKey,
  accountId,
  domain,
  domainDeps,
  remaining
}) {
  const items = picturesToStore({
    rows,
    hints: parts.logoHintsOf(rows),
    placePhotos: placePhotoItems(placeFacts, { max: parts.placePhotosMax }),
    fairShare: parts.fairShare
  })
  if (!deps.pictures || !accountId)
    return {
      run: null,
      rows: [],
      setAside: items.map((i) => ({ url: i.url, source: i.source, reason: NO_STORE }))
    }
  const run = randomUUID()
  const kept = await deps.pictures.store({
    accountId,
    run,
    items,
    domain,
    deps: domainDeps,
    remaining,
    googleKey
  })
  return { run, ...kept }
}

/**
 * The business's logo as a file the brand step reads (`brand-before-site.js` `logoFile`), and the logo research the
 * brief names it by, or null. The logo is the one Website Opportunities' own rule picks without a vision model
 * (`place-logo.js`: the sources' logo hints, then `chooseLogo`, which trusts only what a page says of itself), among the
 * hints whose picture was stored; the file is written from that stored copy (`writeLogo`). A logo not found or not
 * stored is no file and no logo in the brief: the brand step then follows its own rule for a business without one.
 * The logo's own colours are measured from the same stored bytes (`media-info.js` `logoPaletteOf`, as the executor's
 * brand stage does from its stored copy): null when they cannot be read.
 * @returns {Promise<{file: string, research: {status: 'found', chosen: object, candidates: object[]},
 *   palette: object[] | null} | null>}
 */
async function logoOf({ deps, parts, rows, stored, name, context }) {
  if (!deps.writeLogo || !deps.pictures?.open) return null
  const byUrl = new Map(stored.map((m) => [m.source_url, m]))
  const candidates = parts.logoHintsOf(rows).flatMap((h) => {
    const m = byUrl.get(h.url)
    return m
      ? [{ mediaId: m.id, url: h.url, via: h.via, source: h.source, width: m.width, height: m.height }]
      : []
  })
  const { chosen } = parts.chooseLogo(candidates, { name })
  if (!chosen?.mediaId) return null
  const picture = await deps.pictures.open(chosen.mediaId, { accountId: context.accountId }).catch(() => null)
  const file = (await deps.writeLogo(picture).catch(() => null)) ?? null
  if (!file) return null
  const palette = parts.logoPaletteOf
    ? ((await parts.logoPaletteOf(picture.bytes).catch(() => null)) ?? null)
    : null
  return { file, research: { status: 'found', chosen, candidates }, palette }
}
