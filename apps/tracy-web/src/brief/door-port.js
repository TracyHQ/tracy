/**
 * The brief layer's port, spent through session C's provider book.
 *
 * 🔒 C'S DOOR SHAPE IS NOT THE SHAPE THIS DOMAIN GUESSED, AND C'S IS THE REAL ONE. `llm-port.js`
 * was written against the A/B/C note's proposal — an operation router, `call({operation, input})`,
 * where C would own the request. What C actually shipped (`lib/llm-door.js`, `lib/llm-catalog.js`)
 * is a BOOK: `modelForDoor(pool, door, config)` answers `{apiKey, baseUrl, words}` for one of four
 * named jobs, and the caller makes the request itself. So the split is credentials versus
 * transport, not operation versus operation, and this file is the half that belongs here.
 *
 * What does NOT move: this domain still chooses no provider, no model and no key. It names a DOOR
 * — `seedText` — and spends whatever an operator assigned to it on the Model & AI screen. A door
 * with nothing assigned answers `null`, and that stays a refusal (`NOT_CONFIGURED`) rather than a
 * fallback to some other door's key, which is the one thing `llm-door.js`'s own header asks for.
 *
 * ⚠ THE CATALOGUE SAYS `seedText` IS SPENT ELSEWHERE, and that is worth saying out loud rather
 * than leaving for someone to discover: `llm-catalog.js:145` describes it as spent "inside
 * tracy-dsh, and the customer site container" — the seeder and `personalize.mjs`. Writing a
 * customer's page copy from tracy-web is the same JOB an operator assigned that door to, so it is
 * the right door to name; but it is a second process spending it, and the screen's `where` line
 * does not say so yet. Flagged in `tasks/todo-inventory-va-seed-theo-brief.md` §10.1.
 */
import { modelForDoor } from '../lib/llm-door.js'
import { LlmPortError } from './llm-port.js'

/** The door this domain spends. Named once, so nothing reaches for another job's budget. */
export const BRIEF_DOOR = 'seedText'

/**
 * Ask the model for JSON, through whatever the book assigned to `seedText`.
 *
 * `temperature: 0` because two runs over one brief
 * that disagree are two briefs, and a compiler hashing the result cannot tell drift from an edit.
 */
/** Longest one model call may take. */
const CALL_TIMEOUT_MS = 90_000

async function askForJson({ model, system, user, fetchImpl, signal }) {
  // 🔒 EVERY FAILURE ARRIVES TYPED, AND NONE CAN HANG: a caller holding a checkpoint reads `.code`.
  const bound = AbortSignal.timeout(CALL_TIMEOUT_MS)
  let res
  try {
    res = await fetchImpl(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
      signal: signal ? AbortSignal.any([signal, bound]) : bound,
      body: JSON.stringify({
        model: model.words,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user, null, 2) }
        ]
      })
    })
  } catch (cause) {
    throw new LlmPortError('MODEL_CALL_FAILED', 'the model could not be reached', { cause })
  }
  if (!res.ok) throw new LlmPortError('MODEL_CALL_FAILED', `the model answered HTTP ${res.status}`)
  let payload
  try {
    payload = await res.json()
  } catch {
    throw new LlmPortError('BAD_ANSWER', 'the model did not answer with JSON')
  }
  const text = payload?.choices?.[0]?.message?.content ?? ''
  try {
    // 🔒 EXTRACT THE FENCE, DO NOT TRIM AROUND IT — the expression the removed questions translator
    // used, kept whole rather than narrowed, because narrowing it brings back the failure that file
    // already paid for. Stripping a fence only at the very start and end of the string rejects
    // the commonest good answer there is: a sentence, then the JSON in a fence. That is a model
    // doing what it was asked, in a wrapper it likes, being called malformed.
    return JSON.parse(/```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text)
  } catch {
    throw new LlmPortError('BAD_ANSWER', 'the model did not answer with JSON')
  }
}

/**
 * A port backed by C's book. Refuses when the door has nothing assigned.
 *
 * @param {object} args
 * @param {import('pg').Pool | null} args.pool
 * @param {{ model: any, sessionSecret: string }} args.config
 * @param {typeof fetch} [args.fetchImpl]
 * @param {string} [args.door] - override only for a test that must name another door.
 * @returns {Promise<import('./llm-port.js').LlmPort>}
 */
export async function doorLlmPort({ pool, config, fetchImpl = fetch, door = BRIEF_DOOR }) {
  // 🔒 THE BOOK'S OWN FAILURES ARRIVE TYPED. `modelForDoor` reads a table and decrypts a key, so a
  // dead database or a wrong `sessionSecret` throws a bare error — and it throws BEFORE the port
  // exists, so it would escape this domain entirely. A caller holding a checkpoint classifies by
  // `.code` (that is what `llm-port.js` protects); an untyped error hands it `undefined`, which
  // reads the same as a vendor 429 and is not.
  let model
  try {
    // 🔒 With a database, the environment is NOT consulted: a door nobody assigned refuses below.
    // Without one there is no book to consult, so the environment is the only source there is.
    model = await modelForDoor(pool, door, { ...config, model: pool ? null : config.model })
  } catch (cause) {
    throw new LlmPortError('DOOR_UNREADABLE', `the provider book would not answer for ${door}`, {
      door,
      cause
    })
  }
  if (!model?.apiKey || !model?.baseUrl || !model?.words) {
    // 🔒 REFUSE, DO NOT BORROW. `modelForDoor` answers `null` for a door an operator has not
    // filled in, and the honest answer to that is the same one `notConfiguredPort` gives. Falling
    // back to `web`'s key would spend another job's budget and report another job's model.
    const refuse = (method) => async () => {
      throw new LlmPortError('NOT_CONFIGURED', `no model is assigned to the ${door} door`, { method })
    }
    return {
      configured: false,
      door,
      normalizeBrief: refuse('normalizeBrief'),
      generateContent: refuse('generateContent')
    }
  }
  return {
    configured: true,
    door,
    model: model.words,
    normalizeBrief: (input, opts = {}) =>
      askForJson({
        model,
        fetchImpl,
        signal: opts.signal,
        system:
          'You tidy a website brief that code already assembled from a customer’s own answers.\n' +
          'Never invent an address, a person, a figure, a price, a testimonial or a certification.\n' +
          'Keep every fact reference you are given. Answer with JSON only, the same shape you were given.',
        user: input
      }),
    generateContent: (input, opts = {}) =>
      askForJson({
        model,
        fetchImpl,
        signal: opts.signal,
        system:
          'You write website copy for one semantic group at a time, from a brief.\n' +
          'Use only facts present in the brief; leave a group out rather than inventing one.\n' +
          'Never answer with a slot key, an entity, a path, SQL or any CMS identifier.\n' +
          'Answer with JSON only.',
        user: input
      })
  }
}
