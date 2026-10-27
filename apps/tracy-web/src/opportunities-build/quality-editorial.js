/** Prepare A/B/C inside the normal durable WO action. Provider calls never hold a DB transaction. */

import { prepareQualityAssets, qualityAssetPixels } from './quality-assets.js'
import { picturePolicy } from '../lib/wo-picture-policy.js'
import { buildQualityDossier, deterministicFacts, dossierMarkdown, qualityHash } from './quality-dossier.js'
import {
  qualityExecutionBudget,
  qualityExecutionInput,
  qualityExecutionLimits,
  qualityExecutionModel,
  qualityExecutionOf,
  qualityExecutionProfile
} from './quality-execution-profile.js'
import {
  qualityDossierModelView,
  qualityOutlineManifest,
  qualitySemanticAcceptance
} from './quality-inputs.js'
import { callQualityModel, qualityCallBudget, qualityModelFor, qualityUsageCost } from './quality-model.js'
import { OBSERVATION_SYSTEM, validateObservations } from './quality-pictures.js'
import { qualityPlanMarkdown } from './quality-plan.js'
import {
  applyQualityFieldCorrections,
  mergeQualityBatches,
  QUALITY_FIELD_CORRECTIONS_SYSTEM,
  QUALITY_FIELDS_SYSTEM,
  QUALITY_OUTLINE_SYSTEM,
  qualityAttemptSchedule,
  qualityBatchInput,
  qualityBatchModelView,
  qualityFieldBatches,
  qualityFieldCorrectionBatches,
  qualityOutlineContract,
  qualityOutlineRepairIssues,
  validateQualityOutline
} from './quality-planner.js'
import { loadQualityPreparation, prepareQualityRun } from './quality-preparation.js'
import { bindQualityAction, QUALITY_PROTOCOL } from './quality-protocol.js'
import { qualityRunStore, runQualityAttempt } from './quality-runs.js'
import { QUALITY_FACTS_SYSTEM, qualityCompactFactsInput, qualitySourceInput } from './quality-sources.js'

const fail = (code) => Object.assign(new Error(code), { code })
const ROLES = ['facts', 'observations', 'plan', 'review']
const LIMITS = Object.freeze({
  facts: { maxTokens: 4000, maxInputTokens: 70000, maxImages: 0 },
  observations: { maxTokens: 4000, maxInputTokens: 20000, maxImages: 6 },
  outline: { maxTokens: 12000, maxInputTokens: 70000, maxImages: 0 },
  fields: { maxTokens: 8000, maxInputTokens: 40000, maxImages: 0 }
})
const chunk = (items, n) =>
  Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, (i + 1) * n))

/** Preserve admitted legacy wire/cache keys; deduplicate only a request that could never be admitted. */
export function qualityFactsTask(sources, config, executionProfile = null) {
  const candidates = deterministicFacts(sources)
  const legacy = { sources: qualitySourceInput(sources), deterministicCandidates: candidates }
  const limits = executionProfile ? qualityExecutionLimits(executionProfile, 'a-facts') : LIMITS.facts
  const preflight = (input) =>
    qualityCallBudget({
      config,
      system: QUALITY_FACTS_SYSTEM,
      input: qualityExecutionInput(input, executionProfile),
      ...limits
    })
  try {
    preflight(legacy)
    return legacy
  } catch (error) {
    if (error.code !== 'QUALITY_INPUT_LIMIT') throw error
  }
  const compact = qualityCompactFactsInput(sources, candidates)
  preflight(compact)
  return compact
}

export function createQualityEditorial({
  pool,
  secret,
  ledger,
  readInputs,
  policyFor,
  objects,
  headroom,
  loadModel = qualityModelFor,
  paidExecutorFor = null,
  providerCall = callQualityModel,
  prepareAssets = prepareQualityAssets,
  readPixels = qualityAssetPixels,
  executionProfileId = 'bounded-v3',
  preparationParentRunId = null,
  reuseDossier = null,
  reusePreparation = null,
  reuseFieldDraft = null,
  now = Date.now,
  fetchImpl = fetch
}) {
  if (!readInputs || !policyFor || !headroom) throw fail('QUALITY_EDITORIAL_DEPENDENCIES')
  if (reuseDossier !== null && typeof reuseDossier !== 'function')
    throw fail('QUALITY_EDITORIAL_DEPENDENCIES')
  if (reusePreparation !== null && typeof reusePreparation !== 'function')
    throw fail('QUALITY_EDITORIAL_DEPENDENCIES')
  if (reuseFieldDraft !== null && typeof reuseFieldDraft !== 'function')
    throw fail('QUALITY_EDITORIAL_DEPENDENCIES')
  const store = qualityRunStore({ pool, now })
  const prepared = (identity) => loadQualityPreparation(pool, identity)
  const load = (role) => loadModel({ pool, secret, role, now })
  async function adopt({ action, lease, revision, checkAllowed }) {
    await checkAllowed()
    const run = await prepared({
      accountId: action.account_id,
      opportunityId: action.opportunity_id,
      revisionId: revision.id
    })
    if (
      !run ||
      revision.brief?.editorial?.runId !== run.id ||
      revision.brief.editorial.frozenHash !== run.input.frozenHash ||
      revision.brief.editorial.planHash !== run.artifacts.plan?.hash
    )
      throw fail('QUALITY_REVISION_REFERENCE')
    await bindQualityAction(pool, { action, run, lease, now })
    return run
  }

  // Review and repair share the same frozen models, root fence, ledger and future-work forecast as A/B/C.
  function paidFor(context, run) {
    const { action, checkAllowed } = context
    if (run.account_id !== action.account_id || run.opportunity_id !== action.opportunity_id)
      throw fail('QUALITY_PAID_SCOPE')
    if (paidExecutorFor) return paidExecutorFor(context, run)
    const profile = qualityExecutionOf(run.input)
    const profileRef = run.input.executionProfile ? { id: profile.id, hash: profile.hash } : null
    const forecastArgs = {
      context,
      run,
      models: run.input.models,
      maxFieldCalls: profile.maxFieldCalls,
      reviewCalls: profile.automaticReview === false ? 0 : profile.maxLocalReviewCalls + 1,
      observationBatches: Math.ceil((run.input.assets?.selected?.length ?? 0) / 6)
    }
    const save = async (key, value) => {
      await store.artifact(run.id, run.account_id, key, value)
      run.artifacts[key] = value
      return value
    }
    const allowed = async (role) => {
      await checkAllowed()
      const current = (
        await pool.query('select state,deadline from wo_quality_intent where id=$1', [run.intent_id])
      ).rows[0]
      if (
        !current ||
        ['cancelled', 'failed'].includes(current.state) ||
        new Date(current.deadline).getTime() <= now()
      )
        throw fail('QUALITY_RUN_CLOSED')
      const model = await load(role)
      if (profileRef) model.config = qualityExecutionModel(model.config, profile)
      if (model.config.hash !== run.input.models[role].hash) throw fail('QUALITY_MODEL_CONFIG_CHANGED')
      return model
    }
    return async (role, stage, system, input, images = [], limits = null) => {
      const frozenLimits = qualityExecutionLimits(profile, stage)
      limits ??= frozenLimits
      if (qualityHash(limits) !== qualityHash(frozenLimits)) throw fail('QUALITY_EXECUTION_LIMITS_CHANGED')
      input = qualityExecutionInput(input, run.input.executionProfile)
      const model = await allowed(role),
        budget = qualityExecutionBudget(
          qualityCallBudget({ config: model.config, system, input, images, ...limits }),
          run.input.executionProfile
        )
      const answer = await runQualityAttempt({
        store,
        ledger,
        run,
        stage,
        actionId: action.id,
        input: {
          task: input,
          systemHash: qualityHash(system),
          imageHashes: images.map(({ id, sha256 }) => ({ id, sha256 })),
          budget
        },
        modelConfig: model.config,
        maxCents: budget.maxCents,
        checkBudget: () => headroom({ ...forecastArgs, stage, budget }),
        onPaid: (attempt) =>
          save(`paid-slot:${stage}`, {
            attemptId: attempt.id,
            reservationId: attempt.reservation_id,
            modelConfigHash: model.config.hash,
            inputHash: attempt.input_hash,
            costCents: attempt.receipt.costCents,
            state: attempt.state
          }),
        checkAllowed: () => allowed(role),
        call: async () => {
          const answer = await providerCall({ model, system, input, images, budget, fetchImpl, now })
          if (profileRef) answer.receipt.executionProfileHash = profile.hash
          return answer
        },
        actualCents: (answer) => qualityUsageCost(answer, model.config)
      })
      return answer.result
    }
  }

  function editorialFor(context) {
    const { action, lease, checkAllowed, mode } = context
    const editorial = async (frozen) => {
      await checkAllowed()
      let run = await prepared({
        accountId: action.account_id,
        opportunityId: action.opportunity_id,
        revisionId: frozen.id
      })
      if (!run) {
        const inputs = await readInputs(frozen, context),
          executionProfile = qualityExecutionProfile(executionProfileId),
          models = {}
        for (const role of ROLES)
          models[role] = qualityExecutionModel((await load(role)).config, executionProfile)
        // Editorial always observes every admitted picture; its bounded protocol admits at most 24.
        const assets = await prepareAssets({
          pool,
          objects,
          frozen,
          maxPictures: Math.min(picturePolicy(frozen.brief?.picturePolicy).maxVisionPictures, 24)
        })
        const accepted = inputs.comparison
          ? { comparison: inputs.comparison }
          : await qualitySemanticAcceptance(pool, {
              accountId: frozen.account_id,
              opportunityId: frozen.opportunity_id,
              semanticBase: inputs.semanticBase,
              now
            })
        run = await prepareQualityRun(pool, {
          frozen,
          actionId: action.id,
          ...accepted,
          manifest: inputs.manifest,
          questions: inputs.questions,
          sources: inputs.sources,
          assets,
          models,
          executionProfile,
          parentRunId: preparationParentRunId,
          policy: await policyFor(action.account_id),
          mode,
          now
        })
      }
      if (run.input.frozenHash !== qualityHash(frozen) || run.input.mode !== mode)
        throw fail('QUALITY_PREPARATION_CHANGED')
      await bindQualityAction(pool, { action, run, lease, now })
      const root = (await pool.query('select * from wo_quality_intent where id=$1', [run.intent_id])).rows[0]
      if (!root || !root.semantic_input.asOf) throw fail('QUALITY_SEMANTIC_INPUT_MISSING')
      const { manifest, assets, sources } = run.input
      const profile = qualityExecutionOf(run.input)
      const outlineLimits = qualityExecutionLimits(profile, 'c1-outline')
      const fieldLimits = qualityExecutionLimits(profile, 'c2-1')
      const observationBatches = chunk(assets.selected, 6)
      const maxFieldCalls = profile.maxFieldCalls,
        reviewCalls = profile.automaticReview === false ? 0 : profile.maxLocalReviewCalls + 1
      const schedule = qualityAttemptSchedule({
        batchCount: maxFieldCalls,
        observationBatches: observationBatches.length,
        reviewCalls,
        maxAttempts: run.policy.maxAttempts,
        executionProfile: run.input.executionProfile
      })
      // This is a forecast, not a reservation. Each actual HTTP attempt still reserves under the monetary lock.
      const forecastArgs = {
        context,
        run,
        schedule,
        limits: LIMITS,
        models: run.input.models,
        reviewCalls,
        maxFieldCalls,
        observationBatches: observationBatches.length
      }
      const save = async (key, value) => {
        await store.artifact(run.id, run.account_id, key, value)
        run.artifacts[key] = value
        return value
      }
      if (reuseDossier && !run.artifacts.dossier) {
        const reused = await reuseDossier({ context, run }),
          dossier = reused?.dossier,
          proof = reused?.proof
        if (
          !dossier ||
          typeof dossier !== 'object' ||
          Array.isArray(dossier) ||
          dossier.schemaVersion !== 'tracy-wo-dossier/v1' ||
          dossier.accountId !== run.account_id ||
          dossier.snapshotId !== frozen.place_snapshot_id ||
          dossier.validation?.state !== 'validated' ||
          !Array.isArray(dossier.facts) ||
          !Array.isArray(dossier.spans) ||
          !proof ||
          typeof proof !== 'object' ||
          Array.isArray(proof) ||
          proof.schemaVersion !== 'tracy-wo-facts-reuse/v1' ||
          proof.targetRunId !== run.id ||
          proof.targetIntentId !== run.intent_id ||
          proof.accountId !== run.account_id ||
          proof.opportunityId !== run.opportunity_id ||
          proof.dossierHash !== qualityHash(dossier) ||
          !Array.isArray(reused.unresolved)
        )
          throw fail('QUALITY_FACTS_REUSE_INVALID')
        const { hash, ...body } = proof
        if (hash !== qualityHash(body)) throw fail('QUALITY_FACTS_REUSE_INVALID')
        await save('facts-reuse', proof)
        await save('dossier-markdown', dossierMarkdown(dossier))
        await save('facts-unresolved', reused.unresolved)
        // The dossier is the completion marker; a partial save must revalidate reuse on resume.
        await save('dossier', dossier)
      }
      if (
        reuseFieldDraft &&
        (!run.artifacts['field-draft-results'] || !run.artifacts.outline || !run.artifacts.observations)
      ) {
        if (!run.artifacts.dossier) throw fail('QUALITY_FIELD_DRAFT_REUSE_INVALID')
        const reused = await reuseFieldDraft({ context, run }),
          { observations, outline, results, proof } = reused ?? {}
        if (
          !observations ||
          observations.accountId !== run.account_id ||
          observations.inputHash !== qualityHash({ accountId: run.account_id, assets: assets.selected }) ||
          !/^[a-f0-9]{64}$/.test(observations.modelConfigHash ?? '') ||
          observations.validation?.state !== 'validated' ||
          !Array.isArray(observations.pictures) ||
          observations.pictures.length !== assets.selected.length ||
          !outline ||
          outline.validation?.state !== 'validated' ||
          !Array.isArray(results) ||
          !results.length ||
          !proof ||
          proof.schemaVersion !== 'tracy-wo-field-draft-reuse/v1' ||
          proof.targetRunId !== run.id ||
          proof.targetIntentId !== run.intent_id ||
          proof.accountId !== run.account_id ||
          proof.opportunityId !== run.opportunity_id ||
          proof.observationsHash !== qualityHash(observations) ||
          proof.outlineHash !== qualityHash(outline) ||
          proof.resultsHash !== qualityHash(results)
        )
          throw fail('QUALITY_FIELD_DRAFT_REUSE_INVALID')
        const { hash: observationHash, ...observationBody } = observations,
          { hash: proofHash, ...proofBody } = proof,
          { hash: outlineHash, validation: _validation, ...rawOutline } = outline
        if (observationHash !== qualityHash(observationBody) || proofHash !== qualityHash(proofBody))
          throw fail('QUALITY_FIELD_DRAFT_REUSE_INVALID')
        for (const batch of observationBatches) {
          const inputHash = qualityHash({
              accountId: run.account_id,
              pictures: batch,
              policy: run.input.policyVersion
            }),
            checked = validateObservations(
              {
                schemaVersion: observations.schemaVersion,
                inputHash,
                pictures: observations.pictures.filter((p) => batch.some((a) => a.id === p.id))
              },
              batch,
              { accountId: run.account_id, inputHash, modelConfigHash: observations.modelConfigHash }
            )
          if (!checked.ok) throw fail('QUALITY_FIELD_DRAFT_REUSE_INVALID')
        }
        const checked = validateQualityOutline(rawOutline, {
          dossier: run.artifacts.dossier,
          manifest,
          observations
        })
        if (!checked.ok || checked.artifact.hash !== outlineHash)
          throw fail('QUALITY_FIELD_DRAFT_REUSE_INVALID')
        mergeQualityBatches({
          outline,
          batches: qualityFieldBatches({ outline, manifest, maxEstimatedTokens: 6000 }),
          results,
          dossier: run.artifacts.dossier,
          manifest,
          observations
        })
        await save('field-draft-reuse', proof)
        await save('field-draft-results', results)
        await save('outline', outline)
        await save('observations', observations)
      }
      if (profile.maxFieldCorrections && !run.artifacts['field-draft-results'])
        throw fail('QUALITY_FIELD_DRAFT_REUSE_REQUIRED')
      if (reusePreparation && !run.artifacts.observations) {
        if (!run.artifacts.dossier) throw fail('QUALITY_PREPARATION_REUSE_INVALID')
        const reused = await reusePreparation({ context, run }),
          observations = reused?.observations,
          draft = reused?.invalidOutline,
          contextDraft = reused?.contextDraft,
          proof = reused?.proof
        if (
          !observations ||
          observations.schemaVersion !== 'tracy-wo-observations/v1' ||
          observations.accountId !== run.account_id ||
          observations.inputHash !== qualityHash({ accountId: run.account_id, assets: assets.selected }) ||
          !/^[a-f0-9]{64}$/.test(observations.modelConfigHash ?? '') ||
          observations.validation?.state !== 'validated' ||
          !Array.isArray(observations.pictures) ||
          observations.pictures.length !== assets.selected.length ||
          !draft ||
          typeof draft !== 'object' ||
          Array.isArray(draft) ||
          !proof ||
          typeof proof !== 'object' ||
          Array.isArray(proof) ||
          proof.schemaVersion !== 'tracy-wo-preparation-reuse/v1' ||
          proof.targetRunId !== run.id ||
          proof.targetIntentId !== run.intent_id ||
          proof.accountId !== run.account_id ||
          proof.opportunityId !== run.opportunity_id ||
          proof.observationsHash !== qualityHash(observations) ||
          proof.invalidOutlineHash !== qualityHash(draft) ||
          (profile.id === 'manual-review-v4' &&
            (!contextDraft ||
              typeof contextDraft !== 'object' ||
              Array.isArray(contextDraft) ||
              proof.contextDraftHash !== qualityHash(contextDraft)))
        )
          throw fail('QUALITY_PREPARATION_REUSE_INVALID')
        const { hash: observationHash, ...observationBody } = observations,
          { hash: proofHash, ...proofBody } = proof
        if (observationHash !== qualityHash(observationBody) || proofHash !== qualityHash(proofBody))
          throw fail('QUALITY_PREPARATION_REUSE_INVALID')
        for (const batch of observationBatches) {
          const inputHash = qualityHash({
              accountId: run.account_id,
              pictures: batch,
              policy: run.input.policyVersion
            }),
            checked = validateObservations(
              {
                schemaVersion: observations.schemaVersion,
                inputHash,
                pictures: observations.pictures.filter((p) => batch.some((a) => a.id === p.id))
              },
              batch,
              { accountId: run.account_id, inputHash, modelConfigHash: observations.modelConfigHash }
            )
          if (!checked.ok) throw fail('QUALITY_PREPARATION_REUSE_INVALID')
        }
        if (
          validateQualityOutline(draft, {
            dossier: run.artifacts.dossier,
            manifest,
            observations
          }).ok
        )
          throw fail('QUALITY_PREPARATION_REUSE_INVALID')
        await save('preparation-reuse', proof)
        await save('outline-draft', draft)
        if (profile.id === 'manual-review-v4') await save('outline-context-draft', contextDraft)
        // Preserve the original observation hash and model provenance, with no provider replay.
        await save('observations', observations)
      }
      await headroom(forecastArgs)
      const paid = paidFor(context, run)
      let dossier = run.artifacts.dossier
      if (!dossier) {
        const candidates = deterministicFacts(sources),
          input = qualityFactsTask(sources, run.input.models.facts, run.input.executionProfile)
        const proposed = await paid('facts', 'a-facts', QUALITY_FACTS_SYSTEM, input)
        if (
          !proposed ||
          Object.keys(proposed).some((k) => !['facts', 'unresolved'].includes(k)) ||
          !Array.isArray(proposed.facts) ||
          proposed.facts.length > 500 ||
          !Array.isArray(proposed.unresolved)
        )
          throw fail('QUALITY_FACTS_SCHEMA')
        dossier = buildQualityDossier({
          accountId: run.account_id,
          snapshotId: frozen.place_snapshot_id,
          overlay: frozen.overlay,
          business: { name: frozen.overlay.name },
          sources,
          proposals: [...candidates, ...proposed.facts],
          at: root.semantic_input.asOf
        })
        await save('dossier', dossier)
        await save('dossier-markdown', dossierMarkdown(dossier))
        await save('facts-unresolved', proposed.unresolved)
      }
      let observations = run.artifacts.observations
      if (!observations) {
        const pictures = []
        for (const [index, batch] of observationBatches.entries()) {
          const images = await readPixels({ pool, objects, frozen, assets, ids: batch.map((a) => a.id) })
          const inputHash = qualityHash({
            accountId: run.account_id,
            pictures: batch,
            policy: run.input.policyVersion
          })
          const output = await paid(
            'observations',
            `b-pictures-${index + 1}`,
            OBSERVATION_SYSTEM,
            { inputHash, pictures: batch },
            images
          )
          const checked = validateObservations(output, batch, {
            accountId: run.account_id,
            inputHash,
            modelConfigHash: run.input.models.observations.hash
          })
          if (!checked.ok) {
            await save(`observations-invalid-${index + 1}`, checked)
            throw fail('QUALITY_OBSERVATIONS_INVALID')
          }
          pictures.push(...checked.artifact.pictures)
        }
        const value = {
          schemaVersion: 'tracy-wo-observations/v1',
          accountId: run.account_id,
          modelConfigHash: run.input.models.observations.hash,
          inputHash: qualityHash({ accountId: run.account_id, assets: assets.selected }),
          pictures,
          coverage: { asked: assets.selected.length, observed: pictures.length },
          validation: { state: 'validated' }
        }
        observations = await save('observations', { ...value, hash: qualityHash(value) })
      }
      const contextFor = { dossier, manifest, observations }
      let schemaRepairUsed = false
      const schemaRepair = async (system, input, errors, priorOutput = null) => {
        if (schemaRepairUsed) throw fail('QUALITY_SCHEMA_REPAIR_EXHAUSTED')
        schemaRepairUsed = true
        return paid(
          'plan',
          'c-schema-repair',
          system,
          {
            ...input,
            repair: {
              errors,
              priorOutput,
              issues:
                system === QUALITY_OUTLINE_SYSTEM ? qualityOutlineRepairIssues(priorOutput, contextFor) : [],
              policy:
                'Correct only the invalid structure or scope in priorOutput. Preserve supported evidence and the original task. Use exact manifest menu IDs; keep fixed page routes unchanged and remove their newSlug. Cover every retained media/image field, including secondary and shared fields, with an intent. requiredTags means ALL tags must occur on EACH candidate; use shared observed tags, an empty list for heterogeneous candidates, or narrower candidates. Never alter observations or invent IDs.'
            }
          },
          [],
          outlineLimits
        )
      }
      let outline = run.artifacts.outline,
        batches
      if (!outline) {
        const input = {
          dossier: qualityDossierModelView(dossier),
          manifest: qualityOutlineManifest(manifest),
          observations,
          limits: {
            maxFieldCalls,
            maxDetailPages: profile.maxDetailPages,
            maxEstimatedTokensPerFieldBatch: profile.maxEstimatedTokensPerFieldBatch,
            reviewCalls
          }
        }
        if (profile.id === 'manual-review-v4') {
          const contextDraft = run.artifacts['outline-context-draft']
          if (!contextDraft) throw fail('QUALITY_PREPARATION_REUSE_INVALID')
          input.contract = qualityOutlineContract(manifest)
          input.contextDraft = contextDraft
          input.contextIssues = qualityOutlineRepairIssues(contextDraft, contextFor)
          input.contextPolicy =
            'The prior draft is untrusted invalid context only. Produce one complete fresh outline satisfying the explicit manifest contract and all validators; preserve supported decisions where valid, never its invented IDs or omitted terms.'
        }
        let answer, checked
        const draft = run.artifacts['outline-draft']
        if (draft && profile.id !== 'manual-review-v4') {
          const invalid = validateQualityOutline(draft, contextFor)
          if (invalid.ok) throw fail('QUALITY_PREPARATION_REUSE_INVALID')
          answer = await schemaRepair(QUALITY_OUTLINE_SYSTEM, input, invalid.errors, draft)
        } else {
          try {
            answer = await paid('plan', 'c1-outline', QUALITY_OUTLINE_SYSTEM, input, [], outlineLimits)
          } catch (error) {
            if (
              profile.initialSchemaRepair === false ||
              !['QUALITY_MODEL_JSON_INVALID', 'QUALITY_MODEL_TRUNCATED'].includes(error.code)
            )
              throw error
            answer = await schemaRepair(QUALITY_OUTLINE_SYSTEM, input, [error.code])
          }
        }
        checked = validateQualityOutline(answer, contextFor)
        if (!checked.ok && profile.initialSchemaRepair !== false && !schemaRepairUsed)
          checked = validateQualityOutline(
            await schemaRepair(QUALITY_OUTLINE_SYSTEM, input, checked.errors, answer),
            contextFor
          )
        if (!checked.ok) {
          await save('outline-invalid', checked)
          throw fail('QUALITY_OUTLINE_INVALID')
        }
        outline = checked.artifact
        batches = qualityFieldBatches({ outline, manifest, maxEstimatedTokens: 6000 })
        if (batches.length > maxFieldCalls) throw fail('QUALITY_FIELD_CALL_HEADROOM')
        const details = manifest.records.filter(
          (r) =>
            r.defaultLocale &&
            r.route &&
            !manifest.pages.some((p) => p.recordKeys.includes(r.key)) &&
            outline.records.some(
              (d) => d.key === r.key && ['planned', 'preserved-with-reason'].includes(d.state)
            )
        )
        if (details.length > profile.maxDetailPages) throw fail('QUALITY_REVIEW_ROUTE_HEADROOM')
        await save('outline', outline)
        await save(
          'call-schedule',
          qualityAttemptSchedule({
            batchCount: batches.length,
            observationBatches: observationBatches.length,
            reviewCalls,
            maxAttempts: run.policy.maxAttempts,
            executionProfile: run.input.executionProfile
          })
        )
      }
      batches ??= qualityFieldBatches({ outline, manifest, maxEstimatedTokens: 6000 })
      if (batches.length > maxFieldCalls) throw fail('QUALITY_FIELD_CALL_HEADROOM')
      await save('field-batches', batches)
      let plan = run.artifacts.plan
      if (!plan) {
        let results = []
        if (run.artifacts['field-draft-results']) {
          const original = run.artifacts['field-draft-results'],
            prepared = qualityFieldCorrectionBatches({
              outline,
              batches,
              results: original,
              ...contextFor,
              maxBatches: profile.maxFieldCorrections,
              preflight: (task) =>
                qualityCallBudget({
                  config: run.input.models.plan,
                  system: QUALITY_FIELD_CORRECTIONS_SYSTEM,
                  input: qualityExecutionInput(task, run.input.executionProfile),
                  ...fieldLimits
                })
            })
          await save('field-draft-plan', {
            state: 'draft',
            plan: prepared.draft.plan,
            errors: prepared.draft.errors
          })
          const held = run.artifacts['field-correction-batches']
          if (held && qualityHash(held) !== qualityHash(prepared.tasks))
            throw fail('QUALITY_FIELD_CORRECTION_CHANGED')
          if (!held) await save('field-correction-batches', prepared.tasks)
          results = structuredClone(original)
          for (const group of chunk(prepared.tasks, profile.fieldConcurrency ?? 1)) {
            const settled = await Promise.allSettled(
              group.map(async (task) => {
                const key = `field-corrections:${task.id}`
                let response = run.artifacts[key]
                if (!response) {
                  response = await paid(
                    'plan',
                    task.id,
                    QUALITY_FIELD_CORRECTIONS_SYSTEM,
                    task,
                    [],
                    fieldLimits
                  )
                  applyQualityFieldCorrections(original, task, response)
                  await save(key, response)
                }
                return response
              })
            )
            const rejected = settled.find((item) => item.status === 'rejected')
            if (rejected) throw rejected.reason
            for (const [index, item] of settled.entries())
              results = applyQualityFieldCorrections(results, group[index], item.value)
          }
          await save('corrected-field-results', results)
        } else {
          for (const group of chunk(batches, profile.fieldConcurrency ?? 1)) {
            const settled = await Promise.allSettled(
              group.map(async (batch) => {
                const input = qualityBatchInput(batch, { outline, dossier, manifest, observations })
                const spanIds = [
                  ...new Set(
                    outline.records
                      .filter((d) => batch.groups.some((g) => g.key === d.key))
                      .flatMap((d) => d.sourceSpanIds)
                  )
                ]
                input.dossier = qualityDossierModelView(dossier, { spanIds })
                if (profile.id === 'manual-review-v4')
                  input.publicationPolicy =
                    'The frozen source policy also applies to visible text inside images. Do not select an image advertising prices, discounts, promotions, reservation requirements or branch contacts unless those exact claims are supported and current in the dossier. An undated historical promotion is not current. If every allowed candidate fails this policy, use image with assetId null and explain the missing suitable image; never use an asset outside the locked intent.'
                let task = input
                try {
                  try {
                    // The full wire remains byte-identical whenever the actual paid preflight admits it.
                    return await paid('plan', batch.id, QUALITY_FIELDS_SYSTEM, task, [], fieldLimits)
                  } catch (error) {
                    if (error.code !== 'QUALITY_INPUT_LIMIT') throw error
                    task = qualityBatchModelView(input, { manifest })
                    // This repeats the real frozen-limit preflight before any attempt can be claimed.
                    try {
                      return await paid('plan', batch.id, QUALITY_FIELDS_SYSTEM, task, [], fieldLimits)
                    } catch (projectedError) {
                      if (projectedError.code !== 'QUALITY_INPUT_LIMIT') throw projectedError
                      task = qualityBatchModelView(input, { manifest, compactClaims: true })
                      return await paid('plan', batch.id, QUALITY_FIELDS_SYSTEM, task, [], fieldLimits)
                    }
                  }
                } catch (error) {
                  if (
                    profile.initialSchemaRepair === false ||
                    !['QUALITY_MODEL_JSON_INVALID', 'QUALITY_MODEL_TRUNCATED'].includes(error.code)
                  )
                    throw error
                  return schemaRepair(QUALITY_FIELDS_SYSTEM, task, [error.code])
                }
              })
            )
            const rejected = settled.find((result) => result.status === 'rejected')
            if (rejected) throw rejected.reason
            results.push(...settled.map((result) => result.value))
          }
        }
        const checked = mergeQualityBatches({ outline, batches, results, ...contextFor })
        if (!checked.ok) {
          await save('plan-invalid', checked.artifact)
          throw fail('QUALITY_PLAN_INVALID')
        }
        await save('planner-result', checked.plan)
        plan = await save('plan', checked.artifact)
        await save('plan-markdown', qualityPlanMarkdown(plan))
      }
      return {
        frozenHash: run.input.frozenHash,
        reference: {
          protocol: QUALITY_PROTOCOL,
          mode: run.input.mode,
          runId: run.id,
          intentId: run.intent_id,
          frozenHash: run.input.frozenHash,
          planHash: plan.hash,
          dossierHash: dossier.inputHash,
          manifestHash: manifest.hash,
          observationHash: observations.hash,
          state: 'validated',
          artifactsUrl: `/api/website-opportunities/quality/runs/${run.id}`,
          reviewUrl: `/website-opportunities/quality/runs/${run.id}`
        },
        markdown: qualityPlanMarkdown(plan)
      }
    }
    editorial.loadPrepared = async (identity) => (await prepared(identity))?.input.frozen
    return editorial
  }
  return { editorialFor, adopt, paidFor }
}
