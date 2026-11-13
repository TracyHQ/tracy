/**
 * What the build chat's research read (#609), made into the brief and asset manifest a website opportunity's revision
 * stores, in memory: the source rows go through the research executor's own profile merge (`mergeProfile`) and brand
 * observation (`brandFromSocial`), the profile through the decisions a brief read applies (`decideProfile`, as
 * `brief-research.js` `fromOpportunity`), the read through `fromPlace` and the brief through `makeSiteBrief`, checked
 * by `validateBrief` as a revision is. The WO pieces are injected (`parts`, `build-draft-wiring.js`).
 *
 * 🔒 PICTURES ARE KEPT AS REFERENCES. No bytes are downloaded or stored before a site exists: each collected picture
 * becomes the record the executor writes when it cannot store one (`status: 'reference'`, sha256 of `ref:<url>`), with
 * no size, type or palette. The manifest names it by that id and its source address, which is what the needs profile
 * reads (`needs-research-media.mjs`). A step that needs the stored picture (the brand bench, picture labelling, the
 * writer's image placement) has nothing to open.
 *
 * The owner's description is laid over the profile as the seller's typed bio (`profile-edits.js`, field `bio`), the
 * one typed description the Website Opportunities flow has.
 */

/** The executor's media budget (`executor.js` `MEDIA_BUDGET`): pictures kept, shared fairly between sources. */
export const MEDIA_BUDGET = 300
/** The longest seller bio (`profile-edits.js` `EDITABLE_PROFILE_FIELDS.bio`). */
export const BIO_MAX = 1200
const TEXT_MAX = 2000

const textOr = (value) => (typeof value === 'string' ? value.slice(0, TEXT_MAX) : null)

/** The reference records of the pictures the rows collected, in the brief read's shape (`fromPlace` media). */
export function pictureReferences({ rows, domain, fairShare }) {
  const queue = new Map()
  for (const r of rows)
    for (const m of r.collected?.media ?? [])
      if (typeof m?.url === 'string' && !queue.has(m.url)) queue.set(m.url, { ...m, source: r.source })
  return fairShare([...queue.values()], MEDIA_BUDGET).map((m) => {
    const sha256 = domain.sha256Hex(new TextEncoder().encode(`ref:${m.url}`))
    return {
      id: `ref-${sha256.slice(0, 32)}`,
      kind: m.kind === 'video' ? 'video' : 'image',
      category: domain.classifyMedia({ caption: m.caption, alt: m.alt, url: m.url }),
      sha256,
      mime: null,
      width: null,
      height: null,
      source: m.source,
      sourceUrl: m.url,
      ...(typeof m.postId === 'string' ? { postId: m.postId } : {}),
      labels: null,
      caption: textOr(m.caption),
      alt: textOr(m.alt),
      bytes: null,
      postedAt:
        m.postedAt && !Number.isNaN(Date.parse(m.postedAt)) ? new Date(m.postedAt).toISOString() : null
    }
  })
}

/** The brand observations of the executor's brand stage (`executor.js` `brand`), from the rows and the profile. */
function brandOf({ rows, profile, name, domain, parts }) {
  const collectedFrom = (pick) =>
    rows.some((r) => pick(r.source) && ['complete', 'partial'].includes(r.status))
  // A referenced picture has no palette: the observation reads the bio and the name only.
  const observe = (origin) => ({
    ...domain.brandFromSocial({
      palette: parts.mergePalettes([]),
      bio: profile.bio ?? null,
      name: profile.name ?? name,
      avatarUrl: profile.avatarUrl ?? null
    }),
    origin
  })
  const isSocial = (s) => parts.socialSources.includes(s)
  return {
    website: collectedFrom((s) => s === 'website') ? observe('website') : null,
    social: collectedFrom(isSocial) ? observe('social') : null
  }
}

/**
 * The trade of a business known by its links, as Build from my business decides it (`own-site.js`
 * `researchedTrade`): Google's types, else the schema.org type its website states, else its name, else its bio.
 */
export function tradeOf(domain, profile, name, tradeOfWords) {
  const google = profile?.googlePlace ?? null
  const byGoogle = google
    ? domain.tradeOfPlace({ primaryType: google.primaryType, types: google.types })
    : 'other'
  const typed = byGoogle !== 'other' ? byGoogle : domain.tradeOfSchemaType(profile?.businessType)
  const named = typed !== 'other' ? typed : tradeOfWords(profile?.name ?? name)
  return named !== 'other'
    ? named
    : tradeOfWords(profile?.bio, Array.isArray(profile?.cuisine) ? profile.cuisine.join(' ') : null)
}

/**
 * The brief and manifest of what was read.
 * @param {{opp: object, rows: object[], googlePlace: object | null, description: string | null, madeAt: string,
 *   domain: object, parts: object}} input
 * @returns {{brief: object, manifest: object[]} | {invalid: object[]}}
 */
export function briefOf({ opp, rows, googlePlace, description, madeAt, domain, parts }) {
  const bio =
    typeof description === 'string' && description.trim() ? description.trim().slice(0, BIO_MAX) : null
  const owned = {
    ...opp,
    candidate: { ...opp.candidate, ...(bio ? { profileEdits: { bio: { value: bio, at: madeAt } } } : {}) }
  }
  const merged = parts.mergeProfile(owned, rows)
  if (googlePlace) merged.googlePlace = googlePlace
  const trade = tradeOf(domain, merged, owned.name, parts.tradeOfWords)
  if (trade !== 'other') owned.candidate.trade = trade
  const profile = parts.decideProfile(merged, owned, null)
  const brand = brandOf({ rows, profile, name: owned.name, domain, parts })
  const read = parts.fromPlace({ sources: rows, profile, brand, media: [], shown: rows })
  read.media = pictureReferences({ rows, domain, fairShare: parts.fairShare })
  const brief = parts.makeSiteBrief(domain, read, { opportunity: parts.opportunityOf(owned), madeAt })
  const checked = domain.validateBrief(brief)
  if (!checked?.ok) return { invalid: checked?.errors ?? [] }
  brief.readiness = domain.briefReadinessOf(brief)
  if (trade !== 'other') brief.trade = trade
  return { brief, manifest: parts.assetManifestOf(read.media) }
}
