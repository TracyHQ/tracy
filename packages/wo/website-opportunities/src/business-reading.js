/**
 * The reading step of a place's research (#1780): what the business sells, who it is for, its team and its story, read
 * once per research run from the bio, posts and reviews already collected (`domain/business-reading.mjs`). The model is
 * the one /ops › Models & AI assigns to "WO editorial" (door `woEditorial`), and its call is reserved first on the research
 * cost ledger (provider `woEditorial`, purpose `business-reading`), the same way the menu-photo reading step pays.
 * 🔒 Without a model (none assigned, an unusable one, a failed, cut off, empty or unreadable answer, the budget spent) the
 * rules read what they can and the reading says why the model did not run; it never fails the research.
 * A run whose texts and model are those of the reading it holds keeps it and pays nothing.
 */
import { createHash } from 'node:crypto'
import {
  BUSINESS_READING_SYSTEM,
  BUSINESS_READING_VERSION,
  USP_RETRY_SYSTEM,
  businessReadingPrompt,
  checkBusinessReading,
  needsUspRetry,
  uspRetryPrompt,
  withUspRetry,
  readBusinessByRules,
  readingFactsOf,
  readingSourcesOf,
  withListedServiceParts,
  withPostOfferings
} from '../domain/business-reading.mjs'
import { OWNER_STATEMENT_RULE, businessReadingSystemOf } from '../domain/owner-statement-prompt.mjs'
import { OWNER_STATEMENT_KIND, ownerPassageOf } from '../domain/owner-statement.mjs'
import { heldTextsOf } from '../domain/plan-withheld.mjs'
import { HELD_NAME_STAND_IN, heldPassagesOf, withoutStandIn } from '../domain/reading-held-passages.mjs'
import { BudgetExceededError } from './cost-ledger.js'
import { visionCostCents } from './cost-prices.js'
import { controlError } from './google-maps-research.js'
import { requireHost } from './host.js'
import { SOURCES } from './sources.js'
import { modelTokensOf } from './wo-model-tokens.js'

export const BUSINESS_READING_PURPOSE = 'business-reading'
/** The /ops model door the step reads with: Website Opportunities' editorial model. */
export const BUSINESS_READING_DOOR = 'woEditorial'
// A thinking model (DeepSeek's thinking mode) counts its reasoning in `max_tokens`. At 4k the reasoning alone used the
// whole budget on dev (26/10/2026, Harbour Sport Club: ledger settled at the ceiling) and the JSON answer was cut off.
// The editorial model's own client (`opportunities-build/editorial-model.js`) allows 12k for the same reason.
const MAX_OUTPUT_TOKENS = 12_000
// With its reasoning off the answer is the JSON alone: about 1.1k tokens measured (Zuni Cafe, 30/10/2026), so 4k
// leaves it more than three times the room and reserves a third of the ceiling.
const MAX_OUTPUT_TOKENS_NO_REASONING = 4_000
const CALL_MS = 120_000
const EFFORT_OFF = 'off'

/** The most this step lets the model write: its JSON answer, plus its reasoning when the door reasons. */
export const businessReadingMaxTokens = (door) =>
  door?.effort === EFFORT_OFF ? MAX_OUTPUT_TOKENS_NO_REASONING : MAX_OUTPUT_TOKENS

/**
 * What the door gives this step, from `lookupDoor`'s answer (pure): `ready` with the call's credential, or why not.
 * `effort` is `off` when the provider's reasoning can be turned off (`reasoning_effort` profile), else null.
 * 🔒 NO REASONING FOR A READING (#251). The reading quotes what the collected texts say into a fixed JSON shape, and
 * `checkBusinessReading` holds every quote to the sources; it needs no chain of thought. At effort `low` the measured call
 * still reasoned for 9,004 of its 10,148 output tokens and took 109 s, most of a research. The /ops assignment chooses
 * the model; how much this one step reasons is the step's own choice, as `low` was before.
 * @returns {{state: 'ready', door: {url: string, key: string, model: string, effort: string | null}}
 *   | {state: 'not_configured' | 'unavailable', reason?: string}}
 */
export function businessReadingDoorOf(found, host) {
  if (!found || found.state === 'unassigned') return { state: 'not_configured' }
  if (found.state !== 'ok') return { state: 'unavailable', reason: `provider_${found.state}` }
  const { apiKey, baseUrl, model } = found.credential
  const { effortOptions } = requireHost(host, ['effortOptions'])
  const options = effortOptions({
    presetId: found.snapshot?.presetId,
    baseUrl,
    metadata: found.snapshot?.metadata
  })
  return {
    state: 'ready',
    door: {
      url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
      key: apiKey,
      model,
      effort: options.parameter === 'reasoning_effort' ? EFFORT_OFF : null
    }
  }
}

/** The door of the operator's assignment (`host.lookupDoor`). */
export async function businessReadingDoorFor(pool, secret, host) {
  const { lookupDoor } = requireHost(host, ['lookupDoor', 'effortOptions'])
  return businessReadingDoorOf(await lookupDoor(pool, BUSINESS_READING_DOOR, secret), host)
}

/** How a reading was made: the rule and prompt version, and the model with its effort. */
export function businessReadingVersion(door) {
  const model = door ? `${door.model}|${door.effort ?? 'default'}` : 'rules'
  const hash = createHash('sha256')
    .update([BUSINESS_READING_VERSION, BUSINESS_READING_SYSTEM, model].join('\n'))
    .digest('hex')
  return `${BUSINESS_READING_VERSION}-${hash.slice(0, 12)}`
}

// A reading of an owner statement also hashes the owner rule it was read under, so a new rule reads it again.
const inputHashOf = (sources, name, trade, facts) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        name ?? null,
        trade ?? null,
        sources,
        ...(facts.length ? [facts] : []),
        ...(sources.some((s) => s.kind === OWNER_STATEMENT_KIND) ? [OWNER_STATEMENT_RULE] : [])
      ])
    )
    .digest('hex')
    .slice(0, 24)

/** The most one reading may cost, in cents: its prompt (about 3 characters a token) and the longest answer. */
export const businessReadingCeilingCents = (model, prompt, maxTokens = MAX_OUTPUT_TOKENS) =>
  visionCostCents(model, {
    promptTokens: Math.ceil(String(prompt).length / 3) + 1_000,
    completionTokens: maxTokens
  })

/**
 * The texts and facts a reading reads (`readBusiness`'s input less its trade, door and ledger), from a research's
 * collected source rows (`collected`: the rows that were collected, in the `wo_source` shape), its merged profile and
 * Google's place facts (`google`, or null). Pure: the place executor and the build chat's research both read with it.
 * `ownerStatement` (decision D46): what the owner typed about the business in the build chat, read as a source whose
 * facts are true and whose words are never copy (`domain/owner-statement.mjs`). `withheld`: what the owner keeps off
 * the site (`{name?: true, people?: string[], names?: string[]}`, a research's `withheld`): no held text reaches the
 * model, in any passage (`domain/reading-held-passages.mjs`). A held person's sentences (`heldTexts`) are taken out of
 * every passage; the business name while it is held (`nameHeld: true`) is taken out of the statement with its sentences,
 * masked with a neutral stand-in in every other passage, and the message's header names the business by that stand-in.
 * `heldPeople` (the held people of `heldTexts`, given whenever `heldTexts` is): a held person's first name written
 * alone is held too; a caller that gives `heldTexts` alone has every one of them read as a person.
 * The statement is left out of the input when it is blank, and `heldTexts` and `nameHeld` when nothing is held, so a
 * reading with neither is the reading it was.
 */
export function readingInputOf({ profile, google, collected, ownerStatement = null, withheld = null }) {
  const own = collected.filter((s) => SOURCES.includes(s.source))
  const name = profile.name ?? google?.name ?? null
  const heldTexts = heldTextsOf(withheld ?? {})
  const heldPeople = (Array.isArray(withheld?.people) ? withheld.people : []).filter(
    (p) => typeof p === 'string' && p.trim() !== ''
  )
  const nameHeld = withheld?.name === true && typeof name === 'string' && name.trim() !== ''
  return {
    ...(typeof ownerStatement === 'string' && ownerStatement.trim() ? { ownerStatement } : {}),
    ...(heldTexts.length ? { heldTexts, heldPeople } : {}),
    ...(nameHeld ? { nameHeld: true } : {}),
    bio: profile.bio ?? null,
    websitePages: collected.filter((s) => s.source === 'website').flatMap((s) => s.collected?.pages ?? []),
    posts: own.flatMap((s) => (s.collected?.posts ?? []).map((p) => ({ source: s.source, ...p }))),
    reviews: [
      ...(Array.isArray(google?.reviews) ? google.reviews.map((r) => ({ ...r, source: 'google' })) : []),
      ...Object.entries(profile.reviewSources ?? {}).flatMap(([source, group]) =>
        (group?.reviews ?? []).map((r) => ({ ...r, source }))
      )
    ],
    name,
    // What the sub-trade may quote besides the texts: Google's types and each social profile's own category.
    googleTypes: google ? [google.primaryType, ...(Array.isArray(google.types) ? google.types : [])] : [],
    categories: own
      .map((s) => ({ source: s.source, text: s.collected?.profile?.category }))
      .filter((c) => typeof c.text === 'string' && c.text.trim())
  }
}

/**
 * Read a business. `held`: the reading the place holds (kept when its texts and version are these). `charge(spec, call)`
 * reserves the call on the ledger. Never throws for the model's sake: the rules answer instead, with the reason.
 * `googleTypes` and `categories` (each social profile's own category, `{source, text}`) are what the sub-trade may
 * quote besides the texts (`readingFactsOf`).
 * @param {{bio?: string | null, posts?: any[], reviews?: any[], websitePages?: any[], name?: string | null, trade?: string | null,
 *   googleTypes?: string[], categories?: {source: string, text: string}[], ownerStatement?: string | null,
 *   heldTexts?: string[], heldPeople?: string[], nameHeld?: boolean,
 *   door: {state: string, door?: any, reason?: string}, held?: any,
 *   charge: (spec: object, call: () => Promise<any>) => Promise<any>, fetchImpl?: typeof fetch, now?: () => number,
 *   log?: any}} input
 * @returns {Promise<object | null>} the reading, or null when there is no text to read; with an owner statement it
 *   carries `ownerStatement: {read: true, heldOut, cut}` (how many of its sentences were held back, whether it was cut
 *   at its cap), or `{read: false, reason: 'held'}` when every sentence named something held. When the statement was
 *   the only text and all of it was held, there is no reading (null): `ownerStatementRecordOf` gives the caller that
 *   same record, so it can tell "nothing to read" from "everything held".
 */
export async function readBusiness({
  bio = null,
  posts = [],
  reviews = [],
  websitePages = [],
  name = null,
  trade = null,
  googleTypes = [],
  categories = [],
  ownerStatement = null,
  heldTexts = [],
  heldPeople: givenPeople = null,
  nameHeld = false,
  door,
  held = null,
  charge,
  fetchImpl = fetch,
  now = Date.now,
  log = console
}) {
  const heldName = nameHeld && typeof name === 'string' && name.trim() ? name : null
  // Without the held people told apart, every held text is read as a person (a first name alone is held too).
  const heldPeople = Array.isArray(givenPeople) ? givenPeople : heldTexts
  const heldAll = [...heldTexts, ...(heldName ? [heldName] : [])]
  const sources = readingSourcesOf({
    bio,
    posts,
    reviews,
    websitePages,
    ownerStatement,
    heldTexts,
    heldPeople,
    heldName
  })
  if (!sources.length) return null
  const owner = ownerStatementRecordOf(ownerStatement, heldAll, heldPeople)
  // The business is named by the stand-in while its name is held, in the header and in Google's and social facts.
  const header = heldName ? HELD_NAME_STAND_IN : name
  const done = heldName ? withoutStandIn : (read) => read
  const ready = door?.state === 'ready' ? door.door : null
  const version = businessReadingVersion(ready)
  const facts = heldPassagesOf(readingFactsOf({ googleTypes, categories }), {
    people: heldTexts,
    heldPeople,
    name: heldName
  })
  const inputHash = inputHashOf(sources, header, trade, facts)
  // A held reading made before joined service lines kept every part gets them now, paying nothing (F10).
  if (held?.method === 'model' && held.version === version && held.inputHash === inputHash) {
    const kept = {
      ...held,
      ...owner,
      uspThemes: held.uspThemes?.length ? held.uspThemes : null,
      ...(!held.uspThemes?.length ? { uspThemesReason: held.uspThemesReason ?? 'not_recorded' } : {}),
      services: withPostOfferings(withListedServiceParts(held.services, sources), sources)
    }
    // A held reading with no theme that never had its retry gets it now, alone: the whole reading is not paid again.
    return done(
      ready && kept.uspRetry === undefined
        ? await retryUsp(kept, { ready, sources, name: header, trade, charge, fetchImpl, log })
        : kept
    )
  }
  const at = new Date(now()).toISOString()
  const rules = (reason, extra = {}) =>
    done({
      version: businessReadingVersion(null),
      method: 'rules',
      reason,
      inputHash,
      at,
      ...readBusinessByRules(sources),
      uspThemes: null,
      uspThemesReason: `rules_${reason}`,
      ...owner,
      ...extra
    })
  if (!ready) return rules(door?.state === 'unavailable' ? 'unavailable' : 'not_configured')
  const prompt = businessReadingPrompt(sources, { name: header, trade, facts })
  let answer
  try {
    answer = await charge(
      {
        operation: ready.model,
        maxCents: businessReadingCeilingCents(ready.model, prompt, businessReadingMaxTokens(ready)),
        actualCents: (r) =>
          visionCostCents(ready.model, {
            promptTokens: r.promptTokens,
            completionTokens: r.completionTokens
          }),
        tokens: (r) => modelTokensOf([r.usage])
      },
      () => askText({ door: ready, system: businessReadingSystemOf(sources), text: prompt, fetchImpl })
    )
  } catch (error) {
    if (error instanceof BudgetExceededError) return rules('budget')
    if (controlError(error)) throw error
    log.warn?.('wo business reading failed', { error: error?.message })
    return rules('failed')
  }
  // Why the answer could not be read, told apart: cut off by the token limit, empty, or not the contract's JSON.
  if (answer.finishReason === 'length') return rules('truncated', { model: ready.model })
  if (!String(answer.text ?? '').trim()) return rules('empty', { model: ready.model })
  const read = checkBusinessReading(answer.text, sources, { trade, facts })
  if (!read) return rules('unreadable', { model: ready.model })
  return done(
    await retryUsp(
      { version, method: 'model', model: ready.model, inputHash, at, ...read, ...owner },
      { ready, sources, name: header, trade, charge, fetchImpl, log }
    )
  )
}

/**
 * How the owner's statement was read, for the reading's record (pure): `{ownerStatement: {read, heldOut, cut}}`, or
 * `{ownerStatement: {read: false, reason: 'held'}}` when every sentence named something held; nothing (`{}`) when the
 * owner typed none (or only spaces). `heldTexts`: the held people and, while it is held, the business name.
 */
export function ownerStatementRecordOf(statement, heldTexts = [], heldPeople = []) {
  if (typeof statement !== 'string' || !statement.trim()) return {}
  const { passage, heldOut, cut } = ownerPassageOf(statement, heldTexts, { people: heldPeople })
  return { ownerStatement: passage ? { read: true, heldOut, cut } : { read: false, reason: 'held' } }
}

/**
 * The reading's one USP retry (`domain/business-reading.mjs withUspRetry`): when no theme stands and a review or the bio
 * could hold one, one short call on the reviews and the bio, reserved on the ledger like the reading. A failed call
 * (budget, network, an answer cut off) keeps the reading as it was, marked `uspRetry: 'failed'`; never a second retry.
 */
async function retryUsp(read, { ready, sources, name, trade, charge, fetchImpl, log }) {
  if (!needsUspRetry(read, sources)) return read
  const prompt = uspRetryPrompt(sources, { name, trade, dropped: read.uspThemesDropped })
  try {
    const answer = await charge(
      {
        operation: ready.model,
        maxCents: businessReadingCeilingCents(ready.model, prompt, businessReadingMaxTokens(ready)),
        actualCents: (r) =>
          visionCostCents(ready.model, {
            promptTokens: r.promptTokens,
            completionTokens: r.completionTokens
          }),
        tokens: (r) => modelTokensOf([r.usage])
      },
      () => askText({ door: ready, system: USP_RETRY_SYSTEM, text: prompt, fetchImpl })
    )
    if (answer.finishReason === 'length') return { ...read, uspRetry: 'failed' }
    return withUspRetry(read, answer.text, sources, { trade })
  } catch (error) {
    if (controlError(error)) throw error
    if (!(error instanceof BudgetExceededError))
      log.warn?.('wo business reading USP retry failed', { error: error?.message })
    return { ...read, uspRetry: 'failed' }
  }
}

/** One chat completion asking for JSON, as `askVision` does without a picture. */
async function askText({ door, system, text, fetchImpl }) {
  const res = await fetchImpl(door.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${door.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: door.model,
      max_tokens: businessReadingMaxTokens(door),
      ...(door.effort === EFFORT_OFF
        ? { thinking: { type: 'disabled' } }
        : door.effort
          ? { reasoning_effort: door.effort }
          : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text }
      ]
    }),
    signal: AbortSignal.timeout(CALL_MS)
  })
  if (!res.ok)
    throw Object.assign(new Error(`the editorial model answered ${res.status}`), {
      code: `LLM_HTTP_${res.status}`
    })
  const body = await res.json()
  return {
    text: body?.choices?.[0]?.message?.content ?? '',
    // `length`: the answer hit `max_tokens` (on a thinking model, often inside the reasoning) and is incomplete.
    finishReason: body?.choices?.[0]?.finish_reason ?? null,
    promptTokens: Number(body?.usage?.prompt_tokens) || 0,
    completionTokens: Number(body?.usage?.completion_tokens) || 0,
    usage: body?.usage ?? null,
    requestId: body?.id ?? null
  }
}
