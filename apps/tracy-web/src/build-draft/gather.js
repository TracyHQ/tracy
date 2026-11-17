/**
 * The build chat's research of the owner's own words, with no link (#609): an owner with no website, no map listing and
 * no social page says what the business is, and the research brief and asset manifest are made from those words alone,
 * in the shapes a website opportunity's revision stores (`wo_revision.brief`, `wo_revision.asset_manifest`), the input
 * of `researchOf` (`engine-steps.js`). Nothing is fetched and nothing is saved: the description is read by the step
 * chain's business reading as the owner's answer (D46, `gather-reading.js`), and the brief is made by its own brief
 * makers (`gather-read.js`). Every door is injected (`build-draft-gather-wiring.js` `preSiteGatherer`).
 *
 * 🔒 LINKS ARE THE STEP CHAIN'S OWN RESEARCH (#575). A research with links runs the step chain's place research
 * (`place-research.js`, through the engine), never this gatherer: given links, it refuses with `research_unavailable`.
 *
 * With neither a link nor a description, the step stops with `research_empty` and reason `no_links`; with a
 * description but no business name, with reason `no_name`.
 */
import { randomUUID } from 'node:crypto'
import { EngineStepError } from './engine-steps.js'
import { briefOf, briefReadOf, profileOfRead } from './gather-read.js'
import { readingOf } from './gather-reading.js'

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * @param {{loadDomain: () => Promise<object>, runtime: () => Promise<{keys: object, settings: object}>, parts: object,
 *   readingDoor?: () => Promise<object>, readingFetch?: typeof fetch, readingBudgetMs?: number,
 *   now?: () => number, log?: Console}} deps `readingDoor`: the business reading's model door (`woEditorial`);
 *   `readingFetch`: the fetch its model call goes out through
 * @returns {(input: {links?: string[], description: string | null, name?: string | null, withheld?: object | null},
 *   context?: {accountId?: string}) => Promise<{brief: object, manifest: object[], setAside: [], reading: object,
 *   descriptionFacts?: object, descriptionKeptOut?: object[]}>} `reading`: how the business was read
 */
export function createPreSiteGatherer(deps) {
  const { parts, now = Date.now } = deps
  /** The business reading over the owner's words, as `gather` reads them, for a business known by `name`. */
  async function readWords({ description, name, withheld, trade = null }) {
    const [domain, { settings }] = await Promise.all([deps.loadDomain(), deps.runtime()])
    // A business known by the name the owner typed and by no place. Its id names no `wo_opportunity` row.
    const opp = {
      id: randomUUID(),
      name: isText(name) ? name.trim() : '',
      branch: null,
      provider: null,
      provider_id: null,
      candidate: {}
    }
    const subject = profileOfRead({ opp, rows: [], googlePlace: null, description, domain, parts })
    const reading = await readingOf({
      parts,
      readingDoor: deps.readingDoor,
      fetch: deps.readingFetch,
      rows: [],
      profile: subject.merged,
      google: null,
      trade: trade ?? (subject.trade === 'other' ? null : subject.trade),
      description,
      withheld,
      capCents: settings?.researchJobCapCents ?? parts.defaultJobCapCents,
      now,
      ...(deps.readingBudgetMs ? { budgetMs: deps.readingBudgetMs } : {}),
      ...(deps.log ? { log: deps.log } : {})
    })
    return { domain, opp, reading }
  }
  const gather = async function gather({ links, description, name = null, withheld = null }) {
    if (links?.length)
      throw new EngineStepError('research_unavailable', "links are read by the step chain's research", {
        noRerun: true
      })
    // Neither a link nor the owner's words: nothing to read (`stoppedOf`, reason `no_links`).
    if (!isText(description))
      throw Object.assign(new EngineStepError('research_empty', 'nothing was given', { noRerun: true }), {
        reason: 'no_links'
      })
    // No link names the business, so the owner does: a brief needs its name (`stoppedOf`, reason `no_name`).
    if (!isText(name))
      throw Object.assign(new EngineStepError('research_empty', 'no name was given', { noRerun: true }), {
        reason: 'no_name'
      })
    const { domain, opp, reading } = await readWords({ description, name, withheld })
    const madeAt = new Date(now()).toISOString()
    const briefInput = {
      opp,
      rows: [],
      media: [],
      googlePlace: null,
      description,
      madeAt,
      domain,
      parts,
      reading: reading.reading
    }
    const made = briefOf({ ...briefInput, prepared: briefReadOf(briefInput), pictureLabelling: null })
    if (made.invalid)
      throw new EngineStepError(
        'research_unusable',
        `the brief is not valid: ${JSON.stringify(made.invalid).slice(0, 300)}`,
        { noRerun: true }
      )
    return {
      brief: made.brief,
      manifest: made.manifest,
      setAside: [],
      reading: reading.record,
      // What became of the owner's description (D46): how the reading read it as a source, and its sentences kept out
      // of the brief.
      ...(reading.ownerStatement ? { descriptionFacts: reading.ownerStatement } : {}),
      ...(made.keptOut?.length ? { descriptionKeptOut: made.keptOut } : {})
    }
  }
  /**
   * The owner's words read beside a research of links (#575, `place-research.js` `finishPlaceResearch`): the same
   * business reading, given what the owner keeps off the site, whose answer is only how the words were read
   * (`descriptionFacts`) and the reading's record. Nothing of it is a brief.
   * @param {{description: string, name?: string | null, trade?: string | null, withheld?: object | null}} input
   *   `trade`: the trade the research found, when it found one
   */
  gather.readDescription = async ({ description, name = null, trade = null, withheld = null }) => {
    if (!isText(description)) return null
    const { reading } = await readWords({ description, name, withheld, trade })
    return {
      reading: reading.record,
      ...(reading.ownerStatement ? { descriptionFacts: reading.ownerStatement } : {})
    }
  }
  return gather
}
