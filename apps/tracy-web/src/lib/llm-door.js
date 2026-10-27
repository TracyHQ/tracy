/**
 * What a door should actually spend — the provider book first, the environment second, and NEVER
 * the environment in place of a choice somebody made.
 *
 * 🔒 THE FALLBACK IS FOR A DOOR NOBODY FILLED IN. `llm_provider` is a table a deployment may never
 * use: a laptop, a test, a stand brought up from `.env.example`. Every door here already had a
 * shape it accepted (`{ apiKey, baseUrl, words }`, read once at boot by `config.js`), so the book
 * hands back the SAME shape and `config.model` answers when the door is UNASSIGNED. Nothing
 * downstream had to learn a new type, and a deployment that never opens the Model & AI screen
 * behaves exactly as it did before the table existed.
 *
 * 🔒 AN ASSIGNED DOOR THAT CANNOT ANSWER IS `null`, NOT THE ENVIRONMENT. The operator picked a
 * provider and a model; if that provider is switched off or its key will not open, spending
 * `MODEL_API_KEY` on a default model would be a different vendor, a different model and a
 * different bill with nothing on screen to say so. The honest answer is the one an unconfigured
 * door already gives (503, "not configured") plus a log line saying which door and why.
 *
 * ⚠ `null` STAYS `null`. Each of these doors already reads `null` as "this feature is off" and
 * answers 503 rather than calling anything. Turning an unconfigured door into an object with empty
 * strings would send `Authorization: Bearer ` to a vendor and turn a clear refusal into a confusing
 * one.
 */
import { lookupDoor } from './llm-store.js'

/**
 * @typedef {{apiKey: string, baseUrl: string, words: string}} DoorModel
 * @typedef {{ warn: (...args: unknown[]) => void }} DoorLog
 */

/**
 * The first door in `chain` that is filled in. A door that is filled in but broken ends the search
 * with `null` — it does NOT hand the call to the next door, whose budget belongs to another job.
 * Only when every door in the chain is unassigned does the environment answer.
 *
 * @param {import('pg').Pool | null} pool - null on a deployment with no database.
 * @param {Array<'web'|'assistant'|'seedText'|'seedImage'|'vision'|'agent'>} chain
 * @param {{ model: DoorModel | null, sessionSecret: string }} config
 * @param {{ log?: DoorLog, env?: DoorModel | null }} [options] - `env` overrides what answers when
 *   the whole chain is unassigned (the picture door has its own environment key, not `config.model`).
 * @returns {Promise<DoorModel | null>}
 */
export async function modelForChain(pool, chain, config, { log = console, env } = {}) {
  const fromEnv = env === undefined ? (config.model ?? null) : env
  if (!pool) return fromEnv
  for (const door of chain) {
    const found = await lookupDoor(pool, door, config.sessionSecret)
    if (found.state === 'unassigned') continue
    if (found.state === 'ok') {
      const { apiKey, baseUrl, model } = found.credential
      // `words` because that is what every caller downstream already calls the model name;
      // renaming it here would mean touching three call sites for no gain.
      return { apiKey, baseUrl, words: model }
    }
    log.warn(`[llm] door "${door}" is assigned but its provider is ${found.state}; not falling back`)
    return null
  }
  return fromEnv
}

/**
 * @param {import('pg').Pool | null} pool
 * @param {'web'|'seedText'|'seedImage'|'vision'|'agent'|'assistant'} door
 * @param {{ model: DoorModel | null, sessionSecret: string }} config
 * @param {{ log?: DoorLog }} [options]
 * @returns {Promise<DoorModel | null>}
 */
export function modelForDoor(pool, door, config, options) {
  return modelForChain(pool, [door], config, options)
}
