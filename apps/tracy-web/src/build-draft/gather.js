/**
 * The build chat's reading of the owner's own words (#609, #575): the step chain's business reading (D46,
 * `gather-reading.js`) over what the owner said, for a business known by the name the owner typed. Its answer is how
 * the words were read and the reading itself, which a research of the owner's words keeps as the business's
 * `businessReading` (`owner-business.js`) and a research of links keeps as `descriptionFacts`. Nothing is fetched and
 * nothing is saved here. Every door is injected (`build-draft-gather-wiring.js` `preSiteGatherer`).
 */
import { randomUUID } from 'node:crypto'
import { EngineStepError } from './engine-steps.js'
import { profileOfRead } from './gather-read.js'
import { readingOf } from './gather-reading.js'

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * @param {{loadDomain: () => Promise<object>, runtime: () => Promise<{keys: object, settings: object}>, parts: object,
 *   readingDoor?: () => Promise<object>, readingFetch?: typeof fetch, readingBudgetMs?: number,
 *   now?: () => number, log?: Console}} deps `readingDoor`: the business reading's model door (`woEditorial`);
 *   `readingFetch`: the fetch its model call goes out through
 * @returns {Function & {readDescription: Function}} a gatherer that refuses to research by itself, with the
 *   reading of the owner's words (`readDescription`)
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
  /**
   * 🔒 RESEARCH IS THE STEP CHAIN'S (#575): links run its place research (`place-research.js`), no link its research of
   * the owner's words (`owner-research.js`), both through the engine. This gatherer only reads the owner's words for
   * them (`readDescription`); asked to research by itself, it refuses.
   */
  const gather = async function gather() {
    throw new EngineStepError('research_unavailable', "research is the step chain's own", { noRerun: true })
  }
  /**
   * The owner's words read for a research (#575): beside a research of links (`place-research.js`
   * `finishPlaceResearch`), and as the only source of a research of the owner's words (`owner-research.js`), given what
   * the owner keeps off the site: how the words were read (`descriptionFacts`), the reading itself
   * (`businessReading`) and the reading's record. Nothing of it is a brief.
   * @param {{description: string, name?: string | null, trade?: string | null, withheld?: object | null}} input
   *   `trade`: the trade the research found, when it found one
   */
  gather.readDescription = async ({ description, name = null, trade = null, withheld = null }) => {
    if (!isText(description)) return null
    const { reading } = await readWords({ description, name, withheld, trade })
    return {
      reading: reading.record,
      // The business reading itself, the step chain's `profile.businessReading` of a business known by its owner's
      // words (`owner-business.js`).
      ...(reading.reading ? { businessReading: reading.reading } : {}),
      ...(reading.ownerStatement ? { descriptionFacts: reading.ownerStatement } : {})
    }
  }
  return gather
}
