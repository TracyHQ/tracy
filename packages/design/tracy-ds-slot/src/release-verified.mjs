// What `release-batch.mjs verify` calls verified: the restored version looks like the released one (no computed
// difference at either width), every menu page answers as the released one does, its fonts hold, and the run read a
// real site. A stand that came up empty (a bind mount the Docker host cannot see, a webroot that did not unpack) shows
// the CMS installer and links nothing: compared with a released version that came up the same way, every other check
// passes, so an empty run is never verified.

/** Whether a home page is the CMS's own installer rather than the site (Joomla's web installer, WordPress setup). */
export function isInstallerPage(html) {
  return /<title>[^<]*Joomla[^<]*Installer|\/installation\/(?:index|joomla)\.php|wp-admin\/(?:install|setup-config)\.php/i.test(
    String(html ?? '')
  )
}

/**
 * @param {{ computedDifferences: {desktop: number, phone: number}, pages: {checked: number, differ: any[]},
 *   fonts: {ok: boolean}, homes: {now: string, released: string} }} v
 * @returns {{ verified: boolean, problems: string[] }}
 */
export function verifiedOf({ computedDifferences, pages, fonts, homes }) {
  const problems = []
  if (isInstallerPage(homes?.now)) problems.push('the restored version shows the CMS installer, not the site')
  if (isInstallerPage(homes?.released))
    problems.push('the released version shows the CMS installer, not the site')
  if (!(pages?.checked > 0)) problems.push('the home page links no menu page: nothing was checked')
  if (computedDifferences.desktop !== 0 || computedDifferences.phone !== 0)
    problems.push(
      `the default page differs from the released one (desktop ${computedDifferences.desktop}, phone ${computedDifferences.phone})`
    )
  if ((pages?.differ ?? []).length > 0)
    problems.push(`${pages.differ.length} menu page(s) answer otherwise than released`)
  if (!fonts?.ok) problems.push('the fonts check failed')
  return { verified: problems.length === 0, problems }
}
