/**
 * `collector_version` of the snapshot sources whose collection rule changed since the generic `wo-place-1`
 * (`place-executor.js`). A row stamped with another version is due again (`sourceDue`), so Research again
 * collects it once more and its card says `rule-changed`.
 */
export const SOURCE_VERSIONS = Object.freeze({
  // #1670 added the phone and address to the Place Details field mask; facts fetched before it lack them.
  'google-places': 'google-places-2',
  // 24/10/2026: the logo is ScrapeCreators' `profilePic*` file, not `profilePhoto.url` (the photo's page).
  facebook: 'facebook-2'
})

/** The version a source is collected under now, or null when it keeps the generic one. */
export const sourceVersionOf = (source) => SOURCE_VERSIONS[source] ?? null
