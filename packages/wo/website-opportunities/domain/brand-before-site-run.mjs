// The brand step before the site exists, as one step (ticket #616): the existing brand step is run (the caller's
// `run`, the brand bench on the stored research brief and the template kit), its brand file read as the look record
// (`brandLookOf`). Like every step of a build (ADR 0047, #591) a failing attempt is run again once, then the step stops
// with a typed error; every attempt keeps a record line (when it ran, what it cost, how it ended, its inputs and output).
import { BrandStepError, brandLookOf } from './brand-before-site.mjs'

/** How many times the brand step runs at most: the first attempt and one more. */
export const BRAND_STEP_ATTEMPTS = 2
/** The locked prompt of the brand step (the bench's own file and version), named in every record. */
export const BRAND_STEP_PROMPT = Object.freeze({ file: 'brand-step.system.md', version: 10 })

const message = (error) => String(error?.message ?? error).slice(0, 400)

/**
 * Run the brand step once, and once more on a failure, then read its brand file.
 * @param {{run: (how: {attempt: number}) => Promise<{brandFile: object, usd?: number, runId?: string, file?: string}>,
 *   brief: object, kit?: object, inputs?: object, now?: () => number}} input `run`: one attempt of the existing brand
 *   step; `brief`: the stored research brief it ran on (the logo's colours and research source are read from it);
 *   `kit`: the template kit it ran on (`brandLookOf`); `inputs`: what the record says the
 *   step was given (a revision id and a kit ref, never a path)
 * @returns {Promise<{record: ReturnType<typeof brandLookOf>, records: object[], usd: number, prompt: object}>}
 * @throws {BrandStepError} `brand_step_failed` (with every record line) after the second failure, or after the first
 *   when the failure says a second run cannot change it (`noRerun`)
 */
export async function runBrandBeforeSite({ run, brief, kit, inputs = {}, now = Date.now }) {
  if (typeof run !== 'function')
    throw new BrandStepError('brand_step_missing', 'no brand step was given', {}, { noRerun: true })
  const records = []
  let usd = 0
  for (let attempt = 1; attempt <= BRAND_STEP_ATTEMPTS; attempt++) {
    const line = {
      step: 'brand',
      attempt,
      startedAt: new Date(now()).toISOString(),
      inputs,
      prompt: BRAND_STEP_PROMPT
    }
    records.push(line)
    try {
      const ran = await run({ attempt })
      line.usd = Number(ran?.usd ?? 0)
      usd += line.usd
      if (ran?.runId) line.runId = ran.runId
      const record = brandLookOf({ brandFile: ran?.brandFile, brief, kit })
      Object.assign(line, {
        endedAt: new Date(now()).toISOString(),
        outcome: 'done',
        output: { ...(ran.file ? { file: ran.file } : {}), accent: record.accent, logo: record.logo }
      })
      return { record, records, usd, prompt: BRAND_STEP_PROMPT }
    } catch (error) {
      // A run that threw may still have spent (its error carries `usd`); a run that answered was counted above.
      if (line.usd === undefined) {
        line.usd = Number(error?.usd ?? 0)
        usd += line.usd
      }
      Object.assign(line, {
        endedAt: new Date(now()).toISOString(),
        outcome: 'failed',
        error: { code: error?.code ?? null, message: message(error) }
      })
      if (error?.noRerun || attempt === BRAND_STEP_ATTEMPTS)
        throw new BrandStepError(
          'brand_step_failed',
          `the brand step failed ${attempt === 1 ? 'once and cannot be run again' : `${attempt} times`}: ${message(error)}`,
          { records, usd },
          { noRerun: true }
        )
    }
  }
}
