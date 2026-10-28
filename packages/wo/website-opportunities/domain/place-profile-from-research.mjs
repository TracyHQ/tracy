import { createHash } from 'node:crypto'
import { decideHours, hoursPickOf } from './hours-check.mjs'
import { decideGoogleRating, googleRatingOf, ratingPickOf } from './google-rating.mjs'
import { copiedRatingVerdict } from './listing-page.mjs'
import { offeringKindOf } from './offering-kind.mjs'
import { withReadingPicks } from './business-reading.mjs'
import { cleanSocialUrl } from './social-links.mjs'
import { brandNameOf } from './brand-social.mjs'
import { candidateAsRead } from './candidate-as-read.mjs'
import { researchWhatsappOf } from './business-phones.mjs'
import { defaultOfferingKind, statedTradeOf, tradeOfPlace, tradeOfSchemaType } from './trades.mjs'
import { emptyPlaceProfile, sourceRef, webAddress } from './place-profile.mjs'
import { ownMarkNamesOf } from './own-marks.mjs'
import { nameKey } from './business-name.mjs'
import { directMessageUrlOf, ownChannelInvitesOf, socialNetworkOfUrl } from './own-channels.mjs'

const VERSION = 'place-profile-from-research/1'
const SOCIAL_NETWORKS = new Set(['facebook', 'instagram', 'tiktok', 'youtube'])
const MAPPING = 'tracy-trade/1'
const list = (value) => (Array.isArray(value) ? value : [])
const present = (value) => value !== undefined && value !== null && value !== ''
const iso = (value) => (value instanceof Date ? value.toISOString() : value)
const pick = (value, keys) =>
  Object.fromEntries(keys.filter((k) => present(value?.[k])).map((k) => [k, value[k]]))
const canonical = (value) =>
  JSON.stringify(value, function (_key, child) {
    return child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(
          Object.keys(child)
            .sort()
            .map((key) => [key, child[key]])
        )
      : child
  })
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex').slice(0, 24)
/**
 * Why a fact stays off the site until the owner switches it on (#1791): `derivation.method` names the check and
 * `reason` starts with its code, `implausible-all-week-hours`, `few-reviews`, `owner-left-off` or
 * `name-differs-from-own-marks`. The on-site rules
 * (`fact-assessment.mjs`) read the code; the fact itself, its id and its evidence are unchanged.
 */
export const ON_SITE_CHECK = 'on-site-check'
const onSiteCheck = (code, why) => ({
  method: ON_SITE_CHECK,
  version: 'on-site-check/1',
  reason: `${code}: ${why}`
})
const strings = (value) => list(value).filter((v) => typeof v === 'string' && v.length)
const readable = (row) => ['complete', 'partial'].includes(row.status) || Boolean(row.collected_at)
const revoked = (row) => Boolean(row.revoked_at || row.revokedAt || row.status === 'revoked')

/** Stored research to source-backed content. No clock, fetch, model call or template enters this projection. */
export function placeProfileFromResearch({
  identity = {},
  snapshot = {},
  profile = {},
  brand = {},
  sources = [],
  media = [],
  posts = [],
  socialStats = [],
  madeAt
} = {}) {
  profile ??= {}
  brand ??= {}
  identity ??= {}
  snapshot ??= {}
  sources = list(sources)
  media = list(media)
  const google = profile.googlePlace ?? {}
  // As read today, whenever it was saved: never a listing page as its website (`candidate-as-read.mjs`).
  const candidate = candidateAsRead(identity.candidate ?? {})
  const externalId =
    identity.externalId ??
    identity.external_id ??
    google.placeId ??
    identity.providerId ??
    identity.provider_id
  const namespace =
    identity.namespace ??
    (google.placeId || /google/.test(identity.provider ?? '') ? 'google' : identity.provider)
  // Old private rows may have only a deployment id. Expose that limitation instead of claiming portability.
  const website = profile.website ?? google.website ?? candidate.website
  const identityKey = externalId
    ? [namespace ?? 'provider', externalId]
    : website
      ? ['url', website]
      : identity.id
        ? ['deployment-local', identity.id]
        : ['unidentified', identity.name ?? profile.name ?? '', profile.address ?? '']
  const id = (kind, source, locator) => `${kind}_${hash([identityKey, source, locator])}`
  const doc = {
    ...emptyPlaceProfile(id('business', 'identity', identityKey)),
    ...(present(madeAt ?? snapshot.published_at ?? snapshot.publishedAt)
      ? { madeAt: iso(madeAt ?? snapshot.published_at ?? snapshot.publishedAt) }
      : {})
  }
  const sourceIds = new Map()
  function sourceOf(kind = 'research', unsafeRef, row = {}) {
    const ref = sourceRef(unsafeRef)
    const key = canonical([kind, ref ?? null])
    if (sourceIds.has(key)) return sourceIds.get(key)
    const source = {
      id: id('source', kind, ref ?? null),
      kind,
      ...(present(ref) ? { ref } : {}),
      ...pick(row, ['status', 'reason']),
      ...(present(row.collected_at ?? row.collectedAt)
        ? { collectedAt: iso(row.collected_at ?? row.collectedAt) }
        : {}),
      ...(present(row.attempted_at ?? row.attemptedAt)
        ? { attemptedAt: iso(row.attempted_at ?? row.attemptedAt) }
        : {}),
      ...(present(row.collector_version) ? { collectorVersion: row.collector_version } : {})
    }
    sourceIds.set(key, source)
    doc.sources.push(source)
    return source
  }
  for (const row of sources) sourceOf(row.source ?? 'research', row.ref, row)
  // A profile link reads clean (`social-links.mjs`) while its source row keeps the address it was saved with.
  const sameRef = (a, b) => a === b || (typeof a === 'string' && cleanSocialUrl(a) === cleanSocialUrl(b))
  const sourceFor = (kind, ref) => {
    const row = sources.find((s) => (ref ? sameRef(s.ref, ref) : s.source === kind))
    return sourceOf(kind ?? row?.source ?? 'research', ref ?? row?.ref, row)
  }
  const stored = () => sourceOf('research', 'stored:profile')
  const evidenceIds = new Set()
  function evidenceFor(
    source,
    locator,
    excerpt,
    extraction = { method: 'stored-research', version: VERSION }
  ) {
    const evidence = {
      id: id('evidence', source.id, [locator, excerpt, extraction]),
      sourceId: source.id,
      locator,
      ...(typeof excerpt === 'string' ? { excerpt } : {}),
      extraction
    }
    if (!evidenceIds.has(evidence.id)) {
      evidenceIds.add(evidence.id)
      doc.evidence.push(evidence)
    }
    return evidence.id
  }
  function fact(value, source, path, options = {}) {
    const locator = options.locator ?? { kind: 'jsonPath', value: path }
    const evidenceRef = evidenceFor(
      source,
      locator,
      options.excerpt ?? (typeof value === 'string' ? value : undefined),
      options.extraction
    )
    return {
      id: id('fact', source.id, [path, locator]),
      value: structuredClone(value),
      evidenceRefs: [evidenceRef],
      ...(options.language ? { language: options.language } : {}),
      ...(options.derivation ? { derivation: options.derivation } : {})
    }
  }
  const same = (a, b) =>
    typeof a === 'string' && typeof b === 'string'
      ? a.trim().toLowerCase() === b.trim().toLowerCase()
      : a !== undefined && canonical(a) === canonical(b)
  // The merged profile keeps who stated a value in several places; without any, say so instead of citing "research".
  function profileSource(key, value) {
    const named =
      profile.provenance?.[key]?.source ??
      list(profile.evidence?.[key]).find((e) => same(e?.value, value))?.sources?.[0] ??
      (key === 'hours'
        ? Object.entries(profile.hoursBySource ?? {}).find(([, v]) => same(v, value))?.[0]
        : undefined) ??
      sources.filter(readable).find((row) => same(row.collected?.profile?.[key], value))?.source
    if (named) return { source: sourceFor(named) }
    return {
      source: sourceOf('research-merged', undefined, {
        reason: 'The stored research kept this value without naming its source.'
      }),
      extraction: { method: 'merged-without-provenance', version: VERSION }
    }
  }
  // `as` is the fact's value when it wraps the stated one.
  // Every other source the merged research says states the same value is evidence too (#1791): two sources that agree
  // make a fact corroborated (`fact-confidence.mjs`). The fact's id stays the first source's.
  const profileFact = (key, value, path, as = value, options = {}) => {
    const { source, extraction } = profileSource(key, value)
    const made = fact(as, source, path, { ...(extraction ? { extraction } : {}), ...options })
    const agreeing = list(profile.evidence?.[key])
      .filter((e) => same(e?.value, value))
      .flatMap((e) => strings(e.sources))
    for (const kind of new Set(agreeing)) {
      const other = sourceFor(kind)
      if (other.id === source.id) continue
      const ref = evidenceFor(
        other,
        { kind: 'jsonPath', value: `$.profile.evidence.${key}` },
        typeof value === 'string' ? value : undefined
      )
      if (!made.evidenceRefs.includes(ref)) made.evidenceRefs.push(ref)
    }
    return made
  }
  const googleSource = () => sourceFor('google-places', google.placeId)
  for (const key of ['name', 'branch', 'address', 'phone', 'email']) {
    const value = profile[key] ?? identity[key] ?? candidate[key]
    const path = present(profile[key])
      ? `$.profile.${key}`
      : present(identity[key])
        ? `$.identity.${key}`
        : `$.identity.candidate.${key}`
    if (typeof value === 'string' && value.length) doc.business[key] = profileFact(key, value, path)
  }
  for (const [from, to] of [
    ['name', 'name'],
    ['formattedAddress', 'address'],
    ['location', 'location'],
    ['addressComponents', 'addressComponents'],
    ['nationalPhoneNumber', 'nationalPhoneNumber'],
    ['internationalPhoneNumber', 'internationalPhoneNumber'],
    ['reservable', 'reservable']
  ]) {
    if (present(google[from]) && !doc.business[to])
      doc.business[to] = fact(google[from], googleSource(), `$.googlePlace.${from}`)
  }
  if (!doc.business.phone && (google.internationalPhoneNumber || google.nationalPhoneNumber)) {
    const key = google.internationalPhoneNumber ? 'internationalPhoneNumber' : 'nationalPhoneNumber'
    doc.business.phone = fact(google[key], googleSource(), `$.business.phoneFrom.${key}`, {
      locator: { kind: 'jsonPath', value: `$.googlePlace.${key}` }
    })
  }
  // 🔒 A name the business's own marks do not carry (#1791, `own-marks.mjs`): its logo or its social page calls it
  // something else. The name stays what the sources chose, held off the site by rule until the owner confirms it or
  // picks the other name; the other names are a conflict of the name, each citing the marks that give it.
  const logoRead = (brand.logoResearch ?? profile.brand?.logoResearch)?.chosen ?? null
  const ownNames =
    doc.business.name && profile.nameCheck?.state !== 'chosen'
      ? ownMarkNamesOf({ chosen: doc.business.name.value, claims: profile.nameClaims, logo: logoRead })
      : []
  // The handles that only back one of those names (`harbour.sportclub` behind "Harbour Sport Club"): the name's
  // conflict cites them, so they are no second conflict of their own (one conflict per other name).
  const backingHandles = new Set(
    ownNames.flatMap((n) => n.marks.filter((m) => m.via === 'handle').map((m) => nameKey(m.text)))
  )
  if (ownNames.length) {
    const held = doc.business.name
    const markRef = (m) =>
      m.source === 'logo'
        ? evidenceFor(
            sourceOf('logo', webAddress(logoRead?.url)),
            { kind: 'jsonPath', value: '$.brand.logoResearch.chosen.readsAs' },
            m.text,
            { method: 'logo-reading', version: logoRead?.recognised ?? 'unrecorded' }
          )
        : evidenceFor(
            sourceFor(m.source),
            { kind: 'jsonPath', value: `$.profile.nameClaims[${m.index}]` },
            m.text
          )
    const marks = [...new Set(ownNames.flatMap((n) => n.marks.map((m) => m.source)))].join(' and ')
    const why = `its own ${marks} call it ${ownNames.map((n) => n.name).join(' or ')}, not ${held.value}`
    held.derivation = onSiteCheck('name-differs-from-own-marks', why)
    doc.conflicts.push({
      id: id('conflict', 'own-marks', 'business.name'),
      target: 'business.name',
      reason: `name-differs-from-own-marks: ${why}`,
      values: [
        {
          id: id('fact', 'own-marks', ['$.business.name', held.value]),
          value: held.value,
          evidenceRefs: [...held.evidenceRefs]
        },
        ...ownNames.map((n) => ({
          id: id('fact', 'own-marks', ['$.ownMarks', n.name]),
          value: n.name,
          evidenceRefs: [...new Set(n.marks.map(markRef))]
        }))
      ]
    })
  }
  const profileHours = strings(profile.hours).length > 0
  const hours = profileHours ? profile.hours : google.openingHours
  // Hours waiting for a check (one source's "open 24 hours every day") or left off by the owner are no fact; hours the
  // owner typed are (`hours-check.mjs`). Disagreeing sources stay as before: a fact with its conflict below.
  const hoursDecision = decideHours({
    profile,
    googleHours: strings(google.openingHours),
    trade: typeof candidate.trade === 'string' ? candidate.trade : null,
    words: [
      candidate.category,
      candidate.primaryType,
      google.primaryType,
      profile.businessType,
      profile.name
    ],
    pick: hoursPickOf(candidate)
  })
  // 🔒 Hours waiting for that check, or left off by the owner, are still a fact (#1791): one fact with one on-site
  // decision, kept off the site by the reason its derivation names (`ON_SITE_CHECK`), never dropped from the profile.
  const hoursHeld =
    hoursDecision.choice === 'leave'
      ? onSiteCheck('owner-left-off', 'the owner chose to leave the opening hours off the site')
      : hoursDecision.state === 'check'
        ? onSiteCheck(
            'implausible-all-week-hours',
            'one source says open 24 hours every day, which a business of this kind rarely is'
          )
        : null
  if (hoursDecision.choice === 'edit')
    doc.business.hours = fact(
      hoursDecision.hours,
      sourceOf('account-overlay'),
      '$.identity.candidate.hoursPick.hours'
    )
  else if (strings(hours).length)
    doc.business.hours = profileHours
      ? profileFact('hours', hours, '$.profile.hours', hours, hoursHeld ? { derivation: hoursHeld } : {})
      : fact(hours, googleSource(), '$.googlePlace.openingHours', hoursHeld ? { derivation: hoursHeld } : {})
  if (google.amenities && Object.keys(google.amenities).length)
    doc.business.amenities = fact(google.amenities, googleSource(), '$.googlePlace.amenities')
  if (strings(profile.serviceAreas).length)
    doc.business.serviceAreas = profileFact('serviceAreas', profile.serviceAreas, '$.profile.serviceAreas')

  const providerCategories = doc.classification.providerCategories
  const types = google.primaryType || strings(google.types).length ? google : candidate
  if (types.primaryType || strings(types.types).length)
    providerCategories.push(
      fact(
        { provider: 'google', ...pick(types, ['primaryType', 'types']) },
        googleSource(),
        types === google ? '$.googlePlace.types' : '$.identity.candidate.types'
      )
    )
  if (profile.businessType)
    providerCategories.push(
      profileFact('businessType', profile.businessType, '$.profile.businessType', {
        provider: 'schema.org',
        category: profile.businessType
      })
    )
  // A site's own schema.org type, as its source row read it, when the merged profile did not keep it.
  const schemaTypes = present(profile.businessType) ? [profile.businessType] : []
  for (const row of sources.filter(readable)) {
    const category = row.collected?.profile?.category
    if (typeof category === 'string' && category)
      providerCategories.push(
        fact(
          { provider: row.source, category },
          sourceFor(row.source, row.ref),
          '$.collected.profile.category'
        )
      )
    const stated = row.collected?.profile?.businessType
    if (typeof stated === 'string' && stated && !schemaTypes.includes(stated)) {
      schemaTypes.push(stated)
      providerCategories.push(
        fact(
          { provider: 'schema.org', category: stated },
          sourceFor(row.source, row.ref),
          '$.collected.profile.businessType'
        )
      )
    }
  }
  let trade = tradeOfPlace(pick(types, ['primaryType', 'types']))
  for (const type of schemaTypes) if (trade === 'other') trade = tradeOfSchemaType(type)
  // The trade rests on the categories it was read from; with none it is Tracy's default, said as such.
  const tradeValue = { taxonomy: 'tracy-trade', code: trade, mappingVersion: MAPPING }
  const tradeFact = {
    id: id('fact', 'derived', '$.classification.trade'),
    value: tradeValue,
    evidenceRefs: providerCategories.length
      ? [...new Set(providerCategories.flatMap((f) => f.evidenceRefs))]
      : [
          evidenceFor(
            sourceOf('tracy-default', undefined, {
              reason: 'No category was stored; the trade is the default.'
            }),
            { kind: 'jsonPath', value: '$.profile.businessType' },
            undefined,
            { method: 'default-without-category', version: MAPPING }
          )
        ],
    derivation: {
      method: 'tradeOfPlace/tradeOfSchemaType',
      version: MAPPING,
      inputRefs: providerCategories.map((f) => f.id)
    }
  }
  doc.classification.derivedCategories.push(tradeFact)

  const mediaByLocalId = new Map()
  const mediaByUrl = new Map()
  const mediaByHash = new Map()
  for (const row of media) {
    if (revoked(row) || (row.status && row.status !== 'stored')) continue
    const url = webAddress(row.source_url ?? row.sourceUrl ?? row.url)
    const locator = url
      ? { kind: 'url', value: url }
      : {
          kind: 'jsonPath',
          value: row.sha256
            ? `$.media[sha256=${JSON.stringify(row.sha256)}]`
            : `$.media[id=${JSON.stringify(row.id)}]`
        }
    const value = {
      kind: ['image', 'video', 'audio', 'document'].includes(row.kind) ? row.kind : 'unknown',
      ...(url ? { url } : {}),
      ...pick(row, ['sha256', 'mime', 'width', 'height', 'category', 'caption', 'alt', 'credit']),
      ...(present(row.duration_s) ? { duration: Number(row.duration_s) } : {}),
      ...(present(row.bytes) ? { bytes: Number(row.bytes) } : {}),
      ...((row.post_id ?? row.postId) ? { postId: row.post_id ?? row.postId } : {}),
      ...((row.posted_at ?? row.postedAt) ? { publishedAt: iso(row.posted_at ?? row.postedAt) } : {}),
      restrictions: [],
      relations: []
    }
    const result = fact(value, sourceFor(row.source, url), `$.media.${row.sha256 ?? url ?? row.id}`, {
      locator
    })
    const existing = doc.media.find((m) => m.id === result.id)
    const kept = existing ?? result
    if (!existing) doc.media.push(result)
    if (row.id) mediaByLocalId.set(row.id, kept)
    if (url) mediaByUrl.set(url, kept)
    if (row.sha256) mediaByHash.set(row.sha256, kept)
  }
  function menuEvidence(item, index) {
    const src = item.source ?? {}
    const picture = mediaByLocalId.get(src.mediaId ?? src.region)
    const source = sourceFor(
      src.kind === 'photo' ? 'menu-photos' : 'menu-file',
      src.url ?? picture?.value.url
    )
    // Historical `region` is often a media UUID, not a rectangle. Do not publish it as image coordinates.
    const locator = src.page
      ? { kind: 'pdfPage', value: src.page }
      : src.region && typeof src.region === 'object'
        ? { kind: 'imageRegion', value: src.region }
        : { kind: 'jsonPath', value: `$.menuItems[${index}]` }
    return { source, locator }
  }
  for (const [index, item] of list(profile.menuItems).entries()) {
    if (typeof item.name !== 'string' || !item.name) continue
    const { source, locator } = menuEvidence(item, index)
    const section = item.section ?? item.source?.section ?? ''
    const kind = offeringKindOf({ ...item, section }, statedTradeOf(doc))
    const price = {
      kind: present(item.price) ? 'exact' : 'unknown',
      raw: present(item.price) ? String(item.price) : '',
      ...(item.currency && item.currencyAssumed !== true ? { currency: item.currency } : {}),
      ...(item.priceScale !== undefined ? { priceScale: item.priceScale } : {})
    }
    const offering = fact(
      {
        kind,
        name: item.name,
        ...(item.section ? { section: item.section } : {}),
        variants: [{ ...(item.size ? { size: item.size } : {}), price }]
      },
      source,
      `$.menuItems[${index}]`,
      {
        locator,
        excerpt: [item.name, item.price].filter(present).join(' — '),
        extraction: {
          method: item.source?.kind === 'photo' ? 'menu-photo-reading' : 'menu-reader',
          version: item.source?.version ?? 'unrecorded'
        }
      }
    )
    doc.offerings.push(offering)
    if (item.photo?.status === 'accepted') {
      const photo =
        mediaByLocalId.get(item.photo.mediaId ?? item.photo.assetId) ??
        mediaByUrl.get(item.photo.url) ??
        mediaByHash.get(item.photo.sha256)
      if (photo) {
        const ref = evidenceFor(
          source,
          { kind: 'jsonPath', value: `$.menuItems[${index}].photo` },
          item.photo.evidence?.quote,
          { method: item.photo.how ?? 'dish-photos', version: item.photo.matcher ?? 'unrecorded' }
        )
        photo.value.relations.push({ entityId: offering.id, relation: 'depicts', evidenceRefs: [ref] })
      }
    }
    const alternativePrices = list(item.otherPrices)
    if (alternativePrices.length && (present(item.price) || alternativePrices.length > 1)) {
      const values = []
      if (present(item.price))
        values.push(
          fact(pick(item, ['price', 'priceScale']), source, `$.menuItems[${index}].price`, {
            excerpt: String(item.price)
          })
        )
      alternativePrices.forEach((p, i) => {
        const picture = mediaByLocalId.get(p.mediaId)
        values.push(
          fact(
            pick(p, ['price', 'priceScale']),
            picture ? sourceFor('menu-photos', picture.value.url) : source,
            `$.menuItems[${index}].otherPrices[${i}]`,
            { excerpt: String(p.price ?? '') }
          )
        )
      })
      doc.conflicts.push({
        id: id('conflict', source.id, `$.menuItems[${index}].price`),
        target: `offerings.${offering.id}.price`,
        values
      })
    }
  }

  // An attribution keeps its words and its http(s) addresses; any other scheme is dropped.
  const attributionOf = (value) => {
    if (typeof value === 'string')
      return /^[a-z][a-z0-9+.-]*:/i.test(value) && !webAddress(value) ? {} : { attribution: value }
    if (!value || typeof value !== 'object') return {}
    const kept = Object.fromEntries(
      Object.entries(value).filter(([k, v]) => !/(^url$|Uri$|Url$)/.test(k) || webAddress(v))
    )
    return Object.keys(kept).length ? { attribution: kept } : {}
  }
  const addQuote = (value, source, path, options) => {
    if (typeof value.text !== 'string' || !value.text) return
    const entry = fact(value, source, path, { ...options, excerpt: value.text, language: value.language })
    if (!doc.quotes.some((q) => q.id === entry.id)) doc.quotes.push(entry)
  }
  if (profile.bio) {
    const { source, extraction } = profileSource('bio', profile.bio)
    addQuote(
      { kind: 'story', text: profile.bio, restrictions: [] },
      source,
      '$.profile.bio',
      extraction ? { extraction } : {}
    )
  }
  const allPosts = [
    ...list(posts),
    ...sources
      .filter(readable)
      .flatMap((s) => list(s.collected?.posts).map((p) => ({ source: s.source, ...p })))
  ]
  for (const raw of allPosts) {
    const post = { ...raw, url: webAddress(raw.url) }
    const locator = {
      kind: 'post',
      value:
        post.url ??
        post.id ??
        `content:${hash([post.source, post.caption ?? post.text, post.postedAt ?? post.publishedAt])}`
    }
    addQuote(
      {
        kind: 'post',
        text: post.caption ?? post.text,
        ...pick(post, ['author', 'language']),
        ...attributionOf(post.attribution),
        ...((post.postedAt ?? post.publishedAt)
          ? { publishedAt: iso(post.postedAt ?? post.publishedAt) }
          : {}),
        restrictions: []
      },
      sourceFor(post.source, post.url),
      `$.posts.${locator.value}`,
      { locator }
    )
  }
  const reviewGroups = [
    { reviews: google.reviews, source: googleSource, path: '$.googlePlace.reviews' },
    ...Object.entries(profile.reviewSources ?? {}).map(([key, group]) => ({
      reviews: group.reviews,
      source: () => sourceFor(key === 'googleMaps' ? 'google-maps' : key, group.url),
      path: `$.reviewSources.${key}.reviews`
    })),
    ...sources
      .filter(readable)
      .filter((s) => list(s.collected?.reviews).length)
      .map((s) => ({
        reviews: s.collected.reviews,
        source: () => sourceFor(s.source, s.ref),
        path: '$.collected.reviews'
      }))
  ]
  for (const group of reviewGroups)
    for (const [i, review] of list(group.reviews).entries()) {
      addQuote(
        {
          kind: 'review',
          text: review.text,
          ...pick(review, ['author', 'language']),
          ...((review.publishTime ?? review.publishedAt ?? review.date)
            ? { publishedAt: iso(review.publishTime ?? review.publishedAt ?? review.date) }
            : {}),
          // Google and Tripadvisor reviews, scores and reviewer avatars may show on a demo, kept verbatim.
          ...attributionOf(
            review.attribution ??
              pick(review, ['authorUri', 'authorAvatarUrl', 'googleMapsUri', 'url', 'rating'])
          ),
          restrictions: []
        },
        group.source(),
        `${group.path}[${i}]`
      )
    }
  for (const [kind, text] of Object.entries(google.summaries ?? {})) {
    addQuote(
      { kind: 'story', text, attribution: 'Google', restrictions: [] },
      googleSource(),
      `$.googlePlace.summaries.${kind}`,
      kind === 'editorial'
        ? {}
        : { derivation: { method: 'provider-generated-summary', version: 'unrecorded', reason: kind } }
    )
  }

  // What the reading step read (`business-reading.mjs`): Services are offerings, the Team people, Who it is for and the
  // Story quotes of the words they stand on. Each keeps its verbatim quote as evidence; the person's removals
  // (`readingPicks`) leave an item out.
  const reading = withReadingPicks(profile.businessReading, candidate.readingPicks)
  // The menu's own offerings (dishes and items read off menus), before the reading adds services.
  const menuOfferings = [...doc.offerings]
  if (reading) {
    const readingVia = (item) => {
      const s = item.source ?? {}
      if (s.kind === 'bio') return profileSource('bio', profile.bio).source
      if (s.kind === 'review')
        return s.source === 'google' || !s.source
          ? googleSource()
          : sourceFor(s.source === 'googleMaps' ? 'google-maps' : s.source)
      return sourceFor(s.source, s.url)
    }
    const readingFact = (value, item, group, reason) =>
      fact(value, readingVia(item), `$.businessReading.${group}.${item.id}`, {
        locator: item.source?.url
          ? { kind: 'post', value: item.source.url }
          : { kind: 'jsonPath', value: `$.businessReading.${group}.${item.id}` },
        excerpt: item.quote,
        extraction: {
          method: reading.method === 'model' ? 'business-reading' : 'business-reading-rules',
          version: reading.version ?? 'unrecorded'
        },
        derivation: { method: 'business-reading', version: reading.version ?? 'unrecorded', reason }
      })
    for (const item of reading.services)
      doc.offerings.push(
        readingFact(
          {
            kind: item.kind ?? 'service',
            name: item.label,
            variants: [{ price: { kind: 'unknown', raw: '' } }]
          },
          item,
          'services',
          `service: ${item.label}`
        )
      )
    for (const item of reading.team)
      doc.people.push(
        readingFact(
          { name: item.label, relationship: 'team', ...(item.role ? { role: item.role } : {}) },
          item,
          'team',
          item.onSite
            ? `team: ${item.label}`
            : `review-only-person: ${item.label} is named only in guest reviews, off the site until shown`
        )
      )
    const quoteKind = (item) =>
      item.source?.kind === 'bio' ? 'story' : item.source?.kind === 'review' ? 'review' : 'post'
    for (const [group, items] of [
      ['audience', reading.audience],
      ['story', reading.story]
    ])
      for (const item of items) {
        const entry = readingFact(
          { kind: quoteKind(item), text: item.quote, restrictions: [] },
          item,
          group,
          `${group}: ${item.label}`
        )
        if (!doc.quotes.some((q) => q.id === entry.id)) doc.quotes.push(entry)
      }
    // Where the business says it serves (#1780 item 17): one list of its own phrases, each quote kept as evidence.
    // Never an address: `business.address` stays the one address its sources state.
    const areas = reading.serviceAreas ?? []
    if (areas.length) {
      const read = areas.map((item) =>
        readingFact(item.label, item, 'serviceAreas', `service area: ${item.label}`)
      )
      const held = doc.business.serviceAreas
      doc.business.serviceAreas = {
        id: id('fact', 'business-reading', '$.businessReading.serviceAreas'),
        value: [...new Set([...(held?.value ?? []), ...areas.map((a) => a.label)])],
        evidenceRefs: [...new Set([...(held?.evidenceRefs ?? []), ...read.flatMap((f) => f.evidenceRefs)])],
        derivation: {
          method: 'business-reading',
          version: reading.version ?? 'unrecorded',
          reason: "service areas: the business's own words, never an address"
        }
      }
    }
  }

  const observation = brand.website ?? brand.social ?? brand
  // The brand's name is the decided business name, never the handle a social page was read under (`brandNameOf`).
  const decidedName = present(profile.nameCheck?.name) ? profile.nameCheck.name : profile.name
  const brandName = brandNameOf(observation.name, decidedName)
  if (present(brandName) && brandName !== observation.name)
    doc.brand.name = fact(brandName, profileSource('name', brandName).source, '$.brand.decidedName', {
      locator: {
        kind: 'jsonPath',
        value: present(profile.nameCheck?.name) ? '$.profile.nameCheck.name' : '$.profile.name'
      },
      derivation: {
        method: 'decided-name',
        version: 'brand-name-1',
        reason: 'the decided business name, never the handle a social page was read under'
      }
    })
  for (const key of ['name', 'colors', 'fonts', 'tagline']) {
    if (key === 'name' && doc.brand.name) continue
    if (!present(observation[key]) || (Array.isArray(observation[key]) && !observation[key].length)) continue
    doc.brand[key] = fact(
      observation[key],
      sourceFor(observation.origin ?? 'research'),
      `$.brand.${brand.website ? 'website.' : brand.social ? 'social.' : ''}${key}`,
      key === 'colors'
        ? {
            // Read from the chosen logo alone (#1780 item 15), else from the collected pictures.
            derivation: {
              method: observation.colorsFrom === 'logo' ? 'logo-palette' : 'brand-palette',
              version: brand.engine?.version ?? 'unrecorded'
            }
          }
        : {}
    )
  }
  const chosen = brand.logoResearch?.chosen
  const logo =
    mediaByLocalId.get(chosen?.mediaId ?? observation.logo ?? brand.logo) ?? mediaByUrl.get(chosen?.url)
  if (logo) {
    doc.brand.logo = fact(
      { mediaId: logo.id, ...(logo.value.url ? { url: logo.value.url } : {}) },
      stored(),
      '$.brand.logoResearch.chosen'
    )
    logo.value.relations.push({
      entityId: doc.business.id,
      relation: 'logo-of',
      evidenceRefs: [...doc.brand.logo.evidenceRefs]
    })
  }
  // A link is kept as Tracy shows it: a social profile normalised, any other without share tracking (#1780 item 10).
  function addLink(kind, value, source, path) {
    const url = webAddress(cleanSocialUrl(typeof value === 'string' ? value : value?.url, kind))
    if (!url) return
    if (doc.links.some((l) => l.value.kind === kind && l.value.url === url)) return
    // A link of no known kind that another link already holds (the Instagram page listed again) is no second link.
    if (kind === 'other' && doc.links.some((l) => l.value.url === url)) return
    doc.links.push(fact({ kind, url }, source, path))
  }
  // A website field that holds a social page (Google's website field set to the Instagram page) is no website: it is
  // one more source for that social link (#1791), never a second row with the same address.
  const websiteUrl = profile.website ?? google.website
  const websiteSource = () =>
    profile.website ? profileSource('website', profile.website).source : googleSource()
  const websiteNetwork = socialNetworkOfUrl(websiteUrl)
  if (websiteUrl && !websiteNetwork) addLink('website', websiteUrl, websiteSource(), '$.profile.website')
  for (const [kind, url] of Object.entries(profile.socials ?? {}))
    addLink(kind, url, sourceFor(kind, url), `$.profile.socials.${kind}`)
  if (websiteNetwork) {
    const url = webAddress(cleanSocialUrl(websiteUrl, websiteNetwork))
    const social = doc.links.find((l) => l.value.kind === websiteNetwork && l.value.url === url)
    if (social) {
      const ref = evidenceFor(
        websiteSource(),
        { kind: 'jsonPath', value: profile.website ? '$.profile.website' : '$.googlePlace.website' },
        url
      )
      if (!social.evidenceRefs.includes(ref)) social.evidenceRefs.push(ref)
    } else addLink(websiteNetwork, websiteUrl, websiteSource(), '$.profile.website')
  }
  // The WhatsApp number (#1780 item 16, #1791): one a source labels WhatsApp cites that source; one inferred from a UAE
  // mobile cites the phone it was inferred from and says it is inferred (`derivation.method: 'inferred'`).
  const whatsapp = researchWhatsappOf({ profile, candidate, googlePlace: google })
  const phoneFact = doc.business.phone
  if (whatsapp && webAddress(whatsapp.href) && !doc.links.some((l) => l.value.kind === 'whatsapp'))
    doc.links.push(
      whatsapp.basis === 'uae-mobile' && phoneFact
        ? {
            id: id('fact', 'inferred', ['$.contact.whatsapp', whatsapp.href]),
            value: { kind: 'whatsapp', url: whatsapp.href },
            evidenceRefs: [...phoneFact.evidenceRefs],
            derivation: {
              method: 'inferred',
              version: 'business-phones/1',
              inputRefs: [phoneFact.id],
              reason:
                'whatsapp-uae-mobile: the main phone is a UAE mobile number, not labelled WhatsApp by any source'
            }
          }
        : fact(
            { kind: 'whatsapp', url: whatsapp.href },
            profileSource('phone', whatsapp.number).source,
            '$.contact.whatsapp'
          )
    )
  for (const [key, kind] of [
    ['menus', 'menu'],
    ['booking', 'booking'],
    ['links', 'other']
  ]) {
    list(profile[key]).forEach((value, i) =>
      addLink(kind, value, sourceFor(value.source ?? 'research'), `$.profile.${key}[${i}]`)
    )
  }
  // The channels the business invites people to use in its own words (#1791, `own-channels.mjs`): "DM us" on its
  // Instagram makes an Instagram DM channel, "WhatsApp us" backs the WhatsApp button. Each rests on the sentence that
  // says it (its quote) and on the page the message goes to; a WhatsApp number Tracy inferred is then no longer only
  // inferred. A channel needs its page: "DM us" with no Instagram link of the place names no address.
  const ownWords = []
  if (profile.bio) {
    const { source } = profileSource('bio', profile.bio)
    ownWords.push({ text: profile.bio, source, readOn: source.kind, locator: '$.profile.bio' })
  }
  for (const post of allPosts) {
    const url = webAddress(post.url)
    ownWords.push({
      text: post.caption ?? post.text,
      source: sourceFor(post.source, url),
      readOn: post.source,
      locator: url ? { kind: 'post', value: url } : '$.posts'
    })
  }
  const OWN_WORDS = { method: 'own-channel-words', version: 'own-channels/1' }
  for (const words of ownWords)
    for (const invite of ownChannelInvitesOf(words.text, words.readOn)) {
      const quoteRef = () =>
        evidenceFor(
          words.source,
          typeof words.locator === 'string' ? { kind: 'jsonPath', value: words.locator } : words.locator,
          invite.quote,
          OWN_WORDS
        )
      if (invite.channel === 'whatsapp') {
        const wa = doc.links.find((l) => l.value.kind === 'whatsapp')
        if (!wa) continue
        const ref = quoteRef()
        if (!wa.evidenceRefs.includes(ref)) wa.evidenceRefs.push(ref)
        if (wa.derivation?.method === 'inferred')
          wa.derivation = {
            method: 'own-words',
            version: OWN_WORDS.version,
            ...(wa.derivation.inputRefs ? { inputRefs: wa.derivation.inputRefs } : {}),
            reason: 'own-channel: the business invites WhatsApp messages in its own words'
          }
        continue
      }
      const network = invite.channel.replace(/-dm$/, '')
      const page = doc.links.find((l) => l.value.kind === network)
      if (!page) continue
      const ref = quoteRef()
      const held = doc.links.find((l) => l.value.kind === invite.channel)
      if (held) {
        if (!held.evidenceRefs.includes(ref)) held.evidenceRefs.push(ref)
        continue
      }
      // 🔒 Its evidence is the business's invitation sentences only: the page it goes to is its input (`inputRefs`),
      // never a quote, and a source that only lists the page (Google's website field) says nothing about messages.
      doc.links.push({
        id: id('fact', 'own-channel', [invite.channel, page.value.url]),
        value: { kind: invite.channel, url: directMessageUrlOf(network, page.value.url) },
        evidenceRefs: [ref],
        derivation: {
          method: 'own-words',
          version: OWN_WORDS.version,
          inputRefs: [page.id],
          reason: `own-channel: the business invites messages on ${network} in its own words`
        }
      })
    }
  for (const [key, all] of Object.entries(profile.evidence ?? {})) {
    const values = list(all)
      .map((v, i) => ({ v, i }))
      .filter(
        ({ v }) => !(key === 'name' && typeof v?.value === 'string' && backingHandles.has(nameKey(v.value)))
      )
    if (values.length < 2) continue
    const alternatives = values.map(({ v, i }) =>
      fact(v.value, sourceFor(v.sources?.[0]), `$.profile.evidence.${key}[${i}]`)
    )
    doc.conflicts.push({
      id: id('conflict', 'profile', key),
      target: `business.${key}`,
      values: alternatives
    })
  }
  if (profile.hoursConflict && Object.keys(profile.hoursBySource ?? {}).length > 1) {
    const values = Object.entries(profile.hoursBySource).map(([kind, value]) =>
      fact(value, sourceFor(kind), `$.profile.hoursBySource.${kind}`)
    )
    doc.conflicts.push({ id: id('conflict', 'profile', 'hours'), target: 'business.hours', values })
  }
  for (const [key, value] of [
    ['cuisine', profile.cuisine],
    ['priceLevel', google.priceLevel],
    ['priceRange', profile.priceRange],
    // The business's other numbers (`business-phones.mjs`): its Contact section lists them beside the main phone.
    ['otherPhones', list(profile.otherPhones).length ? profile.otherPhones : undefined]
  ]) {
    if (present(value))
      doc.extensions[`research:${key}`] =
        key === 'priceLevel'
          ? fact(value, googleSource(), `$.googlePlace.${key}`)
          : profileFact(key, value, `$.profile.${key}`)
  }
  if (identityKey[0] === 'deployment-local' || identityKey[0] === 'unidentified')
    doc.extensions['research:identity'] = fact(
      { stability: identityKey[0], reason: 'No portable provider identity or website was stored.' },
      stored(),
      '$.identity'
    )
  const statistics = [
    ...sources.filter(readable).map((row) => ({
      source: sourceFor(row.source, row.ref),
      value: row.collected?.profile ?? row.collected ?? {},
      path: `$.collected${row.collected?.profile ? '.profile' : ''}`,
      asOf: row.collected_at
    })),
    ...Object.entries(profile.reviewSources ?? {}).map(([key, value]) => ({
      source: sourceFor(key === 'googleMaps' ? 'google-maps' : key, value.url),
      value,
      path: `$.reviewSources.${key}`,
      asOf: value.fetchedAt
    })),
    // The social-stats cache's measurement of a profile the place links to: one platform's count, cited to that page.
    ...list(socialStats)
      .filter((row) => SOCIAL_NETWORKS.has(row?.network) && webAddress(row.url))
      .map((row, i) => ({
        source: sourceOf(row.network, row.url, {
          collectedAt: row.fetchedAt,
          collector_version: row.provider
        }),
        value: { [row.network === 'youtube' ? 'subscribers' : 'followers']: row.followers, posts: row.posts },
        path: `$.socialStats[${i}]`,
        asOf: row.fetchedAt,
        extraction: { method: 'social-stats', version: row.provider ?? 'unrecorded' }
      }))
  ]
  // A listing page's star rating (#1780): its own source, never merged with Google's. A rating the listing shows of
  // another platform (magicpin shows Google's) says so in its restrictions; when Tracy holds that platform's rating
  // directly the direct one wins and the copy is dropped, and when the two differ neither is a statistic.
  const directRating = (platform) => {
    if (platform === 'google') {
      const g = googleRatingOf({ googlePlace: google, candidate })
      return g ? { rating: g.score, reviews: g.reviews } : null
    }
    const held = profile.reviewSources?.[platform]
    return typeof held?.rating === 'number'
      ? { rating: held.rating, reviews: held.reviewCount ?? held.reviews ?? null }
      : null
  }
  const conflicting = new Set()
  for (const row of sources.filter((s) => s.source === 'listing' && readable(s)))
    for (const [i, l] of list(row.collected?.listings).entries()) {
      const f = l?.facts
      if (!l?.ok || typeof f?.rating !== 'number' || !webAddress(l.url)) continue
      const copied = copiedRatingVerdict(f, directRating(f.ratingOf))
      if (copied === 'conflict') conflicting.add(f.ratingOf)
      if (copied) continue
      statistics.push({
        source: sourceFor('listing', l.url),
        value: { rating: f.rating, ...(Number.isInteger(f.reviews) ? { reviewCount: f.reviews } : {}) },
        path: `$.collected.listings[${i}].facts`,
        asOf: row.collected_at ?? row.updated_at,
        extraction: { method: 'listing-page', version: 'listing-page-1' },
        ...(f.ratingOf
          ? {
              restrictions: [
                `the ${f.ratingOf[0].toUpperCase()}${f.ratingOf.slice(1)} rating as the listing shows it, not the listing's own`
              ]
            }
          : {})
      })
    }
  // Google's rating is one decided fact below (`google-rating.mjs`), never Place Details' raw field: a rating the site
  // leaves off (few reviews, or the owner's choice) is no statistic the site can fill.
  const googleRating = decideGoogleRating({ googlePlace: google, candidate, pick: ratingPickOf(candidate) })
  // A rating the site leaves off is still one fact (#1791), restricted from the demo with the reason it is left off.
  const ratingHeld =
    googleRating.state !== 'left'
      ? null
      : googleRating.choice === 'leave'
        ? onSiteCheck('owner-left-off', "the owner chose to leave Google's rating off the site")
        : onSiteCheck('few-reviews', `Google's rating counts only ${googleRating.reviews ?? 'a few'} reviews`)
  // A listing's disagreeing copy keeps Google's rating off the site as a statistic, but a rating the site leaves off
  // anyway stays one fact: its values are what the brief, the agent prompt and QA name as withheld (dev, 27/10/2026:
  // a 4-review rating against a directory's copy of 16 reviews vanished from the withheld list).
  if ((googleRating.state === 'shown' && !conflicting.has('google')) || ratingHeld)
    statistics.push({
      source: googleSource(),
      value: {
        rating: googleRating.score,
        ...(Number.isInteger(googleRating.reviews) ? { reviewCount: googleRating.reviews } : {})
      },
      path: googleRating.from === 'details' ? '$.googlePlace' : '$.identity.candidate',
      asOf: google.fetchedAt,
      decided: true,
      ...(ratingHeld ? { restrictions: ['not-on-demo'], derivation: ratingHeld } : {})
    })
  const counted = []
  for (const entry of statistics) {
    const held = entry.value
    for (const key of ['rating', 'reviewCount', 'followers', 'likes', 'subscribers', 'posts']) {
      if (typeof held[key] !== 'number' || !Number.isFinite(held[key])) continue
      if (key === 'rating' && entry.source.kind === 'google-places' && !entry.decided) continue
      counted.push({
        entry,
        key,
        fact: fact(
          {
            amount: held[key],
            label: key,
            scope: entry.source.ref ?? entry.source.kind,
            ...(entry.asOf ? { asOf: iso(entry.asOf) } : {}),
            restrictions: entry.restrictions ?? []
          },
          entry.source,
          `${entry.path}.${key}`,
          {
            ...(entry.extraction ? { extraction: entry.extraction } : {}),
            ...(entry.derivation ? { derivation: entry.derivation } : {})
          }
        )
      })
    }
  }
  // One social platform's count read twice (its page, the stats cache): the latest measurement only; a zero read
  // (a page that failed to say) never displaces a real count.
  const timeOf = (c) => Date.parse(c.fact.value.asOf ?? '') || Number.NEGATIVE_INFINITY
  const socialKey = (c) =>
    SOCIAL_NETWORKS.has(c.entry.source.kind) ? JSON.stringify([c.entry.source.kind, c.key]) : null
  for (const [i, c] of counted.entries()) {
    const key = socialKey(c)
    const newer = (o, j) =>
      j !== i &&
      socialKey(o) === key &&
      o.fact.value.amount > 0 &&
      (timeOf(o) > timeOf(c) || (timeOf(o) === timeOf(c) && j < i))
    if (!key || !counted.some(newer)) doc.claims.statistics.push(c.fact)
  }

  function cover(
    target,
    found,
    rows,
    { collector = true, applicable = true, partial = false, note = null } = {}
  ) {
    const reason = (r) => r.reason ?? r.last_error?.reason
    const attempted = rows.filter((r) => r.status !== 'pending' && r.status !== 'skipped')
    const missing = (r) => ['not_found', 'private_or_empty', 'ambiguous', 'no-menu-found'].includes(reason(r))
    const blocked = attempted.some((r) => r.status === 'blocked')
    const failed = attempted.some((r) => (r.status === 'failed' || r.last_error) && !missing(r))
    const incomplete = attempted.some((r) => r.status === 'partial')
    const status = found
      ? partial || blocked || failed || incomplete
        ? 'partial'
        : 'found'
      : !applicable
        ? 'not_applicable'
        : !collector || !attempted.length
          ? 'not_researched'
          : blocked
            ? 'blocked'
            : failed
              ? 'failed'
              : incomplete
                ? 'partial'
                : 'searched_not_found'
    const timestamps = attempted
      .map((r) => iso(r.attempted_at ?? r.collected_at ?? r.updated_at))
      .filter((v) => typeof v === 'string')
      .sort()
    doc.coverage.push({
      target,
      status,
      sourceRefs: [...new Set(rows.map((r) => sourceFor(r.source, r.ref).id))],
      ...(timestamps.length ? { searchedAt: timestamps.at(-1) } : {}),
      methodVersion: VERSION,
      ...(note ? { reason: note } : !collector ? { reason: 'No structured collector for this target.' } : {})
    })
  }
  const menuRows = sources.filter((s) => ['menu-file', 'menu-photos'].includes(s.source))
  if (!menuRows.length)
    for (const read of list(profile.menuReads))
      menuRows.push({ source: 'menu-file', ref: read.url, status: read.status, reason: read.reason })
  const contactRows = sources.filter((s) =>
    ['website', 'google-places', 'facebook', 'instagram'].includes(s.source)
  )
  cover('menu', menuOfferings.length > 0, menuRows, {
    applicable: defaultOfferingKind(statedTradeOf(doc)) === 'dish' || menuRows.length > 0
  })
  // The reading step looked for services and people: "found" or "looked, not there", and says when only rules read.
  const readingRows = reading
    ? [{ source: 'business-reading', ref: null, status: 'complete', attempted_at: reading.at }]
    : []
  const readingNote =
    reading && reading.method !== 'model'
      ? `The model reading did not run (${reading.reason ?? 'not_configured'}); rules read the bio and posts only.`
      : null
  cover('offerings', doc.offerings.length > 0, [...menuRows, ...readingRows], {
    collector: doc.offerings.length > 0 || menuRows.length > 0 || Boolean(reading),
    note: readingNote
  })
  cover(
    'prices',
    menuOfferings.some((f) => f.value.variants.some((v) => v.price?.raw)),
    menuRows,
    {
      collector: menuOfferings.length > 0 || menuRows.length > 0,
      partial: menuOfferings.some((f) => f.value.variants.some((v) => !v.price?.raw))
    }
  )
  cover('hours', Boolean(doc.business.hours), contactRows, { partial: Boolean(profile.hoursConflict) })
  cover('phone', Boolean(doc.business.phone), contactRows)
  // Only the model reads people: after a rules-only reading the Team was never looked for, so it is not researched.
  cover('people', doc.people.length > 0, readingRows, {
    collector: reading?.method === 'model',
    note: readingNote
  })
  for (const target of ['faqs', 'events', 'claims.recognitions', 'claims.relationships'])
    cover(target, false, [], { collector: false })
  cover(
    'media',
    doc.media.length > 0,
    sources.filter((s) => list(s.collected?.media).length)
  )
  cover('brand', Object.keys(doc.brand).length > 0, [], {
    collector: Boolean(brand.logoResearch || brand.website || brand.social)
  })
  return doc
}
