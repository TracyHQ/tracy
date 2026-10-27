/** Finite CMS operations require a tested conditional API; a lease is not CAS. */
import { qualityHash } from './quality-dossier.js'

const err = (code) => Object.assign(new Error(code), { code })
const equivalent = (a, b) => qualityHash(a) === qualityHash(b)
const rowUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const semanticRows = (value, arrayRow = false) => {
  if (Array.isArray(value)) return value.map((row) => semanticRows(row, true))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, value]) =>
            !(arrayRow && key === '_rowId' && typeof value === 'string' && rowUuid.test(value))
        )
        .map(([key, value]) => [key, semanticRows(value)])
    )
  return value
}
// Native repeater row UUIDs may change during publication; content, ordering and every other key remain exact.
const clean = (data) =>
  semanticRows(Object.fromEntries(Object.entries(data ?? {}).filter(([, value]) => value != null)))
// Native local-media reads enrich uploaded references with presentation metadata.
// Compare only documented null enrichment and the generated upload filename;
// identity, storage key, dimensions, alt text and all other fields remain exact.
const mediaReadback = (actual, target) => {
  if (Array.isArray(actual))
    return actual.map((value, index) =>
      mediaReadback(value, Array.isArray(target) ? target[index] : undefined)
    )
  if (!actual || typeof actual !== 'object') return actual
  const expectedLocalImage =
    target?.provider === 'local' &&
    typeof target.id === 'string' &&
    typeof target.meta?.storageKey === 'string' &&
    typeof target.alt === 'string' &&
    Number.isInteger(target.width) &&
    Number.isInteger(target.height) &&
    target.mimeType === 'image/webp' &&
    actual.provider === target.provider &&
    actual.id === target.id &&
    actual.meta?.storageKey === target.meta.storageKey
  return Object.fromEntries(
    Object.entries(actual).flatMap(([key, value]) => {
      if (
        expectedLocalImage &&
        key === 'filename' &&
        !Object.hasOwn(target, key) &&
        typeof value === 'string' &&
        /^wo-quality-[a-f0-9]{40}\.webp$/.test(value)
      )
        return []
      if (expectedLocalImage && key === 'meta' && value && typeof value === 'object')
        return [
          [
            key,
            Object.fromEntries(
              Object.entries(value).filter(
                ([metaKey, metaValue]) =>
                  !(
                    metaValue === null &&
                    ['caption', 'blurhash', 'dominantColor'].includes(metaKey) &&
                    !Object.hasOwn(target.meta, metaKey)
                  )
              )
            )
          ]
        ]
      return [[key, mediaReadback(value, target?.[key])]]
    })
  )
}
const shape = (read, target) => ({
  data: clean(target ? mediaReadback(read.data, target.data) : read.data),
  status: read.status,
  ...(read.slug !== undefined ? { slug: read.slug } : {}),
  ...(read.references ? { references: read.references } : {})
})

/** Review fences include revisions and drafts; matching visible text alone cannot authorize a repair. */
export const qualityReviewSnapshotRow = (operation, actual) => ({
  key: operation.key ?? `menu:${operation.name}@${operation.locale}`,
  id: actual.id,
  revision: actual.revision,
  slug: actual.slug ?? null,
  data: actual.data,
  status: actual.status,
  draft: actual.draft ?? null,
  references: actual.references ?? null
})

export function requireQualityCms(cms) {
  if (
    cms?.capabilities?.conditionalContentWrite !== true ||
    cms.capabilities.conditionalPublish !== true ||
    cms.capabilities.conditionalUnpublish !== true ||
    cms.capabilities.conditionalDiscardDraft !== true ||
    !cms.capabilities.evidenceHash
  )
    throw err('QUALITY_CONDITIONAL_CMS_UNAVAILABLE')
}

export function qualityOperationStore(pool) {
  return {
    async intent(row) {
      const value = [
        row.id,
        row.runId,
        row.accountId,
        row.buildId,
        row.siteKey,
        row.planHash,
        JSON.stringify(row.operation),
        JSON.stringify(row.before),
        JSON.stringify(row.after)
      ]
      const inserted = await pool.query(
        `insert into wo_quality_operation
        (id,run_id,account_id,build_id,site_key,plan_hash,operation,before_image,after_image)
        values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb) on conflict(id) do nothing returning *`,
        value
      )
      const held =
        inserted.rows[0] ??
        (
          await pool.query('select * from wo_quality_operation where id=$1 and account_id=$2', [
            row.id,
            row.accountId
          ])
        ).rows[0]
      if (
        !held ||
        held.site_key !== row.siteKey ||
        held.run_id !== row.runId ||
        held.build_id !== row.buildId ||
        held.plan_hash !== row.planHash ||
        !equivalent(held.operation, row.operation)
      )
        throw err('QUALITY_OPERATION_SCOPE')
      return held
    },
    async get(id, accountId) {
      return (
        (
          await pool.query('select * from wo_quality_operation where id=$1 and account_id=$2', [
            id,
            accountId
          ])
        ).rows[0] ?? null
      )
    },
    async record(id, accountId, state, receipt) {
      const { rowCount } = await pool.query(
        `update wo_quality_operation set state=$3,receipt=receipt||$4::jsonb,updated_at=now() where id=$1 and account_id=$2`,
        [id, accountId, state, JSON.stringify(receipt)]
      )
      if (rowCount !== 1) throw err('QUALITY_OPERATION_SCOPE')
    }
  }
}

/** A response revision belongs to its commit. A later GET cannot grant ownership of that write. */
function mutationRevision(result) {
  if (!result?.revision) throw err('QUALITY_MUTATION_RECEIPT_MISSING')
  return result.revision
}
const intentId = (run, buildId, plan, operation) =>
  qualityHash({ run: run.id, buildId, plan: plan.hash, operation })
const matches = (actual, target, operation) =>
  equivalent(shape(actual, target), shape(target)) &&
  (operation.kind === 'unpublish'
    ? !actual.draft || equivalent(clean(mediaReadback(actual.draft.data, target.data)), clean(target.data))
    : !actual.draft)
const publishedShape = (row) => ({
  ...row.after_image,
  ...(row.before_image.slug !== undefined ? { slug: row.before_image.slug } : {})
})
const ownsPublished = (row, actual) =>
  row.operation.kind === 'update' &&
  row.operation.newSlug &&
  actual.revision === row.receipt?.publishRevision &&
  !actual.draft &&
  equivalent(shape(actual, publishedShape(row)), shape(publishedShape(row)))

/** All targets are inspected before the first CMS mutation, including targets later in the plan. */
export async function executeQualityPlan({
  run,
  plan,
  site,
  buildId,
  cms,
  store,
  checkAllowed,
  audit,
  expectedReview = null,
  operationConcurrency = 1
}) {
  requireQualityCms(cms)
  if (
    plan?.validation?.state !== 'validated' ||
    run.account_id !== site.accountId ||
    site.platform !== 'emdash' ||
    !Number.isInteger(operationConcurrency) ||
    operationConcurrency < 1 ||
    operationConcurrency > 8
  )
    throw err('QUALITY_EXECUTION_SCOPE')
  if (
    site.release.tag !== run.input.manifest.release.tag ||
    site.release.version !== run.input.manifest.release.version ||
    site.release.archiveSha256 !== run.input.manifest.release.archiveSha256
  )
    throw err('QUALITY_INSTALLED_RELEASE_MISMATCH')
  if (
    plan.operations.some(
      (o) =>
        !['update', 'unpublish', 'menu-update', 'term-update'].includes(o.kind) ||
        (o.kind === 'menu-update' && !cms.capabilities.conditionalMenuSnapshot) ||
        (o.kind === 'term-update' && !cms.capabilities.conditionalTermMetadata) ||
        (o.newSlug && !cms.capabilities.conditionalSlugRename)
    )
  )
    throw err('QUALITY_OPERATION_CAPABILITY_UNAVAILABLE')
  for (const operation of plan.operations)
    for (const policy of operation.referenceVisibility ?? [])
      if (
        policy.mode !== 'hidden-by-unpublished-target' ||
        Object.hasOwn(operation.fields ?? {}, policy.field) ||
        !equivalent(operation.expectedReferences?.[policy.field], [policy.targetId]) ||
        (!plan.operations.some(
          (target) =>
            target.kind === 'unpublish' && target.key === policy.targetKey && target.id === policy.targetId
        ) &&
          !plan.installedCoverage?.some(
            (target) =>
              target.key === policy.targetKey &&
              target.id === policy.targetId &&
              target.state === 'unpublished'
          ))
      )
        throw err('QUALITY_REFERENCE_POLICY_SCOPE')
  let reviewRows
  if (expectedReview !== null) {
    const content = expectedReview.content
    if (!Array.isArray(content) || qualityHash(content) !== expectedReview.hash)
      throw err('QUALITY_REPAIR_SNAPSHOT_INVALID')
    reviewRows = new Map(content.map((row) => [row.key, row]))
    if (
      reviewRows.size !== content.length ||
      content.length !== plan.operations.length ||
      plan.operations.some((operation) => {
        const row = reviewRows.get(qualityReviewSnapshotRow(operation, {}).key)
        return !row?.id || !row.revision || row.id !== operation.id
      })
    )
      throw err('QUALITY_REPAIR_SNAPSHOT_SCOPE')
  }
  const assertReviewed = (operation, before) => {
    if (
      reviewRows &&
      !equivalent(
        qualityReviewSnapshotRow(operation, before),
        reviewRows.get(qualityReviewSnapshotRow(operation, {}).key)
      )
    )
      throw err('QUALITY_REPAIR_CONTENT_CONFLICT')
  }
  const drain = async (items, perform) => {
    const results = await Promise.allSettled(items.map(perform)),
      rejected = results.find((result) => result.status === 'rejected')
    if (rejected) throw rejected.reason
    return results.map((result) => result.value)
  }
  const prepare = async (operation) => {
    await checkAllowed()
    const id = intentId(run, buildId, plan, operation)
    let row = await store.get(id, run.account_id)
    if (!row) {
      const before = await cms.read(operation, { referenceState: 'before' })
      if (!before.revision) throw err('QUALITY_REVISION_MISSING')
      assertReviewed(operation, before)
      const after =
        cms.intendedAfter?.(operation, before) ??
        (operation.kind === 'menu-update'
          ? { data: { label: before.data.label, items: operation.items }, status: 'published' }
          : {
              data: { ...before.data, ...operation.fields },
              status: operation.kind === 'unpublish' ? 'draft' : 'published',
              ...(before.slug !== undefined ? { slug: operation.newSlug ?? before.slug } : {}),
              ...(before.references
                ? {
                    references: Object.fromEntries(
                      Object.entries(before.references).map(([key, values]) => [
                        key,
                        operation.fields?.[key] === null &&
                        operation.expectedReferencesAfter?.[key]?.length === 0
                          ? []
                          : values
                      ])
                    )
                  }
                : {})
            })
      const unchanged = matches(before, after, operation)
      if (
        !unchanged &&
        !['menu-update', 'term-update'].includes(operation.kind) &&
        (before.status !== 'published' || before.draft || before.scheduledAt || !before.publishedAt)
      )
        throw err('QUALITY_INITIAL_STATE_UNSUPPORTED')
      await cms.preflight?.(operation, before, after)
      row = await store.intent({
        id,
        runId: run.id,
        accountId: run.account_id,
        buildId,
        siteKey: site.siteKey,
        planHash: plan.hash,
        operation: { ...operation, id: before.id ?? operation.id },
        before,
        after
      })
      // A concurrently persisted intent must carry the same reviewed before-image as this caller.
      assertReviewed(row.operation, row.before_image)
    } else {
      const actual = await cms.read(row.operation),
        before = row.before_image,
        after = row.after_image
      assertReviewed(row.operation, before)
      const ownAfter =
        actual.revision === row.receipt?.actualRevision && matches(actual, after, row.operation)
      const ownDraft =
        row.operation.kind === 'update' &&
        actual.draft &&
        actual.revision === row.receipt?.draftRevision &&
        equivalent(shape(actual), shape(before)) &&
        equivalent(clean(actual.draft.data), clean(after.data))
      const original =
        actual.revision === before.revision &&
        equivalent(shape(actual), shape(before)) &&
        equivalent(actual.draft ?? null, before.draft ?? null)
      if (!ownAfter && !ownDraft && !original && !ownsPublished(row, actual)) {
        const converged = matches(actual, after, row.operation)
        await store.record(id, run.account_id, converged ? 'converged' : 'conflict', {
          observedRevision: actual.revision,
          undoable: false
        })
        throw err(converged ? 'QUALITY_MUTATION_UNCERTAIN' : 'QUALITY_CONTENT_CONFLICT')
      }
      await cms.preflight?.(row.operation, before, after)
    }
    return row
  }
  const rows = []
  for (let offset = 0; offset < plan.operations.length; offset += operationConcurrency)
    rows.push(...(await drain(plan.operations.slice(offset, offset + operationConcurrency), prepare)))
  const apply = async (row) => {
    await checkAllowed()
    const id = row.id,
      operation = row.operation,
      before = row.before_image,
      after = row.after_image
    let actual = await cms.read(operation)
    if (matches(actual, after, operation)) {
      if (row.receipt?.actualRevision === actual.revision) {
        const receipt = { ...row.receipt, reconciled: true, undoable: true }
        await audit({ id, operation, before, after, receipt })
        await store.record(id, run.account_id, 'written', receipt)
        return { id, state: 'written', ...receipt }
      }
      if (actual.revision === before.revision && matches(before, after, operation)) {
        await store.record(id, run.account_id, 'unchanged', { undoable: false })
        return { id, state: 'unchanged', undoable: false }
      }
      await store.record(id, run.account_id, 'converged', {
        observedRevision: actual.revision,
        undoable: false
      })
      throw err('QUALITY_MUTATION_UNCERTAIN')
    }
    const ownDraft =
      operation.kind === 'update' &&
      actual.draft &&
      equivalent(clean(actual.draft.data), clean(after.data)) &&
      row.receipt?.draftRevision === actual.revision
    const ownPublished = ownsPublished(row, actual)
    if (
      !ownDraft &&
      !ownPublished &&
      (!equivalent(shape(actual), shape(before)) || actual.revision !== before.revision)
    ) {
      await store.record(id, run.account_id, 'conflict', { actualHash: qualityHash(shape(actual)) })
      throw err('QUALITY_CONTENT_CONFLICT')
    }
    await checkAllowed()
    await store.record(id, run.account_id, 'sending', {
      beforeHash: qualityHash(shape(before)),
      afterHash: qualityHash(shape(after))
    })
    try {
      let sent
      if (operation.kind === 'menu-update')
        sent = await cms.menuSet(operation, operation.items, { expectedRevision: actual.revision })
      else if (operation.kind === 'term-update')
        sent = await cms.termSet(operation, operation.fields, { expectedRevision: actual.revision })
      else if (operation.kind === 'unpublish')
        sent = await cms.unpublish(operation, { expectedRevision: actual.revision })
      else {
        if (!ownDraft && !ownPublished) {
          const draft = await cms.write(operation, operation.fields, { expectedRevision: actual.revision })
          const revision = mutationRevision(draft)
          await store.record(id, run.account_id, 'drafted', { draftRevision: revision })
          actual = { ...actual, revision }
        }
        await checkAllowed()
        if (!ownPublished) {
          sent = await cms.publish(operation, { expectedRevision: actual.revision })
          if (operation.newSlug) {
            actual = { ...actual, revision: mutationRevision(sent) }
            await store.record(id, run.account_id, 'published', { publishRevision: actual.revision })
          }
        }
        if (operation.newSlug) {
          await checkAllowed()
          sent = await cms.rename(operation, operation.newSlug, { expectedRevision: actual.revision })
        }
      }
      const revision = mutationRevision(sent)
      const receipt = {
        actualRevision: revision,
        ...(sent.snapshot ? { afterSnapshot: sent.snapshot } : {}),
        ...(sent.receipt ? { cmsReceipt: sent.receipt } : {}),
        undoable: true
      }
      await store.record(id, run.account_id, 'committed', receipt)
      actual = await cms.read(operation)
      if (actual.revision !== revision || !matches(actual, after, operation))
        throw err('QUALITY_READBACK_MISMATCH')
      await audit({ id, operation, before, after, receipt })
      await store.record(id, run.account_id, 'written', {
        ...receipt,
        readbackHash: qualityHash(shape(actual))
      })
      return { id, state: 'written', ...receipt }
    } catch (e) {
      await store.record(
        id,
        run.account_id,
        e.code === 'QUALITY_CONTENT_CONFLICT' ? 'conflict' : 'uncertain',
        { error: e.code ?? 'QUALITY_WRITE_UNCERTAIN' }
      )
      throw e
    }
  }
  const parallelRank = ({ operation }) => {
    if (operation.kind !== 'unpublish' || operation.locale === run.input.manifest.locale) return null
    const record = run.input.manifest.records?.find((record) => record.key === operation.key)
    return record ? (record.shared ? 0 : 1) : null
  }
  const receipts = []
  for (let offset = 0; offset < rows.length; ) {
    const group = [rows[offset]],
      rank = operationConcurrency > 1 ? parallelRank(rows[offset]) : null,
      target = (row) => `${row.operation.collection}:${row.operation.id}`,
      targets = new Set([target(rows[offset])])
    if (rank !== null)
      while (group.length < operationConcurrency && offset + group.length < rows.length) {
        const next = rows[offset + group.length]
        if (parallelRank(next) !== rank || targets.has(target(next))) break
        group.push(next)
        targets.add(target(next))
      }
    receipts.push(...(await drain(group, apply)))
    offset += group.length
  }
  return {
    state: 'written',
    receipts,
    ...(operationConcurrency > 1 ? { executionOptions: { operationConcurrency } } : {})
  }
}

/** Conditional compensation is journalled by stage; it never claims a transaction across the site. */
export async function restoreQualityOperation({ id, accountId, cms, store, checkAllowed, audit }) {
  requireQualityCms(cms)
  const row = await store.get(id, accountId)
  if (
    !row ||
    !['written', 'committed', 'published', 'drafted', 'uncertain', 'restoring', 'restored'].includes(
      row.state
    )
  )
    throw err('QUALITY_RESTORE_UNAVAILABLE')
  if (row.state === 'restored') return { state: 'restored', reused: true }
  const operation = row.operation,
    before = row.before_image,
    after = row.after_image
  let actual = await cms.read(operation)
  let receipt = { ...row.receipt }
  if (receipt.restoreRevision) {
    if (
      actual.revision !== receipt.restoreRevision ||
      !equivalent(shape(actual), shape(before)) ||
      actual.draft
    )
      throw err('QUALITY_RESTORE_CONFLICT')
  } else {
    await checkAllowed()
    const originalDraft =
      operation.kind === 'update' &&
      actual.draft &&
      actual.revision === receipt.draftRevision &&
      equivalent(shape(actual), shape(before)) &&
      equivalent(clean(actual.draft.data), clean(after.data))
    const restoreDraft =
      actual.draft &&
      actual.revision === receipt.restoreDraftRevision &&
      equivalent(clean(actual.draft.data), clean(before.data))
    const restoredData =
      !actual.draft &&
      actual.revision === receipt.restorePublishRevision &&
      equivalent(
        shape(actual),
        shape({
          ...before,
          ...(receipt.restoreBaseSlug !== undefined ? { slug: receipt.restoreBaseSlug } : {})
        })
      )
    const ownAfter = receipt.actualRevision === actual.revision && matches(actual, after, operation)
    if (!originalDraft && !restoreDraft && !ownAfter && !ownsPublished(row, actual) && !restoredData)
      throw err('QUALITY_RESTORE_CONFLICT')
    receipt.restoreBaseSlug ??= actual.slug
    await store.record(id, accountId, 'restoring', {
      restoreBeforeHash: qualityHash(shape(actual)),
      ...(receipt.restoreBaseSlug !== undefined ? { restoreBaseSlug: receipt.restoreBaseSlug } : {})
    })
    let sent
    if (operation.kind === 'menu-update')
      sent = await cms.restoreMenu(operation, before.snapshot, { expectedRevision: actual.revision })
    else if (operation.kind === 'term-update')
      sent = await cms.restoreTerm(operation, before.snapshot, { expectedRevision: actual.revision })
    else if (originalDraft) sent = await cms.discardDraft(operation, { expectedRevision: actual.revision })
    else {
      if (!restoreDraft && !restoredData && operation.kind !== 'unpublish') {
        // PUT merges fields. Explicit nulls remove optional fields absent in the original snapshot.
        const fields = Object.fromEntries(
          Object.keys(operation.fields).map((k) => [k, Object.hasOwn(before.data, k) ? before.data[k] : null])
        )
        const draft = await cms.write(operation, fields, {
          expectedRevision: actual.revision,
          restoreReferences: true
        })
        receipt.restoreDraftRevision = mutationRevision(draft)
        await store.record(id, accountId, 'restoring', { restoreDraftRevision: receipt.restoreDraftRevision })
        actual = { ...actual, revision: receipt.restoreDraftRevision }
      }
      await checkAllowed()
      if (!restoredData) {
        sent = await cms.publish(operation, { expectedRevision: actual.revision })
        if (operation.newSlug) {
          receipt.restorePublishRevision = mutationRevision(sent)
          await store.record(id, accountId, 'restoring', {
            restorePublishRevision: receipt.restorePublishRevision
          })
          actual = { ...actual, revision: receipt.restorePublishRevision }
        }
      }
      if (operation.newSlug) {
        if (actual.slug !== before.slug) {
          await checkAllowed()
          sent = await cms.rename(operation, before.slug, { expectedRevision: actual.revision })
        } else sent = { revision: actual.revision }
      }
    }
    receipt.restoreRevision = mutationRevision(sent)
    await store.record(id, accountId, 'restoring', { restoreRevision: receipt.restoreRevision })
    actual = await cms.read(operation)
    if (
      actual.revision !== receipt.restoreRevision ||
      !equivalent(shape(actual), shape(before)) ||
      actual.draft
    )
      throw err('QUALITY_RESTORE_READBACK')
  }
  await audit({ id, operation, before: after, after: before, restore: true, receipt })
  await store.record(id, accountId, 'restored', { restoreReadbackHash: qualityHash(shape(actual)) })
  return { state: 'restored' }
}
