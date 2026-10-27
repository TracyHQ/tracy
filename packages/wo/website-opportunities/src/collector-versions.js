/**
 * `collector_version` of the snapshot sources whose collection rule changed since the generic `wo-place-1`
 * (`place-executor.js`). A row stamped with another version is due again (`sourceDue`), so Research again
 * collects it once more and its card says `rule-changed`.
 */
import { createHash } from 'node:crypto'
import { GPLACES_DETAIL_FIELDS } from '../domain/gplaces-details.mjs'

/**
 * Google Place Details is versioned by the field mask it asks for: a field added to `GPLACES_DETAIL_FIELDS` (the
 * amenity groups of 27/10/2026, after the phone and address of #1670) changes the version, so every place fetched
 * without that field is due once and nobody has to remember a bump. A place fetched under today's mask stays cached.
 */
const placesMaskDigest = createHash('sha256').update(GPLACES_DETAIL_FIELDS).digest('hex').slice(0, 12)

export const SOURCE_VERSIONS = Object.freeze({
  'google-places': `google-places-3-${placesMaskDigest}`,
  // 24/10/2026: the logo is ScrapeCreators' `profilePic*` file, not `profilePhoto.url` (the photo's page).
  facebook: 'facebook-2'
})

/** The version a source is collected under now, or null when it keeps the generic one. */
export const sourceVersionOf = (source) => SOURCE_VERSIONS[source] ?? null
