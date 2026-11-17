/**
 * The business reading of the build chat's research (#609): what the business sells (with the prices its own pages
 * state), who it is for, its team and its story, read from the pages and posts the research collected and the reviews
 * Google gave, by Website Opportunities' own reading step (`business-reading.js` `readBusiness`, its input made by
 * `readingInputOf`, as the place executor's profile stage reads it). Its answer is laid on the profile as
 * `businessReading`, where a place's research keeps it, so the brief reads it exactly as a website opportunity's does.
 *
 * The model is the one /ops › Models & AI assigns to "WO editorial" (door `woEditorial`), injected (`readingDoor`).
 * Each call is reserved in memory against the operator's cap for one research job (`/ops/wo` `researchJobCapCents`),
 * and what it cost is kept in the research record (`reading`). The research step as a whole is reserved once in the
 * research cost ledger (`wo_cost_ledger`) by the engine, at its ceiling (`spend-limits.js`).
 *
 * 🔒 THE READING NEVER STOPS THE RESEARCH. Without a model (none assigned, an unusable one, the cap too small) the
 * reading's own rules read what they can, as in Website Opportunities, and the record says why the model did not run.
 * A failed model call (an error, an empty or unreadable answer) is read once more on the same inputs, then the research
 * goes on with the rules' reading. A reading that throws, or one past its time, gives no reading and its reason.
 */
import { boundedFetch, withinTime } from './within-time.js'

const COLLECTED = new Set(['complete', 'partial'])
const isCollected = (row) => COLLECTED.has(row?.status)

/**
 * Two minutes: one call of the Website Opportunities reading may take this long (`business-reading.js` `CALL_MS`), so
 * a whole call always fits; its one theme retry, or the one rerun, has what is left. Measured in that flow without
 * reasoning: an answer of about 1.1k tokens, far less than a minute (the 109 s reading of 30/10/2026 was the reasoning
 * one, which this step no longer asks for). It runs after the sources are read, outside their own deadline.
 */
export const READING_BUDGET_MS = 120_000

const isText = (value) => typeof value === 'string' && value.trim() !== ''

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
 *   budgetMs?: number, log?: Console, description?: string | null, withheld?: object | null}} input `rows`: the
 *   research's source rows; `profile`: what the sources say (`mergeProfile`), before any decision or typed edit, as
 *   the place executor reads it; `description`: what the owner typed in the build chat, read as a source whose facts
 *   count and whose wording never reaches the site (D46); `withheld`: what the owner keeps off the site, always given
 *   when there is any so a held name never reaches the model
 * @returns {Promise<{reading: object | null, record: object, ownerStatement: object | null}>} `record`: how it was
 *   read, for the research record; `ownerStatement`: how the description was read (`{read, ...}`), null without one
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
  description = null,
  withheld = null,
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
  const base = parts.readingInputOf({
    profile,
    google,
    collected: rows.filter(isCollected),
    ownerStatement: description,
    withheld
  })
  const input = {
    ...base,
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
  const typed = isText(description)
  // No reading means the statement was not read: said with the reading's own reason, or `held` when it was the only
  // text and every sentence of it named something held.
  const unread = (reason) => ({
    reading: null,
    record: record({ method: null, reason, attempts }),
    ownerStatement: typed
      ? reason === 'no_texts'
        ? (parts.ownerStatementRecordOf(base.ownerStatement, base.heldTexts, base.heldPeople)
            .ownerStatement ?? {
            read: false,
            reason
          })
        : { read: false, reason }
      : null
  })
  if (answer.timedOut) return unread('timeout')
  if (answer.error) return unread('error')
  const { reading } = answer
  if (!reading) return unread('no_texts')
  return {
    // The rules reading never reads the statement (it can only copy), whatever record it keeps beside that.
    ownerStatement: !typed
      ? null
      : reading.ownerStatementSkipped
        ? { read: false, reason: reading.ownerStatementSkipped }
        : (reading.ownerStatement ?? { read: false, reason: 'not_read' }),
    reading,
    record: record({
      method: reading.method,
      ...(reading.reason ? { reason: reading.reason } : {}),
      ...(reading.model ? { model: reading.model } : {}),
      // For operators and logs (`reasoning_not_off`, `answer_cut`): never shown to the owner.
      ...(isText(reading.warning) ? { warning: reading.warning } : {}),
      ...(door.reason ? { door: door.reason } : {}),
      attempts
    })
  }
}
