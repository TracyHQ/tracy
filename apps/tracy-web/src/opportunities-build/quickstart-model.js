/** Quickstart editorial calls use the admin WO assignment and existing durable attempts/reservations. */
import { withBuildChoice } from './build-choice.js'
import sharp from 'sharp'
import { quickstartRetryWindow } from './quickstart-retry-window.js'
import { createHash } from 'node:crypto'
import { held, PICTURE_LABEL_SYSTEM, visionKey } from '../lib/picture-vision.js'
import {
  validateQualityExecutionProfile,
  qualityExecutionModel,
  qualityExecutionBudget,
  qualityExecutionInput
} from './quality-execution-profile.js'
import { acceptQualityIntent } from './quality-intents.js'
import { qualityHash } from './quality-dossier.js'
import { qualityRunStore, runQualityAttempt } from './quality-runs.js'
import { callQualityModel, qualityCallBudget, qualityModelFor, qualityUsageCost } from './quality-model.js'

const fail = (code) => Object.assign(new Error(code), { code })
export function createQuickstartModel({
  pool,
  secret,
  ledger,
  runtime,
  jobCapCents = 200,
  replayRunIds = [],
  allowProviderCalls = true,
  modelFor = qualityModelFor,
  providerCall = callQualityModel
}) {
  if (!Number.isInteger(jobCapCents) || jobCapCents < 1 || jobCapCents > 200)
    throw fail('QUICKSTART_BUDGET_UNAVAILABLE')
  if (
    !Array.isArray(replayRunIds) ||
    replayRunIds.length > 1 ||
    replayRunIds.some((id) => !/^[a-f0-9-]{36}$/.test(id))
  )
    throw fail('QUICKSTART_REPLAY_SCOPE')
  return async ({ ctx, source, checkAllowed }) => {
    const settings = (await runtime()).settings
    const policy = {
      maxAttempts: 64,
      maxRunMs: 25 * 60_000,
      accountDailyCapCents: settings.researchDailyCapCents,
      jobCapCents: Math.min(jobCapCents, settings.researchJobCapCents)
    }
    if (!Number.isInteger(policy.jobCapCents) || policy.jobCapCents < 1)
      throw fail('QUICKSTART_BUDGET_UNAVAILABLE')
    const executionProfile = validateQualityExecutionProfile(source.brief.executionProfile)
    const loadModel = async (role) => {
      const model = await modelFor({ pool, secret, role })
      return { ...model, config: qualityExecutionModel(model.config, executionProfile) }
    }
    const assigned = Object.fromEntries(
      await Promise.all(['plan', 'observations'].map(async (role) => [role, await loadModel(role)]))
    )
    const sourceHash = qualityHash({
      revisionId: source.revision_id,
      profile: source.profile_effective,
      brief: source.brief
    })
    const semanticInput = {
      workflow: 'quickstart-first/1',
      revisionId: source.revision_id,
      sourceHash,
      siteKey: ctx.siteKey
    }
    let run = (
      await pool.query('select * from wo_quality_run where account_id=$1 and revision_id=$2', [
        source.account_id,
        source.revision_id
      ])
    ).rows[0]
    let dispatchFailure = null
    let retryWindow = null
    const store = qualityRunStore({
      retryWindow: (scope) => retryWindow?.(scope),
      pool,
      externalScope: async ({ run: current }) => {
        if (dispatchFailure) throw dispatchFailure
        await checkAllowed()
        if (dispatchFailure) throw dispatchFailure
        return (
          current.revision_id === source.revision_id &&
          current.account_id === source.account_id &&
          current.input.sourceHash === sourceHash
        )
      }
    })
    if (!run) {
      const current = (
        await pool.query(
          'select intent_id from wo_quality_current_intent where account_id=$1 and opportunity_id=$2',
          [source.account_id, source.opportunity_id]
        )
      ).rows[0]
      const intent = await acceptQualityIntent(pool, {
        accountId: source.account_id,
        opportunityId: source.opportunity_id,
        semanticInput,
        policy,
        expectedIntentId: current?.intent_id ?? null
      })
      run = await store.prepare({
        accountId: source.account_id,
        opportunityId: source.opportunity_id,
        revisionId: source.revision_id,
        intentId: intent.id,
        policy: intent.policy,
        input: {
          schemaVersion: 'tracy-wo-quickstart-input/v1',
          executionProfile,
          ...semanticInput,
          models: Object.fromEntries(Object.entries(assigned).map(([role, model]) => [role, model.config]))
        }
      })
    }
    if (run.input.sourceHash !== sourceHash || run.input.siteKey !== ctx.siteKey)
      throw fail('QUICKSTART_SOURCE_CHANGED')
    retryWindow = await quickstartRetryWindow({ pool, source, run, actionId: ctx.retryActionId })
    const assertRoot = async () => {
      if (dispatchFailure) throw dispatchFailure
      const current = (
        await pool.query(
          `select r.state,i.state as intent_state,i.deadline,i.policy
        from wo_quality_run r join wo_quality_intent i on i.id=r.intent_id where r.id=$1 and r.account_id=$2`,
          [run.id, source.account_id]
        )
      ).rows[0]
      if (
        !current ||
        ['cancelled', 'failed'].includes(current.state) ||
        ['cancelled', 'failed'].includes(current.intent_state)
      )
        throw fail('QUICKSTART_RUN_CLOSED')
      if (new Date(current.deadline).getTime() <= Date.now()) {
        const window = await retryWindow?.({ root: { ...current, state: current.intent_state } })
        if (!window) throw fail('QUICKSTART_RUN_CLOSED')
        return window
      }
    }
    if (retryWindow) {
      await checkAllowed()
      const window = await assertRoot()
      if (window) await store.artifact(run.id, source.account_id, `retry-window:${window.actionId}`, window)
      retryWindow.activate()
    }
    const frozenReplaySource = replayRunIds.length
      ? (
          await pool.query('select * from wo_revision where id=$1 and account_id=$2', [
            source.revision_id,
            source.account_id
          ])
        ).rows[0]
      : null
    for (const replayId of replayRunIds) {
      const stored = (
        await pool.query(
          `select q.account_id,q.opportunity_id,q.input,r.* from wo_quality_run q
         join wo_revision r on r.id=q.revision_id where q.id=$1`,
          [replayId]
        )
      ).rows[0]
      // Same revision, same build: the build's choice is what both briefs are read with.
      const previous = stored && withBuildChoice(stored, source.build_choice ?? source.choice)
      if (
        !previous ||
        previous.account_id !== source.account_id ||
        previous.opportunity_id !== source.opportunity_id ||
        previous.input.siteKey !== ctx.siteKey ||
        qualityHash(previous.input.executionProfile) !== qualityHash(executionProfile) ||
        qualityHash(previous.input.models) !== qualityHash(run.input.models) ||
        ['profile_effective', 'asset_manifest'].some(
          (key) => qualityHash(previous[key]) !== qualityHash(frozenReplaySource?.[key])
        ) ||
        ['business', 'picturePolicy', 'executionProfile'].some(
          (key) => qualityHash(previous.brief[key]) !== qualityHash(source.brief[key])
        )
      )
        throw fail('QUICKSTART_REPLAY_INPUT_CHANGED')
      const unknown = (
        await pool.query(
          `select id from wo_quality_attempt where run_id=$1 and
         (state not in ('succeeded','failed') or receipt->>'costCents' is null) limit 1`,
          [replayId]
        )
      ).rows.length
      if (unknown) throw fail('QUALITY_ATTEMPT_UNCERTAIN')
    }
    const paid = async (role, system, input, maxTokens, images = []) => {
      // Cache-only recovery must fail before any claim, reservation or provider dispatch.
      if (!allowProviderCalls) throw fail('QUICKSTART_REPLAY_CACHE_MISS')
      ctx.signal?.throwIfAborted()
      await checkAllowed()
      await assertRoot()
      const model = await loadModel(role)
      input = qualityExecutionInput(input, executionProfile)
      if (run.input.models?.[role]?.hash !== model.config.hash) throw fail('QUICKSTART_MODEL_CONFIG_CHANGED')
      const budget = qualityExecutionBudget(
        qualityCallBudget({
          config: model.config,
          system,
          input,
          images,
          maxTokens,
          maxInputTokens: 100000,
          maxImages: 8
        }),
        executionProfile
      )
      return runQualityAttempt({
        store,
        ledger,
        run,
        stage: `quickstart-${role}-${qualityHash({ system, input, imageHashes: images.map((i) => i.sha256) }).slice(0, 24)}`,
        input: { system, input, imageHashes: images.map((i) => i.sha256) },
        modelConfig: model.config,
        maxCents: budget.maxCents,
        buildId: source.id,
        actionId: retryWindow?.actionId ?? null,
        checkAllowed: async () => {
          await checkAllowed()
          await assertRoot()
        },
        call: () => providerCall({ model, system, input, images, budget, signal: ctx.signal }),
        actualCents: (response) => qualityUsageCost(response, model.config)
      })
    }
    const generate = async ({ system, input, maxTokens }) =>
      (await paid('plan', system, input, maxTokens)).result
    generate.preflightEditorial = async ({ system, input, maxTokens }) => {
      const model = await loadModel('plan')
      return qualityExecutionBudget(
        qualityCallBudget({
          config: model.config,
          system,
          input: qualityExecutionInput(input, executionProfile),
          images: [],
          maxTokens,
          maxInputTokens: 100000,
          maxImages: 8
        }),
        executionProfile
      )
    }
    generate.lookupEditorial = async ({ system, inputHash }) => {
      await checkAllowed()
      await assertRoot()
      const rows = (
        await pool.query(
          `select id,state,input,result,receipt,model_config from wo_quality_attempt
         where run_id=any($1::uuid[]) and input->'input'->>'inputHash'=$2 order by created_at,id`,
          [[run.id, ...replayRunIds], inputHash]
        )
      ).rows
      for (const row of rows) {
        if (!['succeeded', 'failed'].includes(row.state) || !Number.isFinite(row.receipt?.costCents))
          throw fail('QUALITY_ATTEMPT_UNCERTAIN')
        if (row.input.system !== system || row.model_config.hash !== assigned.plan.config.hash)
          throw fail('QUICKSTART_REPLAY_INPUT_CHANGED')
      }
      return rows.map((row) => ({
        attemptId: row.id,
        input: row.input.input,
        result: row.result?.result ?? null
      }))
    }
    generate.assertAllowed = assertRoot
    generate.stopDispatch = (error) => {
      dispatchFailure ??= error
    }
    const visionModel = assigned.observations
    const door = {
      model: visionModel.config.model,
      url: visionModel.credential.baseUrl + '/chat/completions'
    }
    generate.vision = {
      key: visionKey(door),
      door,
      maxPictures: 80,
      metered: true,
      booking: {
        door: visionModel.config.door,
        provider: visionModel.config.providerId,
        model: visionModel.config.model
      },
      label: async ({ pictures, signal }) => {
        const labels = new Map(),
          usage = { calls: 0, promptTokens: 0, completionTokens: 0, requests: [] }
        for (let n = 0; n < pictures.length; n += 8) {
          signal?.throwIfAborted()
          const images = []
          for (const picture of pictures.slice(n, n + 8)) {
            const bytes = await sharp(picture.bytes)
              .rotate()
              .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 70 })
              .toBuffer()
            images.push({
              id: picture.id,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`
            })
          }
          const answer = await paid(
            'observations',
            PICTURE_LABEL_SYSTEM,
            { pictureIds: images.map((i) => i.id) },
            12000,
            images
          )
          const asked = new Set(images.map((i) => i.id))
          for (const entry of answer.result?.pictures ?? []) {
            const value = held(entry)
            if (!value || !asked.has(value.id)) throw fail('QUICKSTART_VISION_SCOPE')
            labels.set(value.id, value.labels)
          }
          if (images.some((i) => !labels.has(i.id))) throw fail('QUICKSTART_VISION_INCOMPLETE')
          usage.calls++
          usage.promptTokens += answer.receipt.usage.prompt_tokens
          usage.completionTokens += answer.receipt.usage.completion_tokens
          usage.requests.push({
            requestId: answer.receipt.requestId,
            model: answer.receipt.model,
            usage: answer.receipt.usage
          })
        }
        return { labels, usage, failed: 0 }
      }
    }
    return generate
  }
}
