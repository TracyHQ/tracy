/**
 * What the build chat's research read (#609), made into the brief and asset manifest a website opportunity's revision
 * stores, in memory: the source rows go through the research executor's own profile merge (`mergeProfile`) and brand
 * observation (`brandFromSocial`), the profile through the decisions a brief read applies (`decideProfile`, as
 * `brief-research.js` `fromOpportunity`), the read through `fromPlace` and the brief through `makeSiteBrief`, checked
 * by `validateBrief` as a revision is. The WO pieces are injected (`parts`, `build-draft-gather-wiring.js`).
 *
 * 🔒 PICTURES ARE STORED COPIES. The pictures come in stored (`pictures.js`: downloaded and measured by the Website
 * Opportunities media rules, kept under a draft key, one `build_draft_picture` row each), so the manifest names each by
 * an id that opens again, with its real size, type and palette, as a website opportunity's revision does.
 *
 * The owner's description is laid over the profile as the seller's typed bio (`profile-edits.js`, field `bio`), the
 * one typed description the Website Opportunities flow has.
 */

/** The longest seller bio (`profile-edits.js` `EDITABLE_PROFILE_FIELDS.bio`). */
export const BIO_MAX = 1200

/**
 * The brand observations of the executor's brand stage (`place-executor.js` `brand`), from the rows and the profile.
 * With the chosen logo's own colours (`logoPalette`), the colours are the logo's alone (`colorsFrom: 'logo'`, its
 * `accent`), as a website opportunity's brief has them: the brand step's icon and accent rules read exactly those.
 */
function brandOf({ rows, media, profile, name, domain, parts, logoPalette }) {
  const collectedFrom = (pick) =>
    rows.some((r) => pick(r.source) && ['complete', 'partial'].includes(r.status))
  const observe = (origin, pick) => ({
    ...domain.brandFromSocial({
      palette: parts.mergePalettes(media.filter((m) => pick(m.source))),
      logoPalette,
      bio: profile.bio ?? null,
      name: profile.name ?? name,
      avatarUrl: profile.avatarUrl ?? null
    }),
    origin
  })
  const isWebsite = (s) => s === 'website'
  // Google listing photos are visitors' shots, not the business's own: no part of its brand colours.
  const isSocial = (s) => parts.socialSources.includes(s)
  return {
    website: collectedFrom(isWebsite) ? observe('website', isWebsite) : null,
    social: collectedFrom(isSocial) ? observe('social', isSocial) : null
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
 * @param {{opp: object, rows: object[], media?: object[], googlePlace: object | null, description: string | null,
 *   madeAt: string, domain: object, parts: object, logoResearch?: object | null, logoPalette?: object[] | null}} input
 *   `media`: the stored pictures (`pictures.js`), as rows; `logoResearch`: the chosen logo (`gather.js` `logoOf`),
 *   named by the brief as `brand.logo`; `logoPalette`: that logo's own colours, measured from its stored copy
 * @returns {{brief: object, manifest: object[]} | {invalid: object[]}}
 */
export function briefOf({
  opp,
  rows,
  media = [],
  googlePlace,
  description,
  madeAt,
  domain,
  parts,
  logoResearch = null,
  logoPalette = null
}) {
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
  const observed = brandOf({ rows, media, profile, name: owned.name, domain, parts, logoPalette })
  // The chosen logo rides on the brand as a place's research does (`briefBrand`: `brand.logo` and `logoResearch`).
  const brand = logoResearch ? { ...observed, logoResearch } : observed
  // The stored pictures go through the brief read's own filters (junk, near copies) and mapping (`fromPlace`).
  const read = parts.fromPlace({ sources: rows, profile, brand, media, shown: rows })
  const brief = parts.makeSiteBrief(domain, read, { opportunity: parts.opportunityOf(owned), madeAt })
  const checked = domain.validateBrief(brief)
  if (!checked?.ok) return { invalid: checked?.errors ?? [] }
  brief.readiness = domain.briefReadinessOf(brief)
  if (trade !== 'other') brief.trade = trade
  return { brief, manifest: parts.assetManifestOf(read.media) }
}
