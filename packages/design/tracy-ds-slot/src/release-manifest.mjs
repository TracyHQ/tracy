/**
 * The release manifest of a quickstart that publishes only its switch (`tracy_setting.json`): the
 * older JA Joomla releases carry an installer zip and that file, with neither a `manifest.json` nor a
 * tch contract (ja-focus, ja-titan … on 11/10/2026). The fleet builds a site from the switch alone, so
 * the switch is what the release serves; this gives it the shape `stand.mjs` and `release-joomla.mjs`
 * read (`tracy-quickstart/v1`: `parts.installer`, or `parts.webroot` + `parts.database`).
 *
 * Only what the switch states is written: no byte counts, no table prefix (the installer picks its own,
 * a webroot pair's is read off its dump).
 */

/**
 * @param {string} tag the release tag (`quickstart/ja-focus/j6`)
 * @param {any} setting the release's `tracy_setting.json`
 * @returns {object} a `tracy-quickstart/v1` manifest
 */
export function manifestFromSetting(tag, setting) {
  if (setting?.schemaVersion !== 'tracy-setting/v1') throw new Error(`${tag}: not a tracy-setting/v1 switch`)
  const install = setting.install ?? {}
  const part = (p) => {
    if (!p?.file || !/^[0-9a-f]{64}$/.test(p.sha256 ?? ''))
      throw new Error(`${tag}: switch names no file + sha256`)
    return { file: p.file, sha256: p.sha256 }
  }
  const parts = install.installer
    ? { installer: part(install.installer) }
    : { webroot: part(install.webroot), database: part(install.database) }
  const product = tag.replace(/^quickstart\//, '').split('/')[0]
  return {
    schemaVersion: 'tracy-quickstart/v1',
    product,
    id: tag,
    version: setting.version,
    platform: setting.platform,
    cms: { name: setting.platform, version: setting.cms },
    ...(setting.template && { template: setting.template }),
    parts,
    release: tag,
    repository: 'JoomlArt-Products/joomlart-products'
  }
}
