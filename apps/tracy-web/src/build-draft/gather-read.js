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
 * 🔒 THE OWNER'S DESCRIPTION IS A SOURCE, NEVER COPY (decision D46). What the owner typed in the build chat is not laid
 * over the profile as a bio: the bio based paths (hero, About story, story fact, brand voice) read the sources' own bio.
 * It guides the trade guess when the sources name no trade, and its sentences are kept out of the brief word for word
 * (`description-guard.js`). Its facts are not read yet: the business reading has no passage kind for an owner's own
 * statement and the plan no honest label for one (`DESCRIPTION_FACTS`).
 */
import { keepDescriptionOut } from './description-guard.js'

/**
 * Why the description's facts are not read into the brief (D46): the business reading (`readingSourcesOf`) reads only
 * bio, post, review and website passages, and the plan names an owner's words only as an answer, which the needs
 * profile's trust order does not read. Feeding it as one of those would credit the owner's words to a source that
 * never said them.
 */
export const DESCRIPTION_FACTS = Object.freeze({ read: false, reason: 'no_owner_statement_source' })

const isText = (value) => typeof value === 'string' && value.trim() !== ''

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
 * `researchedTrade`): Google's types, else the schema.org type its website states, else its name, else its bio, else
 * what the owner typed in the build chat (`hint`: words read by the same classifier, never copied anywhere).
 */
export function tradeOf(domain, profile, name, tradeOfWords, hint = null) {
  const google = profile?.googlePlace ?? null
  const byGoogle = google
    ? domain.tradeOfPlace({ primaryType: google.primaryType, types: google.types })
    : 'other'
  const typed = byGoogle !== 'other' ? byGoogle : domain.tradeOfSchemaType(profile?.businessType)
  const named = typed !== 'other' ? typed : tradeOfWords(profile?.name ?? name)
  if (named !== 'other') return named
  const own = tradeOfWords(profile?.bio, Array.isArray(profile?.cuisine) ? profile.cuisine.join(' ') : null)
  return own !== 'other' || !isText(hint) ? own : tradeOfWords(hint)
}

/**
 * The owner's opportunity in memory, the profile its sources say (`mergeProfile`, before any decision or typed edit:
 * what the place executor's reading reads), and its trade, the description guiding it when the sources name none.
 * @param {{opp: object, rows: object[], googlePlace: object | null, description: string | null, domain: object,
 *   parts: object}} input
 */
export function profileOfRead({ opp, rows, googlePlace, description, domain, parts }) {
  const owned = { ...opp, candidate: { ...opp.candidate } }
  const merged = parts.mergeProfile(owned, rows)
  if (googlePlace) merged.googlePlace = googlePlace
  const trade = tradeOf(domain, merged, owned.name, parts.tradeOfWords, description)
  if (trade !== 'other') owned.candidate.trade = trade
  return { owned, merged, trade }
}

/**
 * The brief and manifest of what was read.
 * @param {{opp: object, rows: object[], media?: object[], googlePlace: object | null, description: string | null,
 *   madeAt: string, domain: object, parts: object, logoResearch?: object | null, logoPalette?: object[] | null,
 *   reading?: object | null}} input
 *   `media`: the stored pictures (`pictures.js`), as rows; `logoResearch`: the chosen logo (`gather.js` `logoOf`),
 *   named by the brief as `brand.logo`; `logoPalette`: that logo's own colours, measured from its stored copy;
 *   `reading`: the business reading (`gather-reading.js`), laid on the profile as `businessReading`, where a place's
 *   research keeps it
 * @returns {{brief: object, manifest: object[], keptOut: {sentence: string, where: string}[]} | {invalid: object[]}}
 *   `keptOut`: the description's sentences taken out of the brief (`description-guard.js`)
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
  logoPalette = null,
  reading = null
}) {
  const { owned, merged, trade } = profileOfRead({
    opp,
    rows,
    googlePlace,
    description,
    domain,
    parts
  })
  if (reading) merged.businessReading = reading
  const profile = parts.decideProfile(merged, owned, null)
  const observed = brandOf({ rows, media, profile, name: owned.name, domain, parts, logoPalette })
  // The chosen logo rides on the brand as a place's research does (`briefBrand`: `brand.logo` and `logoResearch`).
  const brand = logoResearch ? { ...observed, logoResearch } : observed
  // The stored pictures go through the brief read's own filters (junk, near copies) and mapping (`fromPlace`).
  const read = parts.fromPlace({ sources: rows, profile, brand, media, shown: rows })
  const brief = parts.makeSiteBrief(domain, read, { opportunity: parts.opportunityOf(owned), madeAt })
  const keptOut = keepDescriptionOut(brief, description)
  const checked = domain.validateBrief(brief)
  if (!checked?.ok) return { invalid: checked?.errors ?? [] }
  brief.readiness = domain.briefReadinessOf(brief)
  if (trade !== 'other') brief.trade = trade
  return { brief, manifest: parts.assetManifestOf(read.media), keptOut }
}
