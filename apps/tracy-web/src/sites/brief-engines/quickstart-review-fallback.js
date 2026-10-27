/**
 * Plain quote cards that cannot carry a review's link: the collected reviews go in them word for word (quote, author,
 * platform), and only the cards left over take verified visit information.
 */
import renderers from '../../lib/quickstart-review-renderers.json' with { type: 'json' }
import { emdashToolFor } from '../../lib/emdash-tool.js'
import { quickstartDerivedCount } from './quickstart-derived-facts.js'
import { qualityHash } from '../../lib/quality-hash.js'
const fail = (code) => Object.assign(new Error(code), { code })

export function quickstartVisitCards(business) {
  const cards = []
  const hours = typeof business.hours === 'string' ? business.hours : JSON.stringify(business.hours)
  const derived = quickstartDerivedCount(
    { id: 'business.hours', type: 'opening-hours', value: hours },
    { semanticRole: 'open-days' }
  )
  if (derived?.number > 0)
    cards.push({
      quote: `Open ${derived.number} days each week.`,
      name: 'Opening days',
      role: business.name,
      source: { id: 'business.hours', derivation: derived }
    })
  if (business.phone)
    cards.push({
      quote: `Call ${business.phone}.`,
      name: 'Contact',
      role: business.name,
      source: { id: 'business.phone', value: business.phone }
    })
  if (business.address)
    cards.push({
      quote: business.address,
      name: 'Location',
      role: business.name,
      source: { id: 'business.address', value: business.address }
    })
  if (business.website)
    cards.push({
      quote: `Visit ${business.website}`,
      name: 'Website',
      role: business.name,
      source: { id: 'business.website', value: business.website }
    })
  return cards
}

export async function quickstartReviewFallback({
  adapter,
  ctx,
  business,
  checkpoint,
  descriptor = null,
  reviews = []
}) {
  const tool = emdashToolFor(ctx.quickstart)
  const contract = descriptor ?? renderers[tool?.templateId]
  if (!contract || contract.sourceLink !== false) return { state: 'not-applicable' }
  if (
    contract.renderer !== 'plain-topic-cards' ||
    contract.rating !== false ||
    contract.reviewStructuredData !== false ||
    !Object.keys(contract.sourceProof ?? {}).length
  )
    throw fail('QUICKSTART_REVIEW_RENDERER_UNPROVEN')
  if ((ctx.normalized.languages?.[0] ?? 'en') !== 'en')
    throw fail('QUICKSTART_REVIEW_FALLBACK_LOCALE_UNSUPPORTED')
  const guests = (Array.isArray(reviews) ? reviews : [])
    .filter(
      (r) => typeof r?.text === 'string' && r.text.trim() && typeof r.author === 'string' && r.author.trim()
    )
    .map((r) => ({
      quote: r.text.trim(),
      name: r.author.trim(),
      role: r.provenance?.provider ?? r.provider ?? '',
      source: { id: 'review', author: r.author, url: r.provenance?.url ?? r.url ?? null }
    }))
  const facts = [...guests, ...quickstartVisitCards(business)],
    receipts = []
  for (const record of adapter.records) {
    const groups = contract.groups.filter(
      (group) =>
        group.collection === record.identity.collection &&
        Array.isArray(record.data[group.field]) &&
        record.data[group.field].length
    )
    if (!groups.length) continue
    const next = structuredClone(record.data),
      paths = [],
      evidence = []
    for (const group of groups) {
      const field = record.schema?.fields?.find((field) => field.slug === group.field)
      const subs = field?.validation?.subFields ?? []
      if (
        field?.type !== 'repeater' ||
        !['quote', 'name', 'role'].every((key) => subs.some((sub) => sub.slug === key)) ||
        subs.some((sub) => /url|href|rating|stars/i.test(sub.slug))
      )
        throw fail('QUICKSTART_REVIEW_RENDERER_UNPROVEN')
      const rows = next[group.field]
      if (facts.length < rows.length) throw fail('QUICKSTART_REVIEW_FALLBACK_FACTS_REQUIRED')
      rows.forEach((row, index) => {
        const fact = facts[index]
        for (const key of ['quote', 'name', 'role']) {
          if (
            !record.bindings.some(
              (binding) => qualityHash(binding.path) === qualityHash([group.field, index, key])
            )
          )
            throw fail('QUICKSTART_REVIEW_FALLBACK_SCOPE')
          row[key] = fact[key]
          paths.push([group.field, index, key])
        }
        evidence.push(fact.source)
      })
      for (const key of group.labels) {
        if (!Object.hasOwn(next, key) || guests.length) continue
        if (!record.bindings.some((binding) => binding.path.length === 1 && binding.path[0] === key))
          throw fail('QUICKSTART_REVIEW_FALLBACK_SCOPE')
        next[key] = /lead|note/.test(key)
          ? `Practical information for visiting ${business.name}.`
          : /title|heading/.test(key)
            ? 'Plan your visit'
            : 'Visit information'
        paths.push([key])
      }
    }
    if (qualityHash(next) === qualityHash(record.data)) continue
    const projected = structuredClone(next)
    for (const path of paths) adapter.set(projected, path, adapter.get(record.data, path))
    if (qualityHash(projected) !== qualityHash(record.data)) throw fail('QUICKSTART_REVIEW_FALLBACK_SCOPE')
    const beforeHash = qualityHash(record.data),
      afterHash = qualityHash(next)
    await adapter.write(record, next, (receipt) =>
      checkpoint(`review-fallback:${record.key}`, {
        ...receipt,
        beforeHash,
        afterHash,
        paths,
        evidence,
        renderer: contract
      })
    )
    receipts.push({ key: record.key, beforeHash, afterHash, paths, evidence })
  }
  return {
    state: 'verified',
    mode: guests.length ? 'verified-reviews' : 'verified-visit-information',
    receipts
  }
}

/** Reconcile only exact, verified writes from this workflow against the saved filled baseline. */
export function quickstartReviewResumeProjection(adapter, held) {
  return adapter.records.map((record) => {
    const receipt = held[`quickstart:review-fallback:${record.key}`]
    if (!receipt) return record
    if (
      receipt.state !== 'verified' ||
      !receipt.beforeData ||
      !receipt.after?.item ||
      receipt.after._rev !== record.revision ||
      receipt.after.item.id !== record.identity.id ||
      qualityHash(receipt.beforeData) !== receipt.beforeHash ||
      qualityHash(record.data) !== receipt.afterHash ||
      qualityHash(receipt.after.item.liveData ?? receipt.after.item.data) !== receipt.afterHash ||
      qualityHash(receipt.after.item.references ?? {}) !== qualityHash(record.references ?? {})
    )
      throw fail('QUICKSTART_REVIEW_RECONCILIATION_REQUIRED')
    const frozen = held['quickstart:editorial-baseline']?.records?.find((item) => item.key === record.key)
    if (!Array.isArray(frozen?.bindings)) throw fail('QUICKSTART_REVIEW_RECONCILIATION_REQUIRED')
    return { ...record, bindings: frozen.bindings, data: receipt.beforeData }
  })
}

export async function reconcileQuickstartReviewPaths({ adapter, held, checkpoint }) {
  for (const record of adapter.records) {
    const receipt = held[`quickstart:review-fallback:${record.key}`]
    if (!receipt) continue
    const next = structuredClone(record.data),
      restored = []
    for (const path of receipt.paths ?? []) {
      if (record.bindings.some((binding) => qualityHash(binding.path) === qualityHash(path))) continue
      adapter.set(next, path, adapter.get(receipt.beforeData, path))
      restored.push(path)
    }
    if (qualityHash(next) === qualityHash(record.data)) continue
    await adapter.write(record, next, (proof) =>
      checkpoint(`review-reconcile:${record.key}`, {
        ...proof,
        restored,
        sourceReceiptHash: qualityHash(receipt)
      })
    )
  }
}
