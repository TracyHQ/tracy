#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/content-contract.mjs — WordPress changes: an identity name or summary the source declares empty is an `absent-in-source` fact (value "", site or customer source) instead of a gap.
/** Site facts are input; plans reference them; rendered observations are checked separately. */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitResult, takeOutputFlags } from './lib/cli-output.mjs'

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0
const keyPattern = /^[a-z][a-z0-9._-]*$/
/** The status of a fact the source declares empty: recorded as such, never filled in. */
export const ABSENT = 'absent-in-source'
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function keys(value, allowed, label) {
  assert(object(value), `${label} must be an object`)
  for (const key of Object.keys(value)) assert(allowed.includes(key), `${label}: unknown field ${key}`)
}
function uniqueStrings(values, label, nonempty = true) {
  assert(
    Array.isArray(values) && (!nonempty || values.length > 0),
    `${label} must be an array${nonempty ? ' with entries' : ''}`
  )
  assert(
    values.every(text) && new Set(values).size === values.length,
    `${label} must contain distinct nonempty strings`
  )
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  return object(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])])
      )
    : value
}
export function contractHash(contract) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(contract)))
    .digest('hex')
}
export function validateContract(contract) {
  keys(
    contract,
    [
      'schemaVersion',
      'id',
      'revision',
      'mode',
      'language',
      'identity',
      'voice',
      'sources',
      'facts',
      'surfaces',
      'pending'
    ],
    'contract'
  )
  assert(contract.schemaVersion === 1, 'Unsupported content contract schemaVersion')
  assert(text(contract.id) && keyPattern.test(contract.id), 'contract.id must be a stable key')
  assert(
    Number.isInteger(contract.revision) && contract.revision > 0,
    'contract.revision must be a positive integer'
  )
  assert(['demo', 'customer'].includes(contract.mode), 'contract.mode must be demo or customer')
  assert(text(contract.language), 'contract.language is required')
  uniqueStrings(contract.voice, 'contract.voice')
  uniqueStrings(contract.pending, 'contract.pending', false)
  assert(contract.pending.length === 0, `Content inputs are pending: ${contract.pending.join(', ')}`)
  assert(object(contract.sources) && Object.keys(contract.sources).length > 0, 'contract.sources is required')
  for (const [key, source] of Object.entries(contract.sources)) {
    assert(keyPattern.test(key), `Invalid source key: ${key}`)
    keys(source, ['kind', 'reference', 'note'], `source ${key}`)
    assert(['customer', 'site', 'demo'].includes(source.kind), `Invalid source kind: ${key}`)
    assert(text(source.reference) && text(source.note), `Source ${key} needs a reference and note`)
  }
  assert(object(contract.facts) && Object.keys(contract.facts).length > 0, 'contract.facts is required')
  keys(contract.identity, ['name', 'summary', 'disclosure'], 'identity')
  // A source field the site declares empty is a fact too: `absent-in-source`, value "", from a
  // site or customer source. Only the identity name and summary may be one — every other fact,
  // the demo disclosure included, carries text.
  const mayBeAbsent = new Set([contract.identity.name, contract.identity.summary].filter((ref) => typeof ref === 'string'))
  for (const [key, fact] of Object.entries(contract.facts)) {
    assert(keyPattern.test(key), `Invalid fact key: ${key}`)
    keys(fact, ['value', 'status', 'source'], `fact ${key}`)
    assert(['verified', 'demo', ABSENT].includes(fact.status), `Fact ${key} must be verified, explicitly demo or ${ABSENT}`)
    const source = contract.sources[fact.source]
    assert(Object.hasOwn(contract.sources, fact.source), `Fact ${key} has an unknown source`)
    if (fact.status === ABSENT) {
      assert(mayBeAbsent.has(key), `Fact ${key} cannot be ${ABSENT}: only the identity name or summary may be`)
      assert(fact.value === '', `Fact ${key} is ${ABSENT} and must carry the empty string, not a value`)
      assert(source.kind !== 'demo', `Fact ${key} is ${ABSENT} and needs site or customer evidence, not a demo source`)
      continue
    }
    assert(text(fact.value), `Fact ${key} needs a nonempty string value`)
    assert(fact.status !== 'verified' || source.kind !== 'demo', `Fact ${key} cannot verify a demo source`)
    assert(
      contract.mode !== 'customer' || (fact.status === 'verified' && source.kind !== 'demo'),
      `Customer fact ${key} needs verified customer/site evidence`
    )
  }
  for (const field of ['name', 'summary', ...(contract.mode === 'demo' ? ['disclosure'] : [])])
    assert(Object.hasOwn(contract.facts, contract.identity[field]), `identity.${field} must reference a fact`)
  if (contract.mode === 'demo')
    assert(contract.facts[contract.identity.disclosure].status !== ABSENT, `identity.disclosure must carry the demo disclosure text, not a ${ABSENT} fact`)
  assert(
    Array.isArray(contract.surfaces) && contract.surfaces.length > 0,
    'contract.surfaces must cover the site and artifacts'
  )
  const ids = new Set()
  for (const surface of contract.surfaces) {
    keys(surface, ['id', 'purpose', 'requiredFacts'], 'surface')
    assert(text(surface.id) && !ids.has(surface.id), `Missing or duplicate surface: ${surface.id}`)
    ids.add(surface.id)
    assert(text(surface.purpose), `Surface ${surface.id} needs a purpose`)
    uniqueStrings(surface.requiredFacts, `${surface.id}.requiredFacts`, false)
    for (const ref of surface.requiredFacts)
      assert(Object.hasOwn(contract.facts, ref), `Unknown required fact: ${ref}`)
  }
  return contract
}

/** No arbitrary per-page factual value overrides: resolve exact refs or interpolate shared facts. */
export function compileContentPlan(contract, plan, requiredSurfaces = contract.surfaces?.map((s) => s.id)) {
  validateContract(contract)
  keys(plan, ['contractId', 'contractHash', 'surfaces'], 'plan')
  assert(
    plan.contractId === contract.id && plan.contractHash === contractHash(contract),
    'Plan uses a different or stale content contract; regenerate and review'
  )
  uniqueStrings(requiredSurfaces, 'requiredSurfaces')
  const scope = new Map(contract.surfaces.map((s) => [s.id, s]))
  for (const id of requiredSurfaces) assert(scope.has(id), `Surface outside content contract: ${id}`)
  assert(
    Array.isArray(plan.surfaces) && plan.surfaces.length === requiredSurfaces.length,
    'Plan must cover exactly the requested surfaces'
  )
  const seen = new Set()
  const surfaces = plan.surfaces.map((surface) => {
    keys(surface, ['id', 'fields'], 'plan surface')
    assert(
      requiredSurfaces.includes(surface.id) && !seen.has(surface.id),
      `Unexpected or duplicate plan surface: ${surface.id}`
    )
    seen.add(surface.id)
    assert(
      object(surface.fields) && Object.keys(surface.fields).length > 0,
      `${surface.id} has no content fields`
    )
    const used = new Set()
    const get = (ref) => {
      assert(Object.hasOwn(contract.facts, ref), `Unknown fact reference: ${ref}`)
      used.add(ref)
      return contract.facts[ref].value
    }
    const fields = Object.fromEntries(
      Object.entries(surface.fields).map(([key, field]) => {
        assert(keyPattern.test(key), `Invalid content field: ${key}`)
        keys(field, ['ref', 'template'], `field ${key}`)
        assert(
          Object.keys(field).length === 1,
          `Field ${key} must use either ref or template, without overrides`
        )
        if (Object.hasOwn(field, 'ref')) {
          assert(text(field.ref), `Field ${key} needs a fact reference`)
          return [key, get(field.ref)]
        }
        assert(text(field.template), `Field ${key} needs nonempty copy`)
        const value = field.template.replace(/\{\{([a-z][a-z0-9._-]*)\}\}/g, (_, ref) => get(ref))
        assert(!value.includes('{{') && !value.includes('}}'), `Field ${key} has an unresolved placeholder`)
        return [key, value]
      })
    )
    for (const ref of scope.get(surface.id).requiredFacts)
      assert(used.has(ref), `${surface.id} omits required fact ${ref}`)
    if (contract.mode === 'demo')
      assert(used.has(contract.identity.disclosure), `${surface.id} must include the demo disclosure`)
    return { id: surface.id, fields }
  })
  return { contractId: contract.id, contractHash: contractHash(contract), surfaces }
}

/** Observations must be exported from actual rendered DOM/admin fields, never copied from the plan. */
export function auditContent(contract, plan, observed, requiredSurfaces) {
  const expected = compileContentPlan(contract, plan, requiredSurfaces)
  keys(observed, ['contractId', 'contractHash', 'surfaces'], 'observed')
  assert(
    observed.contractId === expected.contractId && observed.contractHash === expected.contractHash,
    'Observed content has a stale or different contract'
  )
  assert(
    Array.isArray(observed.surfaces) && observed.surfaces.length === expected.surfaces.length,
    'Observed surface coverage differs from plan'
  )
  const byId = new Map(observed.surfaces.map((s) => [s.id, s]))
  assert(byId.size === observed.surfaces.length, 'Duplicate observed surface')
  let checked = 0
  for (const surface of expected.surfaces) {
    const actual = byId.get(surface.id)
    assert(actual, `Missing observed surface ${surface.id}`)
    keys(actual, ['id', 'fields'], 'observed surface')
    assert(
      object(actual.fields) && Object.keys(actual.fields).length === Object.keys(surface.fields).length,
      `Observed field coverage differs for ${surface.id}`
    )
    for (const [key, value] of Object.entries(surface.fields)) {
      const normalize = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : null)
      assert(normalize(actual.fields[key]) === normalize(value), `Content differs at ${surface.id}:${key}`)
      checked++
    }
  }
  return {
    ok: true,
    surfaces: expected.surfaces.length,
    checkedFields: checked,
    contractHash: expected.contractHash
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    const { argv, json, out } = takeOutputFlags(process.argv.slice(2))
    const [command, contractFile, planFile, observedFile] = argv
    const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
    const contract = validateContract(read(contractFile))
    let result
    if (command === 'validate' && !planFile) result = { ok: true, contractHash: contractHash(contract) }
    else if (command === 'compile' && planFile && !observedFile)
      result = compileContentPlan(contract, read(planFile))
    else if (command === 'audit' && planFile && observedFile)
      result = auditContent(contract, read(planFile), read(observedFile))
    else
      throw new Error(
        'Usage: content-contract.mjs validate CONTRACT | compile CONTRACT PLAN | audit CONTRACT PLAN OBSERVED  [--json] [--out FILE]'
      )
    emitResult({
      result,
      json,
      out,
      script: 'content-contract',
      label: command,
      key: [contractFile, planFile, observedFile].join('\0'),
      protect: [contractFile, planFile, observedFile]
    })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
