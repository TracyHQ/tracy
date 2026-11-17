/**
 * The build chat's research when the owner gave no link (#575): the STEP CHAIN's own research again, never a second
 * runner.
 *
 *   find     the business name and city the owner gave (the agent asked for them; the model read them out of the
 *            owner's words, code only checks their length) go to Build from my business's own name search; places
 *            found are asked about on the place question card (`gather-place.js`), and the place the owner picks is
 *            researched exactly as a link is (`place-research.js`, through the engine)
 *   owner    no place (None of these, nothing found, no city): the business is saved with the owner's statements as
 *            its only source and its content brief is the step chain's own (`owner-business.js`, `createRevision`)
 *   questions what to ask next is read from that brief's readiness (`briefGapQuestionsOf`): each answer the owner
 *            gives is one more statement, and the brief is made again with it, until no field is left to ask
 *
 * 🔒 THE OWNER'S WORDS ARE READ BY MODELS, NEVER BY CODE (D46). The statements are read by the step chain's business
 * reading (`readDescription`, `gather.js`), the facts a typed answer states by the answer reading (ledger step
 * `answers`, `answer-readings.js`); no sentence of them is copied into the brief (`keepDescriptionOut`).
 */
import { randomUUID } from 'node:crypto'
import { briefGapFieldOf, briefGapQuestionsOf, BRIEF_GAP_SKIP, asChosen } from 'website-opportunities/domain'
import { keepDescriptionOut } from './description-guard.js'
import { EngineStepError } from './engine-steps.js'
import { placeAmbiguousError } from './gather-place.js'
import { tradeOfWords } from '../lib/wo-revision-choice.js'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The draft's research when it is a research of the owner's words (it carries `owner`), else null. */
export const ownerResearchOf = (row) => (row?.research?.owner ? row.research : null)

/** The owner's answers to the brief questions the draft's research asked, as stored. */
const gapAnswersOf = (row) => {
  const ids = new Set(list(ownerResearchOf(row)?.gapQuestions).map((q) => q?.id))
  return list(row?.answers).filter((a) => ids.has(a?.question))
}

/** Whether the owner answered a brief question the draft's research asked: the brief is then made again. */
export const ownerAnswersWaiting = (row) => gapAnswersOf(row).length > 0

/** The inputs the draft's research of the owner's words was made from, to make it again. */
export function ownerInputsOf(row) {
  const research = ownerResearchOf(row)
  if (!research) return null
  return {
    links: [],
    ...(isText(research.description) ? { description: research.description } : {}),
    ...(isText(research.owner.name) ? { name: research.owner.name } : {}),
    ...(isText(research.owner.city) ? { city: research.owner.city } : {})
  }
}

/**
 * Look the business up by its name and city once, before any brief: the places found are the place question
 * (`place_ambiguous`, asked as for a Google link). Nothing is asked when the owner already answered the question
 * (`place`), when the draft already holds a research of the owner's words, without a city, or when the search finds
 * nothing or cannot run (no key, its hourly count spent, Google did not answer): the owner's words are then the source.
 */
export async function findOwnerPlace({ name, city }, { service, accountId, place, row }) {
  if (place !== undefined || ownerResearchOf(row) || !isText(name) || !isText(city) || !service.find) return
  const found = await service.find({ accountId, query: `${name.trim()}, ${city.trim()}` }).catch(() => null)
  if (list(found?.candidates).length) throw placeAmbiguousError(found.candidates, { found: true })
}

/**
 * The step chain's content brief of the business its owner told about, as the research step's gathered record
 * (`engine-steps.js` `researchRecordOf`).
 * @param {{description?: string | null, name?: string | null, city?: string | null}} inputs
 * @param {{service: object, accountId: string, row: object | null, readDescription: Function | null,
 *   readAnswers: (questions: object[], answers: object[]) => Promise<Map<string, object> | null>,
 *   withheld?: object | null, now?: () => number}} tools `readAnswers`: the answer reading (ledger step `answers`)
 */
export async function ownerBriefOf({ description, name, city }, tools) {
  const { service, accountId, row, readDescription, readAnswers, withheld = null, now = Date.now } = tools
  if (!isText(name))
    throw Object.assign(new EngineStepError('research_empty', 'no name was given', { noRerun: true }), {
      reason: 'no_name'
    })
  const before = ownerResearchOf(row)
  const questions = list(before?.gapQuestions)
  const answers = gapAnswersOf(row)
  // A typed answer is read once by the answer reading: whether it means "leave it out", and the facts it states.
  const readings = answers.some((a) => isText(a.text))
    ? await readAnswers(questions, answers).catch(() => null)
    : null
  const facts = []
  const answered = [...list(before?.owner?.answered)]
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.question)
    const read = readings?.get(answer.question)
    if (asChosen(answer, question)?.choice === BRIEF_GAP_SKIP || read?.choice === BRIEF_GAP_SKIP) continue
    if (!isText(answer.text)) continue
    answered.push({ field: briefGapFieldOf(answer.question), text: answer.text.trim() })
    facts.push(...list(read?.facts))
  }
  const asked = [...new Set([...list(before?.owner?.asked), ...questions.map((q) => briefGapFieldOf(q.id))])]
  const statements = [
    ...new Set([description, ...answered.map((a) => a.text)].filter(isText).map((t) => t.trim()))
  ]
  const said = statements.join('\n\n')
  const read =
    said && readDescription
      ? await readDescription({ description: said, name, withheld }).catch(() => null)
      : null
  const byName = tradeOfWords(name)
  const trade = byName !== 'other' ? byName : said ? tradeOfWords(said) : 'other'
  const made = await service.ownerBrief({
    accountId,
    opportunityId: before?.ids?.opportunityId ?? null,
    name: name.trim(),
    own: {
      requestId: `build-chat-${randomUUID()}`,
      at: new Date(now()).toISOString(),
      ...(row?.id ? { buildDraft: row.id } : {})
    },
    statements,
    reading: read?.businessReading ?? null,
    facts,
    trade
  })
  if (!made.revision)
    throw new EngineStepError('research_unusable', `the brief could not be made: ${made.error}`, {
      noRerun: made.error === 'BRIEF_INVALID'
    })
  const brief = structuredClone(made.revision.brief)
  if (trade !== 'other' && (!isText(brief.trade) || brief.trade === 'other')) brief.trade = trade
  const keptOut = keepDescriptionOut(brief, said)
  return {
    brief,
    manifest: list(made.revision.asset_manifest),
    placeProfile: made.revision.place_profile ?? null,
    ids: { opportunityId: made.opportunityId, placeId: null, revisionId: made.revision.id },
    setAside: [],
    ...(said ? { ownerStatement: said } : {}),
    ...(read?.descriptionFacts ? { descriptionFacts: read.descriptionFacts } : {}),
    ...(read?.reading ? { reading: read.reading } : {}),
    ...(keptOut.length ? { descriptionKeptOut: keptOut } : {}),
    gapQuestions: briefGapQuestionsOf(brief.readiness, { asked }),
    owner: { name: name.trim(), ...(isText(city) ? { city: city.trim() } : {}), statements, answered, asked }
  }
}
