/** Composition seam for /ops pixel tests; shares WO's bounded transport, prices and monetary book. */
import {
  currentVisionProof,
  runVisionTest,
  VISION_TEST_SYSTEM,
  visionTestStore
} from '../lib/llm-vision-test.js'
import { readWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { callQualityModel, qualityCallBudget, qualityModelFor, qualityUsageCost } from './quality-model.js'
import { qualityPriceFor } from './quality-price.js'

export function createQualityVisionTests({ pool, secret, fetchImpl = fetch, now = Date.now }) {
  const load = () => qualityModelFor({ pool, secret, role: 'vision-test', now })
  const store = visionTestStore({ pool, now })
  const ledger = createCostLedger({
    pool,
    now,
    caps: async () => {
      const { settings } = await readWoOpsSettings(pool)
      return { dailyCapCents: settings.researchDailyCapCents, jobCapCents: settings.researchJobCapCents }
    }
  })
  async function status({ actor } = {}) {
    try {
      const model = await load()
      const proof = await currentVisionProof({ pool, fingerprint: model.config.visionFingerprint, now })
      const active = actor
        ? ((
            await pool.query(
              `select t.id,t.request_key as "requestKey",t.state from llm_model_test t
         join account a on a.id=t.account_id where a.email=$1 and t.fingerprint=$2
         and t.state in ('pending','running','uncertain') order by t.created_at desc limit 1`,
              [actor, model.config.visionFingerprint]
            )
          ).rows[0] ?? null)
        : null
      return {
        state: proof ? 'passed' : 'untested',
        model: model.config.model,
        proof,
        active,
        ...(model.config.price.warning ? { warning: model.config.price.warning } : {})
      }
    } catch (e) {
      return { state: 'unavailable', error: e.message, warning: qualityPriceFor('', '', { now }).warning }
    }
  }
  async function run({ actor, requestKey, checkAllowed }) {
    const accountId = (await pool.query('select id from account where email=$1', [actor])).rows[0]?.id
    if (!accountId) throw new Error('VISION_TEST_ACCOUNT_REQUIRED')
    const model = await load()
    const { settings } = await readWoOpsSettings(pool)
    const inputFor = () => ({ task: 'Read the image and return the requested JSON.' })
    const budgetFor = (input) =>
      qualityCallBudget({
        config: model.config,
        system: VISION_TEST_SYSTEM,
        input: inputFor(),
        images: input.images,
        maxTokens: 2048,
        maxInputTokens: 12000,
        maxImages: 1
      })
    const row = await runVisionTest({
      store,
      ledger,
      model,
      accountId,
      actor,
      requestKey,
      accountDailyCapCents: settings.researchJobCapCents,
      checkAllowed: async () => {
        await checkAllowed()
        if ((await load()).config.visionFingerprint !== model.config.visionFingerprint)
          throw new Error('VISION_TEST_CONFIG_CHANGED')
      },
      budgetFor,
      call: (input, budget) =>
        callQualityModel({
          model,
          system: VISION_TEST_SYSTEM,
          input: inputFor(),
          images: input.images,
          budget,
          fetchImpl,
          now
        }),
      actualCents: (answer) => qualityUsageCost(answer, model.config)
    })
    return {
      id: row.id,
      state: row.state,
      error: row.error,
      model: model.config.model,
      observed: row.result?.observed ?? null,
      costCents: row.receipt?.costCents ?? null,
      requestId: row.receipt?.requestId ?? null,
      imageHashes: row.receipt?.imageHashes ?? [],
      status: await status()
    }
  }
  return { status, run }
}
