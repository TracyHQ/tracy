/** Bind a validated declared plan to the exact installed IDs before any mutation. */
import { qualityHash } from './quality-dossier.js'

const fail = (code) => Object.assign(new Error(code), { code })
const recordKey = (r) => `${r.collection}/${r.slug}@${r.locale}`
const termKey = (t) => `term:${t.name}/${t.slug}@${t.locale}`
const menuKey = (m) => `${m.name}@${m.locale}`
const visibleRelationFields = new Set([
  'home/home@en:project_big',
  'home/home@en:project_small_1',
  'home/home@en:project_small_2',
  'projects_page/projects@en:featured_project'
])

/** A relation-backed card can become publicly empty by unpublishing its exact target, without unlinking it. */
export async function bindQualityReferenceVisibility({ bound, plan, manifest, readSchema }) {
  const { hash: _hash, ...body } = bound
  if (
    bound.hash !== qualityHash(body) ||
    bound.parentPlanHash !== plan.hash ||
    plan.manifestHash !== manifest.hash ||
    typeof readSchema !== 'function'
  )
    throw fail('QUALITY_REFERENCE_POLICY_SCOPE')
  const schemas = new Map(),
    bindings = [],
    operations = []
  for (const original of bound.operations) {
    const candidates = Object.keys(original.fields ?? {}).filter(
      (field) => visibleRelationFields.has(`${original.key}:${field}`) && original.fields[field] === null
    )
    if (original.kind !== 'update' || !candidates.length) {
      operations.push(original)
      continue
    }
    let schema = schemas.get(original.collection)
    if (!schema) {
      schema = await readSchema(original)
      schemas.set(original.collection, schema)
    }
    const operation = structuredClone(original),
      policies = []
    for (const field of candidates) {
      const actual = schema.fields?.find((f) => f.slug === field),
        binding = actual?.validation
      if (!binding?.relation) continue
      const record = manifest.records.find((r) => r.key === original.key),
        ref = String(record?.sample?.[field] ?? '').match(/^\$ref:([^:]+):([^:]+):([^:]+)$/),
        targetKey = ref ? `${ref[1]}/${ref[2]}@${ref[3]}` : null,
        installed = bound.installedCoverage.find((r) => r.key === targetKey),
        target = plan.operations.find((o) => o.kind === 'unpublish' && o.key === targetKey)
      if (
        actual.type !== 'reference' ||
        binding.targetCollection !== 'projects' ||
        binding.relationSide !== 'parent' ||
        ref?.[1] !== 'projects' ||
        ref?.[3] !== original.locale ||
        !installed?.id ||
        !target ||
        target.collection !== 'projects' ||
        target.locale !== original.locale ||
        qualityHash(original.expectedReferences?.[field]) !== qualityHash([installed.id])
      )
        throw fail('QUALITY_REFERENCE_POLICY_SCOPE')
      const policy = {
        field,
        mode: 'hidden-by-unpublished-target',
        relation: binding.relation,
        relationSide: binding.relationSide,
        targetCollection: 'projects',
        targetKey,
        targetId: installed.id
      }
      policies.push(policy)
      bindings.push({ key: original.key, id: original.id, ...policy })
      delete operation.fields[field]
    }
    if (policies.length) {
      operation.referenceVisibility = policies
      const remaining = Object.keys(operation.fields).filter(
        (field) => original.expectedReferencesAfter?.[field]?.length === 0 && operation.fields[field] === null
      )
      if (remaining.length)
        operation.expectedReferencesAfter = Object.fromEntries(
          Object.entries(original.expectedReferences).map(([field, ids]) => [
            field,
            remaining.includes(field) ? [] : ids
          ])
        )
      else delete operation.expectedReferencesAfter
    }
    operations.push(operation)
  }
  if (!bindings.length) return bound
  const artifact = {
    ...body,
    operations,
    referenceVisibility: {
      schemaVersion: 'tracy-wo-relation-visibility/v1',
      sourceBindingHash: bound.hash,
      planHash: plan.hash,
      semantics: 'Relations are preserved; exact unpublished targets do not render as public cards.',
      bindings
    }
  }
  return { ...artifact, hash: qualityHash(artifact) }
}

export function bindQualityInventory({ plan, manifest, inventory }) {
  if (
    plan?.validation?.state !== 'validated' ||
    plan.manifestHash !== manifest.hash ||
    !Array.isArray(inventory?.records) ||
    !Array.isArray(inventory?.menus) ||
    !Array.isArray(inventory?.terms)
  )
    throw fail('QUALITY_INVENTORY_INPUT')
  const indexed = (rows, key) => {
    const map = new Map()
    for (const r of rows) {
      if (!r.id || map.has(key(r))) throw fail('QUALITY_INVENTORY_DUPLICATE')
      map.set(key(r), r)
    }
    return map
  }
  const records = indexed(inventory.records, recordKey),
    menus = indexed(inventory.menus, menuKey),
    terms = indexed(inventory.terms, termKey)
  if (
    inventory.records.some((r) => !manifest.records.some((m) => m.key === recordKey(r))) ||
    inventory.terms.some((t) => !manifest.terms?.some((m) => m.key === termKey(t)))
  )
    throw fail('QUALITY_INVENTORY_EXTRA')
  const knownMenus = [...manifest.menus, ...(manifest.inactiveLocalePolicy?.menus ?? [])]
  if (inventory.menus.some((m) => !knownMenus.some((t) => menuKey(t) === menuKey(m))))
    throw fail('QUALITY_INVENTORY_EXTRA')
  const observations = []
  for (const declared of manifest.records) {
    const actual = records.get(declared.key),
      decision = plan.coverage.find((c) => c.key === declared.key)
    if (!decision) throw fail('QUALITY_INVENTORY_COVERAGE')
    if (!actual && decision.state !== 'empty-by-policy') throw fail('QUALITY_INVENTORY_MISSING')
    if (actual?.scheduledAt || actual?.status === 'scheduled') throw fail('QUALITY_INVENTORY_SCHEDULED')
    observations.push({
      key: declared.key,
      id: actual?.id ?? null,
      state: actual ? (actual.status === 'published' ? 'published' : 'unpublished') : 'absent-by-install',
      policy: decision.state
    })
  }
  const operations = []
  for (const operation of plan.operations) {
    if (operation.kind === 'menu-update') {
      const actual = menus.get(`${operation.name}@${operation.locale}`)
      if (!actual) throw fail('QUALITY_INVENTORY_MENU_MISSING')
      operations.push({ ...operation, id: actual.id })
      continue
    }
    if (operation.kind === 'term-update') {
      const actual = terms.get(operation.key)
      if (!actual) throw fail('QUALITY_INVENTORY_TERM_MISSING')
      operations.push({ ...operation, id: actual.id })
      continue
    }
    const actual = records.get(operation.key)
    if (operation.kind === 'unpublish' && (!actual || actual.status !== 'published')) continue
    if (!actual) throw fail('QUALITY_INVENTORY_MISSING')
    const record = manifest.records.find((r) => r.key === operation.key),
      expectedReferences = {},
      clearedReferences = new Set()
    for (const field of operation.kind === 'update'
      ? record.fields.filter((f) => f.type === 'reference')
      : []) {
      const clearing = Object.hasOwn(operation.fields, field.slug)
      if (clearing) {
        if (
          operation.fields[field.slug] !== null ||
          field.validation?.relation ||
          !field.validation?.targetCollection ||
          field.translatable === false
        )
          throw fail('QUALITY_INVENTORY_REFERENCE_UNSUPPORTED')
        clearedReferences.add(field.slug)
      }
      const value = record.sample[field.slug]
      if (value == null || value === '') {
        expectedReferences[field.slug] = []
        continue
      }
      const ref = String(value).match(/^\$ref:([^:]+):([^:]+):([^:]+)$/)
      if (!ref) throw fail('QUALITY_INVENTORY_REFERENCE_UNRESOLVED')
      const key = `${ref[1]}/${ref[2]}@${ref[3]}`,
        target = records.get(key)
      if (
        !target ||
        (clearing && ref[1] !== field.validation.targetCollection) ||
        (!clearing &&
          !plan.coverage.some((c) => c.key === key && ['planned', 'preserved-with-reason'].includes(c.state)))
      )
        throw fail('QUALITY_INVENTORY_REFERENCE_UNRESOLVED')
      expectedReferences[field.slug] = [target.id]
    }
    operations.push({
      ...operation,
      id: actual.id,
      ...(operation.kind === 'update' ? { expectedReferences } : {}),
      ...(clearedReferences.size
        ? {
            expectedReferencesAfter: Object.fromEntries(
              Object.entries(expectedReferences).map(([key, ids]) => [
                key,
                clearedReferences.has(key) ? [] : ids
              ])
            )
          }
        : {})
    })
  }
  const artifact = {
    ...plan,
    parentPlanHash: plan.hash,
    inventoryHash: qualityHash(inventory),
    operations,
    installedCoverage: observations,
    coverageCounts: {
      declared: manifest.records.length,
      modelRead: manifest.records.filter((r) => r.defaultLocale).length,
      installed: inventory.records.length,
      policyAbsent: observations.filter((o) => o.state === 'absent-by-install').length,
      rendered: 0
    }
  }
  delete artifact.hash
  return { ...artifact, hash: qualityHash(artifact) }
}
