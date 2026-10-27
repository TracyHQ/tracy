/**
 * The demo content of one release, read lazily and once, whatever shape the release ships in:
 *
 * - `sql()`: the demo database of a WordPress or Joomla release, from `install.database`
 *   (`.sql` or `.sql.gz`) or, for a Joomla `installer` zip, `installation/sql/mysql/*.sql` in the
 *   order Joomla's installer runs them.
 * - `siteModel()`: an EmDash release's `seed/site-model.json`, from the `install.source` zip.
 * - `themeFile(stylesheet, file)`: a WordPress theme file (`parts/header.html`), from the theme zip
 *   the release attaches (`wp-<theme>-<version>.zip`, about 1 MB, not named by the setting; the one
 *   of the release's version, else the newest, `readers/theme-zips.js`) and,
 *   failing that, from the webroot tar.gz.
 *
 * What cannot be read throws `UnreadableContent`, whose `status` tells a rule how to report it: a
 * file the release does not carry is a `fail`; an Akeeba `bundle` is `live-only`, since only a
 * restored site shows what is inside it.
 */
import { gunzipSync } from 'node:zlib'

import { tarGzTexts, zipTexts } from './archives.js'
import { themeZipsInOrder } from './theme-zips.js'

export class UnreadableContent extends Error {
  /**
   * @param {string} message
   * @param {'fail' | 'live-only'} status
   */
  constructor(message, status = 'fail') {
    super(message)
    this.status = status
  }
}

/** The order Joomla's installer runs its SQL files in; any other file runs after them. */
const JOOMLA_SQL_ORDER = ['base.sql', 'extensions.sql', 'supports.sql', 'custom.sql']
const sqlRank = (/** @type {string} */ name) => {
  const k = JOOMLA_SQL_ORDER.indexOf(name.split('/').pop() ?? '')
  return k < 0 ? JOOMLA_SQL_ORDER.length : k
}

/**
 * @param {import('../release-source.js').ReleaseSource} source
 * @param {Record<string, any>} setting the release's `tracy_setting.json`, already validated
 */
export function releaseContent(source, setting) {
  const install = setting.install ?? {}
  /** @type {Map<string, Promise<any>>} */
  const memo = new Map()
  const once = (/** @type {string} */ key, /** @type {() => Promise<any>} */ make) => {
    if (!memo.has(key)) memo.set(key, make())
    return memo.get(key)
  }
  const asset = async (/** @type {string} */ part) => {
    const file = install[part]?.file
    const bytes = file ? await source.read(file) : null
    if (!bytes) throw new UnreadableContent(`the release does not carry ${file ?? `an install.${part} file`}`)
    return { file, bytes }
  }

  const sql = () =>
    once('sql', async () => {
      if (install.database) {
        const { file, bytes } = await asset('database')
        return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8')
      }
      if (install.installer) {
        const { file, bytes } = await asset('installer')
        const parts = zipTexts(bytes, (n) => /^installation\/sql\/mysql\/[^/]+\.sql$/.test(n))
        if (parts.size === 0)
          throw new UnreadableContent(`${file} has no installation/sql/mysql/*.sql inside`)
        return [...parts.keys()]
          .sort((a, b) => sqlRank(a) - sqlRank(b))
          .map((n) => parts.get(n))
          .join(';\n')
      }
      if (install.bundle)
        throw new UnreadableContent(
          'an Akeeba bundle cannot be read without restoring it: check it on a restored site',
          'live-only'
        )
      throw new UnreadableContent('the release installs no database this check can read')
    })

  const siteModel = () =>
    once('siteModel', async () => {
      const { file, bytes } = await asset('source')
      const [text] = zipTexts(bytes, (n) => /(^|\/)seed\/site-model\.json$/.test(n)).values()
      if (text === undefined) throw new UnreadableContent(`${file} has no seed/site-model.json inside`)
      return JSON.parse(text)
    })

  /**
   * @param {string} stylesheet the active theme's folder (option `stylesheet`)
   * @param {string} file the path inside the theme, `parts/header.html`
   * @returns {Promise<string | null>}
   */
  const themeFile = (stylesheet, file) =>
    once(`theme:${stylesheet}:${file}`, async () => {
      // The zip of this version first, else the newest: old cuts stay attached to a release.
      for (const zip of themeZipsInOrder(await source.names(), stylesheet, setting.version)) {
        // eslint-disable-next-line no-await-in-loop -- one theme zip per release.
        const bytes = await source.read(zip)
        const hits = bytes ? zipTexts(bytes, (n) => n.endsWith(`/${file}`) || n === file) : new Map()
        const own = [...hits.keys()].find((n) => n.startsWith(`${stylesheet}/`)) ?? [...hits.keys()][0]
        if (own !== undefined) return hits.get(own)
      }
      const webroot = install.webroot?.file ? await source.read(install.webroot.file) : null
      if (!webroot) return null
      const want = `wp-content/themes/${stylesheet}/${file}`
      const [text] = tarGzTexts(webroot, (n) => n === want || n.endsWith(`/${want}`)).values()
      return text ?? null
    })

  return { sql, siteModel, themeFile }
}
