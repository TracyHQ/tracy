/**
 * The narrow door between brief compilation and whatever runs a model.
 *
 * 🔒 THIS FILE CHOOSES NOTHING. No provider, no model id, no key, no endpoint, no retry policy, no
 * fallback. Those are session C's, and the reason they are not duplicated here is not tidiness: a
 * second place that can pick a provider is a second place that can bill an account, leak a key into
 * a log, or quietly answer with a different model than the one an operator configured — and it will
 * do so on exactly the day C's own door is misconfigured, which is the day someone is looking at
 * C's dashboard for an explanation. So the default implementation of this port REFUSES
 * (`NOT_CONFIGURED`), and the only way to get a working one is for a caller to inject C's.
 *
 * 🔒 TWO METHODS IS A FAST PATH, NOT A TRANSPORT PROMISE. `normalizeBrief` and `generateContent`
 * name the two logical text steps a small site needs. They are NOT a commitment to two HTTP
 * requests: a large site splits `generateContent` across pages or semantic groups, and an
 * implementation is free to batch, cache, stream or coalesce. Nothing in this interface says how
 * many calls happen, and no caller may assume a count.
 *
 * ⚠ BLOCKED on session C. The operation NAMES below are the ones the A/B/C contract proposes
 * (`tasks/hop-dong-bang-hoi-inventory-seed.md` §3) and are explicitly marked as proposals: "the real
 * names are C's to publish". They are `null` here rather than guessed strings, and `createLlmPort`
 * requires the caller to pass the real ones. A guessed operation name would fail at C's router with
 * a message about an unknown operation, which reads exactly like an outage.
 */

/** Operation names, once C publishes them. `null` means: not published yet, do not guess. */
export const PROPOSED_OPERATIONS = Object.freeze({
  /** Proposed: `site.brief.normalize` — repair and enrich a brief the code already assembled. */
  normalizeBrief: null,
  /** Proposed: `site.content.generate` — write copy for semantic groups against a ready brief. */
  generateContent: null
})

export class LlmPortError extends Error {
  constructor(code, message, detail = {}) {
    super(message)
    this.name = 'LlmPortError'
    this.code = code
    this.detail = detail
  }
}

/**
 * The port every caller in this domain takes as an argument.
 *
 * @typedef {object} LlmPort
 * @property {(input: any, opts?: {signal?: AbortSignal}) => Promise<any>} normalizeBrief
 * @property {(input: any, opts?: {signal?: AbortSignal}) => Promise<any>} generateContent
 * @property {boolean} configured
 */

/**
 * The default port: it refuses, with the code the rest of the pipeline knows how to hold a
 * checkpoint for. A build that hits this has not failed — it is waiting for configuration, and
 * `NOT_CONFIGURED` is the state it reports rather than a stack trace.
 * @returns {LlmPort}
 */
export function notConfiguredPort() {
  const refuse = (operation) => async () => {
    throw new LlmPortError(
      'NOT_CONFIGURED',
      `No model transport is configured for ${operation}; this build waits rather than choosing one`,
      { operation }
    )
  }
  return {
    configured: false,
    normalizeBrief: refuse('normalizeBrief'),
    generateContent: refuse('generateContent')
  }
}

/**
 * Wrap session C's transport as a port.
 *
 * @param {object} args
 * @param {(req: {operation: string, input: any, signal?: AbortSignal}) => Promise<any>} args.call
 *   C's transport. It owns model, credentials, routing, retries, budget and usage accounting.
 * @param {{normalizeBrief: string, generateContent: string}} args.operations the names C published
 * @returns {LlmPort}
 */
export function createLlmPort({ call, operations }) {
  if (typeof call !== 'function')
    throw new LlmPortError('NO_TRANSPORT', 'An LLM port needs a transport to call')
  for (const key of ['normalizeBrief', 'generateContent'])
    if (typeof operations?.[key] !== 'string' || !operations[key])
      throw new LlmPortError(
        'NO_OPERATION_NAME',
        `This port needs the operation name session C published for ${key}; it does not guess one`,
        { method: key }
      )
  const invoke =
    (method) =>
    async (input, opts = {}) => {
      try {
        return await call({ operation: operations[method], input, signal: opts.signal })
      } catch (cause) {
        // C's own codes pass straight through: a caller holding a checkpoint has to be able to tell
        // a quota from a cancel from a timeout, and re-labelling them here would destroy that.
        throw new LlmPortError(cause?.code ?? 'MODEL_CALL_FAILED', cause?.message ?? String(cause), {
          method,
          operation: operations[method],
          cause
        })
      }
    }
  return {
    configured: true,
    normalizeBrief: invoke('normalizeBrief'),
    generateContent: invoke('generateContent')
  }
}

/**
 * A port that answers from a fixed table — for tests and for developing this domain while C is
 * unavailable. Every answer it returns is stamped `mock: 'MOCK'` so a fixture can never be read as
 * a real model run, and an unstubbed method refuses rather than inventing a plausible answer.
 *
 * @param {{normalizeBrief?: any, generateContent?: any}} answers
 * @returns {LlmPort & {calls: {method: string, input: any}[]}}
 */
export function mockLlmPort(answers = {}) {
  /** @type {{method: string, input: any}[]} */
  const calls = []
  const answer = (method) => async (input) => {
    calls.push({ method, input })
    if (!(method in answers))
      throw new LlmPortError('NOT_CONFIGURED', `MOCK port has no answer for ${method}`, {
        method,
        mock: 'MOCK'
      })
    const value = answers[method]
    const result = typeof value === 'function' ? await value(input) : value
    return result && typeof result === 'object' ? { ...result, mock: 'MOCK' } : result
  }
  return {
    configured: true,
    mock: 'MOCK',
    calls,
    normalizeBrief: answer('normalizeBrief'),
    generateContent: answer('generateContent')
  }
}
