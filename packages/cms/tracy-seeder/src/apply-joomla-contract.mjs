import { isDerived } from './plan-joomla-contract.mjs'
import { createHash } from 'node:crypto'

/** Answers that are silence rather than a refusal: the site (or the relay to it) never said yes or no. */
const SILENT = new Set([
  'COMPONENT_BAD_RESPONSE',
  'COMPONENT_UNREACHABLE',
  'COWORK_WEB_BAD_RESPONSE',
  'COWORK_WEB_UNREACHABLE'
])

/**
 * The sentence a failed door call throws. The door's own words win; without them the code does,
 * never a guess — "contract unavailable" for a site that timed out sent the diagnosis the wrong way.
 * A silent answer to a WRITE may still have landed, and the rerun is what finds out (`cli.mjs`).
 * @param {any} result
 * @param {{ writing?: boolean }} [how]
 */
export function doorRefusal(result, { writing = false } = {}) {
  if (result?.message || result?.error) return String(result.message || result.error)
  const code = typeof result?.code === 'string' ? result.code : null
  if (code && SILENT.has(code)) {
    const status = Number.isInteger(result.status) ? `, HTTP ${String(result.status)}` : ''
    return writing
      ? `The site did not answer the write cleanly (${code}${status}); the write may have landed — run this step again and it checks what the site now holds`
      : `The site did not answer (${code}${status})`
  }
  return code ? `The content contract door refused (${code})` : 'Content contract unavailable'
}

/** Apply reviewed scalar content to the quickstart's original entities.
 * The Claude Cowork plugin owns identity resolution, display checks, transactions and undo.
 * No fallback to the legacy T4 writer is safe after a contract check fails.
 *
 * `mapping.emptyLinks` names link slots to take off (`empty_links`, Claude Cowork for Joomla 0.24.4, TCH #1013): only a
 * slot inspect marks `emptyLink` (its layout was reviewed to draw no dead link without it) may be named, never one also
 * changed. It may stand alone; it joins the request id only when sent, so a mapping without it replays as it always did.
 */
export async function applyJoomlaContract({ apply, siteKey, mapping, dry = false }) {
  const call = async (params) => {
    const result = await apply({ siteKey, action: 'content.contract', params })
    if (!result?.ok) throw new Error(doorRefusal(result, { writing: params.operation === 'apply' }))
    return result
  }
  const state = await call({ operation: 'inspect' })
  if (mapping?.contract !== state.contract)
    throw new Error('The content mapping must name the installed quickstart contract')
  if (typeof mapping.revision !== 'string' || !mapping.revision)
    throw new Error('Inspect the site before preparing a content mapping')
  if (!mapping.changes || Array.isArray(mapping.changes) || typeof mapping.changes !== 'object')
    throw new Error('A content mapping must contain scalar changes')
  const slots = new Map(state.slots.map((slot) => [slot.key, slot]))
  const changes = Object.entries(mapping.changes)
  const emptyLinks = mapping.emptyLinks ?? []
  if (!Array.isArray(emptyLinks) || emptyLinks.some((key) => typeof key !== 'string'))
    throw new Error('Links to take off must be a list of link slot keys')
  if (!changes.length && !emptyLinks.length) throw new Error('The mapping contains no customer content')
  for (const key of emptyLinks) {
    if (key in mapping.changes) throw new Error(`A link cannot be both changed and taken off: ${key}`)
    if (!slots.get(key)?.emptyLink)
      throw new Error(
        `This link cannot be taken off: its layout is not known to draw nothing without it: ${key}`
      )
  }
  if (mapping.pending !== undefined && !Array.isArray(mapping.pending))
    throw new Error('Pending customer inputs must be an array')
  if (Array.isArray(mapping.pending) && mapping.pending.length)
    throw new Error(`Customer content is still needed: ${mapping.pending.join(', ')}`)
  for (const [key, value] of changes) {
    const slot = slots.get(key)
    if (!slot || typeof value !== 'string') throw new Error(`Unknown or non-scalar content slot: ${key}`)
    // A translated copy is written by the language machinery, from its source, never by a seed —
    // a mapping that names one would put brief-language copy into another edition. Refused here as
    // well as skipped by the planner, because a reviewed `--copy` file could name one by hand.
    if (isDerived(slot)) throw new Error(`A seed does not write a translated copy: ${key}`)
    if (slot.requiresEvidence && !mapping.evidence?.[key]?.trim())
      throw new Error(`Customer evidence is missing for ${key}`)
  }
  if (changes.length + emptyLinks.length > 1500)
    throw new Error('Review at most 1500 scalar slots in one content revision')
  const requestId = createHash('sha256')
    .update(
      JSON.stringify({
        siteKey,
        contract: state.contract,
        revision: mapping.revision,
        changes,
        evidence: mapping.evidence ?? {},
        ...(emptyLinks.length ? { emptyLinks } : {})
      })
    )
    .digest('hex')
  const params = {
    operation: 'apply',
    expected_revision: mapping.revision,
    apply_id: `contract-${requestId.slice(0, 48)}`,
    request_id: requestId,
    ...(changes.length ? { changes: mapping.changes } : {}),
    ...(emptyLinks.length ? { empty_links: emptyLinks } : {}),
    evidence: mapping.evidence ?? {}
  }
  if (dry) return { contract: state.contract, params, pages: state.pages }
  const result = await call(params)
  return { ...result, applyId: params.apply_id, contract: state.contract }
}
