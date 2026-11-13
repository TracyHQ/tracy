/**
 * The research gatherer of the build chat before a site exists (#609): the owner's links become the research brief
 * and asset manifest a website opportunity's revision stores (`wo_revision.brief`, `wo_revision.asset_manifest`), the
 * input of `researchOf` (`engine-steps.js`), WITHOUT a website opportunity: nothing here writes a `wo_*` row. Every
 * door it reads through is injected (`build-draft-wiring.js` `preSiteGatherer`), so tests run it on fakes.
 *
 *   links -> judged (`gather-links.js`) -> Google place facts, listing pages, website and social pages read
 *   (`gather-sources.js`) -> brief and manifest (`gather-read.js`)
 *
 * A link that cannot be read is set aside with a plain reason (`setAside`); research with nothing read stops with
 * `research_empty` (`noRerun`: the same links read again give the same nothing). One deadline (`budgetMs`) bounds the
 * whole step; what was read by then is kept.
 */
import { randomUUID } from 'node:crypto'
import { EngineStepError } from './engine-steps.js'
import { linksOf, reasonOf } from './gather-links.js'
import { boundedFetch, isCollected, readSources, withinTime } from './gather-sources.js'
import { briefOf } from './gather-read.js'

/**
 * Three minutes: a plain crawl of the executor's 40 website pages (15 s a page at worst, most answer in under one)
 * and one paid social run fit, and the owner waiting in the chat hears back within one short wait.
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

/** The owner's links whose rows read nothing, each with its plain reason (a page found on the website is not one). */
const unreadOf = (rows, pasted) =>
  rows
    .filter((r) => !isCollected(r) && pasted.has(r.source))
    .map((r) => ({ link: pasted.get(r.source), reason: reasonOf(r.reason) }))

/**
 * @param {{loadDomain: () => Promise<object>, runtime: () => Promise<{keys: object, settings: object}>,
 *   linkFields: Function, listingRowOf: (listings: object[]) => Promise<object | null>,
 *   paidRunAllowed: (accountId: string | null) => Promise<boolean>, parts: object, fetch: typeof fetch,
 *   resolve?: Function, now?: () => number, budgetMs?: number}} deps
 * @returns {(input: {links: string[], description: string | null}, context?: {accountId?: string}) =>
 *   Promise<{brief: object, manifest: object[], setAside: Array<{link: string, reason: string}>}>}
 */
export function createPreSiteGatherer(deps) {
  const { parts, now = Date.now, budgetMs = GATHER_BUDGET_MS } = deps
  return async function gather({ links, description }, context = {}) {
    const started = now()
    const remaining = () => budgetMs - (now() - started)
    const deadline = AbortSignal.timeout(budgetMs)
    // A description alone is not a source: the owner is asked for a link (`stoppedOf`, reason `no_links`).
    if (!links?.length)
      throw Object.assign(new EngineStepError('research_empty', 'no link was given', { noRerun: true }), {
        reason: 'no_links'
      })
    const [domain, { keys, settings }] = await Promise.all([deps.loadDomain(), deps.runtime()])
    const domainDeps = {
      fetch: boundedFetch(deps.fetch, deadline),
      ...(deps.resolve ? { resolve: deps.resolve } : {}),
      now
    }
    const judged = await linksOf({
      linkFields: deps.linkFields,
      domain,
      links: links ?? [],
      googleKey: Boolean(keys?.google)
    })
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
    const place = await placeFactsOf({ domain, fields, keys, deps: domainDeps, now, remaining })
    if (place.reason && judged.googleLink)
      setAside.push({ link: judged.googleLink, reason: reasonOf(place.reason) })
    const rows = await readSources({
      refs: parts.refsOfCandidate(fields.candidate),
      connectors: domain.connectorsFor({ APIFY_TOKEN: keys?.apify ?? undefined }),
      settings,
      keys,
      sources: parts.sources,
      socialSources: parts.socialSources,
      refsOfUrls: parts.refsOfUrls,
      mergeCollected: parts.mergeCollected,
      paidRunAllowed: () => deps.paidRunAllowed(context.accountId ?? null),
      deps: domainDeps,
      remaining
    })
    const pasted = new Map(
      (fields.candidate?.pastedLinks ?? []).map((p) => [p.source, links.find((l) => l === p.url) ?? p.url])
    )
    setAside.push(...unreadOf(rows, pasted))
    const listingRow = judged.listings.some((l) => l.ok) ? await deps.listingRowOf(judged.listings) : null
    const read = [...rows, ...(listingRow ? [listingRow] : [])]
    if (!place.facts && !read.some(isCollected))
      throw new EngineStepError('research_empty', 'nothing could be read from the links', { noRerun: true })
    const made = briefOf({
      opp,
      rows: read,
      googlePlace: place.facts,
      description,
      madeAt: new Date(now()).toISOString(),
      domain,
      parts
    })
    if (made.invalid)
      throw new EngineStepError(
        'research_unusable',
        `the brief is not valid: ${JSON.stringify(made.invalid).slice(0, 300)}`,
        {
          noRerun: true
        }
      )
    const logoFile = await logoFileOf({ deps, parts, rows: read, brief: made.brief, domain, domainDeps })
    return { brief: made.brief, manifest: made.manifest, setAside, ...(logoFile ? { logoFile } : {}) }
  }
}

/**
 * The business's logo as a file the brand step reads (`brand-before-site.js` `logoFile`), or null. The logo is the one
 * Website Opportunities' own rule picks without a vision model (`place-logo.js`: the sources' logo hints, then
 * `chooseLogo`, which trusts only what a page says of itself); `saveLogo` downloads it with the media admission rules.
 * A logo not found or refused is no file: the brand step then follows its own rule for a business without one.
 */
async function logoFileOf({ deps, parts, rows, brief, domain, domainDeps }) {
  if (!deps.saveLogo) return null
  const candidates = parts.logoHintsOf(rows).map((h) => ({
    mediaId: h.url,
    url: h.url,
    via: h.via,
    source: h.source,
    width: null,
    height: null
  }))
  const { chosen } = parts.chooseLogo(candidates, { name: brief?.business?.name })
  if (!chosen?.url) return null
  return (await deps.saveLogo(chosen.url, { domain, deps: domainDeps }).catch(() => null)) ?? null
}
