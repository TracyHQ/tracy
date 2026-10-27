/** Compose the finite writer with independently inspected installation, pixels, media and audit doors. */

import { qualityAssetPixels } from './quality-assets.js'
import { qualityHash } from './quality-dossier.js'
import { openQualityEmdashClient } from './quality-emdash-client.js'
import {
  executeQualityPlan,
  qualityOperationStore,
  qualityReviewSnapshotRow,
  restoreQualityOperation
} from './quality-executor.js'
import { bindQualityInventory, bindQualityReferenceVisibility } from './quality-inventory.js'
import { prepareQualityPlacement, qualityDerivative, qualityImageSlots } from './quality-placement.js'
import { loadQualityPreparation } from './quality-preparation.js'
import { qualityRunStore } from './quality-runs.js'

const fail = (code) => Object.assign(new Error(code), { code })
const digest = /^[a-f0-9]{64}$/
const artifactHash = (value) => {
  const { hash: _hash, ...body } = value ?? {}
  return qualityHash(body)
}
const same = (a, b) => qualityHash(a) === qualityHash(b)

/** Repair keeps the first install's IDs and URL decisions. Current slugs are never treated as new seed identities. */
function inventoryForRepair({ inventory, initial, initialPlan, plan }) {
  if (!initial || initial.parentPlanHash !== initialPlan.hash || artifactHash(initial) !== initial.hash)
    throw fail('QUALITY_REPAIR_BINDING_MISSING')
  if (
    plan.records.some((r) => r.newSlug !== initialPlan.records.find((p) => p.key === r.key)?.newSlug) ||
    plan.operations
      .filter((o) => o.kind === 'term-update')
      .some(
        (o) =>
          o.fields.slug !==
          initialPlan.operations.find((p) => p.kind === 'term-update' && p.key === o.key)?.fields.slug
      )
  )
    throw fail('QUALITY_REPAIR_SLUG_CHANGED')
  const records = inventory.records.map((row) => {
    const binding = initial.installedCoverage.find((r) => r.id === row.id)
    if (!binding) return row
    const operation = initial.operations.find((o) => o.key === binding.key)
    const match = binding.key.match(/^([^/]+)\/(.+)@([^@]+)$/)
    if (
      !match ||
      row.collection !== match[1] ||
      row.locale !== match[3] ||
      ![match[2], operation?.newSlug].includes(row.slug)
    )
      throw fail('QUALITY_REPAIR_IDENTITY_CHANGED')
    return { ...row, slug: match[2] }
  })
  const terms = inventory.terms.map((row) => {
    const operation = initial.operations.find((o) => o.kind === 'term-update' && o.id === row.id)
    if (!operation) return row
    if (
      row.name !== operation.name ||
      row.locale !== operation.locale ||
      ![operation.slug, operation.fields.slug].includes(row.slug)
    )
      throw fail('QUALITY_REPAIR_IDENTITY_CHANGED')
    return { ...row, slug: operation.slug }
  })
  return { ...inventory, records, terms }
}

/** Catalog/create pins are insufficient. These hashes are read from the installed app and checked against release bytes. */
export function assertQualityInstallation({ run, build, inspection, evidence }) {
  const release = run.input.manifest.release,
    installed = inspection?.installation,
    expected = evidence?.template
  if (
    !build.site_key ||
    build.account_id !== run.account_id ||
    build.revision_id !== run.revision_id ||
    inspection?.accountId !== run.account_id ||
    inspection?.siteKey !== build.site_key ||
    inspection?.platform !== 'emdash' ||
    inspection?.release?.tag !== release.tag ||
    inspection.release.version !== release.version ||
    inspection.release.archiveSha256 !== release.archiveSha256 ||
    installed?.archiveSha256 !== release.archiveSha256 ||
    installed?.seedSha256 !== release.seedSha256 ||
    expected?.tag !== release.tag ||
    expected?.version !== release.version ||
    expected?.archiveSha256 !== release.archiveSha256 ||
    expected?.seedSha256 !== release.seedSha256
  )
    throw fail('QUALITY_INSTALLED_RELEASE_MISMATCH')
  for (const key of ['artifactHash', 'sourceFilesHash', 'rendererHash', 'compiledRuntimeHash'])
    if (!digest.test(installed[key] ?? '') || installed[key] !== expected[key])
      throw fail('QUALITY_INSTALLED_SOURCE_MISMATCH')
  if (
    inspection.imageId !== evidence.imageId ||
    inspection.cmsCommit !== evidence.cmsCommit ||
    inspection.backend !== 'node-sqlite' ||
    evidence.state !== 'passed'
  )
    throw fail('QUALITY_CMS_IMAGE_UNVERIFIED')
  return { ...inspection, release: { ...release }, proofHash: qualityHash({ inspection, evidence }) }
}

/** Native image fields take a local media reference, not a URL string or an invented item ID. */
export function qualityUploadedMediaValue(receipt, placement) {
  if (!receipt?.id || typeof receipt.url !== 'string') throw fail('QUALITY_MEDIA_RECEIPT_INVALID')
  let pathname
  try {
    pathname = new URL(receipt.url, 'https://site.invalid').pathname
  } catch {
    throw fail('QUALITY_MEDIA_RECEIPT_INVALID')
  }
  const prefix = '/_emdash/api/media/file/'
  if (!pathname.startsWith(prefix)) throw fail('QUALITY_MEDIA_RECEIPT_INVALID')
  let storageKey
  try {
    storageKey = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    throw fail('QUALITY_MEDIA_RECEIPT_INVALID')
  }
  if (
    !storageKey ||
    storageKey.split('/').some((p) => !p || p === '.' || p === '..') ||
    storageKey.includes('\\') ||
    [...storageKey].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)
  )
    throw fail('QUALITY_MEDIA_RECEIPT_INVALID')
  return {
    id: receipt.id,
    provider: 'local',
    meta: { storageKey },
    alt: placement.alt,
    width: placement.width,
    height: placement.height,
    mimeType: 'image/webp'
  }
}

/** The same deterministic finite snapshot can be used by capture/review to reject stale screenshots. */
export async function qualityFillContentSnapshot({ cms, plan, checkAllowed, operationConcurrency = 1 }) {
  if (!Number.isInteger(operationConcurrency) || operationConcurrency < 1 || operationConcurrency > 8)
    throw fail('QUALITY_SNAPSHOT_CONCURRENCY')
  const content = []
  for (let offset = 0; offset < plan.operations.length; offset += operationConcurrency) {
    const results = await Promise.allSettled(
      plan.operations.slice(offset, offset + operationConcurrency).map(async (operation) => {
        await checkAllowed()
        const actual = await cms.read(operation)
        return qualityReviewSnapshotRow(operation, actual)
      })
    )
    const rejected = results.find((result) => result.status === 'rejected')
    if (rejected) throw rejected.reason
    content.push(...results.map((result) => result.value))
  }
  return { content, hash: qualityHash(content) }
}

/** Cross-domain functions are injected by the composition root; no opportunities → sites import or secret store. */
export function createQualityFill({
  pool,
  objects,
  evidence,
  inspectSite,
  readInventory,
  apiFor,
  measureSlots,
  uploadMedia,
  readMedia,
  recordChange,
  verifyFinal = async () => {},
  operationConcurrency = 1,
  readPixels = qualityAssetPixels,
  derivative = qualityDerivative,
  openCms = openQualityEmdashClient,
  loadRun = (identity) => loadQualityPreparation(pool, identity),
  runStore = qualityRunStore({ pool }),
  operationStore = qualityOperationStore(pool)
}) {
  if (
    ![inspectSite, readInventory, apiFor, measureSlots, uploadMedia, readMedia, recordChange].every(
      (f) => typeof f === 'function'
    ) ||
    !evidence ||
    !Number.isInteger(operationConcurrency) ||
    operationConcurrency < 1 ||
    operationConcurrency > 8
  )
    throw fail('QUALITY_FILL_DEPENDENCIES')

  async function contextOf(context) {
    const { action, revision, build, checkAllowed } = context
    const allowed = async () => {
      if ((await checkAllowed()) !== 'apply') throw fail('QUALITY_APPLY_DISABLED')
    }
    await allowed()
    const run = await loadRun({
      accountId: action.account_id,
      opportunityId: action.opportunity_id,
      revisionId: revision.id
    })
    if (
      !run ||
      run.input.mode !== 'apply' ||
      run.revision_id !== revision.id ||
      revision.brief?.editorial?.runId !== run.id ||
      revision.brief.editorial.planHash !== run.artifacts.plan?.hash ||
      revision.brief.editorial.frozenHash !== run.input.frozenHash ||
      action.revision_id !== revision.id ||
      build.revision_id !== revision.id ||
      action.account_id !== build.account_id ||
      action.build_request_id !== build.request_id ||
      build.state !== 'done'
    )
      throw fail('QUALITY_FILL_SCOPE')
    for (const value of [
      run.artifacts.plan,
      run.artifacts.outline,
      run.artifacts.observations,
      run.input.manifest,
      run.input.assets
    ])
      if (!value?.hash || artifactHash(value) !== value.hash) throw fail('QUALITY_FILL_ARTIFACT_CHANGED')
    const inspection = await inspectSite({ ...context, run, forceFull: true })
    const site = assertQualityInstallation({ run, build, inspection, evidence })
    const cms = await openCms({
      api: await apiFor({ ...context, run, site }),
      manifest: run.input.manifest,
      inspection,
      evidence
    })
    const assertInstalled = async ({ forceFull = false } = {}) => {
      await allowed()
      const current = await inspectSite({ ...context, run, forceFull })
      assertQualityInstallation({ run, build, inspection: current, evidence })
      if (qualityHash(current) !== qualityHash(inspection)) throw fail('QUALITY_INSTALLED_RUNTIME_CHANGED')
    }
    const save = async (key, value) => {
      await runStore.artifact(run.id, run.account_id, key, value)
      run.artifacts[key] = value
      return value
    }
    const audit = async (row) => {
      await recordChange({
        ...context,
        run,
        site,
        ...row,
        genericUndo: false,
        undoReason: 'NO_UNDO_ON_EMDASH',
        compensatingRestore: true,
        idempotencyKey: `${row.id}:${row.restore ? 'restore' : 'write'}`
      })
    }
    return { run, site, cms, save, allowed, assertInstalled, audit }
  }

  async function prepareMedia(context, state, plan, placement, artifactPrefix) {
    const { run, site, save, assertInstalled } = state
    const uploads = []
    for (const p of placement.placements.filter((p) => p.assetId !== null)) {
      await assertInstalled()
      // Even a resumed upload rechecks revocation and the original bytes before using its reference.
      const images = await readPixels({
        pool,
        objects,
        frozen: run.input.frozen,
        assets: run.input.assets,
        ids: [p.assetId]
      })
      const image = images[0],
        asset = run.input.assets.selected.find((a) => a.id === p.assetId)
      if (
        image?.id !== p.assetId ||
        image.sha256 !== asset?.sha256 ||
        !/^data:image\/(?:jpeg|png|webp);base64,/.test(image.dataUrl ?? '')
      )
        throw fail('QUALITY_ASSET_REVOKED')
      const bytes = Buffer.from(image.dataUrl.slice(image.dataUrl.indexOf(',') + 1), 'base64')
      const shaped = await derivative({
        bytes,
        asset,
        placement: p,
        accountId: run.account_id,
        siteKey: site.siteKey,
        planHash: plan.hash
      })
      const operation = {
        kind: 'media-upload',
        slotId: p.slotId,
        assetId: p.assetId,
        derivativeHash: shaped.hash,
        filename: shaped.filename,
        sha256: shaped.sha256
      }
      const id = qualityHash({ runId: run.id, buildId: context.build.id, planHash: plan.hash, operation })
      const applyId = `wo-quality-${id.slice(0, 40)}`
      let row = await operationStore.get(id, run.account_id)
      if (!row)
        row = await operationStore.intent({
          id,
          runId: run.id,
          accountId: run.account_id,
          buildId: context.build.id,
          siteKey: site.siteKey,
          planHash: plan.hash,
          operation,
          before: { media: null },
          after: { sha256: shaped.sha256, applyId }
        })
      if (!same(row.operation, operation)) throw fail('QUALITY_MEDIA_SCOPE')
      let receipt = row.receipt?.media ?? null
      if (row.state !== 'pending') {
        const found = await readMedia({
          ...context,
          run,
          site,
          applyId,
          operationId: id,
          expected: { sha256: shaped.sha256, id: receipt?.id ?? null, url: receipt?.url ?? null }
        })
        if (
          found?.state !== 'owned' ||
          found.applyId !== applyId ||
          found.sha256 !== shaped.sha256 ||
          (receipt && (receipt.id !== found.id || receipt.url !== found.url))
        )
          throw fail('QUALITY_MEDIA_UNCERTAIN')
        receipt = { id: found.id, url: found.url, sha256: shaped.sha256, applyId }
      } else {
        await assertInstalled()
        await operationStore.record(id, run.account_id, 'sending', {
          applyId,
          derivative: shaped.binding,
          genericUndo: false
        })
        let sent
        try {
          sent = await uploadMedia({
            ...context,
            run,
            site,
            applyId,
            operationId: id,
            filename: shaped.filename,
            bytes: shaped.bytes,
            mime: shaped.mime,
            sha256: shaped.sha256,
            alt: p.alt
          })
          if (sent?.ok !== true || !sent.id || !sent.url) throw fail('QUALITY_MEDIA_UNCERTAIN')
          receipt = { id: sent.id, url: sent.url, sha256: shaped.sha256, applyId }
          await operationStore.record(id, run.account_id, 'uploaded', {
            media: receipt,
            genericUndo: false,
            compensatingRestore: false
          })
        } catch (error) {
          await operationStore.record(id, run.account_id, 'uncertain', {
            error: error.code ?? 'QUALITY_MEDIA_UNCERTAIN',
            genericUndo: false,
            compensatingRestore: false
          })
          throw error
        }
      }
      const value = qualityUploadedMediaValue(receipt, p)
      const observed = await readMedia({ ...context, run, site, applyId, operationId: id, expected: receipt })
      if (
        observed?.state !== 'owned' ||
        observed.applyId !== applyId ||
        observed.sha256 !== receipt.sha256 ||
        observed.id !== receipt.id ||
        observed.url !== receipt.url
      )
        throw fail('QUALITY_MEDIA_READBACK_MISMATCH')
      await operationStore.record(id, run.account_id, 'uploaded', {
        media: receipt,
        genericUndo: false,
        readbackHash: qualityHash(observed)
      })
      uploads.push({
        slotId: p.slotId,
        operationId: id,
        assetId: p.assetId,
        derivative: shaped.binding,
        media: receipt,
        value
      })
    }
    const artifact = {
      schemaVersion: 'tracy-wo-quality-media/v1',
      policyVersion: run.input.policyVersion,
      inputHash: run.input_hash,
      runId: run.id,
      accountId: run.account_id,
      buildId: context.build.id,
      planHash: plan.hash,
      placementHash: placement.hash,
      uploads,
      genericUndo: false,
      restorePolicy: 'Conditional content compensation removes references; uploaded media is retained.'
    }
    return save(`${artifactPrefix}:media`, { ...artifact, hash: qualityHash(artifact) })
  }

  async function applyPlan(
    context,
    { plan = null, version = 'initial', basePlan = null, baseContentHash = null, baseContent = null } = {}
  ) {
    if (!/^(?:initial|repair-[12])$/.test(version)) throw fail('QUALITY_FILL_VERSION')
    const state = await contextOf(context),
      { run, cms, site, save, assertInstalled, audit } = state
    plan ??= run.artifacts.plan
    if (
      plan.validation?.state !== 'validated' ||
      artifactHash(plan) !== plan.hash ||
      plan.operations.some((o) => Object.hasOwn(o, 'currentSlug')) ||
      plan.manifestHash !== run.input.manifest.hash ||
      plan.observationHash !== run.artifacts.observations.hash ||
      (version === 'initial'
        ? plan.hash !== run.artifacts.plan.hash
        : plan.parentPlanHash !== run.artifacts.plan.hash)
    )
      throw fail('QUALITY_FILL_PLAN_SCOPE')
    const prefix = `fill:${context.build.id}:${version}`
    let expectedReview = null
    if (version !== 'initial') {
      if (
        !basePlan ||
        artifactHash(basePlan) !== basePlan.hash ||
        (basePlan.hash !== run.artifacts.plan.hash && basePlan.parentPlanHash !== run.artifacts.plan.hash) ||
        !digest.test(baseContentHash ?? '') ||
        !Array.isArray(baseContent) ||
        qualityHash(baseContent) !== baseContentHash
      )
        throw fail('QUALITY_REPAIR_SNAPSHOT_INVALID')
      const previous = Object.entries(run.artifacts).find(
        ([key, value]) =>
          key.startsWith(`fill:${context.build.id}:`) &&
          key.endsWith(':execution-plan') &&
          value.parentPlanHash === basePlan.hash &&
          artifactHash(value) === value.hash
      )?.[1]
      const keys = (operations) => operations.map((o) => [o.key ?? `menu:${o.name}@${o.locale}`, o.id])
      if (
        !previous ||
        !same(
          keys(previous.operations),
          baseContent.map((row) => [row.key, row.id])
        )
      )
        throw fail('QUALITY_REPAIR_SNAPSHOT_SCOPE')
      expectedReview = { content: baseContent, hash: baseContentHash }
      await save(`${prefix}:review-precondition`, {
        basePlanHash: basePlan.hash,
        contentHash: baseContentHash,
        content: baseContent
      })
    }
    await save(`${prefix}:installation`, {
      schemaVersion: 'tracy-wo-quality-installation/v1',
      policyVersion: run.input.policyVersion,
      inputHash: run.input_hash,
      accountId: run.account_id,
      proofHash: site.proofHash,
      inspection: site
    })
    let bound = run.artifacts[`${prefix}:bound`]
    if (!bound) {
      let inventory = await readInventory({ ...context, run, site, cms })
      if (version !== 'initial')
        inventory = inventoryForRepair({
          inventory,
          initial: run.artifacts[`fill:${context.build.id}:initial:bound`],
          initialPlan: run.artifacts.plan,
          plan
        })
      const binding = bindQualityInventory({ plan, manifest: run.input.manifest, inventory })
      if (version !== 'initial') {
        const initial = run.artifacts[`fill:${context.build.id}:initial:bound`]
        const key = (o) => o.key ?? `menu:${o.name}@${o.locale}`
        if (
          binding.operations.some(
            (operation) =>
              !initial.operations.some(
                (first) =>
                  key(first) === key(operation) && first.id === operation.id && first.kind === operation.kind
              )
          )
        )
          throw fail('QUALITY_REPAIR_IDENTITY_CHANGED')
        binding.operations = initial.operations.map((first) => {
          let operation = binding.operations.find((o) => key(o) === key(first))
          // Already-unpublished members stay in the reviewed finite set; their IDs never rebase.
          if (
            !operation &&
            first.kind === 'unpublish' &&
            inventory.records.some((row) => row.id === first.id)
          )
            operation = first
          if (!operation || operation.id !== first.id) throw fail('QUALITY_REPAIR_IDENTITY_CHANGED')
          return first.newSlug ? { ...operation, currentSlug: first.newSlug } : operation
        })
        delete binding.hash
        binding.hash = qualityHash(binding)
      }
      bound = await save(`${prefix}:bound`, binding)
    } else if (bound.parentPlanHash !== plan.hash || artifactHash(bound) !== bound.hash)
      throw fail('QUALITY_FILL_BINDING_CHANGED')
    const referenceKey = `${prefix}:reference-binding:v1`
    if (cms.referenceSchema) {
      const derived = await bindQualityReferenceVisibility({
        bound,
        plan,
        manifest: run.input.manifest,
        readSchema: (operation) => cms.referenceSchema(operation)
      })
      if (derived !== bound) {
        const held = run.artifacts[referenceKey]
        if (held && !same(held, derived)) throw fail('QUALITY_REFERENCE_POLICY_CHANGED')
        bound = held ?? (await save(referenceKey, derived))
      }
    }
    const referencePolicy = bound.referenceVisibility
      ? {
          hash: qualityHash(bound.referenceVisibility),
          policies: bound.referenceVisibility.bindings.map(({ key, ...policy }) => ({
            recordKey: key,
            ...policy
          }))
        }
      : null
    let placement = run.artifacts[`${prefix}:placement`]
    if (!placement) {
      const slots = qualityImageSlots({ plan, outline: run.artifacts.outline, manifest: run.input.manifest })
      const measured = await measureSlots({
        ...context,
        run,
        site,
        plan,
        slots,
        executionBinding: bound,
        referencePolicy,
        checkAllowed: state.allowed
      })
      placement = prepareQualityPlacement({
        run,
        plan,
        outline: run.artifacts.outline,
        manifest: run.input.manifest,
        assets: run.input.assets,
        observations: run.artifacts.observations,
        measured,
        referencePolicy,
        rendererHash: site.installation.rendererHash
      })
      await save(`${prefix}:measurement`, measured)
      await save(`${prefix}:placement`, placement)
    } else if (placement.planHash !== plan.hash || artifactHash(placement) !== placement.hash)
      throw fail('QUALITY_FILL_PLACEMENT_CHANGED')
    const media = await prepareMedia(context, state, plan, placement, prefix)
    const execution = {
      ...bound,
      parentPlanHash: plan.hash,
      placementHash: placement.hash,
      mediaHash: media.hash,
      ...(expectedReview ? { baseContentHash: expectedReview.hash } : {}),
      operations: bound.operations.map((o) => {
        if (o.kind !== 'update') return o
        const imageValues = Object.fromEntries(
          placement.placements
            .filter((p) => placement.slots.find((s) => s.id === p.slotId)?.recordKey === o.key)
            .map((p) => [
              placement.slots.find((s) => s.id === p.slotId).field,
              p.assetId === null ? null : media.uploads.find((u) => u.slotId === p.slotId).value
            ])
        )
        return { ...o, fields: { ...o.fields, ...imageValues } }
      })
    }
    delete execution.hash
    execution.hash = qualityHash(execution)
    const executionKey = bound.referenceVisibility
      ? `${prefix}:relation-policy-v1:execution-plan`
      : `${prefix}:execution-plan`
    const heldExecution = run.artifacts[executionKey]
    if (heldExecution && !same(heldExecution, execution)) throw fail('QUALITY_FILL_BINDING_CHANGED')
    if (!heldExecution) await save(executionKey, execution)
    await assertInstalled()
    const answer = await executeQualityPlan({
      run,
      plan: execution,
      site,
      buildId: context.build.id,
      cms,
      store: operationStore,
      checkAllowed: assertInstalled,
      audit,
      expectedReview,
      operationConcurrency
    })
    const snapshot = await qualityFillContentSnapshot({
      cms,
      plan: execution,
      checkAllowed: assertInstalled,
      operationConcurrency
    })
    const referenceVisibility = []
    for (const binding of bound.referenceVisibility?.bindings ?? []) {
      const source = snapshot.content.find((row) => row.key === binding.key),
        targetOperation = plan.operations.find(
          (operation) => operation.kind === 'unpublish' && operation.key === binding.targetKey
        )
      if (
        !source ||
        !targetOperation ||
        qualityHash(source.references?.[binding.field]?.map((entry) => entry.id)) !==
          qualityHash([binding.targetId])
      )
        throw fail('QUALITY_REFERENCE_POLICY_READBACK')
      await assertInstalled()
      const target = await cms.read({ ...targetOperation, id: binding.targetId })
      if (target.id !== binding.targetId || target.status !== 'draft' || target.draft)
        throw fail('QUALITY_REFERENCE_POLICY_READBACK')
      referenceVisibility.push({
        ...binding,
        graph: 'preserved',
        targetStatus: target.status,
        targetRevision: target.revision,
        publicAbsence: 'requires-public-render-readback'
      })
    }
    const receipts = answer.receipts.map(({ id, state: operationState, actualRevision, undoable }) => ({
      id,
      state: operationState,
      ...(actualRevision ? { actualRevision } : {}),
      undoable
    }))
    await assertInstalled({ forceFull: true })
    await verifyFinal(context)
    const receipt = {
      schemaVersion: 'tracy-wo-quality-fill/v1',
      policyVersion: run.input.policyVersion,
      inputHash: run.input_hash,
      accountId: run.account_id,
      state: 'succeeded',
      runId: run.id,
      buildId: context.build.id,
      planHash: plan.hash,
      executionPlanHash: execution.hash,
      placementHash: placement.hash,
      contentHash: snapshot.hash,
      ...(answer.executionOptions ? { executionOptions: answer.executionOptions } : {}),
      receipts,
      ...(referenceVisibility.length
        ? {
            referenceVisibility: {
              bindingHash: bound.hash,
              policy: 'hidden-by-unpublished-target',
              graphCleared: false,
              bindings: referenceVisibility
            }
          }
        : {}),
      genericUndo: false,
      undoReason: 'NO_UNDO_ON_EMDASH',
      compensatingRestore: true
    }
    await save(`${prefix}:receipt`, receipt)
    return receipt
  }

  async function restore(context, { operationId }) {
    const state = await contextOf(context)
    const row = await operationStore.get(operationId, state.run.account_id)
    if (
      !row ||
      row.run_id !== state.run.id ||
      row.build_id !== context.build.id ||
      row.site_key !== state.site.siteKey ||
      row.operation.kind === 'media-upload'
    )
      throw fail('QUALITY_RESTORE_SCOPE')
    return restoreQualityOperation({
      id: operationId,
      accountId: state.run.account_id,
      cms: state.cms,
      store: operationStore,
      checkAllowed: state.assertInstalled,
      audit: state.audit
    })
  }
  return { fill: (context) => applyPlan(context), applyPlan, restore }
}
