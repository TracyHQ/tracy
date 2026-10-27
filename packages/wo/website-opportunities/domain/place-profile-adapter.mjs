import { createHash } from 'node:crypto'
import { emptyPlaceProfile, sourceRef, webAddress } from './place-profile.mjs'
import { tradeOfCategory } from './trades.mjs'

export const present = (value) => value !== undefined && value !== null && value !== ''
export const pick = (value, keys) =>
  Object.fromEntries(keys.filter((key) => present(value?.[key])).map((key) => [key, value[key]]))

/** Legacy documents do not prove their statements merely by naming a website or setting `verified`. */
export function profileAdapter(business, version) {
  const identity = [business.website ?? null, business.name ?? '', business.address ?? null]
  const id = (kind, path) =>
    `${kind}_${createHash('sha256')
      .update(JSON.stringify([identity, version, path]))
      .digest('hex')
      .slice(0, 24)}`
  const profile = emptyPlaceProfile(id('business', '$.business'))
  function fact(value, path, given = {}) {
    const provenance = { ...given, ref: sourceRef(given.ref) }
    const kind = provenance.kind ?? 'sender-statement'
    const sourceId = id('source', [kind, provenance.ref ?? null])
    if (!profile.sources.some((s) => s.id === sourceId))
      profile.sources.push({ id: sourceId, kind, ...pick(provenance, ['ref', 'reason']) })
    const locator = provenance.locator ?? { kind: 'jsonPath', value: path }
    const evidenceId = id('evidence', [sourceId, path, locator])
    profile.evidence.push({
      id: evidenceId,
      sourceId,
      locator,
      ...(typeof value === 'string' ? { excerpt: value } : {}),
      ...pick(provenance, ['excerpt']),
      extraction: { method: provenance.method ?? 'legacy-adapter', version }
    })
    return {
      id: id('fact', [sourceId, path, locator]),
      value: structuredClone(value),
      evidenceRefs: [evidenceId]
    }
  }
  function link(kind, url, path, provenance) {
    if (webAddress(url)) profile.links.push(fact({ kind, url }, path, provenance))
  }
  /** The trade rests on the category the sender stated; without one it is Tracy's default, said as such. */
  function classify(category, path, provenance) {
    const input = category ? fact({ provider: 'sender', category }, path, provenance) : undefined
    if (input) profile.classification.providerCategories.push(input)
    const code = tradeOfCategory(category) ?? 'other'
    const value = { taxonomy: 'tracy-trade', code, mappingVersion: 'tracy-trade/1' }
    const evidenceRefs = input
      ? [...input.evidenceRefs]
      : fact(value, path, {
          kind: 'tracy-default',
          reason: 'No category was stated; the trade is the default.',
          method: 'default-without-category'
        }).evidenceRefs
    profile.classification.derivedCategories.push({
      id: id('fact', ['trade', path]),
      value,
      evidenceRefs,
      derivation: {
        method: 'trade-from-category',
        version: 'tracy-trade/1',
        inputRefs: input ? [input.id] : []
      }
    })
  }
  function offering(item, path, provenance, kind = 'unknown') {
    const price = {
      kind: present(item.price) ? 'exact' : 'unknown',
      raw: present(item.price) ? String(item.price) : '',
      ...pick(item, ['priceScale']),
      ...(item.currencyAssumed !== true ? pick(item, ['currency']) : {})
    }
    const result = fact(
      {
        kind,
        ...pick(item, ['name', 'section', 'description']),
        variants: [{ ...pick(item, ['size']), price }]
      },
      path,
      provenance
    )
    profile.offerings.push(result)
    return result
  }
  function finish() {
    const found = {
      offerings: profile.offerings,
      prices: profile.offerings.filter((f) => f.value.variants.some((v) => v.price?.raw)),
      people: profile.people,
      faqs: profile.faqs,
      quotes: profile.quotes,
      events: profile.events,
      media: profile.media,
      brand: Object.values(profile.brand),
      hours: [profile.business.hours].filter(Boolean),
      phone: [profile.business.phone].filter(Boolean),
      'claims.statistics': profile.claims.statistics,
      'claims.recognitions': profile.claims.recognitions,
      'claims.relationships': profile.claims.relationships
    }
    for (const [target, value] of Object.entries(found))
      profile.coverage.push({
        target,
        status: value.length ? 'found' : 'not_researched',
        sourceRefs: [
          ...new Set(
            value
              .flatMap((f) => f.evidenceRefs)
              .map((ref) => profile.evidence.find((e) => e.id === ref).sourceId)
          )
        ],
        methodVersion: version
      })
    return profile
  }
  return { profile, fact, link, classify, offering, finish }
}
