/**
 * The business reading of the build chat's research (#609): what the business sells (with the prices its own pages
 * state), who it is for, its team and its story, read from the pages and posts the research collected and the reviews
 * Google gave, by Website Opportunities' own reading step (`business-reading.js` `readBusiness`, its input made by
 * `readingInputOf`, as the place executor's profile stage reads it). Its answer is laid on the profile as
 * `businessReading`, where a place's research keeps it, so the brief reads it exactly as a website opportunity's does.
 *
 * The model is the one /ops › Models & AI assigns to "WO editorial" (door `woEditorial`), injected (`readingDoor`). No
 * research cost ledger is written (that ledger belongs to a place job, `wo_cost_ledger`): each call is reserved in
 * memory against the operator's cap for one research job (`/ops/wo` `researchJobCapCents`), and what it cost is kept
 * in the research record (`reading`).
 *
 * 🔒 THE READING NEVER STOPS THE RESEARCH. Without a model (none assigned, an unusable one, the cap too small) the
 * reading's own rules read what they can, as in Website Opportunities, and the record says why the model did not run.
 * A failed model call (an error, an empty or unreadable answer) is read once more on the same inputs, then the research
 * goes on with the rules' reading. A reading that throws, or one past its time, gives no reading and its reason.
 */
import { boundedFetch, isCollected, withinTime } from './gather-sources.js'

/**
 * Two minutes: one call of the Website Opportunities reading may take this long (`business-reading.js` `CALL_MS`), so
 * a whole call always fits; its one theme retry, or the one rerun, has what is left. Measured in that flow without
 * reasoning: an answer of about 1.1k tokens, far less than a minute (the 109 s reading of 30/10/2026 was the reasoning
 * one, which this step no longer asks for). It runs after the sources are read, outside their own deadline.
 */
export const READING_BUDGET_MS = 120_000

/** A reading made by the rules because the model call itself went wrong: worth one more call on the same inputs. */
const RERUN = new Set(['failed', 'empty', 'unreadable'])

/** The door the reading would read with, or why there is none (a door that cannot be looked up is unavailable). */
async function doorOf(readingDoor) {
  if (!readingDoor) return { state: 'not_configured' }
  try {
    return (await readingDoor()) ?? { state: 'not_configured' }
  } catch {
    return { state: 'unavailable', reason: 'door_lookup_failed' }
  }
}

/**
 * Read the business. Never throws.
 * @param {{parts: object, readingDoor?: () => Promise<object>, fetch?: typeof fetch, rows: object[],
 *   profile: object, google: object | null, trade: string | null, capCents: number, now: () => number,
 *   budgetMs?: number, log?: Console}} input `rows`: the research's source rows; `profile`: what the sources say
 *   (`mergeProfile`), before any decision or typed edit, as the place executor reads it
 * @returns {Promise<{reading: object | null, record: object}>} `record`: how it was read, for the research record
 */
export async function readingOf({
  parts,
  readingDoor,
  fetch: fetchImpl = globalThis.fetch,
  rows,
  profile,
  google,
  trade,
  capCents,
  now,
  budgetMs = READING_BUDGET_MS,
  log = console
}) {
  const started = now()
  const remaining = () => budgetMs - (now() - started)
  const usages = []
  let spentCents = 0
  const record = (fields) => ({
    ...fields,
    calls: usages.length,
    tokens: parts.modelTokensOf(usages),
    costCents: spentCents,
    capCents,
    ms: now() - started
  })
  const door = await doorOf(readingDoor)
  // Each call is reserved at its ceiling against the cap of one research job, then counted at what it cost.
  const charge = async (spec, call) => {
    if (spentCents + spec.maxCents > capCents)
      throw new parts.BudgetExceededError({
        scope: 'job',
        capCents,
        committedCents: spentCents,
        maxCents: spec.maxCents
      })
    const answer = await call()
    usages.push(answer?.usage ?? null)
    spentCents += spec.actualCents ? spec.actualCents(answer) : spec.maxCents
    return answer
  }
  const deadline = AbortSignal.timeout(Math.max(1, budgetMs))
  const input = {
    ...parts.readingInputOf({ profile, google, collected: rows.filter(isCollected) }),
    trade,
    door,
    held: null,
    charge,
    fetchImpl: boundedFetch(fetchImpl, deadline),
    now,
    log
  }
  const readOnce = async () => {
    const answer = await withinTime(async () => {
      try {
        return { reading: await parts.readBusiness(input) }
      } catch (error) {
        log.warn?.('build draft business reading failed', { error: error?.message })
        return { error: true }
      }
    }, remaining())
    return answer
  }
  let attempts = 1
  let answer = await readOnce()
  if (
    door.state === 'ready' &&
    answer.reading?.method === 'rules' &&
    RERUN.has(answer.reading.reason) &&
    remaining() > 0
  ) {
    attempts = 2
    answer = await readOnce()
  }
  if (answer.timedOut) return { reading: null, record: record({ method: null, reason: 'timeout', attempts }) }
  if (answer.error) return { reading: null, record: record({ method: null, reason: 'error', attempts }) }
  const { reading } = answer
  if (!reading) return { reading: null, record: record({ method: null, reason: 'no_texts', attempts }) }
  return {
    reading,
    record: record({
      method: reading.method,
      ...(reading.reason ? { reason: reading.reason } : {}),
      ...(reading.model ? { model: reading.model } : {}),
      ...(door.reason ? { door: door.reason } : {}),
      attempts
    })
  }
}
