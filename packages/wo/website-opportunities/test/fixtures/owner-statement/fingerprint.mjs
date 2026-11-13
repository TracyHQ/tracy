// A fingerprint of everything a business reading sends and returns for one input: the texts it reads, the message and
// the exact request body the model receives, and what the rules and the check make of a scripted answer. Recorded in
// `baseline.json` before the owner statement existed, so a test proves a reading without one is byte for byte as before.
import { createHash } from 'node:crypto'
import {
  BUSINESS_READING_SYSTEM,
  businessReadingPrompt,
  checkBusinessReading,
  readBusinessByRules,
  readingFactsOf,
  readingSourcesOf
} from '../../../domain/business-reading.mjs'
import { readBusiness } from '../../../src/business-reading.js'

const DOOR = {
  state: 'ready',
  door: { url: 'https://model.example.test/chat/completions', key: 'k', model: 'fake-model', effort: 'off' }
}

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** The fingerprint of one reading input (`extra` is spread over it, e.g. a blank owner statement). */
export async function fingerprintOf(input, answer, extra = {}) {
  const given = { ...input, ...extra }
  const sources = readingSourcesOf(given)
  const facts = readingFactsOf(given)
  const prompt = businessReadingPrompt(sources, { name: given.name, trade: given.trade, facts })
  const bodies = []
  const fetchImpl = async (_url, init) => {
    bodies.push(init.body)
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10 }
      })
    }
  }
  const read = await readBusiness({
    ...given,
    door: DOOR,
    charge: (_spec, call) => call(),
    fetchImpl,
    now: () => Date.parse('2026-11-13T00:00:00Z'),
    log: { warn() {} }
  })
  return {
    sources: sha(sources),
    prompt: sha(prompt),
    system: sha(BUSINESS_READING_SYSTEM),
    requests: sha(bodies),
    rules: sha(readBusinessByRules(sources)),
    checked: sha(checkBusinessReading(answer, sources, { trade: given.trade, facts })),
    read: sha(read)
  }
}
